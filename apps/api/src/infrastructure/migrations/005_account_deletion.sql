CREATE TABLE account_deletions (
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL UNIQUE,
 receipt_token_hash text NOT NULL,
 requested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 service_erased_at timestamptz,
 provider_evidence text,
 backup_evidence text,
 confirmed_by text,
 confirmed_at timestamptz,
 completed_at timestamptz,
 attempts integer NOT NULL DEFAULT 0,
 next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 last_error text,
 provider_scope jsonb NOT NULL DEFAULT '{}'::jsonb,
 CHECK (completed_at IS NULL OR (service_erased_at IS NOT NULL AND provider_evidence IS NOT NULL AND backup_evidence IS NOT NULL AND confirmed_by IS NOT NULL))
);
-- Database backstop for authenticated requests already in flight and admin enrollment writes.
CREATE FUNCTION reject_deleted_account_write() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock_shared(hashtextextended(NEW.user_id::text, 418));
 IF EXISTS (SELECT 1 FROM account_deletions WHERE user_id=NEW.user_id) THEN
   RAISE EXCEPTION 'account deletion requested' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER processing_account_active BEFORE INSERT OR UPDATE ON processing_recordings FOR EACH ROW EXECUTE FUNCTION reject_deleted_account_write();
CREATE TRIGGER assignment_account_active BEFORE INSERT ON recorder_assignments FOR EACH ROW EXECUTE FUNCTION reject_deleted_account_write();
CREATE TRIGGER setup_account_active BEFORE INSERT ON setup_operations FOR EACH ROW EXECUTE FUNCTION reject_deleted_account_write();
CREATE TRIGGER session_account_active BEFORE INSERT ON pilot_sessions FOR EACH ROW EXECUTE FUNCTION reject_deleted_account_write();

-- Reserve ownership before writing bytes, including crash-left temporary uploads.
CREATE TABLE account_audio_uploads (
 audio_key text PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER upload_account_active BEFORE INSERT ON account_audio_uploads FOR EACH ROW EXECUTE FUNCTION reject_deleted_account_write();
