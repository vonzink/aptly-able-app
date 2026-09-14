import {
  audioExtension,
  isRecordingId,
  type AudioImport,
} from '../../features/recordings/recording-model';
import type { RecordingFileSystem } from './file-recording-store';

/** Only expendable Plaud audio lives here. Metadata and user downloads live in Documents. */
export function createRecordingAudioCache(files: RecordingFileSystem, root: string, limit: number) {
  const path = (id: string) => `${root.replace(/\/$/, '')}/${id}`;
  const leases = new Map<string, number>();
  async function remove(id: string) {
    if (await files.exists(path(id))) await files.remove(path(id), true);
  }
  async function entries() {
    await files.ensureDirectory(root);
    const result: Array<{ id: string; bytes: number; savedAt: number }> = [];
    for (const entry of await files.list(root)) {
      if (!entry.isDirectory) continue;
      if (entry.name.startsWith('.pending-')) {
        await remove(entry.name);
        continue;
      }
      if (!isRecordingId(entry.name)) continue;
      try {
        const info = JSON.parse(await files.readText(`${path(entry.name)}/cache.json`));
        if (!['mp3', 'wav', 'm4a'].includes(info.extension) || !Number.isFinite(info.savedAt))
          throw new Error('Invalid cache information.');
        const bytes = await files.size(`${path(entry.name)}/audio.${info.extension}`);
        if (!Number.isSafeInteger(bytes) || bytes <= 0) throw new Error('Cached audio is missing.');
        result.push({
          id: entry.name,
          bytes,
          savedAt: info.savedAt,
        });
      } catch {
        if (!leases.has(entry.name)) await remove(entry.name);
      }
    }
    return result.sort((a, b) => a.savedAt - b.savedAt);
  }
  return {
    audioPath: (id: string, name: string) => `${path(id)}/audio.${audioExtension(name)}`,
    remove,
    async put(id: string, input: AudioImport): Promise<boolean> {
      if (input.sizeBytes > limit) return false;
      const cached = await entries();
      const existing = cached.find((entry) => entry.id === id);
      if (existing) return existing.bytes === input.sizeBytes;
      let bytes = cached.reduce((sum, entry) => sum + entry.bytes, 0);
      for (const entry of cached) {
        if (bytes + input.sizeBytes <= limit) break;
        if (leases.has(entry.id)) continue;
        await remove(entry.id);
        bytes -= entry.bytes;
      }
      if (bytes + input.sizeBytes > limit) return false;
      const pending = `.pending-${id}`;
      await remove(pending);
      try {
        await files.ensureDirectory(path(pending));
        const extension = audioExtension(input.name);
        const audio = `${path(pending)}/audio.${extension}`;
        await files.copyFile(input.uri, audio);
        if ((await files.size(audio)) !== input.sizeBytes)
          throw new Error('The audio copy was incomplete. Try receiving it again.');
        await files.writeText(
          `${path(pending)}/cache.json`,
          JSON.stringify({ extension, savedAt: Date.now() }),
        );
        await files.move(path(pending), path(id), true);
        return true;
      } finally {
        await remove(pending);
      }
    },
    lease(id: string) {
      leases.set(id, (leases.get(id) ?? 0) + 1);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        const remaining = (leases.get(id) ?? 1) - 1;
        if (remaining) leases.set(id, remaining);
        else leases.delete(id);
      };
    },
    async clear() {
      for (const entry of await entries()) {
        if (!leases.has(entry.id)) await remove(entry.id);
      }
    },
    isPlaying: (id: string) => leases.has(id),
  };
}
