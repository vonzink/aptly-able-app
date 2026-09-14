import type { AdminAssignment } from '@aptly/contracts';
export function invitationState(invitation: AdminAssignment['latestInvitation'], now = Date.now()) {
  if (!invitation) return 'Not sent';
  if (invitation.revokedAt) return 'Revoked';
  if (invitation.usedAt) return 'Claimed';
  if (Date.parse(invitation.expiresAt) <= now) return 'Expired';
  return 'Ready to scan';
}
export const recorderName = (model: 'notepro' | 'notepins') =>
  model === 'notepro' ? 'Plaud Note Pro' : 'Plaud NotePin S';
export const dateLabel = (value: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
