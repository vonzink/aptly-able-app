import type { EnrollmentController } from './enrollment-controller';
import { parseEnrollmentInput } from './enrollment-link';

export interface EnrollmentLinkSource {
  initial(): Promise<string | null>;
  subscribe(listener: (url: string) => void): () => void;
}

export function attachEnrollmentLinks(
  controller: EnrollmentController,
  source: EnrollmentLinkSource,
): () => void {
  let active = true;
  let receivedLiveLink = false;
  let lastToken: string | null = null;
  const accept = (url: string): boolean => {
    if (!active) return false;
    const parsed = parseEnrollmentInput(url);
    if (!parsed.ok) return false; // Other app routes are not broken invitations.
    if (parsed.token === lastToken && controller.getSnapshot().hasInvitation) return true;
    lastToken = parsed.token;
    controller.receiveInvitation(parsed.token);
    const state = controller.getSnapshot();
    // Authentication resolves any retained invitation itself, after verifying the account.
    if (state.actorId && state.phase !== 'signing-in') void controller.resolveInvitation();
    return true;
  };
  // Subscribe before reading the launch URL. A newer intent must win over a slow launch read.
  const unsubscribe = source.subscribe((url) => {
    if (accept(url)) receivedLiveLink = true;
  });
  void source
    .initial()
    .then((url) => {
      if (url && !receivedLiveLink) accept(url);
    })
    .catch(() => undefined); // Manual invitation entry remains available.
  return () => {
    active = false;
    lastToken = null;
    unsubscribe();
  };
}
