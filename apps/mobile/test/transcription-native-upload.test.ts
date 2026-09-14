import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTranscriptionClient } from '@aptly/api-client';
import { prepareRecordingUpload } from '../src/services/recording-upload.native';

const nativeRequest = vi.hoisted(() => ({
  contentType: '',
  authorization: '',
  bytes: [] as number[],
}));

// Only the device filesystem bridge is unavailable in Node. The fixture reads a
// real saved file and retains the audio MIME behavior of an Expo File instance.
vi.mock('expo-file-system', async () => {
  const { existsSync, statSync } = await import('node:fs');
  const { readFile } = await import('node:fs/promises');
  const { fileURLToPath } = await import('node:url');
  return {
    File: class {
      private path: string;
      readonly type = 'audio/wav';
      constructor(uri: string) {
        this.path = fileURLToPath(uri);
      }
      get exists() {
        return existsSync(this.path);
      }
      get size() {
        return statSync(this.path).size;
      }
      async arrayBuffer() {
        const bytes = await readFile(this.path);
        return new Uint8Array(bytes).buffer;
      }
    },
  };
});

// Exercise Expo's installed normalization and header override at the native
// request boundary. This catches MIME overrides that a generic fetch fake misses.
vi.mock('expo/fetch', async () => {
  // Execute the installed utility without compiling its native implementation
  // dependencies into the app's TypeScript graph. Keep the path explicit for
  // the import-boundary verifier.
  const { normalizeBodyInitAsync, normalizeHeadersInit, overrideHeaders } = await vi.importActual<{
    normalizeBodyInitAsync(body: BodyInit | null | undefined): Promise<{
      body: Uint8Array | null;
      overriddenHeaders?: [string, string][];
    }>;
    normalizeHeadersInit(headers: HeadersInit | null | undefined): [string, string][];
    overrideHeaders(headers: [string, string][], overrides: [string, string][]): [string, string][];
  }>('../node_modules/expo/src/winter/fetch/RequestUtils.ts');
  return {
    fetch: async (_url: unknown, init: RequestInit) => {
      const normalized = await normalizeBodyInitAsync(init.body);
      const headers = normalizeHeadersInit(init.headers);
      const finalHeaders = normalized.overriddenHeaders
        ? overrideHeaders(headers, normalized.overriddenHeaders)
        : headers;
      nativeRequest.contentType = new Headers(finalHeaders).get('content-type') ?? '';
      nativeRequest.authorization = new Headers(finalHeaders).get('authorization') ?? '';
      nativeRequest.bytes = [...normalized.body!];
      return Response.json({
        id: '11111111-1111-4111-8111-111111111111',
        title: 'Saved audio',
        fileName: 'audio.wav',
        sizeBytes: 6,
        status: 'queued',
        attempt: 1,
        createdAt: '2026-09-11T12:00:00.000Z',
        updatedAt: '2026-09-11T12:00:00.000Z',
        transcript: null,
        errorCode: null,
      });
    },
  };
});

const folders: string[] = [];
afterEach(async () => {
  await Promise.all(folders.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});
describe('native upload through installed Expo normalization', () => {
  it('preserves raw audio bytes and octet-stream content type when native fetch normalizes the body', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'aptly-native-audio-'));
    folders.push(folder);
    const path = join(folder, 'audio.wav');
    await writeFile(path, new Uint8Array([82, 73, 70, 70, 0, 255]));
    const signal = new AbortController().signal;
    const prepared = await prepareRecordingUpload(pathToFileURL(path).href, signal);
    const client = createTranscriptionClient({
      baseUrl: 'http://localhost:4100',
      getCredential: () => 'local-code',
    });
    const response = await client.upload('11111111-1111-4111-8111-111111111111', prepared.body, {
      signal,
      ...(prepared.fetch ? { fetch: prepared.fetch } : {}),
    });
    expect(response.status).toBe('queued');
    expect(nativeRequest.contentType).toBe('application/octet-stream');
    expect(nativeRequest.authorization).toBe('Bearer local-code');
    expect(nativeRequest.bytes).toEqual([82, 73, 70, 70, 0, 255]);
  });
});
