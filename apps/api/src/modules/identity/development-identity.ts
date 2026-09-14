import { createHash, timingSafeEqual } from 'node:crypto';
export type ActorContext = Readonly<{ userId: string; role: 'user' | 'admin'; selfService?: true }>;
export interface SessionVerifier {
  verify(
    authorization: string | undefined,
  ): ActorContext | undefined | Promise<ActorContext | undefined>;
}
type DevelopmentIdentity = { token: string; userId: string };

/** Local-only identity adapter. Production identity will implement SessionVerifier. */
export function createDevelopmentIdentity(
  user: DevelopmentIdentity | undefined,
  admin?: DevelopmentIdentity,
): { verify(authorization: string | undefined): ActorContext | undefined } {
  const credentials = [
    ...(user ? [{ ...user, role: 'user' as const }] : []),
    ...(admin ? [{ ...admin, role: 'admin' as const }] : []),
  ].map(({ token, userId, role }) => ({
    hash: createHash('sha256').update(token).digest(),
    actor: { userId, role },
  }));
  return {
    verify(authorization) {
      if (!authorization?.startsWith('Bearer ')) return undefined;
      const token = authorization.slice(7);
      if (token.length > 256 || token.length < 32) return undefined;
      const actual = createHash('sha256').update(token).digest();
      let actor: ActorContext | undefined;
      for (const credential of credentials) {
        if (timingSafeEqual(actual, credential.hash)) actor = credential.actor;
      }
      return actor;
    },
  };
}
