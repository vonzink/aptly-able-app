import { recordingOwner } from '../recordings/recording-model';
import type { DeletionStatusStore } from './deletion-status-store';
import type { DeletionRecoveryStore } from './deletion-recovery-store';
export type { DeletionRecoveryStore, DeletionRecoveryIntent } from './deletion-recovery-store';
import type { AccountClient } from '@aptly/api-client';
import { accountDeletionReceiptSchema, type AccountDeletionReceipt } from '@aptly/contracts';
import type { RecordingsController } from '../recordings/recordings-controller';

export interface DeletionRecord {
  actorId: string;
  receipt: AccountDeletionReceipt;
  localCleanup: 'pending' | 'complete';
}
export interface DeletionJournal {
  read(): Promise<DeletionRecord | null>;
  write(record: DeletionRecord): Promise<void>;
  list?(): Promise<DeletionRecord[]>;
}
async function readDeletionRecords(journal: DeletionJournal): Promise<DeletionRecord[]> {
  if (journal.list) return journal.list();
  const record = await journal.read();
  return record ? [record] : [];
}
export function createDeletionJournal(
  storage: { read(): Promise<string | null>; write(value: string): Promise<void> },
  origin: string,
): DeletionJournal & { list(): Promise<DeletionRecord[]> } {
  async function list(): Promise<DeletionRecord[]> {
    const raw = await storage.read();
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (data.origin !== origin) return [];
    // Migrate the previous single-receipt format on the next write.
    const entries = data.records ?? [data];
    if (!Array.isArray(entries)) throw new Error('The saved deletion receipts could not be read.');
    return entries.map((entry) => {
      const receipt = accountDeletionReceiptSchema.safeParse(entry.receipt);
      if (
        !receipt.success ||
        typeof entry.actorId !== 'string' ||
        !entry.actorId ||
        !['pending', 'complete'].includes(entry.localCleanup)
      )
        throw new Error('The saved deletion receipt could not be read. Contact support if needed.');
      return { actorId: entry.actorId, receipt: receipt.data, localCleanup: entry.localCleanup };
    });
  }
  return {
    list,
    async read() {
      return (await list())[0] ?? null;
    },
    async write(record: DeletionRecord) {
      const others = (await list()).filter(
        (item) => item.receipt.requestId !== record.receipt.requestId,
      );
      await storage.write(JSON.stringify({ origin, records: [record, ...others] }));
    },
  };
}

/** Queued library operations finish before the deletion snapshot; other owners and
 * unscoped manual imports are never selected for removal. An unreadable library is
 * explicitly incomplete, not successfully empty. */
export async function removeAccountRecordings(library: RecordingsController, actorId: string) {
  await library.clearAccountPhoneDrafts(actorId);
  await library.clearAccountLocations(actorId);
  await library.reload();
  const snapshot = library.getSnapshot();
  if (!snapshot.readable || snapshot.error)
    throw new Error('Local library could not be read. Retry local cleanup.');
  let failed = snapshot.unavailableCount > 0;
  for (const recording of snapshot.recordings) {
    if (recordingOwner(recording) === actorId && !(await library.remove(recording.id)))
      failed = true;
  }
  // Per-record removal/acknowledgement can create coordinate-free suppression
  // markers; account cleanup removes those and the consent preference as well.
  await library.clearAccountPhoneDrafts(actorId);
  await library.clearAccountLocations(actorId);
  if (failed)
    throw new Error(
      'Some local files could not be removed. Retry local cleanup or contact support.',
    );
}

let workflowActive = false;
/** Process-wide across mounted screen instances. Never queue a second destructive intent. */
export async function runDeletionWorkflow<T>(work: () => Promise<T>): Promise<T> {
  if (workflowActive)
    throw new Error(
      'An account deletion operation is already running. Wait for it to finish and retry.',
    );
  workflowActive = true;
  try {
    return await work();
  } finally {
    workflowActive = false;
  }
}
type CompletionDependencies = {
  recovery: DeletionRecoveryStore;
  journal: DeletionJournal;
  statusStore: DeletionStatusStore;
  currentActor(): string | null;
  signOut(): Promise<void>;
  cleanLocal(actorId: string): Promise<void>;
  onAccepted(record: DeletionRecord): void;
};
type DeletionResult = { record: DeletionRecord; warning: string | null };
async function completeAcceptedDeletion(
  actorId: string,
  receipt: AccountDeletionReceipt,
  credential: string,
  deps: CompletionDependencies,
): Promise<DeletionResult> {
  let record: DeletionRecord = { actorId, receipt, localCleanup: 'pending' };
  const previous = (await readDeletionRecords(deps.journal).catch(() => [])).find(
    (item) => item.actorId === actorId && item.receipt.requestId === receipt.requestId,
  );
  if (previous) record.localCleanup = previous.localCleanup;
  deps.onAccepted(record);
  const warnings: string[] = [];
  let receiptSaved = false;
  try {
    await deps.journal.write(record);
    receiptSaved = true;
  } catch {
    warnings.push(
      'The receipt could not be saved on this phone. Copy the reference below. Recovery information has been retained.',
    );
  }
  // Move accepted access to a per-request, receipt-only status capability.
  // Keep crash recovery if either durable write fails.
  let statusSaved = false;
  try {
    if (receipt.status === 'complete') await deps.statusStore.clear(receipt.requestId);
    else await deps.statusStore.write(receipt.requestId, credential);
    statusSaved = true;
  } catch {
    warnings.push('Status access could not be saved. Retry request recovery.');
  }
  if (receiptSaved && statusSaved) {
    try {
      await deps.recovery.clear();
    } catch {
      warnings.push('The saved recovery credential could not be cleared. Retry recovery.');
    }
  }
  if (deps.currentActor() === actorId) {
    try {
      await deps.signOut();
    } catch {
      warnings.push('Sign-out cleanup needs another attempt in Settings.');
    }
  }
  if (record.localCleanup !== 'complete') {
    try {
      await deps.cleanLocal(actorId);
      record = { ...record, localCleanup: 'complete' };
      await deps.journal.write(record);
      if (!receiptSaved && statusSaved) {
        try {
          await deps.recovery.clear();
        } catch {
          warnings.push('The saved recovery credential could not be cleared. Retry recovery.');
        }
      }
    } catch (error) {
      warnings.push(
        error instanceof Error ? error.message : 'Local cleanup needs another attempt.',
      );
    }
  }
  deps.onAccepted(record);
  return { record, warning: warnings.join(' ') || null };
}
function statusOf(error: unknown) {
  return error && typeof error === 'object' && 'status' in error ? error.status : undefined;
}
export async function submitAccountDeletion(
  args: CompletionDependencies & {
    client: AccountClient;
    credential: string;
    password: string;
    confirmation: string;
    actorId: string;
  },
): Promise<DeletionResult> {
  return runDeletionWorkflow(async () => {
    const { actorId, password, confirmation, client, credential } = args;
    if (args.currentActor() !== actorId)
      throw new Error('Your sign-in changed. Reopen account settings before continuing.');
    if (!password || confirmation !== 'DELETE')
      throw new Error('Enter your password and type DELETE to confirm.');
    if (!credential) throw new Error('Sign in before requesting account deletion.');
    const records = await readDeletionRecords(args.journal);
    if (records.some((item) => item.localCleanup === 'pending' && item.actorId !== actorId))
      throw new Error(
        'Local cleanup from an earlier account is still pending. Contact support before deleting another account on this device.',
      );
    const recovery = await args.recovery.read();
    if (recovery && (recovery.actorId !== actorId || recovery.credential !== credential))
      throw new Error(
        'An earlier account deletion request still needs recovery. Recover it before deleting another account.',
      );
    if (args.currentActor() !== actorId)
      throw new Error('Your sign-in changed. Reopen account settings before continuing.');
    // A failed persistence operation must prevent any destructive network request.
    await args.recovery.write({ actorId, credential });
    if (args.currentActor() !== actorId) {
      if (!recovery) await args.recovery.clear();
      throw new Error('Your sign-in changed. Reopen account settings before continuing.');
    }
    let receipt: AccountDeletionReceipt;
    try {
      receipt = await client.requestDeletion({ password, confirmation: 'DELETE' });
    } catch (error) {
      try {
        receipt = await client.getDeletionStatus();
      } catch (lookupError) {
        // Only an explicit request rejection plus confirmed absence permits disposal.
        // Network/5xx/timeout failures might have committed and always retain recovery.
        if (
          !recovery &&
          [400, 401, 403].includes(Number(statusOf(error))) &&
          statusOf(lookupError) === 401
        )
          await args.recovery.clear();
        throw error;
      }
    }
    return completeAcceptedDeletion(actorId, receipt, credential, args);
  });
}
/** GET-only recovery works even after normal session restoration discarded a revoked token. */
export async function recoverAccountDeletion(
  args: CompletionDependencies & {
    createClient(credential: string): AccountClient;
  },
): Promise<DeletionResult | null> {
  return runDeletionWorkflow(async () => {
    const intent = await args.recovery.read();
    if (!intent) return null;
    const records = await readDeletionRecords(args.journal);
    if (records.some((item) => item.localCleanup === 'pending' && item.actorId !== intent.actorId))
      throw new Error(
        'Another account still needs local cleanup. Contact support before continuing recovery.',
      );
    const receipt = await args.createClient(intent.credential).getDeletionStatus();
    return completeAcceptedDeletion(intent.actorId, receipt, intent.credential, args);
  });
}

export async function retryAccountLocalCleanup(args: {
  record: DeletionRecord;
  journal: DeletionJournal;
  currentActor(): string | null;
  signOut(): Promise<void>;
  cleanLocal(actorId: string): Promise<void>;
  onAccepted(record: DeletionRecord): void;
}): Promise<DeletionRecord> {
  return runDeletionWorkflow(async () => {
    const matchesCurrent = async () => {
      const current = args.journal.list
        ? (await args.journal.list()).find(
            (item) => item.receipt.requestId === args.record.receipt.requestId,
          )
        : await args.journal.read();
      if (
        !current ||
        current.actorId !== args.record.actorId ||
        current.receipt.requestId !== args.record.receipt.requestId
      )
        throw new Error(
          'The saved deletion request changed. Reopen the deletion page before retrying.',
        );
    };
    await matchesCurrent();
    if (args.currentActor() === args.record.actorId) await args.signOut();
    await args.cleanLocal(args.record.actorId);
    await matchesCurrent();
    const complete: DeletionRecord = { ...args.record, localCleanup: 'complete' };
    await args.journal.write(complete);
    args.onAccepted(complete);
    return complete;
  });
}

/** Read-only refresh after sign-out. Completion is saved before retiring access. */
export async function refreshAccountDeletionStatus(args: {
  record: DeletionRecord;
  journal: DeletionJournal;
  statusStore: DeletionStatusStore;
  createClient(credential: string): AccountClient;
  currentActor(): string | null;
}): Promise<DeletionRecord> {
  return runDeletionWorkflow(async () => {
    const actor = args.currentActor();
    if (actor && actor !== args.record.actorId)
      throw new Error('This receipt belongs to another account.');
    const credential = await args.statusStore.read(args.record.receipt.requestId);
    if (!credential) {
      if (args.record.receipt.status === 'complete') return args.record;
      throw new Error(
        'Status access is unavailable on this device. Contact support with your reference.',
      );
    }
    const receipt = await args.createClient(credential).getDeletionStatus();
    if (args.currentActor() !== actor)
      throw new Error('Your account changed. Reopen the deletion page.');
    if (receipt.requestId !== args.record.receipt.requestId)
      throw new Error('The service returned a different deletion reference.');
    const updated = { ...args.record, receipt };
    await args.journal.write(updated);
    if (receipt.status === 'complete') await args.statusStore.clear(receipt.requestId);
    return updated;
  });
}
