import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { z } from 'zod';
import {
  plaudDeviceOperationRequestSchema,
  plaudDeviceSessionSchema,
  type PlaudDeviceSession,
  type PlaudDeviceBind,
  type PlaudDeviceUnbind,
} from '@aptly/contracts';
import type { ActorContext } from '../identity/development-identity.js';
import type { PlaudDeviceProvider } from './provider.js';
import { PlaudDeviceError } from './errors.js';

export interface PlaudDeviceService {
  session(actor: ActorContext, operationId: string): Promise<PlaudDeviceSession>;
  bind(actor: ActorContext, operationId: string): Promise<PlaudDeviceBind>;
  unbind(actor: ActorContext, operationId: string): Promise<PlaudDeviceUnbind>;
}
type Recorder = PlaudDeviceSession['recorder'];
const missing = () =>
  new PlaudDeviceError(
    'PLAUD_OPERATION_NOT_FOUND',
    404,
    'This recorder enrollment is unavailable for your account.',
  );
const inactive = () =>
  new PlaudDeviceError(
    'PLAUD_ENROLLMENT_INACTIVE',
    409,
    'This recorder enrollment is no longer active.',
  );

export function createPlaudDeviceService(
  pool: pg.Pool,
  provider: PlaudDeviceProvider,
): PlaudDeviceService {
  async function owned<T>(
    actor: ActorContext,
    operationId: string,
    releasing: boolean,
    work: (recorder: Recorder, client: pg.PoolClient) => Promise<T>,
  ): Promise<T> {
    if (
      !z.uuid().safeParse(actor.userId).success ||
      !plaudDeviceOperationRequestSchema.safeParse({ operationId }).success
    )
      throw new PlaudDeviceError('INVALID_INPUT', 400, 'A valid recorder enrollment is required.');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout = '5s'");
      const reference = (
        await client.query<{ recorder_id: string }>(
          `SELECT a.recorder_id FROM setup_operations o
         JOIN recorder_assignments a ON a.id = o.assignment_id AND a.user_id = o.user_id
         WHERE o.id = $1 AND o.user_id = $2`,
          [operationId, actor.userId],
        )
      ).rows[0];
      if (!reference) throw missing();
      // Follow enrollment's recorder -> assignment -> operation lock order. Keep the
      // lock during the bounded cloud call so revocation/reassignment cannot overtake it.
      const device = (
        await client.query<Recorder>(
          'SELECT serial, model FROM recorders WHERE id = $1 FOR UPDATE',
          [reference.recorder_id],
        )
      ).rows[0];
      const state = (
        await client.query<{ operation_status: string; assignment_status: string }>(
          `SELECT o.status AS operation_status, a.status AS assignment_status
         FROM setup_operations o
         JOIN recorder_assignments a ON a.id = o.assignment_id AND a.user_id = o.user_id
         WHERE o.id = $1 AND o.user_id = $2 FOR UPDATE OF a, o`,
          [operationId, actor.userId],
        )
      ).rows[0];
      if (!device || !state) throw missing();
      if (
        !releasing &&
        (state.operation_status !== 'pending' || state.assignment_status !== 'active')
      )
        throw inactive();
      if (releasing) {
        const assignedElsewhere = await client.query(
          "SELECT 1 FROM recorder_assignments WHERE recorder_id = $1 AND status = 'active' AND user_id <> $2",
          [reference.recorder_id, actor.userId],
        );
        if (assignedElsewhere.rows[0])
          throw new PlaudDeviceError(
            'PLAUD_RECORDER_REASSIGNED',
            409,
            'This recorder has been reassigned. Contact your administrator before unpairing.',
          );
      }
      const recorder = plaudDeviceSessionSchema.shape.recorder.parse(device);
      const result = await work(recorder, client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  async function vendor<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof PlaudDeviceError) throw error;
      throw new PlaudDeviceError(
        'PLAUD_PROVIDER_UNAVAILABLE',
        502,
        'Plaud could not complete the device request. Try again.',
      );
    }
  }
  async function audit(
    client: pg.PoolClient,
    actor: ActorContext,
    operationId: string,
    action: string,
  ) {
    await client.query(
      'INSERT INTO audit_events(id, actor_id, action, resource_id) VALUES ($1, $2, $3, $4)',
      [randomUUID(), actor.userId, action, operationId],
    );
  }
  return {
    session: (actor, operationId) =>
      owned(actor, operationId, false, async (recorder) => {
        const token = await vendor(() => provider.session(actor.userId));
        return plaudDeviceSessionSchema.parse({ ...token, userId: actor.userId, recorder });
      }),
    bind: (actor, operationId) =>
      owned(actor, operationId, false, async (recorder, client) => {
        await vendor(() => provider.bind(actor.userId, recorder));
        await audit(client, actor, operationId, 'plaud.device_bound');
        return { status: 'bound' as const };
      }),
    unbind: (actor, operationId) =>
      owned(actor, operationId, true, async (recorder, client) => {
        await vendor(() => provider.unbind(actor.userId, recorder));
        await audit(client, actor, operationId, 'plaud.device_unbound');
        return { status: 'unbound' as const };
      }),
  };
}
