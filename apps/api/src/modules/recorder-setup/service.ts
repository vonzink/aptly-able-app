import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type {
  AccountRecorder,
  AccountRecorders,
  SetupOperation,
  RecorderSetupInput,
} from '@aptly/contracts';
import { lockActiveAccount } from '../account-deletion/lock.js';
import type { ActorContext } from '../identity/development-identity.js';
import { EnrollmentError } from '../enrollments/errors.js';

export interface RecorderSetupService {
  list(actor: ActorContext): Promise<AccountRecorders>;
  add(actor: ActorContext, input: RecorderSetupInput): Promise<AccountRecorder>;
  begin(actor: ActorContext, assignmentId: string): Promise<SetupOperation>;
}
type Row = {
  assignment_id: string;
  recorder_id: string;
  model: 'notepro' | 'notepins';
  serial_suffix: string;
  operation_id: string | null;
  operation_status: 'pending' | 'revoked' | null;
  operation_created_at: Date | null;
};
const select = `SELECT a.id AS assignment_id, r.id AS recorder_id, r.model, right(r.serial,4) AS serial_suffix,
  o.id AS operation_id, o.status AS operation_status, o.created_at AS operation_created_at
  FROM recorder_assignments a JOIN recorders r ON r.id=a.recorder_id
  LEFT JOIN LATERAL (SELECT id,status,created_at FROM setup_operations WHERE assignment_id=a.id AND user_id=a.user_id
    ORDER BY created_at DESC,id DESC LIMIT 1) o ON true
  WHERE a.user_id=$1 AND a.status='active'
    AND NOT EXISTS (SELECT 1 FROM account_deletions WHERE user_id=a.user_id)`;
function card(row: Row): AccountRecorder {
  return {
    assignmentId: row.assignment_id,
    recorder: { id: row.recorder_id, model: row.model, serialSuffix: row.serial_suffix },
    operation: row.operation_id
      ? {
          id: row.operation_id,
          assignmentId: row.assignment_id,
          status: row.operation_status!,
          createdAt: row.operation_created_at!.toISOString(),
        }
      : null,
    setupBlocked: row.operation_status === 'revoked',
  };
}
const missing = () =>
  new EnrollmentError('NOT_FOUND', 404, 'This recorder is not available for your account.');
const conflict = () =>
  new EnrollmentError(
    'ASSIGNMENT_CONFLICT',
    409,
    'This recorder is already assigned or its model does not match.',
  );
export function createRecorderSetupService(pool: pg.Pool): RecorderSetupService {
  async function transact<T>(actor: ActorContext, work: (client: pg.PoolClient) => Promise<T>) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout = '5s'");
      await lockActiveAccount(client, actor.userId);
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
  async function read(client: pg.PoolClient, actor: ActorContext, id: string) {
    const row = (await client.query<Row>(`${select} AND a.id=$2`, [actor.userId, id])).rows[0];
    if (!row) throw missing();
    return card(row);
  }
  return {
    async list(actor) {
      const result = await pool.query<Row>(`${select} ORDER BY a.assigned_at DESC,a.id DESC`, [
        actor.userId,
      ]);
      return {
        recorders: result.rows.map(card),
        canAdd: actor.selfService === true || actor.role === 'admin',
      };
    },
    async add(actor, input) {
      if (!actor.selfService && actor.role !== 'admin')
        throw new EnrollmentError(
          'FORBIDDEN',
          403,
          'Ask your administrator to assign your recorder.',
        );
      return transact(actor, async (client) => {
        await client.query(
          'INSERT INTO recorders(id,serial,model) VALUES ($1,$2,$3) ON CONFLICT(serial) DO NOTHING',
          [randomUUID(), input.serial, input.model],
        );
        const recorder = (
          await client.query<{ id: string; model: string }>(
            'SELECT id,model FROM recorders WHERE serial=$1 FOR UPDATE',
            [input.serial],
          )
        ).rows[0];
        if (!recorder || recorder.model !== input.model) throw conflict();
        const existing = (
          await client.query<{ id: string; user_id: string }>(
            "SELECT id,user_id FROM recorder_assignments WHERE recorder_id=$1 AND status='active' FOR UPDATE",
            [recorder.id],
          )
        ).rows[0];
        if (existing) {
          if (existing.user_id !== actor.userId) throw conflict();
          return read(client, actor, existing.id);
        }
        const id = randomUUID();
        await client.query(
          "INSERT INTO recorder_assignments(id,user_id,recorder_id,status) VALUES ($1,$2,$3,'active')",
          [id, actor.userId, recorder.id],
        );
        await client.query(
          'INSERT INTO audit_events(id,actor_id,action,resource_id) VALUES ($1,$2,$3,$4)',
          [randomUUID(), actor.userId, 'assignment.created', id],
        );
        return read(client, actor, id);
      });
    },
    async begin(actor, id) {
      return transact(actor, async (client) => {
        const reference = (
          await client.query<{ recorder_id: string }>(
            'SELECT recorder_id FROM recorder_assignments WHERE id=$1 AND user_id=$2',
            [id, actor.userId],
          )
        ).rows[0];
        if (!reference) throw missing();
        // Same account -> recorder -> assignment lock order as unpair and deletion.
        await client.query('SELECT id FROM recorders WHERE id=$1 FOR UPDATE', [
          reference.recorder_id,
        ]);
        await client.query('SELECT id FROM recorder_assignments WHERE id=$1 FOR UPDATE', [id]);
        const current = await read(client, actor, id);
        if (current.setupBlocked)
          throw new EnrollmentError(
            'SETUP_REVOKED',
            409,
            'Setup access was revoked. Ask for a new invitation.',
          );
        if (current.operation) return current.operation;
        const operationId = randomUUID();
        const row = (
          await client.query<{ created_at: Date }>(
            `INSERT INTO setup_operations(id,assignment_id,enrollment_token_id,user_id,idempotency_key,status)
          VALUES ($1,$2,NULL,$3,$4,'pending') RETURNING created_at`,
            [operationId, id, actor.userId, randomUUID()],
          )
        ).rows[0]!;
        await client.query(
          'INSERT INTO audit_events(id,actor_id,action,resource_id) VALUES ($1,$2,$3,$4)',
          [randomUUID(), actor.userId, 'enrollment.started_from_account', operationId],
        );
        return {
          id: operationId,
          assignmentId: id,
          status: 'pending',
          createdAt: row.created_at.toISOString(),
        };
      });
    },
  };
}
