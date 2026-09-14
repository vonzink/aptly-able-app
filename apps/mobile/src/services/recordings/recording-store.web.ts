import {
  assertLocalRecording,
  applyRecordingPatch,
  isRecordingId,
  validateAudioImport,
  type LocalRecording,
  type RecordingLibraryRead,
  type RecordingStore,
} from '../../features/recordings/recording-model';

interface WebStoreOptions {
  databaseName?: string;
  indexedDB?: IDBFactory;
  createObjectURL?: (blob: Blob) => string;
  revokeObjectURL?: (uri: string) => void;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Local storage could not be read.'));
  });
}

export function createWebRecordingStore(options: WebStoreOptions = {}): RecordingStore {
  const databaseName = options.databaseName ?? 'aptly-able-local-recordings-v1';
  function open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const factory = options.indexedDB ?? globalThis.indexedDB;
      if (!factory) {
        reject(new Error('Local recording storage is unavailable in this browser.'));
        return;
      }
      const request = factory.open(databaseName, 1);
      let blocked = false;
      request.onupgradeneeded = () => {
        const database = request.result;
        database.createObjectStore('metadata', { keyPath: 'id' });
        database.createObjectStore('audio');
      };
      request.onsuccess = () => {
        if (blocked) {
          request.result.close();
          return;
        }
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
      request.onerror = () =>
        reject(request.error ?? new Error('Local recording storage could not be opened.'));
      request.onblocked = () => {
        blocked = true;
        reject(new Error('Close other Aptly Able tabs and try again.'));
      };
    });
  }

  async function transact<T>(
    stores: string[],
    mode: IDBTransactionMode,
    operation: (transaction: IDBTransaction) => Promise<T>,
  ): Promise<T> {
    const database = await open();
    try {
      const transaction = database.transaction(stores, mode);
      const complete = new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onabort = () =>
          reject(transaction.error ?? new Error('Local recording storage could not be saved.'));
        transaction.onerror = () => {
          /* onabort reports the final transaction outcome. */
        };
      });
      // Attach a rejection handler immediately; an aborted transaction can finish before
      // the individual request promise rejects.
      void complete.catch(() => undefined);
      try {
        const result = await operation(transaction);
        await complete;
        return result;
      } catch (error) {
        try {
          transaction.abort();
        } catch {
          /* It may already have aborted. */
        }
        await complete.catch(() => undefined);
        throw error;
      }
    } finally {
      database.close();
    }
  }

  function checkId(id: string) {
    if (!isRecordingId(id)) throw new Error('Invalid recording identifier.');
  }
  async function readLibrary(): Promise<RecordingLibraryRead> {
    const entries: unknown[] = await transact(['metadata'], 'readonly', (transaction) =>
      requestResult(transaction.objectStore('metadata').getAll()),
    );
    const recordings: LocalRecording[] = [];
    let unavailableCount = 0;
    for (const entry of entries) {
      try {
        assertLocalRecording(entry);
        recordings.push(entry);
      } catch {
        // Leave this entry and its audio intact so a later recovery can inspect them.
        unavailableCount++;
      }
    }
    recordings.sort((left, right) => right.importedAt.localeCompare(left.importedAt));
    return { recordings, unavailableCount };
  }
  return {
    readLibrary,
    async list() {
      return (await readLibrary()).recordings;
    },
    async saveAudio(record, input) {
      assertLocalRecording(record);
      validateAudioImport(input);
      // Web pickers supply the File/Blob itself. Never save or refetch a temporary URL.
      const blob = input.blob;
      if (
        !(blob instanceof Blob) ||
        blob.size !== input.sizeBytes ||
        record.sizeBytes !== blob.size ||
        record.originalName !== input.name
      )
        throw new Error('The audio file is unavailable or incomplete. Select it again.');
      await transact(['metadata', 'audio'], 'readwrite', async (transaction) => {
        await Promise.all([
          requestResult(transaction.objectStore('metadata').add(record)),
          requestResult(transaction.objectStore('audio').add(blob, record.id)),
        ]);
      });
    },
    async update(id, patch) {
      checkId(id);
      return transact(['metadata'], 'readwrite', async (transaction) => {
        const metadata = transaction.objectStore('metadata');
        const previous: unknown = await requestResult(metadata.get(id));
        if (!previous) throw new Error('This recording is no longer in your local library.');
        assertLocalRecording(previous);
        const record = applyRecordingPatch(previous, patch);
        await requestResult(metadata.put(record));
        return record;
      });
    },
    async remove(id) {
      checkId(id);
      await transact(['metadata', 'audio'], 'readwrite', async (transaction) => {
        await Promise.all([
          requestResult(transaction.objectStore('metadata').delete(id)),
          requestResult(transaction.objectStore('audio').delete(id)),
        ]);
      });
    },
    async openAudio(id) {
      checkId(id);
      const blob: unknown = await transact(['audio'], 'readonly', (transaction) =>
        requestResult(transaction.objectStore('audio').get(id)),
      );
      if (!(blob instanceof Blob))
        throw new Error('The local audio file is missing. Import it again.');
      const uri = (options.createObjectURL ?? URL.createObjectURL.bind(URL))(blob);
      let released = false;
      return {
        uri,
        release() {
          if (!released) {
            released = true;
            (options.revokeObjectURL ?? URL.revokeObjectURL.bind(URL))(uri);
          }
        },
      };
    },
  };
}

export const recordingStore = createWebRecordingStore();
