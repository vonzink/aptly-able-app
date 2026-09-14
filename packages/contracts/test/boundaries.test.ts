import { describe, expect, it } from 'vitest';
import { importViolation } from '../../../scripts/verify-boundaries.mjs';
describe('workspace dependency boundaries', () => {
  it('rejects both named and relative server imports from mobile', () => {
    expect(
      importViolation('/workspace/apps/mobile/src/index.ts', '@aptly/api', '/workspace'),
    ).toBeDefined();
    expect(
      importViolation('/workspace/apps/mobile/src/index.ts', '../../api/src/app.js', '/workspace'),
    ).toBeDefined();
    expect(
      importViolation('/workspace/apps/mobile/src/index.ts', '@aws-sdk/client-s3', '/workspace'),
    ).toBeDefined();
  });
  it('allows public contracts while denying access to parent workspace code', () => {
    expect(
      importViolation('/workspace/apps/mobile/src/index.ts', '@aptly/contracts', '/workspace'),
    ).toBeUndefined();
    expect(
      importViolation(
        '/workspace/apps/mobile/src/index.ts',
        '../../../../services/api/server.js',
        '/workspace',
      ),
    ).toBeDefined();
  });
});

// Prevent server dependencies from reaching mobile indirectly through public contracts.
it('rejects named and relative server dependencies from contracts', () => {
  for (const dependency of [
    'pg',
    'fastify',
    '@aws-sdk/client-s3',
    '../../plaud-client/src/index.ts',
  ]) {
    expect(
      importViolation('/workspace/packages/contracts/src/index.ts', dependency, '/workspace'),
    ).toBeDefined();
  }
});

it('prevents server dependencies from reaching the browser or mobile through the API client', () => {
  for (const source of ['apps/admin/src/main.ts', 'packages/api-client/src/index.ts']) {
    for (const dependency of ['pg', '@aptly/api', '@aws-sdk/client-s3'])
      expect(importViolation(`/workspace/${source}`, dependency, '/workspace')).toBeDefined();
  }
  expect(
    importViolation('/workspace/packages/api-client/src/index.ts', 'node:fs', '/workspace'),
  ).toBeDefined();
  expect(
    importViolation(
      '/workspace/packages/api-client/src/index.ts',
      '@aptly/contracts',
      '/workspace',
    ),
  ).toBeUndefined();
});
