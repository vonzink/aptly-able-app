CREATE TABLE processing_recordings (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  file_name text NOT NULL,
  file_type text NOT NULL CHECK (file_type IN ('mp3','wav','m4a')),
  size_bytes bigint NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 262144000),
  status text NOT NULL DEFAULT 'awaiting_upload' CHECK (status IN ('awaiting_upload','queued','uploading','submitting','transcribing','complete','failed','submission_uncertain')),
  audio_key text,
  sha256 text,
  attempt integer NOT NULL DEFAULT 0 CHECK (attempt >= 0),
  provider_task_id text,
  transcript jsonb,
  error_code text,
  poll_errors integer NOT NULL DEFAULT 0,
  attempt_started_at timestamptz,
  next_poll_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((status = 'complete') = (transcript IS NOT NULL)),
  CHECK ((audio_key IS NULL) = (sha256 IS NULL))
);
CREATE INDEX processing_recordings_queue_idx ON processing_recordings(next_poll_at, created_at)
  WHERE status IN ('queued','uploading','submitting','transcribing');
CREATE INDEX processing_recordings_owner_idx ON processing_recordings(user_id, created_at DESC);
