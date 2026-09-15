import { describe, expect, it, vi } from 'vitest';
import { createPlaudDeviceClient } from '../src/plaud-device.js';
const operationId = 'a48abcc4-4a79-40d8-8184-8ea53f76db72';
const session = {
  userAccessToken: 'transient-user-token',
  expiresAt: '2026-09-11T13:00:00.000Z',
  customDomain: 'platform-us.plaud.ai',
  userId: '6c541871-348c-479a-8aac-ff7dfe1ea8b1',
  recorder: { serial: '8820000000000001', model: 'notepins' },
};
function fixture(credential: string | undefined = 'session-credential') {
  const transport = vi.fn<typeof fetch>(async () => Response.json(session));
  const client = createPlaudDeviceClient({
    baseUrl: 'https://api.example.test',
    getCredential: () => credential,
    fetch: transport,
  });
  return { client, transport };
}
describe('Plaud device API client', () => {
  it('requests capabilities without credentials and sends operation IDs only in authenticated POST bodies', async () => {
    const { client, transport } = fixture();
    transport.mockResolvedValueOnce(Response.json({ available: true, reason: 'ready' }));
    expect(await client.capabilities()).toEqual({ available: true, reason: 'ready' });
    expect(transport.mock.calls[0]).toEqual([
      'https://api.example.test/v1/plaud/capabilities',
      expect.objectContaining({
        method: 'GET',
        headers: {},
        cache: 'no-store',
        credentials: 'omit',
      }),
    ]);
    expect(await client.session(operationId)).toEqual(session);
    expect(transport.mock.calls[1]).toEqual([
      'https://api.example.test/v1/plaud/device-session',
      expect.objectContaining({
        method: 'POST',
        headers: { Authorization: 'Bearer session-credential', 'Content-Type': 'application/json' },
        body: JSON.stringify({ operationId }),
        redirect: 'error',
      }),
    ]);
    transport.mockResolvedValueOnce(Response.json({ status: 'bound' }));
    expect(await client.bind(operationId)).toEqual({ status: 'bound' });
    transport.mockResolvedValueOnce(Response.json({ status: 'unbound' }));
    expect(await client.unbind(operationId)).toEqual({ status: 'unbound' });
    transport.mockResolvedValueOnce(Response.json({ status: 'released' }));
    expect(await client.completeUnpair(operationId)).toEqual({ status: 'released' });
    expect(transport.mock.calls.slice(2).map(([url]) => url)).toEqual([
      'https://api.example.test/v1/plaud/device-bind',
      'https://api.example.test/v1/plaud/device-unbind',
      'https://api.example.test/v1/plaud/device-complete-unpair',
    ]);
  });
  it('validates credentials, cancellation and operation IDs before networking', async () => {
    const { client, transport } = fixture();
    await expect(client.session(undefined as unknown as string)).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    await expect(client.session('arbitrary/id?token=secret')).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    await expect(
      client.session(operationId, { signal: AbortSignal.abort() }),
    ).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(transport).not.toHaveBeenCalled();
    const signedOut = createPlaudDeviceClient({
      baseUrl: 'https://api.example.test',
      getCredential: () => undefined,
      fetch: transport,
    });
    await expect(signedOut.bind(operationId)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(transport).not.toHaveBeenCalled();
  });
  it('rejects mismatched responses and does not expose upstream body text', async () => {
    const { client, transport } = fixture();
    transport.mockResolvedValueOnce(Response.json({ ...session, customDomain: 'attacker.test' }));
    await expect(client.session(operationId)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    transport.mockResolvedValueOnce(
      Response.json(
        { error: { code: 'PLAUD_RECORDER_REASSIGNED', message: 'private upstream secret' } },
        { status: 409 },
      ),
    );
    await expect(client.unbind(operationId)).rejects.toMatchObject({
      code: 'PLAUD_RECORDER_REASSIGNED',
      status: 409,
    });
    transport.mockRejectedValueOnce(new Error('private upstream secret'));
    await expect(client.session(operationId)).rejects.not.toThrow('private upstream secret');
  });
  it('rejects late cancelled responses and bounds transports that ignore abort', async () => {
    const controller = new AbortController();
    const transport = vi.fn<typeof fetch>(async () => {
      controller.abort();
      return Response.json(session);
    });
    const client = createPlaudDeviceClient({
      baseUrl: 'http://127.0.0.1:4100',
      getCredential: () => 'credential',
      fetch: transport,
      timeoutMs: 5,
    });
    await expect(client.session(operationId, { signal: controller.signal })).rejects.toMatchObject({
      code: 'CANCELLED',
    });
    transport.mockImplementationOnce(() => new Promise(() => {}));
    await expect(client.session(operationId)).rejects.toMatchObject({ code: 'TIMEOUT' });
  });
  it.each([
    'http://api.example.test',
    'https://u:p@api.example.test',
    'https://api.example.test?token=secret',
    'https://api.example.test/path',
  ])('rejects unsafe service addresses', (baseUrl) => {
    expect(() => createPlaudDeviceClient({ baseUrl, getCredential: () => 'credential' })).toThrow();
  });
});
