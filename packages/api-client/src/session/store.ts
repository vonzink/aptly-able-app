import { z } from 'zod';

const savedSessionSchema = z.strictObject({
  version: z.literal(1),
  origin: z.url(),
  mode: z.literal('pilot'),
  credential: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  actorId: z.uuid(),
  expiresAt: z.iso.datetime(),
  accountEmail: z.email().max(254).nullable(),
});
export type SavedSession = z.infer<typeof savedSessionSchema>;
export interface SessionStore {
  load(): Promise<SavedSession | null>;
  save(value: Omit<SavedSession, 'version' | 'origin' | 'mode'>): Promise<void>;
  clear(): Promise<void>;
}
export interface SessionStorageDriver {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
  remove(): Promise<void>;
}

/** The envelope prevents a credential from being restored against another environment. */
export function createSessionStore(
  driver: SessionStorageDriver,
  baseUrl: string,
  mode: string,
): SessionStore {
  const origin = new URL(baseUrl).origin;
  return {
    async load() {
      const raw = await driver.read();
      if (!raw) return null;
      let value: unknown;
      try {
        value = JSON.parse(raw);
      } catch {
        /* Discard malformed data below. */
      }
      const parsed = savedSessionSchema.safeParse(value);
      if (!parsed.success || parsed.data.origin !== origin || parsed.data.mode !== mode) {
        await driver.remove();
        return null;
      }
      return parsed.data;
    },
    async save(value) {
      if (mode !== 'pilot') return;
      await driver.write(
        JSON.stringify(savedSessionSchema.parse({ ...value, version: 1, origin, mode: 'pilot' })),
      );
    },
    clear: () => driver.remove(),
  };
}

/** Tab-scoped persistence; never localStorage and never a password. */
export function createBrowserSessionStore(
  baseUrl: string,
  mode: string,
  key: string,
): SessionStore {
  return createSessionStore(
    {
      read: async () => window.sessionStorage.getItem(key),
      write: async (value) => window.sessionStorage.setItem(key, value),
      remove: async () => window.sessionStorage.removeItem(key),
    },
    baseUrl,
    mode,
  );
}
