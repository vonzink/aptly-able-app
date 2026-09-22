-- Account-authenticated setup has no transferable invitation. Keep assignments
-- and setup operations separate; existing invitation enrollments remain unchanged.
ALTER TABLE setup_operations ALTER COLUMN enrollment_token_id DROP NOT NULL;
