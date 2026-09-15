import { describe, expect, it } from 'vitest';

import { parseEnrollmentInput } from '../src/features/enrollment/enrollment-link';

const token = 'Abcdefghijklmnopqrstuvwxyz0123456789_-ABCDE';
const development = { allowLocalDevelopment: true };

describe('enrollment invitation parsing', () => {
  it('reads a token only from the /enroll URL fragment', () => {
    expect(
      parseEnrollmentInput(`http://localhost:8088/enroll#token=${token}`, development),
    ).toEqual({
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

  it('accepts the production HTTPS origin and preserves fragment-only tokens', () => {
    expect(parseEnrollmentInput(`https://plaud.aptlyable.info/enroll#token=${token}`)).toEqual({
      ok: true,
      token,
    });
    expect(parseEnrollmentInput(`aptlyable://enroll/#token=${token}`)).toEqual({ ok: true, token });
  });

  it.each([
    'https://untrusted.example/enroll',
    'https://plaud.aptlyable.info.evil.example/enroll',
    'https://plaud.aptlyable.info:444/enroll',
    'http://plaud.aptlyable.info/enroll',
    'ftp://plaud.aptlyable.info/enroll',
    'file:///enroll',
    'javascript:/enroll',
    'exp+aptly-able://anything/enroll',
    'aptlyable://untrusted/enroll',
    'aptlyable://enroll:1234',
    'https://user:password@plaud.aptlyable.info/enroll',
    'aptlyable://user@enroll',
  ])('rejects an untrusted scheme, authority or credentials: %s', (base) => {
    expect(parseEnrollmentInput(`${base}#token=${token}`).ok).toBe(false);
  });

  it.each(['localhost:8088', '127.0.0.1:8088', '[::1]:8088'])(
    'accepts local development %s only with development explicitly enabled',
    (host) => {
      const url = `http://${host}/enroll#token=${token}`;
      expect(parseEnrollmentInput(url, { allowLocalDevelopment: false }).ok).toBe(false);
      expect(parseEnrollmentInput(url, development)).toEqual({ ok: true, token });
    },
  );

  it.each(['localhost.evil.example:8088', '192.168.1.10:8088', 'untrusted.example'])(
    'does not broaden development trust to %s',
    (host) => {
      expect(parseEnrollmentInput(`http://${host}/enroll#token=${token}`, development).ok).toBe(
        false,
      );
    },
  );

  it('uses the native development flag only for loopback URLs', () => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, '__DEV__');
    try {
      Object.defineProperty(globalThis, '__DEV__', { value: true, configurable: true });
      expect(parseEnrollmentInput(`http://localhost:8088/enroll#token=${token}`)).toEqual({
        ok: true,
        token,
      });
      Object.defineProperty(globalThis, '__DEV__', { value: false, configurable: true });
      expect(parseEnrollmentInput(`http://localhost:8088/enroll#token=${token}`).ok).toBe(false);
    } finally {
      if (previous) Object.defineProperty(globalThis, '__DEV__', previous);
      else Reflect.deleteProperty(globalThis, '__DEV__');
    }
  });

  it.each([
    `https://plaud.aptlyable.info/enroll#token=${token}&token=${token}`,
    `https://plaud.aptlyable.info/enroll#token=${token}&token=bad`,
    `https://plaud.aptlyable.info/enroll?%74oken=${token}#token=${token}`,
    `https://plaud.aptlyable.info/enroll#token=%E0%A4%A`,
    `https://plaud.aptlyable.info/\nenroll#token=${token}`,
    `https://plaud.aptlyable.info\\enroll#token=${token}`,
  ])('rejects ambiguous or malformed invitation input: %s', (url) => {
    expect(parseEnrollmentInput(url).ok).toBe(false);
  });
});
