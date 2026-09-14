import { ApiError } from './api-error.js';

function isPrivateIPv4(host: string): boolean {
  const parts = host.split('.');
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255))
    return false;
  const [first, second] = parts.map(Number);
  return (
    first === 10 ||
    (first === 172 && second! >= 16 && second! <= 31) ||
    (first === 192 && second === 168)
  );
}

/** HTTP beyond loopback requires an exact, explicitly configured private development origin. */
export function apiBase(value: string, developmentHttpOrigin?: string): string {
  try {
    const url = new URL(value);
    const local =
      url.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]', '10.0.2.2'].includes(url.hostname);
    const development =
      url.protocol === 'http:' &&
      url.origin === developmentHttpOrigin &&
      isPrivateIPv4(url.hostname);
    if (
      (url.protocol !== 'https:' && !local && !development) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/'
    )
      throw new Error();
    return url.origin;
  } catch {
    throw new ApiError(
      0,
      'INVALID_CONFIGURATION',
      'The service address is not configured correctly.',
    );
  }
}
