import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type TranscriptionClient } from '@aptly/api-client';
import type { ProcessingRecording } from '@aptly/contracts';
import { createTranscriptionController } from '../src/features/transcription/transcription-controller';
import type { LocalRecording } from '../src/features/recordings/recording-model';

const id = '11111111-1111-4111-8111-111111111111';
const local: LocalRecording = {
  id,
  title: 'Meeting',
  originalName: 'meeting.m4a',
  sizeBytes: 4,
  importedAt: '2026-09-11T12:00:00.000Z',
  mimeType: 'audio/mp4',
  durationSeconds: null,
  transcript: {
    fileName: 'notes.txt',
    text: 'My imported notes',
    segments: [],
    importedAt: '2026-09-11T12:00:00.000Z',
  },
};
const record: ProcessingRecording = {
  id,
  title: 'Meeting',
  fileName: 'meeting.m4a',
  sizeBytes: 4,
  status: 'awaiting_upload',
  attempt: 0,
  createdAt: local.importedAt,
  updatedAt: local.importedAt,
  errorCode: null,
  transcript: null,
};
const complete: ProcessingRecording = {
  ...record,
  status: 'complete',
  attempt: 1,
  transcript: {
    text: 'Generated result',
    segments: [{ startSeconds: 1, endSeconds: 2, text: 'Generated result' }],
    durationSeconds: 2,
    language: 'en',
  },
};
const missing = () => new ApiError(404, 'RECORDING_NOT_FOUND', 'Not found');
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function setup(overrides: Partial<TranscriptionClient> = {}, recording = local) {
  const events: string[] = [];
  const bytes = new Blob(['test']);
  const client: TranscriptionClient = {
    capabilities: async () => ({ available: true, provider: 'plaud', reason: 'ready' }),
    get: async () => {
      throw missing();
    },
    register: async (input) => {
      events.push(`register:${input.id}`);
      return record;
    },
    upload: async (recordingId, body) => {
      expect(body).toBe(bytes);
      events.push(`upload:${recordingId}`);
      return { ...record, status: 'queued', attempt: 1 };
    },
    retry: async (_id, acknowledge) => {
      events.push(`retry:${acknowledge}`);
      return { ...record, status: 'queued', attempt: 2 };
    },
    ...overrides,
  };
  const controller = createTranscriptionController({
    client,
    recording,
    openAudio: async (recordingId) => {
      events.push(`open:${recordingId}`);
      return {
        uri: 'saved:audio',
        release: () => {
          events.push('release');
        },
      };
    },
    prepareAudio: async (uri) => {
      expect(uri).toBe('saved:audio');
      return { body: bytes };
    },
  });
  return { controller, events, client };
}
afterEach(() => vi.useRealTimers());
describe('transcription lifecycle', () => {
  it('keeps recording coordinates and local notes out of server registration and audio upload', async () => {
    const register = vi.fn<TranscriptionClient['register']>(async () => record);
    const { controller, events } = setup(
      { register },
      {
        ...local,
        notes: 'Private local note',
        location: {
          version: 1,
          sessionId: 42,
          startedAt: 1_800_000_000_000,
          endedAt: 1_800_000_060_000,
          status: 'complete',
          reason: null,
          droppedPoints: 0,
          points: [
            { latitude: 39.7, longitude: -104.9, accuracy: 10, capturedAt: 1_800_000_001_000 },
          ],
        },
      },
    );
    await controller.activate('actor-a');
    await controller.generate();
    expect(register.mock.calls[0]?.[0]).toEqual({
      id,
      title: local.title,
      fileName: local.originalName,
      sizeBytes: local.sizeBytes,
    });
    expect(events).toContain(`upload:${id}`);
    controller.deactivate();
  });
  it('restores completed server transcripts even when new transcription is not configured', async () => {
    const { controller, events } = setup({
      capabilities: async () => ({ available: false, provider: 'plaud', reason: 'not_configured' }),
      get: async () => complete,
    });
    await controller.activate('actor-a');
    expect(controller.getSnapshot().record?.transcript?.text).toBe('Generated result');
    await controller.generate();
    expect(events).toEqual([]);
    controller.deactivate();
  });

  it('shows missing provider capability before sign-in and refuses generation', async () => {
    const { controller, events } = setup({
      capabilities: async () => ({ available: false, provider: 'plaud', reason: 'not_configured' }),
      get: async () => {
        throw Error('must not authenticate');
      },
    });
    await controller.activate(null);
    await controller.generate();
    expect(controller.getSnapshot().capabilities?.reason).toBe('not_configured');
    expect(controller.getSnapshot().record).toBeNull();
    expect(events).toEqual([]);
    controller.deactivate();
  });

  it('requires an explicit action, serializes duplicate taps and releases the saved source', async () => {
    const registration = deferred<ProcessingRecording>();
    const { controller, events } = setup({ register: async () => registration.promise });
    await controller.activate('actor-a');
    expect(events).toEqual([]);
    const first = controller.generate();
    const second = controller.generate();
    registration.resolve(record);
    await Promise.all([first, second]);
    expect(events).toEqual([`open:${id}`, `upload:${id}`, 'release']);
    expect(controller.getSnapshot().record?.status).toBe('queued');
    expect(local.transcript?.text).toBe('My imported notes');
    controller.deactivate();
  });

  it('restores a generated transcript after reload without re-uploading or replacing imported text', async () => {
    const { controller, events } = setup({ get: async () => complete });
    await controller.activate('actor-a');
    await controller.generate();
    expect(controller.getSnapshot().record?.transcript?.segments[0]?.startSeconds).toBe(1);
    expect(local.transcript?.text).toBe('My imported notes');
    expect(events).toEqual([]);
    controller.deactivate();
  });

  it('reconciles an upload response loss before retrying and never uploads an already queued job', async () => {
    let remote: ProcessingRecording = record;
    let uploads = 0;
    const { controller, events } = setup({
      get: async () => remote,
      upload: async () => {
        uploads++;
        remote = { ...record, status: 'queued', attempt: 1 };
        throw new ApiError(0, 'NETWORK_ERROR', 'Connection interrupted');
      },
    });
    await controller.activate('actor-a');
    await controller.generate();
    expect(controller.getSnapshot().error).toBeTruthy();
    await controller.generate();
    expect(uploads).toBe(1);
    expect(controller.getSnapshot().record?.status).toBe('queued');
    expect(events.filter((e) => e === 'release')).toHaveLength(1);
    controller.deactivate();
  });

  it('polls serially until complete and stops after a terminal response', async () => {
    vi.useFakeTimers();
    const polling = deferred<ProcessingRecording>();
    let gets = 0;
    const { controller } = setup({
      get: async () => (++gets === 1 ? { ...record, status: 'transcribing' } : polling.promise),
    });
    await controller.activate('actor-a');
    await vi.advanceTimersByTimeAsync(3000);
    await vi.advanceTimersByTimeAsync(12000);
    expect(gets).toBe(2);
    polling.resolve(complete);
    await vi.advanceTimersByTimeAsync(12000);
    expect(controller.getSnapshot().record?.status).toBe('complete');
    expect(gets).toBe(2);
    controller.deactivate();
  });

  it('aborts pending work on sign-out and discards late results after account changes', async () => {
    const old = deferred<ProcessingRecording>();
    let oldSignal: AbortSignal | undefined;
    let gets = 0;
    const { controller } = setup({
      get: async (_id, options) => {
        gets++;
        if (gets === 1) {
          oldSignal = options?.signal;
          return old.promise;
        }
        throw missing();
      },
    });
    const first = controller.activate('actor-a');
    await Promise.resolve();
    await Promise.resolve();
    await controller.activate(null);
    expect(oldSignal?.aborted).toBe(true);
    expect(controller.getSnapshot().record).toBeNull();
    await controller.activate('actor-b');
    old.resolve(complete);
    await first;
    expect(controller.getSnapshot().actorId).toBe('actor-b');
    expect(controller.getSnapshot().record).toBeNull();
    controller.deactivate();
  });

  it('releases a source acquired after unmount and never uploads it', async () => {
    const opened = deferred<{ uri: string; release(): void }>();
    let released = false;
    let uploaded = false;
    const controller = createTranscriptionController({
      recording: local,
      client: setup({
        get: async () => record,
        upload: async () => {
          uploaded = true;
          return record;
        },
      }).client,
      openAudio: async () => opened.promise,
      prepareAudio: async () => ({ body: new Blob(['test']) }),
    });
    await controller.activate('actor-a');
    const generating = controller.generate();
    await Promise.resolve();
    await Promise.resolve();
    controller.deactivate();
    opened.resolve({
      uri: 'saved:audio',
      release: () => {
        released = true;
      },
    });
    await generating;
    expect(released).toBe(true);
    expect(uploaded).toBe(false);
  });

  it('requires explicit duplicate-risk acknowledgement for an uncertain submission', async () => {
    const { controller, events } = setup({
      get: async () => ({ ...record, status: 'submission_uncertain', attempt: 1 }),
    });
    await controller.activate('actor-a');
    await controller.retry(false);
    expect(events).toEqual([]);
    await controller.retry(true);
    expect(events).toEqual(['retry:true']);
    expect(controller.getSnapshot().record?.status).toBe('queued');
    controller.deactivate();
  });

  it('retries a failed attempt explicitly, without reopening local audio', async () => {
    const { controller, events } = setup({
      get: async () => ({ ...record, status: 'failed', attempt: 1 }),
    });
    await controller.activate('actor-a');
    await controller.retry(false);
    expect(events).toEqual(['retry:false']);
    controller.deactivate();
  });

  it('resumes polling after a temporary status failure and cancels scheduled polls on blur', async () => {
    vi.useFakeTimers();
    let gets = 0;
    const { controller } = setup({
      get: async () => {
        gets++;
        if (gets === 2) throw new ApiError(0, 'NETWORK_ERROR', 'Connection interrupted');
        return gets === 3 ? complete : { ...record, status: 'transcribing' };
      },
    });
    await controller.activate('actor-a');
    await vi.advanceTimersByTimeAsync(3000);
    expect(controller.getSnapshot().error).toBeTruthy();
    expect(controller.getSnapshot().record?.status).toBe('transcribing');
    await vi.advanceTimersByTimeAsync(3000);
    expect(controller.getSnapshot().record?.status).toBe('complete');
    expect(controller.getSnapshot().error).toBeNull();
    controller.deactivate();
    await vi.advanceTimersByTimeAsync(9000);
    expect(gets).toBe(3);
  });

  it('clears a completed transcript immediately when the server rejects the actor', async () => {
    let authorized = true;
    let expired = false;
    const { client } = setup({
      get: async () => {
        if (authorized) return complete;
        throw new ApiError(401, 'UNAUTHORIZED', 'Sign in again.');
      },
    });
    const controller = createTranscriptionController({
      client,
      recording: local,
      openAudio: async () => {
        throw Error('unexpected local audio');
      },
      prepareAudio: async () => {
        throw Error('unexpected local audio');
      },
      onUnauthorized: () => {
        expired = true;
      },
    });
    await controller.activate('actor-a');
    authorized = false;
    await controller.refresh();
    expect(controller.getSnapshot().record).toBeNull();
    expect(controller.getSnapshot().actorId).toBeNull();
    expect(expired).toBe(true);
    controller.deactivate();
  });

  it('aborts an upload and releases its source immediately on sign-out, ignoring late success', async () => {
    const uploaded = deferred<ProcessingRecording>();
    const started = deferred<void>();
    let signal: AbortSignal | undefined;
    const { controller, events } = setup({
      get: async () => record,
      upload: async (_id, _body, options) => {
        signal = options?.signal;
        started.resolve();
        return uploaded.promise;
      },
    });
    await controller.activate('actor-a');
    const generating = controller.generate();
    await started.promise;
    await controller.activate(null);
    expect(signal?.aborted).toBe(true);
    expect(events).toContain('release');
    uploaded.resolve(complete);
    await generating;
    expect(events.filter((e) => e === 'release')).toHaveLength(1);
    expect(controller.getSnapshot().record).toBeNull();
    controller.deactivate();
  });

  it('recovers a lost retry response without starting a second new attempt', async () => {
    let remote: ProcessingRecording = { ...record, status: 'failed', attempt: 1 };
    let retries = 0;
    const { controller } = setup({
      get: async () => remote,
      retry: async () => {
        retries++;
        remote = { ...record, status: 'queued', attempt: 2 };
        throw new ApiError(0, 'NETWORK_ERROR', 'Connection interrupted');
      },
    });
    await controller.activate('actor-a');
    await controller.retry(false);
    await controller.retry(false);
    expect(retries).toBe(1);
    expect(controller.getSnapshot().record?.status).toBe('queued');
    controller.deactivate();
  });
});
