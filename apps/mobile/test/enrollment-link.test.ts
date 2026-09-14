import { describe, expect, it } from 'vitest';

import { parseEnrollmentInput } from '../src/features/enrollment/enrollment-link';

const token = 'Abcdefghijklmnopqrstuvwxyz0123456789_-ABCDE';

describe('enrollment invitation parsing', () => {
  it('reads a token only from the /enroll URL fragment', () => {
    expect(parseEnrollmentInput(`http://localhost:8088/enroll#token=${token}`)).toEqual({
      ok: true,
      token,
    });
  });

  it('rejects a token supplied in the query string', () => {
    expect(parseEnrollmentInput(`http://localhost:8088/enroll?token=${token}`)).toEqual({
      ok: false,
      reason: 'query-token',
    });
  });

  it('rejects links for another path and malformed codes', () => {
    expect(parseEnrollmentInput(`http://localhost:8088/settings#token=${token}`).ok).toBe(false);
    expect(parseEnrollmentInput('too-short').ok).toBe(false);
  });

  it('accepts a raw invitation code for local native testing', () => {
    expect(parseEnrollmentInput(token)).toEqual({ ok: true, token });
  });

  it('accepts the native custom scheme enrollment route', () => {
    expect(parseEnrollmentInput(`aptlyable://enroll#token=${token}`)).toEqual({ ok: true, token });
  });
});
