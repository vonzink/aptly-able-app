import { ProviderError } from '../provider.js';

/** No vendor response body, URL, header, or underlying exception leaves this boundary. */
export function createHttp(transport: typeof fetch, timeoutMs: number) {
  return async function request(
    url: string,
    init: RequestInit,
    options: { etag?: boolean; submission?: boolean; maxBytes?: number } = {},
  ): Promise<unknown> {
    const submission = options.submission ?? false;
    const maxBytes = options.maxBytes ?? 1024 * 1024;
    const controller = new AbortController();
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const discard = (response: Response) => {
      void response.body?.cancel().catch(() => {});
    };
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(new ProviderError('provider_timeout', submission));
        controller.abort();
        void reader?.cancel().catch(() => {});
      }, timeoutMs);
    });
    try {
      return await Promise.race([
        timeout,
        (async () => {
          const response = await transport(url, {
            ...init,
            redirect: 'error',
            signal: controller.signal,
          });
          if (controller.signal.aborted) {
            discard(response);
            throw new ProviderError('provider_timeout', submission);
          }
          if (response.redirected || (response.status >= 300 && response.status < 400)) {
            discard(response);
            throw new ProviderError('provider_redirect', submission);
          }
          if (!response.ok) {
            discard(response);
            const code =
              response.status === 401 || response.status === 403
                ? 'provider_auth_failed'
                : response.status === 429
                  ? 'provider_rate_limited'
                  : response.status >= 500
                    ? 'provider_unavailable'
                    : 'provider_rejected';
            throw new ProviderError(
              code,
              submission && (response.status >= 500 || response.status === 408),
            );
          }
          if (options.etag) {
            discard(response);
            const etag = response.headers.get('etag');
            if (!etag || etag.length > 1024 || /[\r\n]/.test(etag)) {
              throw new ProviderError('provider_invalid_response', submission);
            }
            return etag;
          }
          const length = response.headers.get('content-length');
          if (length !== null && (!/^\d+$/.test(length) || Number(length) > maxBytes)) {
            discard(response);
            throw new ProviderError('provider_response_too_large', submission);
          }
          if (!response.body) throw new ProviderError('provider_invalid_response', submission);
          reader = response.body.getReader();
          const chunks: Uint8Array[] = [];
          let bytes = 0;
          try {
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              bytes += value.byteLength;
              if (bytes > maxBytes) {
                void reader.cancel().catch(() => {});
                throw new ProviderError('provider_response_too_large', submission);
              }
              chunks.push(value);
            }
          } finally {
            reader.releaseLock();
            reader = undefined;
          }
          const body = new Uint8Array(bytes);
          let offset = 0;
          for (const chunk of chunks) {
            body.set(chunk, offset);
            offset += chunk.byteLength;
          }
          try {
            return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)) as unknown;
          } catch {
            throw new ProviderError('provider_invalid_response', submission);
          }
        })(),
      ]);
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError(
        controller.signal.aborted ? 'provider_timeout' : 'provider_network',
        submission,
      );
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  };
}
