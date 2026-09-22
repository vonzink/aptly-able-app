import { createRecorderSetupService } from '../modules/recorder-setup/service.js';
import { createAccountDeletionService } from '../modules/account-deletion/service.js';
import { createPilotIdentity } from '../modules/identity/pilot-identity.js';
import { createPlaudDeviceProvider } from '../modules/plaud-devices/provider.js';
import { createPlaudDeviceService } from '../modules/plaud-devices/service.js';
import { createAudioStorage } from '../modules/recordings/audio-storage.js';
import { createProcessingService } from '../modules/recordings/service.js';
import { createTranscriptionWorker } from '../modules/transcription/worker.js';
import { createPlaudProvider } from '../modules/transcription/plaud/index.js';
import { readConfig } from './config.js';
import { buildApp } from '../transport/http/app.js';
import { createDatabase } from '../infrastructure/database.js';
import { createAdminEnrollmentQueries } from '../modules/enrollments/admin-queries.js';
import { createEnrollmentService } from '../modules/enrollments/service.js';

try {
  const config = readConfig(process.env);
  const database = createDatabase(config.databaseUrl);
  const storage = createAudioStorage(config.recordingsDirectory);
  const accountDeletion = database.deletionPool
    ? createAccountDeletionService(database.deletionPool, storage)
    : undefined;
  let deletionRun: Promise<void> | undefined;
  const deletionTimer = setInterval(() => {
    if (!accountDeletion || deletionRun) return;
    deletionRun = accountDeletion
      .tick()
      .catch(() => {})
      .finally(() => {
        deletionRun = undefined;
      });
  }, 10000);
  deletionTimer.unref();
  const worker =
    database.workerPool && config.plaud
      ? createTranscriptionWorker({
          pool: database.workerPool,
          storage,
          provider: createPlaudProvider(config.plaud),
        })
      : undefined;
  const app = buildApp({
    config,
    ...(accountDeletion ? { accountDeletion } : {}),
    ...(database.pool && config.pilotAuthEnabled
      ? { pilotIdentity: createPilotIdentity(database.pool) }
      : {}),
    probeDatabase: database.probe,
    logger: true,
    transcriptionAvailable: !!config.plaud,
    ...(database.devicePool && config.plaudSdk
      ? {
          plaudDevices: createPlaudDeviceService(
            database.devicePool,
            createPlaudDeviceProvider(config.plaudSdk),
          ),
        }
      : {}),
    ...(database.pool
      ? {
          recordings: createProcessingService(database.pool, storage, database.uploadPool),
          enrollments: createEnrollmentService(database.pool),
          recorderSetup: createRecorderSetupService(database.pool),
          adminQueries: createAdminEnrollmentQueries(database.pool),
        }
      : {}),
  });
  app.addHook('onClose', async () => {
    clearInterval(deletionTimer);
    await deletionRun;
    await worker?.stop();
    await database.close();
  });
  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    await app.close();
  };
  process.once('SIGINT', () => {
    void shutdown();
  });
  process.once('SIGTERM', () => {
    void shutdown();
  });
  try {
    await app.listen({ host: config.host, port: config.port });
    worker?.start();
  } catch {
    await app.close();
    throw new Error('API startup failed.');
  }
} catch {
  console.error('API startup failed. Check configuration, database access and port availability.');
  process.exitCode = 1;
}
