import { expect, test } from 'vitest';
import { buildApp } from '../src/transport/http/app.js';
import { readConfig } from '../src/bootstrap/config.js';

test('authentication throttles each client behind the exact trusted proxy', async () => {
  const app = buildApp({
    config: readConfig({ TRUSTED_PROXY_IP: '172.30.45.3' }),
    probeDatabase: async () => {},
  });
  const send = (remoteAddress: string, forwarded: string) =>
    app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      remoteAddress,
      headers: { 'x-forwarded-for': forwarded },
      payload: {},
    });
  try {
    for (let i = 0; i < 10; i++)
      expect((await send('172.30.45.3', '198.51.100.10')).statusCode).toBe(503);
    expect((await send('172.30.45.3', '198.51.100.10')).statusCode).toBe(429);
    expect((await send('172.30.45.3', '198.51.100.11')).statusCode).toBe(503);
    // Direct clients cannot rotate a spoofed header to escape their socket-IP bucket.
    for (let i = 0; i < 10; i++)
      expect((await send('198.51.100.20', `203.0.113.${i}`)).statusCode).toBe(503);
    expect((await send('198.51.100.20', '203.0.113.100')).statusCode).toBe(429);
  } finally {
    await app.close();
  }
});
