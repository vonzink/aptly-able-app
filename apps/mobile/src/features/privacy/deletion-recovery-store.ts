export interface DeletionRecoveryIntent {
  actorId: string;
  credential: string;
}
export interface DeletionRecoveryStore {
  read(): Promise<DeletionRecoveryIntent | null>;
  write(intent: DeletionRecoveryIntent): Promise<void>;
  clear(): Promise<void>;
}
/** The credential is saved only to recover a submitted deletion; never save a password. */
export function createDeletionRecoveryStore(
  storage: {
    read(): Promise<string | null>;
    write(value: string): Promise<void>;
    clear(): Promise<void>;
  },
  origin: string,
): DeletionRecoveryStore {
  function parse(raw: string) {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || !('origin' in value) || value.origin !== origin)
      throw new Error(
        'An account deletion recovery request belongs to another service. Restore that service configuration before continuing.',
      );
    if (
      !('actorId' in value) ||
      typeof value.actorId !== 'string' ||
      !value.actorId ||
      !('credential' in value) ||
      typeof value.credential !== 'string' ||
      !/^[A-Za-z0-9_-]{43}$/.test(value.credential)
    )
      throw new Error('The account deletion recovery request could not be read. Contact support.');
    return { actorId: value.actorId, credential: value.credential };
  }
  return {
    async read() {
      const raw = await storage.read();
      return raw ? parse(raw) : null;
    },
    async write(intent) {
      parse(JSON.stringify({ ...intent, origin }));
      const previous = await storage.read();
      if (previous) {
        const saved = parse(previous);
        if (saved.actorId !== intent.actorId || saved.credential !== intent.credential)
          throw new Error(
            'Another account deletion request still needs recovery. Finish it before continuing.',
          );
      }
      await storage.write(JSON.stringify({ ...intent, origin }));
    },
    clear: () => storage.clear(),
  };
}
