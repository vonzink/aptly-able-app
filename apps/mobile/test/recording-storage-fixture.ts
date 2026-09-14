/// <reference types="node" />
import { afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AudioImport, LocalRecording } from '../src/features/recordings/recording-model';
import {
  createFileRecordingStore,
  type RecordingFileSystem,
} from '../src/services/recordings/file-recording-store';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => fs.rm(path, { recursive: true, force: true })),
  );
});

export async function recordingStorageFixture() {
  const directory = await fs.mkdtemp(join(tmpdir(), 'aptly-recordings-'));
  directories.push(directory);
  const source = join(directory, 'source.wav');
  await fs.writeFile(source, 'audio bytes');
  const root = join(directory, 'library');
  const files: RecordingFileSystem = {
    ensureDirectory: async (path) => {
      await fs.mkdir(path, { recursive: true });
    },
    list: async (path) =>
      (await fs.readdir(path, { withFileTypes: true })).map((entry) => ({
        name: entry.name,
        isDirectory: entry.isDirectory(),
      })),
    exists: async (path) => {
      try {
        await fs.stat(path);
        return true;
      } catch {
        return false;
      }
    },
    size: async (path) => (await fs.stat(path)).size,
    readText: (path) => fs.readFile(path, 'utf8'),
    writeText: (path, text) => fs.writeFile(path, text, { flag: 'wx' }),
    copyFile: (from, to) => fs.copyFile(from, to, fs.constants.COPYFILE_EXCL),
    move: async (from, to) => {
      try {
        await fs.stat(to);
      } catch {
        await fs.rename(from, to);
        return;
      }
      throw new Error('destination exists');
    },
    remove: (path) => fs.rm(path, { recursive: true, force: true }),
  };
  const input: AudioImport = {
    name: 'source.wav',
    uri: source,
    sizeBytes: 11,
    mimeType: 'audio/wav',
  };
  const record: LocalRecording = {
    id: 'd3a673f4-5f4c-4e54-9a30-08cb1b06e950',
    title: 'Source',
    originalName: input.name,
    sizeBytes: 11,
    mimeType: 'audio/wav',
    importedAt: '2026-09-10T12:00:00.000Z',
    durationSeconds: null,
    transcript: null,
  };
  return { files, root, source, input, record, store: createFileRecordingStore({ files, root }) };
}
