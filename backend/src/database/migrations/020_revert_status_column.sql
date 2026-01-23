-- Revert user_status column back to status
ALTER TABLE users RENAME COLUMN user_status TO status;

-- Update status check constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_user_status_check;
ALTER TABLE users ADD CONSTRAINT users_status_check
  CHECK (status IN ('active', 'inactive', 'on_leave', 'terminated', 'resigned', 'on_notice'));

-- Re-create index on new column name
DROP INDEX IF EXISTS idx_users_user_status;
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
