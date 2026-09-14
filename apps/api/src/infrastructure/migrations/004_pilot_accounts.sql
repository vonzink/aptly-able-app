CREATE TABLE pilot_accounts (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
  email text NOT NULL UNIQUE CHECK (email = lower(btrim(email)) AND length(email) <= 254),
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE pilot_sessions (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  user_id uuid NOT NULL REFERENCES pilot_accounts(user_id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (expires_at > created_at)
);
CREATE INDEX pilot_sessions_user_idx ON pilot_sessions(user_id);
CREATE INDEX pilot_sessions_expiry_idx ON pilot_sessions(expires_at);
