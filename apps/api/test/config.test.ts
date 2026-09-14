import { describe, expect, it } from 'vitest';
import { readConfig } from '../src/bootstrap/config.js';
const devIdentity = {
  DEV_SESSION_TOKEN: 'a'.repeat(48),
  DEV_USER_ID: '6c541871-348c-479a-8aac-ff7dfe1ea8b1',
};
describe('configuration safety', () => {
  it('binds to loopback and disables development identity by default', () => {
    expect(readConfig({}).host).toBe('127.0.0.1');
    expect(readConfig({}).developmentIdentity).toBeUndefined();
  });
  it('rejects development credentials in production even if incomplete', () => {
    expect(() => readConfig({ NODE_ENV: 'production', ...devIdentity })).toThrow();
    expect(() =>
      readConfig({ NODE_ENV: 'production', DEV_USER_ID: devIdentity.DEV_USER_ID }),
    ).toThrow();
  });
  it('rejects invalid ports and partial or weak credentials', () => {
    expect(() => readConfig({ PORT: 'not-a-port' })).toThrow();
    expect(() => readConfig({ PORT: '65536' })).toThrow();
    expect(() => readConfig({ DEV_SESSION_TOKEN: devIdentity.DEV_SESSION_TOKEN })).toThrow();
    expect(() => readConfig({ ...devIdentity, DEV_SESSION_TOKEN: 'short' })).toThrow();
  });
  it('does not include secret values in configuration errors', () => {
    expect(() => readConfig({ DATABASE_URL: 'private-secret-value' })).toThrow(
      'Invalid API configuration',
    );
    try {
      readConfig({ DATABASE_URL: 'private-secret-value' });
    } catch (error) {
      expect(String(error)).not.toContain('private-secret-value');
    }
  });
});

describe('enrollment configuration', () => {
  const admin = {
    DEV_ADMIN_SESSION_TOKEN: 'b'.repeat(48),
    DEV_ADMIN_USER_ID: 'd77c9e0a-8ee0-482a-88aa-47d7b0d26843',
  };
  it('keeps admin credentials separate and rejects incomplete or production credentials', () => {
    expect(readConfig(admin).developmentAdminIdentity?.userId).toBe(admin.DEV_ADMIN_USER_ID);
    expect(() => readConfig({ DEV_ADMIN_USER_ID: admin.DEV_ADMIN_USER_ID })).toThrow();
    expect(() => readConfig({ NODE_ENV: 'production', ...admin })).toThrow();
    expect(() =>
      readConfig({
        ...devIdentity,
        ...admin,
        DEV_ADMIN_SESSION_TOKEN: devIdentity.DEV_SESSION_TOKEN,
      }),
    ).toThrow();
    expect(() =>
      readConfig({ ...devIdentity, ...admin, DEV_ADMIN_USER_ID: devIdentity.DEV_USER_ID }),
    ).toThrow();
  });
  it('prevents development credentials from listening on all interfaces', () => {
    expect(() => readConfig({ ...admin, HOST: '0.0.0.0' })).toThrow();
    expect(() => readConfig({ ...devIdentity, HOST: '0.0.0.0' })).toThrow();
    expect(readConfig({ HOST: '0.0.0.0' }).host).toBe('0.0.0.0');
  });
  it('requires a bounded HTTPS enrollment destination without embedded credentials or tokens', () => {
    expect(
      readConfig({ ENROLLMENT_BASE_URL: 'https://enroll.example.test/setup' }).enrollmentBaseUrl,
    ).toBe('https://enroll.example.test/setup');
    expect(
      readConfig({ ENROLLMENT_BASE_URL: 'http://localhost:8088/enroll' }).enrollmentBaseUrl,
    ).toBeDefined();
    for (const url of [
      'http://example.test/setup',
      'https://user:pass@example.test/setup',
      'https://example.test/setup?token=secret',
      'https://example.test/setup#secret',
      'https://example.test/' + 'a'.repeat(600),
      'javascript:alert(1)',
    ])
      expect(() => readConfig({ ENROLLMENT_BASE_URL: url })).toThrow();
    expect(() =>
      readConfig({ NODE_ENV: 'production', ENROLLMENT_BASE_URL: 'http://localhost/setup' }),
    ).toThrow();
  });
  it('allows the installed app enrollment route for development phone testing', () => {
    expect(readConfig({ ENROLLMENT_BASE_URL: 'aptlyable://enroll' }).enrollmentBaseUrl).toBe(
      'aptlyable://enroll',
    );
  });
  it('rejects other native destinations and requires HTTPS in production', () => {
    for (const url of [
      'aptlyable://settings',
      'aptlyable://enroll/another-path',
      'aptlyable://user:pass@enroll',
      'aptlyable://enroll:8088',
      'aptlyable://enroll?token=secret',
      'aptlyable://enroll#token=secret',
      'anotherapp://enroll',
    ])
      expect(() => readConfig({ ENROLLMENT_BASE_URL: url })).toThrow();
    expect(() =>
      readConfig({ NODE_ENV: 'production', ENROLLMENT_BASE_URL: 'aptlyable://enroll' }),
    ).toThrow();
  });
});

describe('Plaud SDK and transcription configuration', () => {
  it('requires paired SDK credentials and optionally enables transcription', () => {
    expect(readConfig({}).plaud).toBeUndefined();
    expect(readConfig({}).plaudSdk).toBeUndefined();
    const sdk = readConfig({
      PLAUD_CLIENT_ID: 'client',
      PLAUD_CLIENT_SECRET: 'secret',
      PLAUD_REGION: 'jp',
    });
    expect(sdk.plaudSdk).toEqual({ clientId: 'client', clientSecret: 'secret', region: 'jp' });
    expect(sdk.plaud).toBeUndefined();
    expect(() => readConfig({ PLAUD_CLIENT_SECRET: 'secret' })).toThrow();
    expect(() => readConfig({ PLAUD_API_KEY: 'api-key' })).toThrow();
    expect(() => readConfig({ PLAUD_CLIENT_ID: 'client', PLAUD_API_KEY: 'api-key' })).toThrow();
    expect(() => readConfig({ PLAUD_CLIENT_ID: 'client' })).toThrow('Invalid API configuration');
    expect(() =>
      readConfig({
        PLAUD_CLIENT_ID: 'client',
        PLAUD_CLIENT_SECRET: 'secret',
        PLAUD_API_KEY: 'key',
        PLAUD_REGION: 'unknown',
      }),
    ).toThrow();
    expect(
      readConfig({
        PLAUD_CLIENT_ID: 'client',
        PLAUD_CLIENT_SECRET: 'secret',
        PLAUD_API_KEY: 'api-key',
      }).plaud,
    ).toEqual({ clientId: 'client', clientSecret: 'secret', apiKey: 'api-key', region: 'us' });
  });
});
