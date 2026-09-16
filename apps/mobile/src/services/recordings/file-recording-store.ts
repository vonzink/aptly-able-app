import {
  assertLocalRecording,
  TEMPORARY_AUDIO_BYTES,
  type PlaudRecordingSource,
  type AudioImport,
  applyRecordingPatch,
  audioExtension,
  isRecordingId,
  isRecorderSerial,
  validateAudioImport,
  type LocalRecording,
  type RecordingLibraryRead,
  type RecordingStore,
} from '../../features/recordings/recording-model';
import { createRecordingAudioCache } from './recording-audio-cache';

export interface RecordingFileSystem {
  ensureDirectory(path: string): Promise<void>;
  list(path: string): Promise<Array<{ name: string; isDirectory: boolean }>>;
  exists(path: string): Promise<boolean>;
  size(path: string): Promise<number>;
  readText(path: string): Promise<string>;
  writeText(path: string, text: string): Promise<void>;
  copyFile(source: string, destination: string): Promise<void>;
  move(source: string, destination: string, directory: boolean): Promise<void>;
  remove(path: string, directory: boolean): Promise<void>;
}

export function createFileRecordingStore({
  files,
  root,
  cacheRoot = `${root}-cache`,
  cacheLimitBytes = TEMPORARY_AUDIO_BYTES,
}: {
  files: RecordingFileSystem;
  root: string;
  cacheRoot?: string;
  cacheLimitBytes?: number;
}): RecordingStore {
  const path = (...parts: string[]) => [root.replace(/\/$/, ''), ...parts].join('/');
  const cache = createRecordingAudioCache(files, cacheRoot, cacheLimitBytes);
  let queue = Promise.resolve();
  function serialized<T>(operation: () => Promise<T>): Promise<T> {
    const result = queue.then(operation);
    queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
  function checkId(id: string) {
    if (!isRecordingId(id)) throw new Error('Invalid recording identifier.');
  }
  async function cleanup(target: string, directory: boolean) {
    try {
      if (await files.exists(target)) await files.remove(target, directory);
    } catch {
      /* A failed cleanup does not invalidate an already committed record. */
    }
  }
  async function metadata(
    id: string,
  ): Promise<{ record: LocalRecording; revision: number; versions: string[] }> {
    checkId(id);
    const versions = (await files.list(path(id)))
      .map((entry) => entry.name)
      .filter((name) => /^metadata-\d{10}\.json$/.test(name))
      .sort();
    const latest = versions.at(-1);
    if (!latest) throw new Error('This recording is no longer available.');
    const record: unknown = JSON.parse(await files.readText(path(id, latest)));
    assertLocalRecording(record);
    if (record.id !== id) throw new Error('Saved recording information does not match its audio.');
    if (record.location === null) {
      // A previous removal may have committed the null marker before an older
      // coordinate-bearing revision could be purged. Retry on every read, including
      // after relaunch; keep audio usable and expose a retry state if still blocked.
      let pending = false;
      for (const name of versions.slice(0, -1)) {
        try {
          if (await files.exists(path(id, name))) await files.remove(path(id, name), false);
        } catch {
          pending = true;
        }
      }
      record.locationRemovalPending = pending;
    }
    return { record, revision: Number(latest.slice(9, 19)), versions };
  }
  const permanentPath = (record: LocalRecording) =>
    path(record.id, `audio.${audioExtension(record.originalName)}`);
  const audioPath = (record: LocalRecording) =>
    record.retention === 'temporary'
      ? cache.audioPath(record.id, record.originalName)
      : permanentPath(record);
  async function withAvailability(record: LocalRecording): Promise<LocalRecording> {
    return record.retention
      ? { ...record, audioAvailable: await files.exists(audioPath(record)) }
      : record;
  }
  // File size is excluded: deletion applies to the recorder session, even if its size changes.
  function dismissalPath(source: PlaudRecordingSource) {
    if (
      !isRecordingId(source.actorId) ||
      !isRecorderSerial(source.serial) ||
      !Number.isSafeInteger(source.sessionId) ||
      source.sessionId < 0
    )
      throw new Error('Invalid recorder source.');
    return path('.dismissed', `${source.actorId}-${source.serial}-${source.sessionId}.json`);
  }
  const isDismissed = (source: PlaudRecordingSource) => files.exists(dismissalPath(source));
  async function activeMetadata(id: string) {
    const previous = await metadata(id);
    if (previous.record.source && (await isDismissed(previous.record.source)))
      throw new Error('This recording was deleted from the app.');
    return previous;
  }
  async function dismiss(record: LocalRecording) {
    if (!record.source || (await isDismissed(record.source))) return;
    await files.ensureDirectory(path('.dismissed'));
    const temporary = path('.dismissed', `.${record.id}.pending`);
    await cleanup(temporary, false);
    await files.writeText(temporary, JSON.stringify({ source: record.source }));
    await files.move(temporary, dismissalPath(record.source), false);
  }
  async function finishDeletion(id: string) {
    // For device audio, the durable dismissal is the logical deletion commit.
    // Leave metadata/tombstones in place if cleanup fails so list() can retry.
    await cache.remove(id);
    const tombstone = path(`.deleted-${id}`);
    if (await files.exists(path(id))) {
      await cleanup(tombstone, true);
      await files.move(path(id), tombstone, true);
    }
    await cleanup(tombstone, true);
  }
  async function retryDeletion(id: string) {
    try {
      await finishDeletion(id);
    } catch {
      // Already committed: remaining bytes are reclaimed on a later list.
    }
  }
  async function commitMetadata(
    previous: Awaited<ReturnType<typeof metadata>>,
    record: LocalRecording,
  ) {
    const nextName = `metadata-${String(previous.revision + 1).padStart(10, '0')}.json`;
    const temporary = path(record.id, `.${nextName}.pending`);
    await cleanup(temporary, false);
    try {
      const {
        audioAvailable: _availability,
        locationRemovalPending: _locationRemovalPending,
        ...persisted
      } = record;
      await files.writeText(temporary, JSON.stringify(persisted));
      await files.move(temporary, path(record.id, nextName), false);
    } catch (error) {
      await cleanup(temporary, false);
      throw error;
    }
    for (const name of previous.versions) {
      // Explicit location removal must purge earlier coordinate-bearing revisions too.
      // The new null marker is durable; a failed purge is reported and can be retried.
      if (record.location === null) {
        if (await files.exists(path(record.id, name)))
          await files.remove(path(record.id, name), false);
      } else await cleanup(path(record.id, name), false);
    }
    if (record.location === null) record.locationRemovalPending = false;
  }
  async function restore(id: string, input: AudioImport, keep: boolean) {
    const previous = await activeMetadata(id);
    const record = previous.record;
    validateAudioImport(input);
    if (
      !record.source ||
      record.sizeBytes !== input.sizeBytes ||
      record.originalName !== input.name
    )
      throw new Error('Audio details do not match this recording.');
    if (await isDismissed(record.source))
      throw new Error('This recording was deleted from the app.');
    if (!keep && record.retention === 'temporary') {
      if (!(await cache.put(id, input)))
        throw new Error(
          'This audio will not fit in the temporary cache. Choose Keep offline in app to retain it.',
        );
      return;
    }
    const destination = permanentPath(record);
    const temporary = `${destination}.pending`;
    await cleanup(temporary, false);
    try {
      // A previous attempt may have copied the audio but failed its metadata commit.
      if (!(await files.exists(destination))) {
        await files.copyFile(input.uri, temporary);
        if ((await files.size(temporary)) !== record.sizeBytes)
          throw new Error('The audio copy was incomplete. Try again.');
        await files.move(temporary, destination, false);
      }
      if ((await files.size(destination)) !== record.sizeBytes)
        throw new Error('The downloaded audio is incomplete.');
      await commitMetadata(previous, { ...record, retention: 'downloaded' });
    } finally {
      await cleanup(temporary, false);
    }
    if (!cache.isPlaying(id)) await cache.remove(id);
  }

  async function readLibrary(): Promise<RecordingLibraryRead> {
    await files.ensureDirectory(root);
    const recordings: LocalRecording[] = [];
    let unavailableCount = 0;
    // Root failures still reject: they do not mean the user has an empty library.
    for (const entry of await files.list(root)) {
      if (
        entry.isDirectory &&
        entry.name.startsWith('.deleted-') &&
        isRecordingId(entry.name.slice(9))
      ) {
        await retryDeletion(entry.name.slice(9));
        continue;
      }
      if (
        entry.isDirectory &&
        entry.name.startsWith('.pending-') &&
        isRecordingId(entry.name.slice(9))
      ) {
        await cleanup(path(entry.name), true);
        try {
          await cache.remove(entry.name.slice(9));
        } catch {
          // An abandoned import must not prevent committed recordings from loading.
        }
        continue;
      }
      if (!entry.isDirectory || !isRecordingId(entry.name)) continue;
      try {
        const { record } = await metadata(entry.name);
        if (record.source && (await isDismissed(record.source))) {
          await retryDeletion(record.id);
          continue;
        }
        recordings.push(await withAvailability(record));
      } catch {
        // Preserve unreadable metadata and audio for recovery. Never guess an older
        // revision: that could restore a deleted transcript or storage preference.
        unavailableCount++;
      }
    }
    recordings.sort((left, right) => right.importedAt.localeCompare(left.importedAt));
    return { recordings, unavailableCount };
  }

  return {
    deviceAudio: {
      isDismissed: (source) => serialized(() => isDismissed(source)),
      restore: (id, input, keep) => serialized(() => restore(id, input, keep)),
      keep: (id) =>
        serialized(async () => {
          const { record } = await activeMetadata(id);
          await restore(
            id,
            {
              uri: audioPath(record),
              name: record.originalName,
              sizeBytes: record.sizeBytes,
              mimeType: record.mimeType,
            },
            true,
          );
        }),
      clearTemporary: () => serialized(() => cache.clear()),
    },
    readLibrary: () => serialized(readLibrary),
    list: () => serialized(async () => (await readLibrary()).recordings),
    saveAudio: (record, input) =>
      serialized(async () => {
        assertLocalRecording(record);
        validateAudioImport(input);
        if (record.source && (await isDismissed(record.source)))
          throw new Error('This recording was deleted from the app.');
        if (record.sizeBytes !== input.sizeBytes || record.originalName !== input.name)
          throw new Error('Audio details do not match the selected file.');
        await files.ensureDirectory(root);
        if (await files.exists(path(record.id))) throw new Error('This recording already exists.');
        const staging = path(`.pending-${record.id}`);
        await cleanup(staging, true);
        try {
          await files.ensureDirectory(staging);
          if (record.retention === 'temporary') {
            await cache.put(record.id, input);
          } else {
            const destination = `${staging}/audio.${audioExtension(input.name)}`;
            await files.copyFile(input.uri, destination);
            if ((await files.size(destination)) !== record.sizeBytes)
              throw new Error('The audio copy was incomplete. Select the file again.');
          }
          await files.writeText(`${staging}/metadata-0000000001.json`, JSON.stringify(record));
          await files.move(staging, path(record.id), true);
        } catch (error) {
          await cleanup(staging, true);
          if (record.retention === 'temporary') await cache.remove(record.id);
          throw error;
        }
      }),
    update: (id, patch) =>
      serialized(async () => {
        const previous = await activeMetadata(id);
        const record = applyRecordingPatch(previous.record, patch);
        await commitMetadata(previous, record);
        return withAvailability(record);
      }),
    remove: (id) =>
      serialized(async () => {
        checkId(id);
        const { record } = await metadata(id);
        if (record.source) {
          // Before this atomic marker commits, preserve audio and metadata. Once
          // committed, hide the record and prevent resync even across restarts.
          await dismiss(record);
          await retryDeletion(id);
          return;
        }
        const tombstone = path(`.deleted-${id}`);
        await cleanup(tombstone, true);
        await files.move(path(id), tombstone, true);
        await cleanup(tombstone, true);
      }),
    openAudio: (id) =>
      serialized(async () => {
        const { record } = await activeMetadata(id);
        const uri = audioPath(record);
        if (!(await files.exists(uri)))
          throw new Error(
            record.source
              ? 'Audio is not on this phone. Connect your recorder and load it again.'
              : 'The local audio file is missing. Import it again.',
          );
        return {
          uri,
          release: record.retention === 'temporary' ? cache.lease(id) : () => undefined,
        };
      }),
  };
}
