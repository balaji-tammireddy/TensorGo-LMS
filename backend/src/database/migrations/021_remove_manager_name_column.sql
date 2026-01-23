-- Remove redundant reporting_manager_name column from users table
ALTER TABLE users DROP COLUMN IF EXISTS reporting_manager_name;
