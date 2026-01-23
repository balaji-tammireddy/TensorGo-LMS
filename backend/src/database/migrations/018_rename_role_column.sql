-- Rename role column to user_role in users table
ALTER TABLE users RENAME COLUMN role TO user_role;

-- Update valid roles check constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_user_role_check 
  CHECK (user_role IN ('employee', 'manager', 'hr', 'super_admin', 'intern'));

-- Re-create index on new column name
DROP INDEX IF EXISTS idx_users_role;
CREATE INDEX IF NOT EXISTS idx_users_user_role ON users(user_role);
