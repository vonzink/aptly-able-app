-- Preserve the commitment made when the request was accepted. Do not invent a
-- retroactive deadline for requests accepted before this policy was introduced.
ALTER TABLE account_deletions ADD COLUMN expected_completion_at timestamptz;
ALTER TABLE account_deletions ADD CONSTRAINT deletion_deadline_after_request
  CHECK (expected_completion_at IS NULL OR expected_completion_at >= requested_at);
CREATE INDEX account_deletions_due ON account_deletions(expected_completion_at)
  WHERE completed_at IS NULL;
