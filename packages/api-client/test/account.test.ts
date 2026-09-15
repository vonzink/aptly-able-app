import { test, expect, vi } from 'vitest';
import { createAccountClient } from '../src/account.js';
const receipt = {
  requestId: '7cd0a633-ef96-4dd4-bb4a-6c0e293e06c3',
  status: 'pending',
  requestedAt: '2026-09-15T12:00:00.000Z',
  pendingWork: ['provider_erasure', 'backup_retention'],
};
test('deletion sends explicit confirmation and credential; status survives response-loss retry', async () => {
  const fetch = vi.fn(async () => new Response(JSON.stringify(receipt), { status: 202 }));
  const client = createAccountClient({
    baseUrl: 'https://api.example.com',
    getCredential: () => 'secret',
    fetch,
  });
  expect(await client.requestDeletion({ password: 'password', confirmation: 'DELETE' })).toEqual(
    receipt,
  );
  expect(fetch).toHaveBeenCalledWith(
    'https://api.example.com/v1/account/deletion',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ password: 'password', confirmation: 'DELETE' }),
      headers: { Authorization: 'Bearer secret', 'Content-Type': 'application/json' },
      redirect: 'error',
      credentials: 'omit',
    }),
  );
  expect(await client.getDeletionStatus()).toEqual(receipt);
});
test('invalid intent or missing credentials never sends a request', () => {
  const fetch = vi.fn();
  const client = createAccountClient({
    baseUrl: 'https://api.example.com',
    getCredential: () => undefined,
    fetch,
  });
  expect(() => client.requestDeletion({ password: 'password', confirmation: 'DELETE' })).toThrow(
    'Sign in',
  );
  expect(fetch).not.toHaveBeenCalled();
});
test('provider errors never become a false completion or leak raw server details', async () => {
  const fetch = vi.fn(async () => new Response('secret internal detail', { status: 503 }));
  const client = createAccountClient({
    baseUrl: 'https://api.example.com',
    getCredential: () => 'secret',
    fetch,
  });
  await expect(
    client.requestDeletion({ password: 'password', confirmation: 'DELETE' }),
  ).rejects.toMatchObject({ status: 503 });
});
