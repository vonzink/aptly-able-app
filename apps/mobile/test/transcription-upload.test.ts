import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTranscriptionClient } from '@aptly/api-client';
import { prepareRecordingUpload } from '../src/services/recording-upload.web';
import { createTranscriptionController } from '../src/features/transcription/transcription-controller';

afterEach(() => vi.unstubAllGlobals());
describe('saved web audio upload', () => {
  it('uploads exact saved blob bytes through the shared client and restores generated timestamps', async () => {
    // File is a native upload concern; the web transport only needs Blob support.
    vi.stubGlobal('File', undefined);
    const bytes = new Uint8Array([0, 255, 13, 10]);
    const uri = URL.createObjectURL(new Blob([bytes]));
    const id = '11111111-1111-4111-8111-111111111111';
    let released = false;
    let server: Record<string, unknown> | null = null;
    const client = createTranscriptionClient({
      baseUrl: 'http://localhost:4100',
      getCredential: () => 'local-code',
      fetch: async (url, init) => {
        const path = new URL(String(url)).pathname;
        if (path.endsWith('/capabilities'))
          return Response.json({ available: true, provider: 'plaud', reason: 'ready' });
        if (path === '/v1/recordings') {
          server = {
            ...JSON.parse(String(init?.body)),
            status: 'awaiting_upload',
            attempt: 0,
            createdAt: '2026-09-11T12:00:00.000Z',
            updatedAt: '2026-09-11T12:00:00.000Z',
            transcript: null,
            errorCode: null,
          };
          return Response.json(server);
        }
        if (path.endsWith('/audio')) {
          const uploaded = await new Response(init?.body).arrayBuffer();
          expect([...new Uint8Array(uploaded)]).toEqual([0, 255, 13, 10]);
          server = {
            ...server,
            status: 'complete',
            attempt: 1,
            transcript: {
              text: 'Saved speech',
              segments: [{ text: 'Saved speech', startSeconds: 4.5, endSeconds: 6 }],
              durationSeconds: 6,
              language: null,
            },
          };
          return Response.json(server);
        }
        return server
          ? Response.json(server)
          : Response.json({ error: { code: 'RECORDING_NOT_FOUND' } }, { status: 404 });
      },
    });
    const controller = createTranscriptionController({
      client,
      recording: { id, title: 'Saved audio', originalName: 'saved.wav', sizeBytes: 4 },
      openAudio: async () => ({
        uri,
        release() {
          URL.revokeObjectURL(uri);
          released = true;
        },
      }),
      prepareAudio: prepareRecordingUpload,
    });
    try {
      await controller.activate('actor-a');
      await controller.generate();
      expect(controller.getSnapshot().record?.transcript?.segments[0]?.startSeconds).toBe(4.5);
      expect(released).toBe(true);
    } finally {
      controller.deactivate();
      URL.revokeObjectURL(uri);
    }
  });

  it('rejects empty saved audio before it can become an upload body', async () => {
    const uri = URL.createObjectURL(new Blob([]));
    try {
      await expect(prepareRecordingUpload(uri, new AbortController().signal)).rejects.toMatchObject(
        { code: 'LOCAL_AUDIO_UNAVAILABLE' },
      );
    } finally {
      URL.revokeObjectURL(uri);
    }
  });

  it('honors cancellation when opening saved web audio', async () => {
    const uri = URL.createObjectURL(new Blob(['audio']));
    const abort = new AbortController();
    abort.abort();
    try {
      await expect(prepareRecordingUpload(uri, abort.signal)).rejects.toMatchObject({
        name: 'AbortError',
      });
    } finally {
      URL.revokeObjectURL(uri);
    }
  });
});
