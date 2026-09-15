import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type pg from 'pg';
import {
  registerAccountSchema,
  loginAccountSchema,
  authResponseSchema,
  type RegisterAccount,
  type LoginAccount,
  type AuthResponse,
} from '@aptly/contracts';
import type { ActorContext, SessionVerifier } from './development-identity.js';
import { hashPassword, verifyPassword } from './password.js';
export class PilotAuthError extends Error {
  readonly code = 'AUTH_FAILED';
  readonly statusCode = 401;
  constructor() {
    super('The account request could not be completed. Check your details and try again.');
  }
}
export interface PilotIdentity extends SessionVerifier {
  register(input: RegisterAccount): Promise<AuthResponse>;
  login(input: LoginAccount): Promise<AuthResponse>;
  logout(authorization: string | undefined): Promise<void>;
}
function tokenHash(authorization: string | undefined): string | undefined {
  const token = authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
  return token ? createHash('sha256').update(token).digest('hex') : undefined;
}
export function createPilotIdentity(pool: pg.Pool): PilotIdentity {
  async function session(query: Pick<pg.PoolClient, 'query'>, userId: string) {
    const credential = randomBytes(32).toString('base64url');
    const result = await query.query<{ expires_at: Date }>(
      `INSERT INTO pilot_sessions(token_hash,user_id,expires_at)
       VALUES ($1,$2,clock_timestamp() + interval '7 days') RETURNING expires_at`,
      [tokenHash(`Bearer ${credential}`), userId],
    );
    return authResponseSchema.parse({
      credential,
      expiresAt: result.rows[0]!.expires_at.toISOString(),
      session: { user: { id: userId, role: 'user' }, mode: 'pilot' },
    });
  }
  return {
    async register(raw) {
      const parsed = registerAccountSchema.safeParse(raw);
      if (!parsed.success) throw new PilotAuthError();
      const input = parsed.data;
      const passwordHash = await hashPassword(input.password);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const userId = randomUUID();
        await client.query('INSERT INTO users(id,display_name) VALUES ($1,$2)', [
          userId,
          input.displayName,
        ]);
        await client.query(
          'INSERT INTO pilot_accounts(user_id,email,password_hash) VALUES ($1,$2,$3)',
          [userId, input.email, passwordHash],
        );
        const response = await session(client, userId);
        await client.query('COMMIT');
        return response;
      } catch (error) {
        await client.query('ROLLBACK');
        if (error && typeof error === 'object' && 'code' in error && error.code === '23505')
          throw new PilotAuthError();
        throw error;
      } finally {
        client.release();
      }
    },
    async login(raw) {
      const parsed = loginAccountSchema.safeParse(raw);
      if (!parsed.success) throw new PilotAuthError();
      const input = parsed.data;
      const result = await pool.query<{ user_id: string; password_hash: string }>(
        'SELECT user_id,password_hash FROM pilot_accounts WHERE email=$1 AND NOT EXISTS (SELECT 1 FROM account_deletions WHERE user_id=pilot_accounts.user_id)',
        [input.email],
      );
      const account = result.rows[0];
      const valid = await verifyPassword(input.password, account?.password_hash);
      if (!valid || !account) throw new PilotAuthError();
      return session(pool, account.user_id);
    },
    async verify(authorization): Promise<ActorContext | undefined> {
      const hash = tokenHash(authorization);
      if (!hash) return undefined;
      const result = await pool.query<{ user_id: string }>(
        `SELECT user_id FROM pilot_sessions WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>clock_timestamp() AND NOT EXISTS (SELECT 1 FROM account_deletions WHERE user_id=pilot_sessions.user_id)`,
        [hash],
      );
      const userId = result.rows[0]?.user_id;
      return userId ? { userId, role: 'user', selfService: true } : undefined;
    },
    async logout(authorization) {
      const hash = tokenHash(authorization);
      if (hash)
        await pool.query(
          'UPDATE pilot_sessions SET revoked_at=clock_timestamp() WHERE token_hash=$1 AND revoked_at IS NULL',
          [hash],
        );
    },
  };
}
