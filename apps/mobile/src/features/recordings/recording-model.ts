import {
  readRecordingLocation,
  type RecordingLocation,
} from '../recording-location/location-model';
import {
  createAssignmentRequestSchema,
  transcriptSegmentSchema,
  type TranscriptSegment,
} from '@aptly/contracts';

export interface PlaudRecordingSource {
  kind: 'plaud';
  actorId: string;
  serial: string;
  sessionId: number;
  sizeBytes: number;
}

export function sourceKey(source: PlaudRecordingSource): string {
  return `${source.actorId}:${source.serial}:${source.sessionId}:${source.sizeBytes}`;
}

export const MAX_AUDIO_BYTES = 250 * 1024 * 1024;
export const TEMPORARY_AUDIO_BYTES = 100 * 1024 * 1024;
export const MAX_TRANSCRIPT_BYTES = 2 * 1024 * 1024;
export const MAX_RECORDING_TITLE_LENGTH = 200;
export const MAX_RECORDING_NOTES_LENGTH = 10_000;

export interface ImportedTranscript {
  fileName: string;
  text: string;
  segments: TranscriptSegment[];
  importedAt: string;
}

export interface LocalRecording {
  id: string;
  title: string;
  originalName: string;
  importedAt: string;
  sizeBytes: number;
  mimeType: string;
  durationSeconds: number | null;
  transcript: ImportedTranscript | null;
  /** Optional for libraries saved before recording notes were introduced. */
  notes?: string;
  /** null records an explicit removal; undefined is a recording without captured location. */
  location?: RecordingLocation | null;
  source?: PlaudRecordingSource;
  /** Phone microphone recordings are owned; manual imports remain device-shared. */
  phoneCapture?: { actorId: string; createdAt: string };
  retention?: 'temporary' | 'downloaded';
  /** Derived from the filesystem; the OS may have cleared temporary audio. */
  audioAvailable?: boolean;
  /** Runtime-only: a durable removal marker exists but old metadata needs cleanup. */
  locationRemovalPending?: boolean;
}

export interface AudioImport {
  name: string;
  uri: string;
  sizeBytes: number;
  mimeType: string;
  blob?: Blob;
}

export interface RecordingLibraryRead {
  recordings: LocalRecording[];
  unavailableCount: number;
}

export interface RecordingStore {
  deviceAudio?: {
    isDismissed(source: PlaudRecordingSource): Promise<boolean>;
    keep(id: string): Promise<void>;
    restore(id: string, input: AudioImport, keep: boolean): Promise<void>;
    clearTemporary(): Promise<void>;
  };
  list(): Promise<LocalRecording[]>;
  // Adapters can report individual unreadable entries without failing the entire library.
  // list() remains available for callers that only need readable records.
  readLibrary?(): Promise<RecordingLibraryRead>;
  saveAudio(record: LocalRecording, input: AudioImport): Promise<void>;
  update(id: string, patch: RecordingPatch): Promise<LocalRecording>;
  remove(id: string): Promise<void>;
  openAudio(id: string): Promise<{ uri: string; release(): void }>;
}

export type RecordingPatch = Partial<
  Pick<LocalRecording, 'title' | 'notes' | 'durationSeconds' | 'transcript' | 'location'>
>;

export function applyRecordingPatch(
  previous: LocalRecording,
  patch: RecordingPatch,
): LocalRecording {
  if (
    Object.keys(patch).some(
      (key) => !['title', 'notes', 'durationSeconds', 'transcript', 'location'].includes(key),
    )
  ) {
    throw new Error('Audio details cannot be changed by a metadata update.');
  }
  const next = { ...previous, ...patch };
  assertLocalRecording(next);
  return next;
}

const audioTypes: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
};

export function audioExtension(name: string): string {
  const extension = name.split('.').at(-1)?.toLowerCase() ?? '';
  if (!Object.hasOwn(audioTypes, extension))
    throw new Error('Choose an MP3, WAV, or M4A audio file.');
  return extension;
}

export function validateAudioImport(input: AudioImport): string {
  const extension = audioExtension(input.name);
  if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes <= 0)
    throw new Error('The selected audio file is empty or its size is unavailable.');
  if (input.sizeBytes > MAX_AUDIO_BYTES)
    throw new Error('Choose an audio file no larger than 250 MiB.');
  if (!input.uri && !input.blob) throw new Error('The selected audio file is unavailable.');
  return audioTypes[extension]!;
}

export function validateTitle(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) throw new Error('Enter a recording name.');
  if (trimmed.length > MAX_RECORDING_TITLE_LENGTH)
    throw new Error('Keep the recording name to 200 characters or fewer.');
  return trimmed;
}

export function validateRecordingNotes(notes: string): string {
  if (notes.length > MAX_RECORDING_NOTES_LENGTH)
    throw new Error('Keep your notes to 10,000 characters or fewer.');
  return notes.trim();
}

export function isRecordingId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function isRecorderSerial(value: unknown): value is string {
  const result = createAssignmentRequestSchema.shape.serial.safeParse(value);
  // Stored identities must already be normalized, just like the enrolled assignment.
  return result.success && result.data === value;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function assertLocalRecording(value: unknown): asserts value is LocalRecording {
  if (
    !isObject(value) ||
    typeof value.id !== 'string' ||
    !isRecordingId(value.id) ||
    typeof value.title !== 'string' ||
    !value.title.trim() ||
    value.title.length > MAX_RECORDING_TITLE_LENGTH ||
    typeof value.originalName !== 'string' ||
    !value.originalName ||
    typeof value.importedAt !== 'string' ||
    !Number.isFinite(Date.parse(value.importedAt)) ||
    typeof value.sizeBytes !== 'number' ||
    !Number.isSafeInteger(value.sizeBytes) ||
    value.sizeBytes <= 0 ||
    value.sizeBytes > MAX_AUDIO_BYTES ||
    typeof value.mimeType !== 'string' ||
    !value.mimeType ||
    !(
      value.durationSeconds === null ||
      (typeof value.durationSeconds === 'number' &&
        Number.isFinite(value.durationSeconds) &&
        value.durationSeconds >= 0)
    )
  ) {
    throw new Error('Saved recording information is invalid.');
  }
  audioExtension(value.originalName);
  if (
    value.notes !== undefined &&
    (typeof value.notes !== 'string' || value.notes.length > MAX_RECORDING_NOTES_LENGTH)
  )
    throw new Error('Saved recording notes are invalid.');
  if (
    value.retention !== undefined &&
    value.retention !== 'temporary' &&
    value.retention !== 'downloaded'
  )
    throw new Error('Saved recording storage preference is invalid.');
  if (value.phoneCapture !== undefined) {
    const capture = value.phoneCapture;
    if (
      value.source !== undefined ||
      !isObject(capture) ||
      typeof capture.actorId !== 'string' ||
      !isRecordingId(capture.actorId) ||
      typeof capture.createdAt !== 'string' ||
      !Number.isFinite(Date.parse(capture.createdAt))
    )
      throw new Error('Saved phone recording owner is invalid.');
  }
  if (value.source !== undefined) {
    const source = value.source;
    if (
      !isObject(source) ||
      source.kind !== 'plaud' ||
      typeof source.actorId !== 'string' ||
      !isRecordingId(source.actorId) ||
      !isRecorderSerial(source.serial) ||
      !Number.isSafeInteger(source.sessionId) ||
      Number(source.sessionId) < 0 ||
      !Number.isSafeInteger(source.sizeBytes) ||
      Number(source.sizeBytes) <= 0
    ) {
      throw new Error('Saved recorder source is invalid.');
    }
  }
  if (value.location !== undefined && value.location !== null) {
    if (
      !isObject(value.source) ||
      !readRecordingLocation(value.location, Number(value.source.sessionId))
    )
      throw new Error('Saved recording location is invalid.');
  }
  if (value.transcript !== null) {
    const transcript = value.transcript;
    if (
      !isObject(transcript) ||
      typeof transcript.fileName !== 'string' ||
      typeof transcript.text !== 'string' ||
      typeof transcript.importedAt !== 'string' ||
      !Number.isFinite(Date.parse(transcript.importedAt)) ||
      !Array.isArray(transcript.segments) ||
      !transcript.segments.every((segment) => transcriptSegmentSchema.safeParse(segment).success)
    ) {
      throw new Error('Saved transcript information is invalid.');
    }
  }
}

export function recordingOwner(
  recording: Pick<LocalRecording, 'source' | 'phoneCapture'>,
): string | undefined {
  return recording.source?.actorId ?? recording.phoneCapture?.actorId;
}
export function visibleToActor(
  recording: Pick<LocalRecording, 'source' | 'phoneCapture'>,
  actorId: string | null,
): boolean {
  const owner = recordingOwner(recording);
  return owner === undefined || owner === actorId;
}
