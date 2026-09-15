import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import QRCode from 'qrcode';
import { buildApp } from '../src/transport/http/app.js';
import { readConfig } from '../src/bootstrap/config.js';
import type { EnrollmentService } from '../src/modules/enrollments/service.js';

const userId = '8cd7c040-9c09-4629-b1a1-9e8dfecf4e10';
const adminId = '4cbda9d7-547d-4675-a2bb-540e5c4555cf';
const assignmentId = 'de3723d5-e282-449d-93f2-900f1680a2a0';
const tokenId = 'a9680a90-81de-47a8-9f35-cc19f351b22c';
const recorderId = '7bbdff94-fb1e-425f-abfa-1e14ffb7c53b';
const operationId = 'c6725454-bcd7-43f0-b1f7-b0e44a877a9f';
const userToken = 'u'.repeat(48);
const adminToken = 'a'.repeat(48);
const rawToken = 'T'.repeat(43);
const createdAt = '2026-09-10T12:00:00.000Z';
const expiresAt = '2026-09-11T12:00:00.000Z';
const assignment = {
  id: assignmentId,
  userId,
  recorderId,
  assignedAt: createdAt,
  status: 'active' as const,
};
const operation = { id: operationId, assignmentId, status: 'pending' as const, createdAt };
const apps: FastifyInstance[] = [];
function fixture(options: { disabled?: boolean; noLink?: boolean; nativeLink?: boolean } = {}) {
  const service = {
    createAssignment: vi.fn(async () => assignment),
    issueToken: vi.fn(async () => ({ id: tokenId, assignmentId, expiresAt, rawToken })),
    revokeToken: vi.fn(async () => undefined),
    endAssignment: vi.fn(async () => ({ ...assignment, status: 'revoked' as const })),
    resolve: vi.fn(async () => ({
      assignmentId,
      recorder: { id: recorderId, model: 'notepro' as const, serialSuffix: '4812' },
      expiresAt,
    })),
    claim: vi.fn(async () => operation),
    getClaimOperation: vi.fn(async () => operation),
    getOperation: vi.fn(async () => operation),
  } satisfies EnrollmentService;
  const config = readConfig({
    DEV_SESSION_TOKEN: userToken,
    DEV_USER_ID: userId,
    DEV_ADMIN_SESSION_TOKEN: adminToken,
    DEV_ADMIN_USER_ID: adminId,
    ...(options.noLink
      ? {}
      : {
          ENROLLMENT_BASE_URL: options.nativeLink
            ? 'aptlyable://enroll'
            : 'https://enroll.example.test/setup',
        }),
  });
  const app = buildApp({
    config,
    probeDatabase: async () => undefined,
    ...(options.disabled ? {} : { enrollments: service }),
  });
  apps.push(app);
  return { app, service };
}
const adminHeaders = { authorization: `Bearer ${adminToken}` };
const userHeaders = { authorization: `Bearer ${userToken}` };
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  vi.restoreAllMocks();
});

describe('enrollment HTTP boundaries', () => {
  it.each(['/v1/admin', '/v1/workspace'])(
    'rejects model/serial mismatches at %s before assignment creation',
    async (prefix) => {
      const { app, service } = fixture();
      const response = await app.inject({
        method: 'POST',
        url: `${prefix}/recorder-assignments`,
        headers: adminHeaders,
        payload: { userId, serial: '882B123456785641', model: 'notepro' },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('INVALID_REQUEST');
      expect(service.createAssignment).not.toHaveBeenCalled();
    },
  );

  it.each(['/v1/admin', '/v1/workspace'])(
    'preserves a valid alphanumeric serial at %s',
    async (prefix) => {
      const { app, service } = fixture();
      const payload = { userId, serial: '882B123456785641', model: 'notepins' };
      const response = await app.inject({
        method: 'POST',
        url: `${prefix}/recorder-assignments`,
        headers: adminHeaders,
        payload: { ...payload, serial: ` ${payload.serial} ` },
      });
      expect(response.statusCode).toBe(201);
      expect(service.createAssignment).toHaveBeenCalledWith(
        { userId: adminId, role: 'admin' },
        payload,
      );
    },
  );

  it('rejects unauthenticated and user-role administrative calls before state changes', async () => {
    const { app, service } = fixture();
    for (const [url, payload] of [
      ['/v1/admin/recorder-assignments', { userId, serial: '8810004812', model: 'notepro' }],
      [`/v1/admin/recorder-assignments/${assignmentId}/enrollment-tokens`, {}],
      [`/v1/admin/enrollment-tokens/${tokenId}/revoke`, {}],
      [`/v1/admin/recorder-assignments/${assignmentId}/end`, { status: 'revoked' }],
    ] as const) {
      expect((await app.inject({ method: 'POST', url, payload })).statusCode).toBe(401);
      expect(
        (
          await app.inject({
            method: 'POST',
            url,
            payload,
            headers: { ...userHeaders, 'x-role': 'admin', 'x-user-id': adminId },
          })
        ).statusCode,
      ).toBe(403);
    }
    expect(service.createAssignment).not.toHaveBeenCalled();
    expect(service.issueToken).not.toHaveBeenCalled();
    expect(service.revokeToken).not.toHaveBeenCalled();
    expect(service.endAssignment).not.toHaveBeenCalled();
  });
  it('creates an assignment with the verified administrator and strict input', async () => {
    const { app, service } = fixture();
    const payload = { userId, serial: '8810004812', model: 'notepro' };
    const response = await app.inject({
      method: 'POST',
      url: '/v1/admin/recorder-assignments',
      headers: adminHeaders,
      payload,
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual(assignment);
    expect(service.createAssignment).toHaveBeenCalledWith(
      { userId: adminId, role: 'admin' },
      payload,
    );
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/admin/recorder-assignments',
          headers: adminHeaders,
          payload: { ...payload, status: 'active' },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/admin/recorder-assignments',
          headers: adminHeaders,
          payload: { ...payload, model: 'note' },
        })
      ).statusCode,
    ).toBe(400);
    expect(service.createAssignment).toHaveBeenCalledTimes(1);
  });
  it('issues a no-store QR with the secret only in the URL fragment', async () => {
    const { app, service } = fixture();
    const encoder = vi.spyOn(QRCode, 'toString');
    const response = await app.inject({
      method: 'POST',
      url: `/v1/admin/recorder-assignments/${assignmentId}/enrollment-tokens`,
      headers: adminHeaders,
      payload: {},
    });
    expect(response.statusCode).toBe(201);
    const invitation = response.json();
    expect(Object.keys(invitation).sort()).toEqual([
      'assignmentId',
      'enrollmentUrl',
      'expiresAt',
      'id',
      'qrSvg',
    ]);
    expect(invitation.enrollmentUrl).toBe(`https://enroll.example.test/setup#token=${rawToken}`);
    expect(invitation.qrSvg).toContain('<svg');
    expect(encoder).toHaveBeenCalledWith(
      invitation.enrollmentUrl,
      expect.objectContaining({ type: 'svg', margin: 4 }),
    );
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(service.issueToken).toHaveBeenCalledWith(
      { userId: adminId, role: 'admin' },
      assignmentId,
      86400,
    );
  });
  it('requires an explicit link destination before minting an invitation', async () => {
    const { app, service } = fixture({ noLink: true });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/v1/admin/recorder-assignments/${assignmentId}/enrollment-tokens`,
          headers: adminHeaders,
          payload: {},
        })
      ).statusCode,
    ).toBe(503);
    expect(service.issueToken).not.toHaveBeenCalled();
  });
  it('issues an installed-app QR with its token in the fragment for phone testing', async () => {
    const { app } = fixture({ nativeLink: true });
    const response = await app.inject({
      method: 'POST',
      url: `/v1/admin/recorder-assignments/${assignmentId}/enrollment-tokens`,
      headers: adminHeaders,
      payload: {},
    });
    expect(response.statusCode).toBe(201);
    const invitation = response.json();
    const nativeUrl = `aptlyable://enroll#token=${rawToken}`;
    expect(invitation.enrollmentUrl).toBe(nativeUrl);
    expect(invitation.qrSvg).toBe(
      await QRCode.toString(nativeUrl, { type: 'svg', margin: 4, errorCorrectionLevel: 'M' }),
    );
    expect(response.headers['cache-control']).toBe('no-store');
  });
  it('requires body tokens and a UUID claim key; GET and query strings never claim', async () => {
    const { app, service } = fixture();
    const url = '/v1/enrollments/claim';
    expect(
      (await app.inject({ url: `${url}?token=${rawToken}`, headers: userHeaders })).statusCode,
    ).toBe(404);
    for (const request of [
      {
        url: `${url}?token=${rawToken}`,
        payload: { token: rawToken, idempotencyKey: operationId },
      },
      { url, payload: { token: rawToken } },
      { url, payload: { token: rawToken, idempotencyKey: 'not-a-uuid' } },
      { url, payload: { token: rawToken, idempotencyKey: operationId, userId: adminId } },
    ])
      expect(
        (await app.inject({ method: 'POST', headers: userHeaders, ...request })).statusCode,
      ).toBe(400);
    expect(service.claim).not.toHaveBeenCalled();
    const response = await app.inject({
      method: 'POST',
      url,
      headers: { ...userHeaders, 'x-user-id': adminId },
      payload: { token: rawToken, idempotencyKey: operationId },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(operation);
    expect(service.claim).toHaveBeenCalledWith({ userId, role: 'user' }, rawToken, operationId);
    expect(response.body).not.toContain(rawToken);
  });
  it('authenticates resolve and operation reads and supports safe revocation', async () => {
    const { app, service } = fixture();
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/enrollments/resolve',
          payload: { token: rawToken },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/enrollments/resolve',
          headers: userHeaders,
          payload: { token: rawToken },
        })
      ).json().recorder.serialSuffix,
    ).toBe('4812');
    expect(
      (
        await app.inject({ url: `/v1/enrollments/operations/${operationId}`, headers: userHeaders })
      ).json(),
    ).toEqual(operation);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/v1/admin/enrollment-tokens/${tokenId}/revoke`,
          headers: adminHeaders,
          payload: {},
        })
      ).statusCode,
    ).toBe(204);
    expect(service.revokeToken).toHaveBeenCalledWith({ userId: adminId, role: 'admin' }, tokenId);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/v1/enrollments/${operationId}/complete`,
          headers: userHeaders,
          payload: {},
        })
      ).statusCode,
    ).toBe(404);
  });
  it('rejects unsupported lifetimes and identifiers without database work', async () => {
    const { app, service } = fixture();
    for (const payload of [
      { expiresInSeconds: 0 },
      { expiresInSeconds: 604801 },
      { expiresInSeconds: 60.5 },
    ]) {
      expect(
        (
          await app.inject({
            method: 'POST',
            url: `/v1/admin/recorder-assignments/${assignmentId}/enrollment-tokens`,
            headers: adminHeaders,
            payload,
          })
        ).statusCode,
      ).toBe(400);
    }
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/admin/enrollment-tokens/not-a-uuid/revoke',
          headers: adminHeaders,
          payload: {},
        })
      ).statusCode,
    ).toBe(400);
    expect(service.issueToken).not.toHaveBeenCalled();
    expect(service.revokeToken).not.toHaveBeenCalled();
  });
  it('fails closed when persistence is unavailable and never leaks driver details', async () => {
    const disabled = fixture({ disabled: true });
    expect(
      (
        await disabled.app.inject({
          method: 'POST',
          url: '/v1/enrollments/resolve',
          headers: userHeaders,
          payload: { token: rawToken },
        })
      ).statusCode,
    ).toBe(503);
    const { app, service } = fixture();
    service.claim.mockRejectedValue(new Error(`postgres://secret@database token=${rawToken}`));
    const response = await app.inject({
      method: 'POST',
      url: '/v1/enrollments/claim',
      headers: userHeaders,
      payload: { token: rawToken, idempotencyKey: operationId },
    });
    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain('secret');
    expect(response.body).not.toContain(rawToken);
  });
});
