-- Add new columns for employee profile tracking
ALTER TABLE users
ADD COLUMN IF NOT EXISTS is_profile_updated BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS uan_number VARCHAR(20),
ADD COLUMN IF NOT EXISTS total_experience NUMERIC(4,1);

-- Ensure UAN is alphanumeric/numeric (application layer handles exact validation, DB just provides storage)
-- Adding a check constraint for total_experience to be non-negative
ALTER TABLE users
ADD CONSTRAINT total_experience_check CHECK (total_experience >= 0);
