import type { PlaudRecordingSource } from '../recordings/recording-model';
import type { RecordingsController } from '../recordings/recordings-controller';
import type { PlaudFilePort, PlaudRecordingFile } from './plaud-file-port';

export class TransferFailure extends Error {}

/** Owns one export through its terminal callback, local commit and temporary-file cleanup. */
export async function receivePlaudAudio({
  native,
  library,
  file,
  source,
  transport,
  timeoutMs,
  current,
  onProgress,
  onSaving,
  onStalled,
  restore,
}: {
  native: PlaudFilePort;
  library: RecordingsController;
  file: PlaudRecordingFile;
  source: PlaudRecordingSource;
  transport: 'bluetooth' | 'wifi';
  timeoutMs: number;
  current(): boolean;
  onProgress(progress: number): void;
  onSaving(): void;
  onStalled(stalled: boolean): void;
  restore?: { id: string; keep: boolean; name: string };
}): Promise<boolean> {
  let stalled = false;
  let exported = false;
  let lastProgress = 0;
  let deadline: ReturnType<typeof setTimeout>;
  const arm = () => {
    clearTimeout(deadline);
    deadline = setTimeout(() => {
      stalled = true;
      if (transport === 'wifi') void native.wifi?.stop().catch(() => undefined);
      // Losing the connection does not release the SDK's shared exporter.
      onStalled(true);
    }, timeoutMs);
  };
  const subscription = native.addListener('exportProgress', ({ sessionId, progress }) => {
    if (
      exported ||
      sessionId !== file.sessionId ||
      !current() ||
      stalled ||
      !Number.isFinite(progress)
    )
      return;
    const next = Math.max(0, Math.min(100, progress));
    if (next <= lastProgress) return;
    lastProgress = next;
    onProgress(next);
    arm();
  });
  arm();
  let outputPath: string | undefined;
  try {
    // A timeout/stop is not proof of cancellation. Await the SDK terminal callback
    // so a second transfer cannot overlap writes to its export directory.
    const result = await (transport === 'wifi'
      ? native.wifi!.exportAudio(file.sessionId)
      : native.exportAudio(file.sessionId));
    exported = true;
    clearTimeout(deadline!);
    outputPath = result.outputPath;
    if (!current() || stalled) return false;
    if (result.sessionId !== file.sessionId)
      throw new TransferFailure('The recorder returned a different recording. Try syncing again.');
    const input = await native.readExport(outputPath);
    if (!current()) return false;
    onSaving();
    const audio = {
      ...input,
      name: restore?.name ?? `Plaud ${source.serial.slice(-4)} recording ${file.sessionId}.mp3`,
    };
    const id = restore
      ? await library
          .restoreDeviceAudio(restore.id, audio, restore.keep)
          .then((saved) => (saved ? restore.id : null))
      : await library.importDeviceAudio(audio, source);
    if (!id)
      throw new TransferFailure(
        library.getSnapshot().error ?? 'The received recording could not be saved. Try again.',
      );
    await library.setDuration(id, file.duration);
    return true;
  } finally {
    clearTimeout(deadline!);
    subscription.remove();
    if (outputPath) await native.removeExport(outputPath).catch(() => undefined);
    if (stalled) onStalled(false);
  }
}
