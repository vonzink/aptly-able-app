const tokenPattern = /^[A-Za-z0-9_-]{43}$/;

export type EnrollmentInputResult =
  | { ok: true; token: string }
  | { ok: false; reason: 'empty' | 'malformed' | 'wrong-path' | 'query-token' };

export function parseEnrollmentInput(input: string): EnrollmentInputResult {
  const value = input.trim();
  if (!value) return { ok: false, reason: 'empty' };
  if (tokenPattern.test(value)) return { ok: true, token: value };

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (url.searchParams.has('token')) return { ok: false, reason: 'query-token' };
  const isEnrollmentRoute =
    url.pathname === '/enroll' ||
    (url.protocol === 'aptlyable:' &&
      url.hostname === 'enroll' &&
      (url.pathname === '' || url.pathname === '/'));
  if (!isEnrollmentRoute) return { ok: false, reason: 'wrong-path' };
  const token = new URLSearchParams(url.hash.slice(1)).get('token') ?? '';
  return tokenPattern.test(token) ? { ok: true, token } : { ok: false, reason: 'malformed' };
}
