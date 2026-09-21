import { describe, expect, it, vi } from 'vitest';
import { createPhoneRecordingController } from '../src/features/phone-recording/phone-recording-controller';
import type {
  PhoneRecorderPort,
  PhoneRecordingDraft,
} from '../src/features/phone-recording/phone-recording-model';
const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const id = '33333333-3333-4333-8333-333333333333';
const draft: PhoneRecordingDraft = {
  id,
  actorId: owner,
  createdAt: '2026-09-18T12:00:00Z',
  uri: 'file:///audio.m4a',
};
function setup() {
  let recording = false;
  let duration = 0;
  const port: PhoneRecorderPort = {
    available: true,
    requestPermission: vi.fn(async () => true),
    prepare: vi.fn(async () => draft),
    record: vi.fn(() => {
      recording = true;
    }),
    pause: vi.fn(() => {
      recording = false;
    }),
    stop: vi.fn(async () => {
      recording = false;
    }),
    status: () => ({
      recording,
      canRecord: true,
      durationSeconds: duration,
      finished: false,
      error: false,
    }),
    audio: vi.fn(async () => ({
      ...draft,
      durationSeconds: duration,
      input: {
        name: 'Phone recording.m4a',
        uri: draft.uri,
        sizeBytes: 1024,
        mimeType: 'audio/mp4',
      },
    })),
    recover: vi.fn(async () => null),
    discard: vi.fn(async () => {}),
    clearActor: vi.fn(async () => {}),
  };
  const save = vi.fn(async () => id as string | null);
  const c = createPhoneRecordingController({
    port,
    save,
    createId: () => id,
    now: () => draft.createdAt,
  });
  return {
    port,
    save,
    c,
    setDuration: (n: number) => {
      duration = n;
    },
  };
}
describe('phone recording lifecycle', () => {
  it('requires sign-in and an explicit start before asking for microphone permission', async () => {
    const { c, port } = setup();
    await c.activate(null);
    await c.start();
    expect(port.requestPermission).not.toHaveBeenCalled();
    await c.activate(owner);
    expect(port.requestPermission).not.toHaveBeenCalled();
    await c.start();
    expect(port.record).toHaveBeenCalledOnce();
  });
  it('permission denial never prepares or starts audio', async () => {
    const { c, port } = setup();
    vi.mocked(port.requestPermission).mockResolvedValue(false);
    await c.activate(owner);
    await c.start();
    expect(port.prepare).not.toHaveBeenCalled();
    expect(c.getSnapshot().error).toMatch(/permission/i);
  });
  it('prevents duplicate starts and retains a failed save for retry', async () => {
    const { c, port, save, setDuration } = setup();
    await c.activate(owner);
    await Promise.all([c.start(), c.start()]);
    expect(port.record).toHaveBeenCalledOnce();
    setDuration(30);
    await c.stop();
    save.mockResolvedValueOnce(null);
    expect(await c.save()).toBeNull();
    expect(port.discard).not.toHaveBeenCalled();
    expect(c.getSnapshot().phase).toBe('review');
    expect(await c.save()).toBe(id);
    expect(port.discard).toHaveBeenCalledOnce();
  });
  it('never resumes after an interruption without user action', async () => {
    const { c, port, setDuration } = setup();
    await c.activate(owner);
    await c.start();
    setDuration(5);
    port.pause();
    c.refresh();
    expect(c.getSnapshot().phase).toBe('paused');
    expect(port.record).toHaveBeenCalledTimes(1);
    await c.resume();
    expect(port.record).toHaveBeenCalledTimes(2);
  });
  it('stops on account changes and does not reveal the previous draft', async () => {
    const { c, port } = setup();
    await c.activate(owner);
    await c.start();
    await c.activate(other);
    expect(port.stop).toHaveBeenCalled();
    expect(c.getSnapshot().draft).toBeNull();
    expect(c.getSnapshot().actorId).toBe(other);
  });
  it('cancels a permission result after sign-out', async () => {
    const { c, port } = setup();
    let allow!: (n: boolean) => void;
    vi.mocked(port.requestPermission).mockReturnValue(
      new Promise((r) => {
        allow = r;
      }),
    );
    await c.activate(owner);
    const start = c.start();
    const logout = c.activate(null);
    allow(true);
    await Promise.all([start, logout]);
    expect(port.record).not.toHaveBeenCalled();
    expect(c.getSnapshot().actorId).toBeNull();
  });
  it('recovers an unfinished recording without restarting the microphone', async () => {
    const { c, port } = setup();
    vi.mocked(port.recover).mockResolvedValue(draft);
    await c.activate(owner);
    expect(c.getSnapshot().phase).toBe('review');
    expect(port.record).not.toHaveBeenCalled();
  });
  it('keeps cleanup failure visible and retry does not duplicate saved audio', async () => {
    const { c, port, save, setDuration } = setup();
    await c.activate(owner);
    await c.start();
    setDuration(3);
    await c.stop();
    vi.mocked(port.discard).mockRejectedValueOnce(new Error('disk'));
    expect(await c.save()).toBeNull();
    expect(c.getSnapshot().savedId).toBe(id);
    expect(await c.save()).toBe(id);
    expect(save).toHaveBeenCalledTimes(1);
  });
});

it('lets the user discard prepared audio when starting the microphone fails', async () => {
  const { c, port } = setup();
  vi.mocked(port.record).mockImplementationOnce(() => {
    throw new Error('Microphone is in use.');
  });
  await c.activate(owner);
  await c.start();
  expect(c.getSnapshot().phase).toBe('review');
  expect(c.getSnapshot().draft?.id).toBe(id);
  await c.discard();
  expect(c.getSnapshot().draft).toBeNull();
});
it('still stops audio when reading native status fails', async () => {
  const { c, port } = setup();
  await c.activate(owner);
  await c.start();
  port.status = () => {
    throw new Error('Native status failed');
  };
  await c.stop();
  expect(c.getSnapshot().phase).toBe('review');
  expect(port.stop).toHaveBeenCalledTimes(2);
});
it('enforces the remaining duration after pause instead of restarting the limit', async () => {
  const { c, port, setDuration } = setup();
  await c.activate(owner);
  await c.start();
  setDuration(100);
  await c.pause();
  await c.resume();
  expect(port.record).toHaveBeenLastCalledWith(7100);
});
