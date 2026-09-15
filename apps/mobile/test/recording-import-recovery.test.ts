import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { createRecordingsController } from '../src/features/recordings/recordings-controller';
import { recordingStorageFixture } from './recording-storage-fixture';

const source = {
  kind: 'plaud' as const,
  actorId: '201b4a9f-80dd-4b9b-bdd0-ac5e907ddc08',
  serial: '88212345B6789012',
  sessionId: 42,
  sizeBytes: 100,
};

it('refuses a device import when the saved library cannot be read, then recovers without duplication', async () => {
  const { store, input } = await recordingStorageFixture();
  const original = createRecordingsController({
    store,
    createId: randomUUID,
    now: () => new Date().toISOString(),
  });
  await original.initialize();
  const id = await original.importDeviceAudio(input, source);
  let offline = true;
  const reopened = createRecordingsController({
    store: {
      ...store,
      readLibrary: async () => {
        if (offline) throw new Error('storage unavailable');
        return store.readLibrary!();
      },
    },
    createId: randomUUID,
    now: () => new Date().toISOString(),
  });
  await reopened.initialize();
  expect(await reopened.importDeviceAudio(input, source)).toBeNull();
  expect(await store.list()).toHaveLength(1);
  offline = false;
  expect(await reopened.importDeviceAudio(input, source)).toBe(id);
  expect(await store.list()).toHaveLength(1);
});

it('does not duplicate a committed import when its following library refresh fails', async () => {
  const { store, input } = await recordingStorageFixture();
  let failRead = false;
  const library = createRecordingsController({
    store: {
      ...store,
      saveAudio: async (record, audio) => {
        await store.saveAudio(record, audio);
        failRead = true;
      },
      readLibrary: async () => {
        if (failRead) throw new Error('storage unavailable');
        return store.readLibrary!();
      },
    },
    createId: randomUUID,
    now: () => new Date().toISOString(),
  });
  await library.initialize();
  expect(await library.importDeviceAudio(input, source)).toBeNull();
  const committed = (await store.list())[0]!;
  failRead = false;
  expect(await library.importDeviceAudio(input, source)).toBe(committed.id);
  expect(await store.list()).toHaveLength(1);
});

it('checks persisted identities before importing even when initialize has not been called', async () => {
  const { store, input } = await recordingStorageFixture();
  const makeLibrary = () =>
    createRecordingsController({
      store,
      createId: randomUUID,
      now: () => new Date().toISOString(),
    });
  const first = makeLibrary();
  await first.initialize();
  const id = await first.importDeviceAudio(input, source);
  expect(await makeLibrary().importDeviceAudio(input, source)).toBe(id);
  expect(await store.list()).toHaveLength(1);
});
