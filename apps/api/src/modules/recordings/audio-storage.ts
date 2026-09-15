import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, rename, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import { RecordingError } from './errors.js';

export function createAudioStorage(directory: string) {
  const root = resolve(directory);
  const path = (key: string) => {
    if (!/^[a-f0-9-]{36}\.audio$/.test(key)) throw new Error('Invalid audio storage key.');
    return resolve(root, key);
  };
  return {
    path,
    async save(source: Readable, expectedBytes: number, reservedKey?: string) {
      if (
        !Number.isSafeInteger(expectedBytes) ||
        expectedBytes <= 0 ||
        expectedBytes > 250 * 1024 * 1024
      )
        throw new RecordingError(400, 'INVALID_AUDIO', 'Choose audio no larger than 250 MB.');
      await mkdir(root, { recursive: true, mode: 0o700 });
      const key = reservedKey ?? `${randomUUID()}.audio`;
      const pending = path(key) + '.pending';
      const hash = createHash('sha256');
      const destination = await open(pending, 'wx', 0o600);
      let bytes = 0;
      try {
        await pipeline(
          source,
          async function* (chunks) {
            for await (const chunk of chunks) {
              const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
              bytes += data.length;
              if (bytes > expectedBytes)
                throw new RecordingError(
                  400,
                  'INVALID_AUDIO',
                  'The audio size does not match the selected file.',
                );
              hash.update(data);
              yield data;
            }
          },
          destination.createWriteStream(),
        );
        if (bytes !== expectedBytes)
          throw new RecordingError(
            400,
            'INVALID_AUDIO',
            'The audio upload was incomplete. Try again.',
          );
        await rename(pending, path(key));
        return { key, sha256: hash.digest('hex') };
      } finally {
        await destination.close();
        await rm(pending, { force: true });
      }
    },
    async remove(key: string) {
      await rm(path(key), { force: true });
      await rm(path(key) + '.pending', { force: true });
    },
  };
}
export type AudioStorage = ReturnType<typeof createAudioStorage>;
