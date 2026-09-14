CREATE TABLE users (
  id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE recorders (
  id uuid PRIMARY KEY,
  serial text NOT NULL UNIQUE,
  model text NOT NULL CHECK (model IN ('notepro', 'notepins')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE recorder_assignments (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  recorder_id uuid NOT NULL REFERENCES recorders(id) ON DELETE RESTRICT,
  assigned_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  status text NOT NULL CHECK (status IN ('active', 'released', 'revoked')),
  ended_at timestamptz,
  UNIQUE (id, user_id),
  CHECK ((status = 'active' AND ended_at IS NULL) OR (status <> 'active' AND ended_at IS NOT NULL))
);

CREATE UNIQUE INDEX recorder_assignments_one_active_recorder
  ON recorder_assignments(recorder_id) WHERE status = 'active';

CREATE FUNCTION reject_assignment_identity_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.user_id <> OLD.user_id OR NEW.recorder_id <> OLD.recorder_id OR NEW.assigned_at <> OLD.assigned_at THEN
    RAISE EXCEPTION 'assignment identity is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER recorder_assignment_identity_immutable
BEFORE UPDATE ON recorder_assignments
FOR EACH ROW EXECUTE FUNCTION reject_assignment_identity_change();

CREATE TABLE enrollment_tokens (
  id uuid PRIMARY KEY,
  assignment_id uuid NOT NULL REFERENCES recorder_assignments(id) ON DELETE RESTRICT,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (id, assignment_id),
  CHECK (expires_at > created_at)
);

CREATE TABLE setup_operations (
  id uuid PRIMARY KEY,
  assignment_id uuid NOT NULL,
  enrollment_token_id uuid NOT NULL UNIQUE,
  user_id uuid NOT NULL,
  idempotency_key uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  revoked_at timestamptz,
  UNIQUE (user_id, idempotency_key),
  FOREIGN KEY (assignment_id, user_id)
    REFERENCES recorder_assignments(id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (enrollment_token_id, assignment_id)
    REFERENCES enrollment_tokens(id, assignment_id) ON DELETE RESTRICT,
  CHECK ((status = 'pending' AND revoked_at IS NULL) OR (status = 'revoked' AND revoked_at IS NOT NULL))
);

CREATE TABLE audit_events (
  id uuid PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action text NOT NULL,
  resource_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX enrollment_tokens_assignment_idx ON enrollment_tokens(assignment_id);
CREATE INDEX setup_operations_assignment_idx ON setup_operations(assignment_id);
CREATE INDEX audit_events_resource_idx ON audit_events(resource_id);
