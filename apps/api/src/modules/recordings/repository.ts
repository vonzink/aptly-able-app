import type pg from 'pg';
import {
  processingRecordingSchema,
  type ProcessingStatus,
  type GeneratedTranscript,
} from '@aptly/contracts';
import { RecordingError } from './errors.js';
export type RecordingRow = {
  id: string;
  user_id: string;
  title: string;
  file_name: string;
  file_type: 'mp3' | 'wav' | 'm4a';
  size_bytes: string;
  status: ProcessingStatus;
  audio_key: string | null;
  sha256: string | null;
  attempt: number;
  provider_task_id: string | null;
  transcript: GeneratedTranscript | null;
  error_code: string | null;
  poll_errors: number;
  attempt_started_at: Date | null;
  next_poll_at: Date;
  created_at: Date;
  updated_at: Date;
};
export const presentRecording = (row: RecordingRow) =>
  processingRecordingSchema.parse({
    id: row.id,
    title: row.title,
    fileName: row.file_name,
    sizeBytes: Number(row.size_bytes),
    status: row.status,
    attempt: row.attempt,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    errorCode: row.error_code,
    transcript: row.transcript,
  });
export async function ownedRecording(
  db: pg.Pool | pg.PoolClient,
  userId: string,
  id: string,
  lock = false,
): Promise<RecordingRow> {
  const result = await db.query<RecordingRow>(
    `SELECT * FROM processing_recordings WHERE id=$1 AND user_id=$2${lock ? ' FOR UPDATE' : ''}`,
    [id, userId],
  );
  if (!result.rows[0])
    throw new RecordingError(
      404,
      'RECORDING_NOT_FOUND',
      'This uploaded recording is not available.',
    );
  return result.rows[0];
}
