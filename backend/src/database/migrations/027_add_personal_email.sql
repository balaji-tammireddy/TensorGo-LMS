-- Add personal_email column to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS personal_email VARCHAR(255);

-- Create index for faster lookups if needed (optional, but good practice if we search by it)
-- CREATE INDEX IF NOT EXISTS idx_users_personal_email ON users(personal_email);
