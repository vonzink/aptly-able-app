import { expect, it } from 'vitest';
import { createRecordingLocationController } from '../src/features/recording-location/location-controller';
import type {
  LocationStatus,
  RecordingLocationPort,
} from '../src/features/recording-location/location-port';
const status: LocationStatus = {
  enabled: false,
  permission: 'foreground',
  backgroundReady: false,
  capturing: false,
  reason: 'off',
};
function fixture() {
  let enabled = false;
  let owner: string | null = null;
  const port: RecordingLocationPort = {
    available: true,
    setContext: async (context) => {
      owner = context.actorId;
      enabled = false;
    },
    getStatus: async () => ({ ...status, enabled }),
    setEnabled: async (next) => {
      enabled = next;
      return { ...status, enabled };
    },
    requestBackground: async () => ({ ...status, enabled, backgroundReady: true }),
    subscribe: () => () => {},
    read: async () => null,
    remove: async () => {},
    clearActor: async () => {},
  };
  return {
    port,
    controller: createRecordingLocationController(port),
    owner: () => owner,
    enabled: () => enabled,
  };
}
it('starts unavailable until context is ready and never enables on context restoration', async () => {
  const f = fixture();
  expect(f.controller.getSnapshot().enabled).toBe(false);
  await f.controller.setContext({ actorId: 'alice', serial: null });
  expect(f.enabled()).toBe(false);
  expect(f.controller.getSnapshot().actorId).toBe('alice');
  expect(f.controller.getSnapshot().busy).toBe(false);
});
it('enables only on explicit action and clears displayed consent on sign-out', async () => {
  const f = fixture();
  await f.controller.setContext({ actorId: 'alice', serial: '123' });
  expect(await f.controller.setEnabled(true)).toBe(true);
  expect(f.controller.getSnapshot().enabled).toBe(true);
  await f.controller.setContext({ actorId: null, serial: null });
  expect(f.controller.getSnapshot().enabled).toBe(false);
  expect(await f.controller.setEnabled(true)).toBe(false);
});
it('ignores a permission completion belonging to the previous signed-in user', async () => {
  const f = fixture();
  await f.controller.setContext({ actorId: 'alice', serial: '123' });
  let finish!: (value: LocationStatus) => void;
  f.port.setEnabled = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const enabling = f.controller.setEnabled(true);
  await f.controller.setContext({ actorId: 'bob', serial: '456' });
  finish({ ...status, enabled: true });
  await enabling;
  expect(f.controller.getSnapshot().actorId).toBe('bob');
  expect(f.controller.getSnapshot().enabled).toBe(false);
});
it('surfaces failure without displaying an enabled switch', async () => {
  const f = fixture();
  await f.controller.setContext({ actorId: 'alice', serial: null });
  f.port.setEnabled = async () => {
    throw new Error('native permission failed');
  };
  expect(await f.controller.setEnabled(true)).toBe(false);
  expect(f.controller.getSnapshot().enabled).toBe(false);
  expect(f.controller.getSnapshot().error).toBeTruthy();
  expect(f.controller.getSnapshot().busy).toBe(false);
});

it('does not overwrite a completed preference change with an older status read', async () => {
  const f = fixture();
  await f.controller.setContext({ actorId: 'alice', serial: '123' });
  let finish!: (value: LocationStatus) => void;
  f.port.getStatus = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const reading = f.controller.refresh();
  await f.controller.setEnabled(true);
  finish(status);
  await reading;
  expect(f.controller.getSnapshot().enabled).toBe(true);
});

it('reports an unsaved disable and preserves the persisted switch state for retry', async () => {
  const f = fixture();
  await f.controller.setContext({ actorId: 'alice', serial: '123' });
  await f.controller.setEnabled(true);
  f.port.setEnabled = async () => ({
    ...status,
    enabled: true,
    capturing: false,
    reason: 'storage',
  });
  expect(await f.controller.setEnabled(false)).toBe(false);
  expect(f.controller.getSnapshot().enabled).toBe(true);
  expect(f.controller.getSnapshot().error).toContain('saved');
});
