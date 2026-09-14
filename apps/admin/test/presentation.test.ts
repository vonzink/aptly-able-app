import { expect, it } from 'vitest';
import { invitationState } from '../src/features/assignments/presentation.js';
const invitation = {
  id: 'id',
  createdAt: '2026-09-10T12:00:00Z',
  expiresAt: '2026-09-11T12:00:00Z',
  usedAt: null,
  revokedAt: null,
};
it('distinguishes missing, expired, claimed and revoked invitations', () => {
  expect(invitationState(null, 0)).toBe('Not sent');
  expect(invitationState(invitation, Date.parse('2026-09-10T13:00:00Z'))).toBe('Ready to scan');
  expect(invitationState(invitation, Date.parse('2026-09-12T13:00:00Z'))).toBe('Expired');
  expect(invitationState({ ...invitation, usedAt: '2026-09-10T13:00:00Z' }, 0)).toBe('Claimed');
  expect(
    invitationState(
      { ...invitation, usedAt: '2026-09-10T13:00:00Z', revokedAt: '2026-09-10T14:00:00Z' },
      0,
    ),
  ).toBe('Revoked');
});
