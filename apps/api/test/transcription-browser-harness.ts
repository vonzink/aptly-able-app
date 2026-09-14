/** Isolated local browser fixture. Never uses live Plaud credentials or application tables. */
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { migrate } from '../src/infrastructure/migrate.js';
import { createAudioStorage } from '../src/modules/recordings/audio-storage.js';
import { createProcessingService } from '../src/modules/recordings/service.js';
import { createTranscriptionWorker } from '../src/modules/transcription/worker.js';
import { createPlaudProvider } from '../src/modules/transcription/plaud/index.js';
import { buildApp } from '../src/transport/http/app.js';
import { readConfig } from '../src/bootstrap/config.js';

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error('TEST_DATABASE_URL is required.');
const control = new pg.Pool({ connectionString });
const schema = `transcription_browser_${randomBytes(8).toString('hex')}`;
const directory = await mkdtemp(join(tmpdir(), 'aptly-browser-transcription-'));
await control.query(`CREATE SCHEMA ${schema}`);
const pool = new pg.Pool({ connectionString, options: `-c search_path=${schema}` });
await migrate(pool);
const userId = randomUUID();
const credential = 'fixture-user-token-for-isolated-browser-tests';
await pool.query('INSERT INTO users(id) VALUES ($1)', [userId]);
const metadataFile = fileURLToPath(
  new URL('../../../.local/transcription-browser-fixture.json', import.meta.url),
);
const stats = { submissions: 0, polls: 0, uploadedBytes: 0 };
let available = true;
let size = 0;
const parts = new Map<number, Uint8Array>();
const fixtureFetch: typeof fetch = async (input, init) => {
  const url = new URL(String(input));
  const body = typeof init?.body === 'string' && init.body ? JSON.parse(init.body) : {};
  const json = (value: unknown) =>
    new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
  if (
    url.pathname.endsWith('/oauth/partner/access-token') ||
    url.pathname.endsWith('/users/access-token')
  )
    return json({ access_token: 'fixture-token', token_type: 'bearer', expires_in: 3600 });
  if (url.pathname.endsWith('/generate-presigned-urls')) {
    size = body.filesize;
    parts.clear();
    return json({
      FileId: 'fixture-file',
      UploadId: 'fixture-upload',
      ChunkSize: 5242880,
      Parts: Array.from({ length: Math.ceil(size / 5242880) }, (_, i) => ({
        PartNumber: i + 1,
        PresignedUrl: `https://fixture-upload.example/parts/${i + 1}`,
      })),
    });
  }
  if (url.hostname === 'fixture-upload.example') {
    if (!(init?.body instanceof Uint8Array)) throw new Error('Expected binary provider upload.');
    parts.set(Number(url.pathname.split('/').at(-1)), init.body);
    return new Response('', { headers: { etag: '"fixture-etag"' } });
  }
  if (url.pathname.endsWith('/complete-upload')) {
    const bytes = Buffer.concat(
      [...parts.entries()].sort((a, b) => a[0] - b[0]).map(([, part]) => part),
    );
    if (bytes.length !== size || createHash('md5').update(bytes).digest('hex') !== body.file_md5)
      throw new Error('Fixture upload integrity failure.');
    stats.uploadedBytes = bytes.length;
    return json({
      FileId: 'fixture-file',
      FileType: body.filetype,
      FileMd5: body.file_md5,
      DownloadUrl: 'https://fixture-download.example/audio',
    });
  }
  if (url.pathname.endsWith('/transcriptions/')) {
    stats.submissions++;
    return json({ transcription_id: 'fixture-task', status: 'PENDING', data: {} });
  }
  if (url.pathname.endsWith('/transcriptions/fixture-task')) {
    stats.polls++;
    if (stats.polls === 1)
      return json({ transcription_id: 'fixture-task', status: 'PROGRESS', data: {} });
    return json({
      transcription_id: 'fixture-task',
      status: 'SUCCESS',
      data: {
        text: 'Synthetic browser verification. Generated text survives reload.',
        language: 'en',
        duration: 45,
        results: [
          { start: 2, end: 5, text: 'Synthetic browser verification.', speaker_id: 'Test speaker' },
          {
            start: 10,
            end: 14,
            text: 'Generated text survives reload.',
            speaker_id: 'Test speaker',
          },
        ],
      },
    });
  }
  throw new Error('Unexpected fixture request.');
};
const storage = createAudioStorage(directory);
const provider = createPlaudProvider({
  clientId: 'fixture-client',
  clientSecret: 'fixture-secret',
  apiKey: 'fixture-key',
  region: 'us',
  fetch: fixtureFetch,
});
const worker = createTranscriptionWorker({ pool, storage, provider, pollIntervalMs: 500 });
const app = buildApp({
  config: readConfig({
    DEV_SESSION_TOKEN: credential,
    DEV_USER_ID: userId,
    BROWSER_ORIGINS: 'http://localhost:8088',
  }),
  probeDatabase: async () => {
    await pool.query('SELECT 1');
  },
  recordings: createProcessingService(pool, storage),
  transcriptionAvailable: true,
});
app.get('/fixture/stats', async () => stats);
app.post('/fixture/disable', async () => {
  available = false;
  return { available };
});
app.addHook('onSend', async (request, _reply, payload) =>
  request.url === '/v1/transcription/capabilities' && !available
    ? JSON.stringify({ available: false, provider: 'plaud', reason: 'not_configured' })
    : payload,
);
app.addHook('onClose', async () => {
  await worker.stop();
  await pool.end();
  await control.query(`DROP SCHEMA ${schema} CASCADE`);
  await control.end();
  await rm(directory, { recursive: true, force: true });
  await rm(metadataFile, { force: true });
});
await writeFile(metadataFile, JSON.stringify({ url: 'http://127.0.0.1:4101', credential }), {
  mode: 0o600,
});
await app.listen({ host: '127.0.0.1', port: 4101 });
worker.start();
console.log(
  'Isolated transcription fixture ready at http://127.0.0.1:4101; provider responses are synthetic.',
);
let closing = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    if (!closing) {
      closing = true;
      void app.close();
    }
  });
