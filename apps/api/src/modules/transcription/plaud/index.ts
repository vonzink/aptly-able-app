import { createHash } from 'node:crypto';
import { open } from 'node:fs/promises';
import { ProviderError, type TranscriptionProvider } from '../provider.js';
import { createHttp } from './http.js';
import { httpsUrl, invalid, normalizeTranscript, object, string } from './validation.js';

export interface PlaudProviderOptions {
  clientId: string;
  clientSecret: string;
  apiKey: string;
  region: 'us' | 'jp';
  fetch?: typeof fetch;
  timeoutMs?: number;
}

const MAX_AUDIO_BYTES = 250 * 1024 * 1024;
const MAX_PART_BYTES = 16 * 1024 * 1024;
const MAX_PARTS = 10000;
const PENDING = new Set(['PENDING', 'RECEIVED', 'STARTED', 'PROGRESS']);

export function createPlaudProvider(options: PlaudProviderOptions): TranscriptionProvider {
  const timeoutMs = options.timeoutMs ?? 30000;
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 300000 ||
    !['us', 'jp'].includes(options.region) ||
    [options.clientId, options.clientSecret, options.apiKey].some(
      (value) => !value || /[\r\n]/.test(value),
    )
  ) {
    throw new ProviderError('provider_invalid_config');
  }
  const base = `https://platform-${options.region}.plaud.ai/developer/api`;
  const request = createHttp(options.fetch ?? globalThis.fetch, timeoutMs);
  const transcriptionHeaders = {
    'Content-Type': 'application/json',
    'X-Client-Id': options.clientId,
    'X-Client-Api-Key': options.apiKey,
  };
  // A completed upload is eligible for one submission on this instance. A restart must
  // recover via the durable worker's task/checkpoint state, never reuse an arbitrary URL.
  const issuedDownloads = new Map<string, number>();
  const jsonPost = (authorization: string, body: unknown): RequestInit => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authorization },
    body: JSON.stringify(body),
  });

  return {
    async uploadAudio(input) {
      if (
        !Number.isSafeInteger(input.sizeBytes) ||
        input.sizeBytes <= 0 ||
        input.sizeBytes > MAX_AUDIO_BYTES ||
        !['mp3', 'wav', 'm4a'].includes(input.fileType) ||
        input.userId.length < 6 ||
        input.userId.length > 120
      )
        throw new ProviderError('provider_invalid_audio');
      // Opening once preserves file identity. Validate size before credentials/network use.
      let file;
      try {
        file = await open(input.path, 'r');
      } catch {
        throw new ProviderError('provider_audio_unavailable');
      }
      try {
        const before = await file.stat();
        if (!before.isFile() || before.size !== input.sizeBytes)
          throw new ProviderError('provider_invalid_audio');
        const partner = object(
          await request(`${base}/oauth/partner/access-token`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              Authorization: `Basic ${Buffer.from(`${options.clientId}:${options.clientSecret}`).toString('base64')}`,
            },
            body: '',
          }),
        );
        const user = object(
          await request(
            `${base}/open/partner/users/access-token`,
            jsonPost(`Bearer ${string(partner.access_token, 16384)}`, {
              user_id: input.userId,
              expires_in: 86400,
            }),
          ),
        );
        const authorization = `Bearer ${string(user.access_token, 16384)}`;
        const plan = object(
          await request(
            `${base}/open/partner/files/upload/generate-presigned-urls`,
            jsonPost(authorization, { filesize: before.size, filetype: input.fileType }),
          ),
        );
        const fileId = string(plan.FileId);
        const uploadId = string(plan.UploadId);
        const chunkSize = plan.ChunkSize;
        if (
          typeof chunkSize !== 'number' ||
          !Number.isSafeInteger(chunkSize) ||
          chunkSize < 1 ||
          chunkSize > MAX_PART_BYTES ||
          !Array.isArray(plan.Parts) ||
          plan.Parts.length !== Math.ceil(before.size / chunkSize) ||
          plan.Parts.length > MAX_PARTS
        )
          return invalid();
        const parts = plan.Parts.map((value, index) => {
          const part = object(value);
          if (part.PartNumber !== index + 1) return invalid();
          return { PartNumber: index + 1, PresignedUrl: httpsUrl(part.PresignedUrl) };
        });
        const md5 = createHash('md5');
        const completed: Array<{ PartNumber: number; ETag: string }> = [];
        let position = 0;
        for (const part of parts) {
          const bytes = new Uint8Array(Math.min(chunkSize, before.size - position));
          let filled = 0;
          while (filled < bytes.byteLength) {
            const result = await file.read(
              bytes,
              filled,
              bytes.byteLength - filled,
              position + filled,
            );
            if (result.bytesRead === 0) throw new ProviderError('provider_audio_changed');
            filled += result.bytesRead;
          }
          position += bytes.byteLength;
          md5.update(bytes);
          // Signed object-store PUTs receive raw bytes and no application credentials.
          const etag = await request(
            part.PresignedUrl,
            { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: bytes },
            { etag: true },
          );
          completed.push({ PartNumber: part.PartNumber, ETag: string(etag) });
        }
        const after = await file.stat();
        if (
          position !== before.size ||
          after.size !== before.size ||
          after.mtimeMs !== before.mtimeMs ||
          after.ctimeMs !== before.ctimeMs
        )
          throw new ProviderError('provider_audio_changed');
        const digest = md5.digest('hex');
        const result = object(
          await request(
            `${base}/open/partner/files/upload/complete-upload`,
            jsonPost(authorization, {
              file_id: fileId,
              upload_id: uploadId,
              part_list: completed,
              filetype: input.fileType,
              file_md5: digest,
            }),
          ),
        );
        if (
          (result.FileId !== undefined && result.FileId !== fileId) ||
          (result.FileType !== undefined && result.FileType !== input.fileType) ||
          (result.FileMd5 !== undefined && result.FileMd5 !== digest)
        )
          return invalid();
        const downloadUrl = httpsUrl(result.DownloadUrl);
        for (const [url, expiry] of issuedDownloads)
          if (expiry < Date.now()) issuedDownloads.delete(url);
        if (issuedDownloads.size >= 1000) throw new ProviderError('provider_capacity');
        issuedDownloads.set(downloadUrl, Date.now() + 23 * 60 * 60 * 1000);
        return { downloadUrl };
      } catch (error) {
        if (error instanceof ProviderError) throw error;
        throw new ProviderError('provider_audio_unavailable');
      } finally {
        await file.close().catch(() => {});
      }
    },

    async submit(downloadUrl) {
      const expiry = issuedDownloads.get(downloadUrl);
      issuedDownloads.delete(downloadUrl);
      if (expiry === undefined || expiry < Date.now())
        throw new ProviderError('provider_untrusted_url');
      const result = await request(
        `${base}/open/partner/ai/transcriptions/`,
        {
          method: 'POST',
          headers: transcriptionHeaders,
          body: JSON.stringify({
            file_url: downloadUrl,
            params: {
              transcribe: { language: 'auto' },
              diarization: { enabled: true, return_embedding: false },
            },
          }),
        },
        { submission: true },
      );
      try {
        return string(object(result).transcription_id, 512);
      } catch {
        throw new ProviderError('provider_invalid_response', true);
      }
    },

    async poll(taskId) {
      string(taskId, 512);
      const result = object(
        await request(
          `${base}/open/partner/ai/transcriptions/${encodeURIComponent(taskId)}`,
          {
            method: 'GET',
            headers: transcriptionHeaders,
          },
          { maxBytes: 8 * 1024 * 1024 },
        ),
      );
      if (
        typeof result.status !== 'string' ||
        (result.transcription_id !== undefined && result.transcription_id !== taskId)
      )
        return invalid();
      if (PENDING.has(result.status)) return { status: 'pending' };
      if (result.status === 'FAILURE' || result.status === 'REVOKED') return { status: 'failed' };
      if (result.status !== 'SUCCESS') return invalid();
      return { status: 'complete', transcript: normalizeTranscript(result.data) };
    },
  };
}
