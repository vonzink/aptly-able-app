ALTER TABLE users ADD COLUMN display_name text NOT NULL DEFAULT 'Local user'
  CHECK (length(btrim(display_name)) BETWEEN 1 AND 120);
CREATE INDEX recorder_assignments_history_idx ON recorder_assignments(assigned_at DESC, id DESC);
CREATE INDEX enrollment_tokens_recent_idx ON enrollment_tokens(assignment_id, created_at DESC, id DESC);
CREATE INDEX setup_operations_recent_idx ON setup_operations(assignment_id, created_at DESC, id DESC);
