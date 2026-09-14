/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import { join } from 'node:path';
import { recordingStorageFixture } from './recording-storage-fixture';
import { createFileRecordingStore } from '../src/services/recordings/file-recording-store';
import { createRecordingsController } from '../src/features/recordings/recordings-controller';

const source = {
  kind: 'plaud' as const,
  actorId: '201b4a9f-80dd-4b9b-bdd0-ac5e907ddc08',
  serial: '882123456789',
  sessionId: 42,
  sizeBytes: 100,
};

async function fixture() {
  const test = await recordingStorageFixture();
  const cacheRoot = join(test.root, '..', 'cache');
  const store = createFileRecordingStore({ files: test.files, root: test.root, cacheRoot });
  const record = { ...test.record, source, retention: 'temporary' as const };
  await store.saveAudio(record, test.input);
  const audio = await store.openAudio(record.id);
  audio.release();
  return { ...test, record, cacheRoot, store, audio };
}

describe('recoverable Plaud deletion', () => {
  it('preserves the recording and its restore eligibility when dismissal cannot commit', async () => {
    const { files, root, cacheRoot, record, input, store, audio } = await fixture();
    const broken = createFileRecordingStore({
      root,
      cacheRoot,
      files: {
        ...files,
        move: async (from, to, directory) => {
          if (to.includes('/.dismissed/')) throw new Error('dismissal commit failed');
          await files.move(from, to, directory);
        },
      },
    });
    await expect(broken.remove(record.id)).rejects.toThrow();
    expect(await store.deviceAudio!.isDismissed(source)).toBe(false);
    expect(await store.list()).toEqual([{ ...record, audioAvailable: true }]);
    expect(await fs.readFile(audio.uri, 'utf8')).toBe('audio bytes');
    await expect(store.deviceAudio!.restore(record.id, input, true)).resolves.toBeUndefined();
  });

  it.each(['metadata move', 'cache removal'])(
    'reports a committed deletion and recovers after %s fails, including restart',
    async (failure) => {
      const { files, root, cacheRoot, record, input, audio } = await fixture();
      const broken = createFileRecordingStore({
        root,
        cacheRoot,
        files: {
          ...files,
          move: async (from, to, directory) => {
            if (failure === 'metadata move' && to.includes('/.deleted-'))
              throw new Error('metadata cleanup failed');
            await files.move(from, to, directory);
          },
          remove: async (path, directory) => {
            if (failure === 'cache removal' && path.startsWith(cacheRoot))
              throw new Error('cache cleanup failed');
            await files.remove(path, directory);
          },
        },
      });
      const library = createRecordingsController({
        store: broken,
        createId: () => record.id,
        now: () => record.importedAt,
      });
      await library.initialize();
      expect(await library.remove(record.id)).toBe(true);
      expect(library.getSnapshot().recordings).toEqual([]);
      expect(await broken.list()).toEqual([]);
      await expect(broken.openAudio(record.id)).rejects.toThrow();
      const reopened = createFileRecordingStore({ files, root, cacheRoot });
      // Check before listing: sync must not recreate a committed deletion on restart.
      expect(await reopened.deviceAudio!.isDismissed({ ...source, sizeBytes: 101 })).toBe(true);
      await expect(reopened.saveAudio(record, input)).rejects.toThrow(/deleted/i);
      expect(await reopened.list()).toEqual([]);
      expect(await files.exists(join(root, record.id))).toBe(false);
      expect(await files.exists(audio.uri)).toBe(false);
      expect(await fs.readFile(input.uri, 'utf8')).toBe('audio bytes');
    },
  );
});
