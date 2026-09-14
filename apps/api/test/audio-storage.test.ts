import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { expect, test } from 'vitest';
import { createAudioStorage } from '../src/modules/recordings/audio-storage.js';

test('publishes exact bytes only, cleans incomplete uploads and rejects invalid keys', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aptly-upload-'));
  try {
    const store = createAudioStorage(root);
    const saved = await store.save(Readable.from([Buffer.from('hello')]), 5);
    expect(await readFile(store.path(saved.key), 'utf8')).toBe('hello');
    expect(saved.sha256).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
    await expect(store.save(Readable.from([Buffer.from('short')]), 10)).rejects.toMatchObject({
      code: 'INVALID_AUDIO',
    });
    await expect(store.save(Readable.from([Buffer.from('too long')]), 1)).rejects.toMatchObject({
      code: 'INVALID_AUDIO',
    });
    expect(await readdir(root)).toEqual([saved.key]);
    expect(() => store.path('../outside')).toThrow();
    await store.remove(saved.key);
    expect(await readdir(root)).toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
