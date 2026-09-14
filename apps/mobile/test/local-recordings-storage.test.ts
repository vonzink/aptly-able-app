/// <reference types="node" />

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import { join } from 'node:path';
import { recordingStorageFixture as fixture } from './recording-storage-fixture';

import type { LocalRecording, RecordingPatch } from '../src/features/recordings/recording-model';
import { createRecordingsController } from '../src/features/recordings/recordings-controller';
import { createFileRecordingStore } from '../src/services/recordings/file-recording-store';

describe('native filesystem recording persistence', () => {
  it('saves Plaud source identity with the actual audio and deduplicates after restarting the store', async () => {
    const { store, files, root, input, record } = await fixture();
    const source = {
      kind: 'plaud' as const,
      actorId: '201b4a9f-80dd-4b9b-bdd0-ac5e907ddc08',
      serial: '882123456789',
      sessionId: 42,
      sizeBytes: 100,
    };
    const controller = createRecordingsController({
      store,
      createId: () => record.id,
      now: () => record.importedAt,
    });
    await controller.initialize();
    expect(await controller.importDeviceAudio(input, source)).toBe(record.id);
    const reopened = createFileRecordingStore({ files, root });
    const restored = createRecordingsController({
      store: reopened,
      createId: () => {
        throw new Error('duplicate');
      },
      now: () => record.importedAt,
    });
    await restored.initialize();
    expect(await restored.importDeviceAudio(input, source)).toBe(record.id);
    expect((await reopened.list())[0]?.source).toEqual(source);
    expect(await fs.readFile((await reopened.openAudio(record.id)).uri, 'utf8')).toBe(
      'audio bytes',
    );
  });
  it('preserves independent transcript, rename, and duration edits from stale controller snapshots', async () => {
    const { store, record, input } = await fixture();
    await store.saveAudio(record, input);
    const controllerA = createRecordingsController({
      store,
      createId: () => record.id,
      now: () => record.importedAt,
    });
    const controllerB = createRecordingsController({
      store,
      createId: () => record.id,
      now: () => record.importedAt,
    });
    await Promise.all([controllerA.initialize(), controllerB.initialize()]);
    await controllerA.attachTranscript(record.id, 'notes.txt', 'Keep these actual words.');
    await controllerB.rename(record.id, 'Renamed in tab B');
    await controllerA.setDuration(record.id, 42);
    await controllerB.reload();
    expect(controllerB.getSnapshot().recordings[0]).toMatchObject({
      title: 'Renamed in tab B',
      durationSeconds: 42,
      transcript: { text: 'Keep these actual words.' },
    });
    expect((await store.list())[0]).toEqual(controllerB.getSnapshot().recordings[0]);
  });

  it('reopens metadata and audio after creating a fresh store and preserves the source on removal', async () => {
    const { store, record, input, files, root, source } = await fixture();
    await store.saveAudio(record, input);
    const reopened = createFileRecordingStore({ files, root });
    expect(await reopened.list()).toEqual([record]);
    const audio = await reopened.openAudio(record.id);
    expect(audio.uri).not.toBe(source);
    expect(await fs.readFile(audio.uri, 'utf8')).toBe('audio bytes');
    await reopened.update(record.id, { title: 'Renamed' });
    expect((await store.list())[0]?.title).toBe('Renamed');
    expect(await fs.readFile(audio.uri, 'utf8')).toBe('audio bytes');
    await reopened.remove(record.id);
    expect(await store.list()).toEqual([]);
    expect(await fs.readFile(source, 'utf8')).toBe('audio bytes');
    await expect(fs.stat(audio.uri)).rejects.toThrow();
  });

  it('never publishes a partial import after audio copy fails', async () => {
    const { files, root, record, input } = await fixture();
    const store = createFileRecordingStore({
      files: {
        ...files,
        copyFile: async (_source, destination) => {
          await fs.writeFile(destination, 'partial');
          throw new Error('disk full');
        },
      },
      root,
    });
    await expect(store.saveAudio(record, input)).rejects.toThrow();
    expect(await store.list()).toEqual([]);
    expect(await fs.readdir(root)).toEqual([]);
  });

  it('keeps the last committed metadata when the next write or commit fails', async () => {
    const { store, files, root, record, input } = await fixture();
    await store.saveAudio(record, input);
    const broken = createFileRecordingStore({
      files: {
        ...files,
        move: async () => {
          throw new Error('commit failed');
        },
      },
      root,
    });
    await expect(broken.update(record.id, { title: 'Lost update' })).rejects.toThrow();
    expect(await store.list()).toEqual([record]);
    await store.update(record.id, { title: 'Retry saved' });
    expect((await store.list())[0]?.title).toBe('Retry saved');
  });

  it('does not overwrite existing audio for a duplicate id or recreate deleted metadata', async () => {
    const { store, record, input } = await fixture();
    await store.saveAudio(record, input);
    await expect(store.saveAudio({ ...record, title: 'Duplicate' }, input)).rejects.toThrow();
    expect(await store.list()).toEqual([record]);
    await store.remove(record.id);
    await expect(store.update(record.id, { title: 'Removed' })).rejects.toThrow();
    expect(await store.list()).toEqual([]);
  });

  it('validates copied size and confines recording identifiers to app directories', async () => {
    const { store, input, record, root, source } = await fixture();
    await expect(
      store.saveAudio({ ...record, sizeBytes: 12 }, { ...input, sizeBytes: 12 }),
    ).rejects.toThrow();
    await expect(store.remove('../source.wav')).rejects.toThrow();
    expect(await fs.readFile(source, 'utf8')).toBe('audio bytes');
    expect(await fs.readdir(root)).toEqual([]);
  });

  it('lists metadata without reading audio payloads', async () => {
    const { store, files, root, record, input } = await fixture();
    await store.saveAudio(record, input);
    const metadataOnly = createFileRecordingStore({
      files: {
        ...files,
        readText: async (path) => {
          if (!path.endsWith('.json')) throw new Error('audio read during listing');
          return files.readText(path);
        },
      },
      root,
    });
    expect(await metadataOnly.list()).toEqual([record]);
  });

  it('retains audio and metadata when deletion cannot commit', async () => {
    const { store, files, root, record, input } = await fixture();
    await store.saveAudio(record, input);
    const broken = createFileRecordingStore({
      files: {
        ...files,
        move: async () => {
          throw new Error('move failed');
        },
      },
      root,
    });
    await expect(broken.remove(record.id)).rejects.toThrow();
    expect(await store.list()).toEqual([record]);
    expect(await fs.readFile((await store.openAudio(record.id)).uri, 'utf8')).toBe('audio bytes');
  });

  it('rejects metadata edits that would point at another audio file', async () => {
    const { store, record, input } = await fixture();
    await store.saveAudio(record, input);
    await expect(
      store.update(record.id, { originalName: 'different.mp3' } as unknown as RecordingPatch),
    ).rejects.toThrow();
    expect(await store.list()).toEqual([record]);
  });

  it('reclaims committed deletions on next list after an OS cleanup failure', async () => {
    const { store, files, root, record, input } = await fixture();
    await store.saveAudio(record, input);
    const cleanupFailure = createFileRecordingStore({
      files: {
        ...files,
        remove: async () => {
          throw new Error('OS cleanup failed');
        },
      },
      root,
    });
    await cleanupFailure.remove(record.id);
    expect(await fs.readdir(root)).toEqual([`.deleted-${record.id}`]);
    expect(await store.list()).toEqual([]);
    expect(await fs.readdir(root)).toEqual([]);
  });
});

const deviceSource = {
  kind: 'plaud' as const,
  actorId: '201b4a9f-80dd-4b9b-bdd0-ac5e907ddc08',
  serial: '882123456789',
  sessionId: 42,
  sizeBytes: 100,
};

async function cacheFixture(limit = 22) {
  const test = await fixture();
  const cacheRoot = join(test.root, '..', 'cache');
  const store = createFileRecordingStore({
    files: test.files,
    root: test.root,
    cacheRoot,
    cacheLimitBytes: limit,
  });
  const record: LocalRecording = { ...test.record, source: deviceSource, retention: 'temporary' };
  return { ...test, cacheRoot, store, record };
}

it('bounds temporary audio while preserving library entries and explicit downloads', async () => {
  const { store, record, input } = await cacheFixture(11);
  await store.saveAudio(record, input);
  // Release before eviction; a playing recording must stay readable.
  const playing = await store.openAudio(record.id);
  expect(playing.uri).toContain('/cache/');
  playing.release();
  await store.deviceAudio!.keep(record.id);
  const second = {
    ...record,
    id: 'd3a673f4-5f4c-4e54-9a30-08cb1b06e951',
    importedAt: '2026-09-11T12:00:00.000Z',
  };
  const third = { ...second, id: 'd3a673f4-5f4c-4e54-9a30-08cb1b06e952' };
  await store.saveAudio(second, input);
  await store.saveAudio(third, input);
  const saved = await store.list();
  expect(saved).toHaveLength(3);
  expect(saved.find((r) => r.id === second.id)?.audioAvailable).toBe(false);
  expect(saved.find((r) => r.id === record.id)?.retention).toBe('downloaded');
  expect(await fs.readFile((await store.openAudio(record.id)).uri, 'utf8')).toBe('audio bytes');
  await expect(store.openAudio(second.id)).rejects.toThrow();
  expect(saved.find((r) => r.id === third.id)?.audioAvailable).toBe(true);
});

it('does not evict playing audio or exceed the cache budget when no room can be made', async () => {
  const { store, record, input } = await cacheFixture(11);
  await store.saveAudio(record, input);
  const playing = await store.openAudio(record.id);
  const second = { ...record, id: 'd3a673f4-5f4c-4e54-9a30-08cb1b06e951' };
  await store.saveAudio(second, input);
  expect(await fs.readFile(playing.uri, 'utf8')).toBe('audio bytes');
  expect((await store.list()).find((r) => r.id === second.id)?.audioAvailable).toBe(false);
  playing.release();
  await store.deviceAudio!.restore(second.id, input, false);
  expect((await store.list()).find((r) => r.id === record.id)?.audioAvailable).toBe(false);
  expect(await fs.readFile((await store.openAudio(second.id)).uri, 'utf8')).toBe('audio bytes');
});

it('recovers from OS cache removal and can explicitly download audio larger than the cache', async () => {
  const { store, record, input, cacheRoot } = await cacheFixture(5);
  await store.saveAudio(record, input);
  expect((await store.list())[0]?.audioAvailable).toBe(false);
  await store.deviceAudio!.restore(record.id, input, true);
  expect((await store.list())[0]).toMatchObject({ retention: 'downloaded', audioAvailable: true });
  await fs.rm(cacheRoot, { recursive: true, force: true });
  expect(await fs.readFile((await store.openAudio(record.id)).uri, 'utf8')).toBe('audio bytes');
});

it('persists dismissal by owner and recorder session after deletion, including size changes', async () => {
  const { store, record, input, files, root, cacheRoot } = await cacheFixture();
  await store.saveAudio(record, input);
  const audio = await store.openAudio(record.id);
  audio.release();
  await store.remove(record.id);
  expect(await store.list()).toEqual([]);
  await expect(fs.stat(audio.uri)).rejects.toThrow();
  const reopened = createFileRecordingStore({ files, root, cacheRoot });
  expect(await reopened.deviceAudio!.isDismissed({ ...deviceSource, sizeBytes: 101 })).toBe(true);
  expect(
    await reopened.deviceAudio!.isDismissed({
      ...deviceSource,
      actorId: '301b4a9f-80dd-4b9b-bdd0-ac5e907ddc08',
    }),
  ).toBe(false);
  expect(await reopened.deviceAudio!.isDismissed({ ...deviceSource, sessionId: 43 })).toBe(false);
  await expect(reopened.saveAudio(record, input)).rejects.toThrow(/deleted/i);
});

it('clears temporary audio without removing metadata, downloads, or playing audio', async () => {
  const { store, record, input } = await cacheFixture();
  await store.saveAudio(record, input);
  const playing = await store.openAudio(record.id);
  await store.deviceAudio!.clearTemporary();
  expect(await fs.readFile(playing.uri, 'utf8')).toBe('audio bytes');
  playing.release();
  await store.deviceAudio!.clearTemporary();
  expect((await store.list())[0]).toMatchObject({ id: record.id, audioAvailable: false });
  await expect(fs.stat(playing.uri)).rejects.toThrow();
});

it('exposes current cache availability through the library controller and blocks re-import of deleted audio', async () => {
  const { store, record, input } = await cacheFixture();
  const controller = createRecordingsController({
    store,
    createId: () => record.id,
    now: () => record.importedAt,
  });
  await controller.initialize();
  await controller.importDeviceAudio(input, deviceSource);
  expect(controller.getSnapshot().recordings[0]).toMatchObject({
    retention: 'temporary',
    audioAvailable: true,
  });
  await controller.clearTemporaryAudio();
  expect(controller.getSnapshot().recordings[0]?.audioAvailable).toBe(false);
  expect(await controller.restoreDeviceAudio(record.id, input, true)).toBe(true);
  expect(controller.getSnapshot().recordings[0]).toMatchObject({
    retention: 'downloaded',
    audioAvailable: true,
  });
  await controller.remove(record.id);
  expect(await controller.isSourceDismissed(deviceSource)).toBe(true);
  expect(await controller.importDeviceAudio(input, deviceSource)).toBe(null);
  expect(controller.getSnapshot().recordings).toEqual([]);
});

it('reloads an individual cache file purged by the OS even when native size reports zero', async () => {
  const { store, record, input, files, root, cacheRoot } = await cacheFixture();
  await store.saveAudio(record, input);
  const audio = await store.openAudio(record.id);
  audio.release();
  await fs.rm(audio.uri);
  const reopened = createFileRecordingStore({
    files: { ...files, size: async (path) => ((await files.exists(path)) ? files.size(path) : 0) },
    root,
    cacheRoot,
  });
  expect((await reopened.list())[0]?.audioAvailable).toBe(false);
  await reopened.deviceAudio!.restore(record.id, input, false);
  expect(await fs.readFile((await reopened.openAudio(record.id)).uri, 'utf8')).toBe('audio bytes');
});

it('uses enrollment serial rules for receiving, downloading and dismissing alphanumeric recorder sessions', async () => {
  const { store, files, root, cacheRoot, record, input } = await cacheFixture();
  const source = { ...deviceSource, serial: '88212345B6789012' };
  const controller = createRecordingsController({
    store,
    createId: () => record.id,
    now: () => record.importedAt,
  });
  await controller.initialize();
  expect(await controller.isSourceDismissed(source)).toBe(false);
  expect(await controller.importDeviceAudio(input, source)).toBe(record.id);
  expect(controller.getSnapshot().recordings[0]?.source).toEqual(source);
  expect(await controller.keepOnPhone(record.id)).toBe(true);
  expect(await fs.readFile((await store.openAudio(record.id)).uri, 'utf8')).toBe('audio bytes');
  expect(await controller.remove(record.id)).toBe(true);
  const reopened = createFileRecordingStore({ files, root, cacheRoot });
  expect(await reopened.deviceAudio!.isDismissed(source)).toBe(true);
  expect(await reopened.list()).toEqual([]);
});

it.each(['882/../1234', '882%2f1234', '882123B', ' 88212345B6789012 '])(
  'rejects malformed or noncanonical source serial %s before creating a dismissal path',
  async (serial) => {
    const { store, record, input } = await cacheFixture();
    const source = { ...deviceSource, serial };
    await expect(store.deviceAudio!.isDismissed(source)).rejects.toThrow();
    await expect(store.saveAudio({ ...record, source }, input)).rejects.toThrow();
    expect(await store.list()).toEqual([]);
  },
);
