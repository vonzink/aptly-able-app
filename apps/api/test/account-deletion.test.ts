import { expect, test, vi } from 'vitest';
import { buildApp } from '../src/transport/http/app.js';
import { readConfig } from '../src/bootstrap/config.js';
import { AccountDeletionError } from '../src/modules/account-deletion/service.js';
const receipt = {
  requestId: '7cd0a633-ef96-4dd4-bb4a-6c0e293e06c3',
  status: 'pending' as const,
  requestedAt: '2026-09-15T12:00:00.000Z',
  pendingWork: ['service_data', 'provider_erasure', 'backup_retention'] as (
    'service_data' | 'provider_erasure' | 'backup_retention'
  )[],
};
test('deletion HTTP preserves errors, explicit intent, honest accepted receipt and bounded attempts', async () => {
  const request = vi.fn(async (authorization: string | undefined) => {
    if (!authorization) throw new AccountDeletionError();
    return receipt;
  });
  const app = buildApp({
    config: readConfig({}),
    probeDatabase: async () => {},
    accountDeletion: {
      request,
      status: async () => receipt,
      tick: async () => {},
      confirmExternalErasure: async () => {},
    },
  });
  try {
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/account/deletion',
          payload: { password: 'abc', confirmation: 'DELETE' },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/account/deletion',
          payload: { password: 'abc', confirmation: 'no' },
        })
      ).statusCode,
    ).toBe(400);
    const accepted = await app.inject({
      method: 'POST',
      url: '/v1/account/deletion',
      headers: { authorization: 'Bearer test' },
      payload: { password: 'abc', confirmation: 'DELETE' },
    });
    expect(accepted.statusCode).toBe(202);
    expect(accepted.json()).toEqual(receipt);
    for (let n = 0; n < 8; n++)
      await app.inject({ method: 'POST', url: '/v1/account/deletion', payload: {} });
    expect(
      (await app.inject({ method: 'POST', url: '/v1/account/deletion', payload: {} })).statusCode,
    ).toBe(429);
  } finally {
    await app.close();
  }
});
