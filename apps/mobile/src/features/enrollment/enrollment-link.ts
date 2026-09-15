const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
declare const __DEV__: boolean;

export type EnrollmentInputResult =
  | { ok: true; token: string }
  | {
      ok: false;
      reason: 'empty' | 'malformed' | 'wrong-path' | 'query-token' | 'untrusted-origin';
    };

export function parseEnrollmentInput(
  input: string,
  {
    allowLocalDevelopment = typeof __DEV__ !== 'undefined' && __DEV__,
  }: { allowLocalDevelopment?: boolean } = {},
): EnrollmentInputResult {
  const value = input.trim();
  if (!value) return { ok: false, reason: 'empty' };
  if (tokenPattern.test(value)) return { ok: true, token: value };
  // URL parsing normalizes embedded whitespace and backslashes; reject ambiguous input first.
  if (/[\s\\]/.test(value)) return { ok: false, reason: 'malformed' };

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (url.searchParams.has('token')) return { ok: false, reason: 'query-token' };
  const customScheme = url.protocol === 'aptlyable:' && url.hostname === 'enroll' && !url.port;
  const localDevelopment =
    allowLocalDevelopment &&
    ['http:', 'https:'].includes(url.protocol) &&
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    (!customScheme && url.origin !== 'https://plaud.aptlyable.info' && !localDevelopment)
  )
    return { ok: false, reason: 'untrusted-origin' };
  const isEnrollmentRoute = customScheme
    ? url.pathname === '' || url.pathname === '/'
    : url.pathname === '/enroll';
  if (!isEnrollmentRoute) return { ok: false, reason: 'wrong-path' };
  const tokens = new URLSearchParams(url.hash.slice(1)).getAll('token');
  if (tokens.length !== 1) return { ok: false, reason: 'malformed' };
  const token = tokens[0]!;
  return tokenPattern.test(token) ? { ok: true, token } : { ok: false, reason: 'malformed' };
}
