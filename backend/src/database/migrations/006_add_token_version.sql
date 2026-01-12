-- Add token_version to users table for session invalidation
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER DEFAULT 1;
