-- Rename status column to user_status in users table
ALTER TABLE users RENAME COLUMN status TO user_status;

-- Update status check constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check;
ALTER TABLE users ADD CONSTRAINT users_user_status_check 
  CHECK (user_status IN ('active', 'inactive', 'on_leave', 'terminated', 'resigned', 'on_notice'));

-- Re-create index on new column name
DROP INDEX IF EXISTS idx_users_status;
CREATE INDEX IF NOT EXISTS idx_users_user_status ON users(user_status);
