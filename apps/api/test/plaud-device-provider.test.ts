import { describe, expect, it, vi } from 'vitest';
import { createPlaudDeviceProvider } from '../src/modules/plaud-devices/provider.js';

const userId = '6c541871-348c-479a-8aac-ff7dfe1ea8b1';
const recorder = { serial: '8820000000000001', model: 'notepins' as const };
const providerDeviceId = 'device_70550902-08b3-4d50-b60b-a206644c7fd0';
const token = (access_token: string) => ({ access_token, token_type: 'bearer', expires_in: 3600 });
function fixture(responses: unknown[], region: 'us' | 'jp' = 'us') {
  const transport = vi.fn<typeof fetch>(async () => Response.json(responses.shift()));
  const provider = createPlaudDeviceProvider({
    clientId: 'client',
    clientSecret: 'secret',
    region,
    fetch: transport,
    now: () => Date.parse('2026-09-11T12:00:00.000Z'),
  });
  return { provider, transport };
}

describe('Plaud device provider protocol', () => {
  it('registers a new serial by signing it before requesting cloud ownership', async () => {
    let registered = false;
    const transport = vi.fn<typeof fetch>(async (url) => {
      const path = new URL(String(url)).pathname;
      if (path.endsWith('/oauth/partner/access-token')) return Response.json(token('partner'));
      if (path.endsWith('/users/access-token')) return Response.json(token('user-token'));
      if (path.endsWith('/sdk/sn-sign')) {
        registered = true;
        return Response.json({ signature: 'transient-device-signature' });
      }
      if (path.endsWith('/sdk/bind'))
        return registered
          ? Response.json({ type: recorder.model, sn: recorder.serial, is_bind: true })
          : Response.json({ detail: 'Not Found' }, { status: 404 });
      throw new Error('Unexpected provider request');
    });
    const provider = createPlaudDeviceProvider({
      clientId: 'client',
      clientSecret: 'secret',
      region: 'us',
      fetch: transport,
    });
    await expect(provider.bind(userId, recorder)).resolves.toBeUndefined();
    expect(transport.mock.calls.map(([url]) => new URL(String(url)).pathname)).toEqual([
      '/developer/api/oauth/partner/access-token',
      '/developer/api/open/partner/users/access-token',
      '/developer/api/open/partner/sdk/sn-sign',
      '/developer/api/open/partner/sdk/bind',
    ]);
    expect(transport.mock.calls[2]?.[1]).toMatchObject({
      method: 'POST',
      headers: { Authorization: 'Bearer user-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: recorder.model, sn: recorder.serial }),
    });
  });
  it('mints a bounded per-user SDK session with Basic partner then Bearer user authentication', async () => {
    const { provider, transport } = fixture([token('partner'), token('user-token')], 'jp');
    expect(await provider.session(userId)).toEqual({
      userAccessToken: 'user-token',
      expiresAt: '2026-09-11T13:00:00.000Z',
      customDomain: 'platform-jp.plaud.ai',
    });
    expect(transport.mock.calls[0]).toEqual([
      'https://platform-jp.plaud.ai/developer/api/oauth/partner/access-token',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from('client:secret').toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: '',
        redirect: 'error',
      }),
    ]);
    expect(transport.mock.calls[1]).toEqual([
      'https://platform-jp.plaud.ai/developer/api/open/partner/users/access-token',
      expect.objectContaining({
        method: 'POST',
        headers: { Authorization: 'Bearer partner', 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, expires_in: 3600 }),
      }),
    ]);
  });
  it.each([
    ['bind', true],
    ['unbind', false],
  ] as const)(
    'validates exact %s confirmation with the owned user token',
    async (method, expected) => {
      const { provider, transport } = fixture([
        token('partner'),
        token('user-token'),
        ...(expected ? [{ signature: 'transient-device-signature' }] : []),
        { type: recorder.model, sn: recorder.serial, is_bind: expected },
      ]);
      await expect(provider[method](userId, recorder)).resolves.toBeUndefined();
      expect(transport.mock.calls[expected ? 3 : 2]).toEqual([
        `https://platform-us.plaud.ai/developer/api/open/partner/sdk/${method}`,
        expect.objectContaining({
          headers: { Authorization: 'Bearer user-token', 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: recorder.model, sn: recorder.serial }),
        }),
      ]);
    },
  );
  it.each([
    ['bind', true],
    ['unbind', false],
  ] as const)(
    'verifies the live opaque %s response against the assigned serial registry',
    async (method, bound) => {
      const confirmation = { device_id: providerDeviceId, is_bind: bound };
      const { provider, transport } = fixture([
        token('partner'),
        token('user-token'),
        ...(bound ? [{ signature: 'transient-device-signature' }] : []),
        confirmation,
        { ...confirmation, bind_history: [] },
      ]);
      await expect(provider[method](userId, recorder)).resolves.toBeUndefined();
      expect(transport.mock.lastCall).toEqual([
        'https://platform-us.plaud.ai/developer/api/open/partner/sdk/binding?type=notepins&sn=8820000000000001',
        expect.objectContaining({
          headers: { Authorization: 'Bearer user-token' },
          redirect: 'error',
        }),
      ]);
    },
  );
  it.each([
    { device_id: 'device_another', is_bind: true },
    { device_id: providerDeviceId, is_bind: false },
    { device_id: providerDeviceId, is_bind: null },
    { is_bind: true },
  ])(
    'rejects opaque bind confirmation when the serial registry does not confirm it',
    async (registry) => {
      const { provider } = fixture([
        token('partner'),
        token('user-token'),
        { signature: 'transient-device-signature' },
        { device_id: providerDeviceId, is_bind: true },
        registry,
      ]);
      await expect(provider.bind(userId, recorder)).rejects.toMatchObject({
        code: 'PLAUD_PROVIDER_INVALID_RESPONSE',
      });
    },
  );
  it.each([
    { type: recorder.model, sn: '8820000000000002', is_bind: true },
    { type: 'notepro', sn: recorder.serial, is_bind: true },
    { type: recorder.model, sn: recorder.serial, is_bind: false },
    { success: true },
    { device_id: providerDeviceId, type: 'notepro', sn: recorder.serial, is_bind: true },
  ])('rejects incomplete or mismatched bind confirmation', async (response) => {
    const { provider } = fixture([
      token('partner'),
      token('user-token'),
      { signature: 'transient-device-signature' },
      response,
    ]);
    await expect(provider.bind(userId, recorder)).rejects.toMatchObject({
      code: 'PLAUD_PROVIDER_INVALID_RESPONSE',
    });
  });
  it.each([{ signature: '' }, { signature: null }, {}])(
    'does not request cloud binding without a valid serial signature',
    async (response) => {
      const { provider, transport } = fixture([token('partner'), token('user-token'), response]);
      await expect(provider.bind(userId, recorder)).rejects.toMatchObject({
        code: 'PLAUD_PROVIDER_INVALID_RESPONSE',
      });
      expect(transport.mock.calls).toHaveLength(3);
      expect(String(transport.mock.calls[2]?.[0])).toMatch(/\/sdk\/sn-sign$/);
    },
  );
  it.each([
    { ...token('private-value'), expires_in: -1 },
    { ...token('private-value'), expires_in: '3600' },
    { ...token('private-value'), token_type: 'basic' },
    token('private\r\nvalue'),
  ])('rejects unsafe token responses without disclosing them', async (response) => {
    const { provider } = fixture([token('partner'), response]);
    await expect(provider.session(userId)).rejects.toMatchObject({
      code: 'PLAUD_PROVIDER_INVALID_RESPONSE',
    });
    try {
      await fixture([response]).provider.session(userId);
    } catch (error) {
      expect(String(error)).not.toContain('private');
    }
  });
  it('validates the UUID before making requests and never passes through upstream failures', async () => {
    const { provider, transport } = fixture([]);
    await expect(provider.session('client-selected-owner')).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
    transport.mockResolvedValueOnce(new Response('private-secret-provider-body', { status: 403 }));
    await expect(provider.session(userId)).rejects.toMatchObject({
      code: 'PLAUD_PROVIDER_UNAVAILABLE',
      message: 'Plaud could not complete the device request. Try again.',
    });
    transport.mockRejectedValueOnce(new Error('private-secret-network-error'));
    await expect(provider.session(userId)).rejects.not.toThrow('private-secret');
  });
  it('bounds hanging provider calls and rejects redirects', async () => {
    const transport = vi.fn<typeof fetch>(() => new Promise(() => {}));
    const provider = createPlaudDeviceProvider({
      clientId: 'client',
      clientSecret: 'secret',
      region: 'us',
      fetch: transport,
      timeoutMs: 5,
    });
    await expect(provider.session(userId)).rejects.toMatchObject({
      code: 'PLAUD_PROVIDER_UNAVAILABLE',
    });
    transport.mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { Location: 'https://elsewhere.test' } }),
    );
    await expect(provider.session(userId)).rejects.toMatchObject({
      code: 'PLAUD_PROVIDER_UNAVAILABLE',
    });
  });
});
