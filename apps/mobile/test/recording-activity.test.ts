import { describe, expect, it, vi } from 'vitest';
import { createRecordingActivityCoordinator } from '../src/features/phone-recording/recording-activity';
import type { PhoneRecordingSnapshot } from '../src/features/phone-recording/phone-recording-controller';
import { visibleToActor } from '../src/features/recordings/recording-model';

const state: PhoneRecordingSnapshot = {
  actorId: 'owner',
  draft: { id: 'recording', actorId: 'owner', uri: 'private', createdAt: 'private' },
  phase: 'recording',
  ready: true,
  busy: false,
  seconds: 5,
  savedId: null,
  error: null,
};
describe('recording lock screen', () => {
  it('shares only timing and status, throttles refresh, updates immediately on pause', async () => {
    const port = { show: vi.fn(async () => {}), end: vi.fn(async () => {}) };
    let now = 100_000;
    const c = createRecordingActivityCoordinator(port, () => now);
    await c.update(state);
    expect(port.show).toHaveBeenCalledWith(
      { paused: false, elapsedSeconds: 5, timerStart: 95_000, timerEnd: 7_295_000 },
      160_000,
    );
    now += 500;
    await c.update({ ...state, seconds: 5.5 });
    expect(port.show).toHaveBeenCalledTimes(1);
    await c.update({ ...state, phase: 'paused' });
    expect(port.show).toHaveBeenCalledTimes(2);
    now += 30_000;
    await c.update({ ...state, phase: 'paused' });
    expect(port.show).toHaveBeenCalledTimes(3);
  });
  it('ends after a queued update when the account signs out', async () => {
    const calls: string[] = [];
    let complete!: () => void;
    const c = createRecordingActivityCoordinator({
      show: () =>
        new Promise<void>((r) => {
          calls.push('show');
          complete = r;
        }),
      end: async () => {
        calls.push('end');
      },
    });
    const start = c.update(state);
    await Promise.resolve();
    const end = c.update({ ...state, actorId: null, draft: null, phase: 'idle' });
    complete();
    await Promise.all([start, end]);
    expect(calls).toEqual(['show', 'end']);
  });
  it('does not propagate optional lock-screen failures into microphone capture', async () => {
    const port = {
      show: vi.fn(async () => {
        throw new Error('disabled');
      }),
      end: vi.fn(async () => {}),
    };
    const c = createRecordingActivityCoordinator(port);
    await expect(c.update(state)).resolves.toBeUndefined();
    await c.update({ ...state, draft: null, phase: 'review' });
    expect(port.end).toHaveBeenCalledOnce();
  });
});
it('hides phone recordings from signed-out users and other accounts', () => {
  const record = { phoneCapture: { actorId: 'owner', createdAt: 'date' } };
  expect(visibleToActor(record, null)).toBe(false);
  expect(visibleToActor(record, 'other')).toBe(false);
  expect(visibleToActor(record, 'owner')).toBe(true);
  expect(visibleToActor({}, null)).toBe(true); // Existing manual imports stay device-shared.
});
