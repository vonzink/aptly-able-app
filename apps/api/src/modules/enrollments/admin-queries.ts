import type pg from 'pg';
import { z } from 'zod';
import type { AdminAssignment, AdminUser } from '@aptly/contracts';
import type { ActorContext } from '../identity/development-identity.js';
import { EnrollmentError } from './errors.js';

type Page<T, Key extends string> = Record<Key, T[]> & { hasMore: boolean };
export interface AdminEnrollmentQueries {
  users(actor: ActorContext, page: number): Promise<Page<AdminUser, 'users'>>;
  assignments(actor: ActorContext, page: number): Promise<Page<AdminAssignment, 'assignments'>>;
  assignment(actor: ActorContext, id: string): Promise<AdminAssignment>;
}
const pageSchema = z.number().int().min(1).max(100000);
function requireAdmin(actor: ActorContext) {
  if (actor.role !== 'admin' && !actor.selfService)
    throw new EnrollmentError('FORBIDDEN', 403, 'Administrator access is required.');
}
function offset(page: number) {
  const parsed = pageSchema.safeParse(page);
  if (!parsed.success)
    throw new EnrollmentError('INVALID_INPUT', 400, 'The requested page is invalid.');
  return (parsed.data - 1) * 25;
}
type Row = {
  id: string;
  user_id: string;
  recorder_id: string;
  assigned_at: Date;
  status: AdminAssignment['status'];
  display_name: string;
  model: 'notepro' | 'notepins';
  serial_suffix: string;
  token_id: string | null;
  token_expires_at: Date | null;
  token_created_at: Date | null;
  token_used_at: Date | null;
  token_revoked_at: Date | null;
  operation_id: string | null;
  operation_status: 'pending' | 'revoked' | null;
  operation_created_at: Date | null;
};
const selectAssignment = `
 SELECT a.id, a.user_id, a.recorder_id, a.assigned_at, a.status, u.display_name,
        r.model, right(r.serial,4) AS serial_suffix,
        t.id AS token_id, t.expires_at AS token_expires_at, t.created_at AS token_created_at,
        t.used_at AS token_used_at, t.revoked_at AS token_revoked_at,
        o.id AS operation_id, o.status AS operation_status, o.created_at AS operation_created_at
 FROM recorder_assignments a JOIN users u ON u.id = a.user_id JOIN recorders r ON r.id = a.recorder_id
 LEFT JOIN LATERAL (SELECT * FROM enrollment_tokens WHERE assignment_id = a.id ORDER BY created_at DESC, id DESC LIMIT 1) t ON true
 LEFT JOIN LATERAL (SELECT * FROM setup_operations WHERE assignment_id = a.id ORDER BY created_at DESC, id DESC LIMIT 1) o ON true`;
function map(row: Row): AdminAssignment {
  return {
    id: row.id,
    userId: row.user_id,
    recorderId: row.recorder_id,
    assignedAt: row.assigned_at.toISOString(),
    status: row.status,
    user: { id: row.user_id, displayName: row.display_name },
    recorder: { id: row.recorder_id, model: row.model, serialSuffix: row.serial_suffix },
    latestInvitation: row.token_id
      ? {
          id: row.token_id,
          expiresAt: row.token_expires_at!.toISOString(),
          createdAt: row.token_created_at!.toISOString(),
          usedAt: row.token_used_at?.toISOString() ?? null,
          revokedAt: row.token_revoked_at?.toISOString() ?? null,
        }
      : null,
    latestOperation: row.operation_id
      ? {
          id: row.operation_id,
          assignmentId: row.id,
          status: row.operation_status!,
          createdAt: row.operation_created_at!.toISOString(),
        }
      : null,
  };
}
export function createAdminEnrollmentQueries(pool: pg.Pool): AdminEnrollmentQueries {
  return {
    async users(actor, page) {
      requireAdmin(actor);
      const result = await pool.query<{ id: string; display_name: string }>(
        'SELECT id, display_name FROM users WHERE ($2::uuid IS NULL OR id = $2) ORDER BY display_name, id LIMIT 26 OFFSET $1',
        [offset(page), actor.role === 'admin' ? null : actor.userId],
      );
      return {
        users: result.rows
          .slice(0, 25)
          .map((row) => ({ id: row.id, displayName: row.display_name })),
        hasMore: result.rows.length > 25,
      };
    },
    async assignments(actor, page) {
      requireAdmin(actor);
      const result = await pool.query<Row>(
        `${selectAssignment} WHERE ($2::uuid IS NULL OR a.user_id = $2) ORDER BY a.assigned_at DESC, a.id DESC LIMIT 26 OFFSET $1`,
        [offset(page), actor.role === 'admin' ? null : actor.userId],
      );
      return { assignments: result.rows.slice(0, 25).map(map), hasMore: result.rows.length > 25 };
    },
    async assignment(actor, id) {
      requireAdmin(actor);
      if (!z.uuid().safeParse(id).success)
        throw new EnrollmentError('INVALID_INPUT', 400, 'The assignment identity is invalid.');
      const result = await pool.query<Row>(
        `${selectAssignment} WHERE a.id = $1 AND ($2::uuid IS NULL OR a.user_id = $2)`,
        [id, actor.role === 'admin' ? null : actor.userId],
      );
      if (!result.rows[0])
        throw new EnrollmentError('NOT_FOUND', 404, 'The assignment is not available.');
      return map(result.rows[0]);
    },
  };
}
