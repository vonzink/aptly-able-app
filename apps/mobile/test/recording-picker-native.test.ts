import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  pickAudio,
  pickTranscript,
  releasePickedAudio,
} from '../src/services/recording-picker.native';
const device = vi.hoisted(() => ({
  cache: '',
  selected: '',
  name: 'sample.mp3',
  failDelete: false,
}));
vi.mock('expo-document-picker', () => ({
  getDocumentAsync: async () => ({
    canceled: false,
    assets: [{ uri: device.selected, name: device.name, mimeType: 'audio/mpeg' }],
  }),
}));
// Only the unavailable device bridges are replaced; ownership and cleanup run on real files.
vi.mock('expo-file-system/legacy', () => ({
  get cacheDirectory() {
    return device.cache;
  },
  getInfoAsync: async (uri: string) => {
    const path = fileURLToPath(uri);
    if (!existsSync(path)) return { exists: false };
    const info = statSync(path);
    return { exists: true, isDirectory: info.isDirectory(), size: info.size };
  },
  readAsStringAsync: async (uri: string) => readFileSync(fileURLToPath(uri), 'utf8'),
  deleteAsync: async (uri: string) => {
    if (device.failDelete) throw new Error('blocked');
    rmSync(fileURLToPath(uri), { force: true });
  },
}));
let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'aptly-picker-'));
  device.cache = pathToFileURL(directory + '/').href;
  mkdirSync(join(directory, 'DocumentPicker'));
  device.selected = pathToFileURL(join(directory, 'DocumentPicker', 'copy.mp3')).href;
  device.failDelete = false;
  device.name = 'sample.mp3';
  writeFileSync(fileURLToPath(device.selected), 'audio bytes');
});
afterEach(() => rmSync(directory, { recursive: true, force: true }));
it('releases the copied audio while preserving the original and saved library file', async () => {
  const original = join(directory, 'original.mp3');
  const saved = join(directory, 'saved.mp3');
  writeFileSync(original, 'audio bytes');
  const input = await pickAudio();
  expect(input?.sizeBytes).toBe(11);
  writeFileSync(saved, readFileSync(fileURLToPath(input!.uri)));
  await releasePickedAudio(input!.uri);
  expect(existsSync(fileURLToPath(input!.uri))).toBe(false);
  expect(readFileSync(original, 'utf8')).toBe('audio bytes');
  expect(readFileSync(saved, 'utf8')).toBe('audio bytes');
});
it('reads and removes a transcript copy, including an oversized rejected transcript', async () => {
  device.name = 'conversation.txt';
  writeFileSync(fileURLToPath(device.selected), 'speaker text');
  expect(await pickTranscript()).toMatchObject({ name: 'conversation.txt', text: 'speaker text' });
  expect(existsSync(fileURLToPath(device.selected))).toBe(false);
  writeFileSync(fileURLToPath(device.selected), 'x'.repeat(2 * 1024 * 1024 + 1));
  await expect(pickTranscript()).rejects.toThrow('smaller than 2 MB');
  expect(existsSync(fileURLToPath(device.selected))).toBe(false);
});
it('never removes arbitrary paths, unclaimed cache files, or a selected external original', async () => {
  const original = join(directory, 'private.txt');
  writeFileSync(original, 'keep');
  await releasePickedAudio(pathToFileURL(original).href);
  await releasePickedAudio(device.selected);
  expect(existsSync(original)).toBe(true);
  expect(existsSync(fileURLToPath(device.selected))).toBe(true);
  device.selected = pathToFileURL(original).href;
  await expect(pickAudio()).rejects.toThrow();
  expect(readFileSync(original, 'utf8')).toBe('keep');
});
it('retains failed cleanup for retry without losing the copied audio early', async () => {
  const input = await pickAudio();
  device.failDelete = true;
  await expect(releasePickedAudio(input!.uri)).rejects.toThrow();
  expect(existsSync(fileURLToPath(input!.uri))).toBe(true);
  device.failDelete = false;
  await releasePickedAudio(input!.uri);
  expect(existsSync(fileURLToPath(input!.uri))).toBe(false);
});

it('reports a failed transcript cleanup and retries it without removing another active import', async () => {
  const active = await pickAudio();
  device.selected = pathToFileURL(join(directory, 'DocumentPicker', 'transcript.txt')).href;
  writeFileSync(fileURLToPath(device.selected), 'speaker text');
  const transcriptCopy = device.selected;
  device.failDelete = true;
  expect(await pickTranscript()).toMatchObject({
    text: 'speaker text',
    cleanupWarning: expect.any(String),
  });
  device.failDelete = false;
  device.selected = pathToFileURL(join(directory, 'DocumentPicker', 'other.txt')).href;
  writeFileSync(fileURLToPath(device.selected), 'other text');
  await pickTranscript();
  expect(existsSync(fileURLToPath(transcriptCopy))).toBe(false);
  expect(existsSync(fileURLToPath(active!.uri))).toBe(true);
  await releasePickedAudio(active!.uri);
});

it('reports cleanup failure when rejecting a transcript instead of silently retaining it', async () => {
  writeFileSync(fileURLToPath(device.selected), 'x'.repeat(2 * 1024 * 1024 + 1));
  device.failDelete = true;
  await expect(pickTranscript()).rejects.toMatchObject({ cleanupWarning: expect.any(String) });
});
