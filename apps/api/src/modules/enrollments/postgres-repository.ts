import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { RecorderAssignment, SetupOperation } from '@aptly/contracts';
import type pg from 'pg';
import type { ActorContext } from '../identity/development-identity.js';
import { EnrollmentError } from './errors.js';
import type { EnrollmentService } from './service.js';

type AssignmentRow = {
  id: string;
  user_id: string;
  recorder_id: string;
  assigned_at: Date;
  status: 'active' | 'released' | 'revoked';
};
type OperationRow = {
  id: string;
  assignment_id: string;
  enrollment_token_id: string;
  user_id: string;
  idempotency_key: string;
  status: 'pending' | 'revoked';
  created_at: Date;
};

const unavailable = () =>
  new EnrollmentError(
    'ENROLLMENT_UNAVAILABLE',
    404,
    'This enrollment invitation is unavailable. Ask an administrator for a new invitation.',
  );
const notFound = () =>
  new EnrollmentError('NOT_FOUND', 404, 'The requested resource was not found.');
const assignmentConflict = () =>
  new EnrollmentError(
    'ASSIGNMENT_CONFLICT',
    409,
    'The recorder assignment conflicts with its current state.',
  );
const toAssignment = (row: AssignmentRow): RecorderAssignment => ({
  id: row.id,
  userId: row.user_id,
  recorderId: row.recorder_id,
  assignedAt: row.assigned_at.toISOString(),
  status: row.status,
});
const toOperation = (row: OperationRow): SetupOperation => ({
  id: row.id,
  assignmentId: row.assignment_id,
  status: row.status,
  createdAt: row.created_at.toISOString(),
});
const hashToken = (rawToken: string) => createHash('sha256').update(rawToken).digest('hex');
async function transaction<T>(
  pool: pg.Pool,
  work: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function audit(
  client: pg.PoolClient,
  actor: ActorContext,
  action: string,
  resourceId: string,
) {
  await client.query(
    'INSERT INTO audit_events(id, actor_id, action, resource_id) VALUES ($1, $2, $3, $4)',
    [randomUUID(), actor.userId, action, resourceId],
  );
}

async function findRecorderAndLockAssignment(
  client: pg.PoolClient,
  assignmentId: string,
): Promise<AssignmentRow | undefined> {
  const reference = await client.query<{ recorder_id: string }>(
    'SELECT recorder_id FROM recorder_assignments WHERE id = $1',
    [assignmentId],
  );
  if (!reference.rows[0]) return undefined;
  await client.query('SELECT id FROM recorders WHERE id = $1 FOR UPDATE', [
    reference.rows[0].recorder_id,
  ]);
  return (
    await client.query<AssignmentRow>(
      'SELECT * FROM recorder_assignments WHERE id = $1 FOR UPDATE',
      [assignmentId],
    )
  ).rows[0];
}

export function createPostgresEnrollmentRepository(pool: pg.Pool): EnrollmentService {
  return {
    async createAssignment(actor, input) {
      if (actor.role !== 'admin' && (!actor.selfService || input.userId !== actor.userId))
        throw new EnrollmentError('FORBIDDEN', 403, 'You can only assign a recorder to yourself.');
      return transaction(pool, async (client) => {
        if (!(await client.query('SELECT 1 FROM users WHERE id = $1', [input.userId])).rows[0]) {
          throw new EnrollmentError('USER_NOT_FOUND', 404, 'The assigned user was not found.');
        }
        await client.query(
          `INSERT INTO recorders(id, serial, model) VALUES ($1, $2, $3)
           ON CONFLICT (serial) DO NOTHING`,
          [randomUUID(), input.serial, input.model],
        );
        const recorder = (
          await client.query<{ id: string; model: string }>(
            'SELECT id, model FROM recorders WHERE serial = $1 FOR UPDATE',
            [input.serial],
          )
        ).rows[0];
        if (!recorder || recorder.model !== input.model) throw assignmentConflict();
        const active = await client.query(
          "SELECT 1 FROM recorder_assignments WHERE recorder_id = $1 AND status = 'active' FOR UPDATE",
          [recorder.id],
        );
        if (active.rows[0]) throw assignmentConflict();
        const id = randomUUID();
        const created = await client.query<AssignmentRow>(
          `INSERT INTO recorder_assignments(id, user_id, recorder_id, status)
           VALUES ($1, $2, $3, 'active') RETURNING *`,
          [id, input.userId, recorder.id],
        );
        await audit(client, actor, 'assignment.created', id);
        return toAssignment(created.rows[0]!);
      });
    },

    async issueToken(actor, assignmentId, expiresInSeconds) {
      return transaction(pool, async (client) => {
        const assignment = await findRecorderAndLockAssignment(client, assignmentId);
        if (
          !assignment ||
          (actor.role !== 'admin' && (!actor.selfService || assignment.user_id !== actor.userId))
        )
          throw notFound();
        if (assignment.status !== 'active') throw assignmentConflict();
        await client.query(
          `UPDATE enrollment_tokens SET revoked_at = clock_timestamp()
           WHERE assignment_id = $1 AND used_at IS NULL AND revoked_at IS NULL`,
          [assignmentId],
        );
        const rawToken = randomBytes(32).toString('base64url');
        const id = randomUUID();
        const token = await client.query<{ expires_at: Date }>(
          `INSERT INTO enrollment_tokens(id, assignment_id, token_hash, expires_at)
           VALUES ($1, $2, $3, clock_timestamp() + ($4 * interval '1 second'))
           RETURNING expires_at`,
          [id, assignmentId, hashToken(rawToken), expiresInSeconds],
        );
        await audit(client, actor, 'token.issued', id);
        return {
          id,
          assignmentId,
          expiresAt: token.rows[0]!.expires_at.toISOString(),
          rawToken,
        };
      });
    },

    async revokeToken(actor, tokenId) {
      await transaction(pool, async (client) => {
        const reference = await client.query<{ assignment_id: string }>(
          'SELECT assignment_id FROM enrollment_tokens WHERE id = $1',
          [tokenId],
        );
        if (!reference.rows[0]) throw notFound();
        const assignment = await findRecorderAndLockAssignment(
          client,
          reference.rows[0].assignment_id,
        );
        if (
          !assignment ||
          (actor.role !== 'admin' && (!actor.selfService || assignment.user_id !== actor.userId))
        )
          throw notFound();
        const token = await client.query<{ revoked_at: Date | null }>(
          'SELECT revoked_at FROM enrollment_tokens WHERE id = $1 FOR UPDATE',
          [tokenId],
        );
        if (!token.rows[0]) throw notFound();
        if (!token.rows[0].revoked_at) {
          await client.query(
            'UPDATE enrollment_tokens SET revoked_at = clock_timestamp() WHERE id = $1',
            [tokenId],
          );
          await client.query(
            `UPDATE setup_operations SET status = 'revoked', revoked_at = clock_timestamp()
             WHERE enrollment_token_id = $1 AND status = 'pending'`,
            [tokenId],
          );
          await audit(client, actor, 'token.revoked', tokenId);
        }
      });
    },

    async endAssignment(actor, assignmentId, status) {
      return transaction(pool, async (client) => {
        const assignment = await findRecorderAndLockAssignment(client, assignmentId);
        if (
          !assignment ||
          (actor.role !== 'admin' && (!actor.selfService || assignment.user_id !== actor.userId))
        )
          throw notFound();
        if (assignment.status === status) return toAssignment(assignment);
        if (assignment.status !== 'active') throw assignmentConflict();
        await client.query(
          `UPDATE enrollment_tokens SET revoked_at = clock_timestamp()
           WHERE assignment_id = $1 AND revoked_at IS NULL`,
          [assignmentId],
        );
        await client.query(
          `UPDATE setup_operations SET status = 'revoked', revoked_at = clock_timestamp()
           WHERE assignment_id = $1 AND status = 'pending'`,
          [assignmentId],
        );
        const ended = await client.query<AssignmentRow>(
          `UPDATE recorder_assignments SET status = $2, ended_at = clock_timestamp()
           WHERE id = $1 RETURNING *`,
          [assignmentId, status],
        );
        await audit(client, actor, 'assignment.ended', assignmentId);
        return toAssignment(ended.rows[0]!);
      });
    },

    async resolve(actor, rawToken) {
      const result = await pool.query<{
        assignment_id: string;
        recorder_id: string;
        model: 'notepro' | 'notepins';
        serial_suffix: string;
        expires_at: Date;
      }>(
        `SELECT t.assignment_id, r.id AS recorder_id, r.model,
                right(r.serial, 4) AS serial_suffix, t.expires_at
         FROM enrollment_tokens t
         JOIN recorder_assignments a ON a.id = t.assignment_id
         JOIN recorders r ON r.id = a.recorder_id
         WHERE t.token_hash = $1 AND a.user_id = $2 AND a.status = 'active'
           AND t.revoked_at IS NULL AND t.used_at IS NULL AND t.expires_at > clock_timestamp()`,
        [hashToken(rawToken), actor.userId],
      );
      const row = result.rows[0];
      if (!row) throw unavailable();
      return {
        assignmentId: row.assignment_id,
        recorder: { id: row.recorder_id, model: row.model, serialSuffix: row.serial_suffix },
        expiresAt: row.expires_at.toISOString(),
      };
    },

    async claim(actor, rawToken, idempotencyKey) {
      return transaction(pool, async (client) => {
        const hash = hashToken(rawToken);
        const keyedOperation = (
          await client.query<{ token_hash: string }>(
            `SELECT t.token_hash
             FROM setup_operations o
             JOIN enrollment_tokens t ON t.id = o.enrollment_token_id
             WHERE o.user_id = $1 AND o.idempotency_key = $2`,
            [actor.userId, idempotencyKey],
          )
        ).rows[0];
        if (keyedOperation && keyedOperation.token_hash !== hash) {
          throw new EnrollmentError(
            'IDEMPOTENCY_CONFLICT',
            409,
            'That idempotency key was already used for another enrollment.',
          );
        }
        const reference = await client.query<{
          id: string;
          assignment_id: string;
          recorder_id: string;
          user_id: string;
        }>(
          `SELECT t.id, t.assignment_id, a.recorder_id, a.user_id
           FROM enrollment_tokens t JOIN recorder_assignments a ON a.id = t.assignment_id
           WHERE t.token_hash = $1`,
          [hash],
        );
        const initial = reference.rows[0];
        if (!initial || initial.user_id !== actor.userId) throw unavailable();
        await client.query('SELECT id FROM recorders WHERE id = $1 FOR UPDATE', [
          initial.recorder_id,
        ]);
        const assignment = (
          await client.query<AssignmentRow>(
            'SELECT * FROM recorder_assignments WHERE id = $1 FOR UPDATE',
            [initial.assignment_id],
          )
        ).rows[0];
        const token = (
          await client.query<{
            id: string;
            assignment_id: string;
            used_at: Date | null;
            revoked_at: Date | null;
            expired: boolean;
          }>(
            `SELECT id, assignment_id, used_at, revoked_at,
                    expires_at <= clock_timestamp() AS expired
             FROM enrollment_tokens WHERE id = $1 FOR UPDATE`,
            [initial.id],
          )
        ).rows[0];
        const existing = (
          await client.query<OperationRow>(
            'SELECT * FROM setup_operations WHERE user_id = $1 AND idempotency_key = $2',
            [actor.userId, idempotencyKey],
          )
        ).rows[0];
        if (existing) {
          if (existing.enrollment_token_id !== initial.id) {
            throw new EnrollmentError(
              'IDEMPOTENCY_CONFLICT',
              409,
              'That idempotency key was already used for another enrollment.',
            );
          }
          if (
            assignment?.status === 'active' &&
            token?.revoked_at === null &&
            existing.status === 'pending'
          ) {
            return toOperation(existing);
          }
          throw unavailable();
        }
        if (
          !assignment ||
          assignment.status !== 'active' ||
          assignment.user_id !== actor.userId ||
          !token ||
          token.revoked_at ||
          token.used_at ||
          token.expired
        ) {
          throw unavailable();
        }
        const operationId = randomUUID();
        try {
          await client.query(
            'UPDATE enrollment_tokens SET used_at = clock_timestamp() WHERE id = $1',
            [token.id],
          );
          const operation = await client.query<OperationRow>(
            `INSERT INTO setup_operations(
               id, assignment_id, enrollment_token_id, user_id, idempotency_key, status
             ) VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING *`,
            [operationId, assignment.id, token.id, actor.userId, idempotencyKey],
          );
          await audit(client, actor, 'enrollment.claimed', operationId);
          return toOperation(operation.rows[0]!);
        } catch (error) {
          if ((error as { code?: string }).code === '23505') {
            throw new EnrollmentError(
              'IDEMPOTENCY_CONFLICT',
              409,
              'That idempotency key was already used for another enrollment.',
            );
          }
          throw error;
        }
      });
    },

    async getClaimOperation(actor, key) {
      const result = await pool.query<OperationRow>(
        'SELECT * FROM setup_operations WHERE user_id = $1 AND idempotency_key = $2',
        [actor.userId, key],
      );
      if (!result.rows[0]) throw unavailable();
      return toOperation(result.rows[0]);
    },
    async getOperation(actor, operationId) {
      const operation = await pool.query<OperationRow>(
        'SELECT * FROM setup_operations WHERE id = $1 AND user_id = $2',
        [operationId, actor.userId],
      );
      if (!operation.rows[0]) throw unavailable();
      return toOperation(operation.rows[0]);
    },
  };
}
