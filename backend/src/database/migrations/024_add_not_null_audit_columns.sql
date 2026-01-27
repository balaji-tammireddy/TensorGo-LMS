-- Migration 024: Add NOT NULL audit columns to all tables
-- This migration ensures all tables have created_by, created_at, updated_by, updated_at columns with NOT NULL constraints

-- Step 1: Add missing audit columns to tables that don't have them

-- activity_access
ALTER TABLE activity_access ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE activity_access ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE activity_access ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id);
ALTER TABLE activity_access ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id);

-- module_access
ALTER TABLE module_access ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE module_access ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE module_access ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id);
ALTER TABLE module_access ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id);

-- project_members
ALTER TABLE project_members ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE project_members ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE project_members ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id);
ALTER TABLE project_members ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id);

-- task_access
ALTER TABLE task_access ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE task_access ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE task_access ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id);
ALTER TABLE task_access ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id);

-- project_activities (missing created_by and updated_by)
ALTER TABLE project_activities ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id);
ALTER TABLE project_activities ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id);

-- project_modules (missing created_by and updated_by)
ALTER TABLE project_modules ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id);
ALTER TABLE project_modules ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id);

-- project_tasks (missing created_by and updated_by)
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id);
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id);

-- projects (missing updated_by)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id);

-- Step 2: Set default values for existing NULL records (using user ID 1 as system default)

-- Update all tables with NULL created_by or updated_by values
UPDATE activity_access SET created_by = 1 WHERE created_by IS NULL;
UPDATE activity_access SET updated_by = 1 WHERE updated_by IS NULL;

UPDATE module_access SET created_by = 1 WHERE created_by IS NULL;
UPDATE module_access SET updated_by = 1 WHERE updated_by IS NULL;

UPDATE project_members SET created_by = 1 WHERE created_by IS NULL;
UPDATE project_members SET updated_by = 1 WHERE updated_by IS NULL;

UPDATE task_access SET created_by = 1 WHERE created_by IS NULL;
UPDATE task_access SET updated_by = 1 WHERE updated_by IS NULL;

UPDATE project_activities SET created_by = 1 WHERE created_by IS NULL;
UPDATE project_activities SET updated_by = 1 WHERE updated_by IS NULL;

UPDATE project_modules SET created_by = 1 WHERE created_by IS NULL;
UPDATE project_modules SET updated_by = 1 WHERE updated_by IS NULL;

UPDATE project_tasks SET created_by = 1 WHERE created_by IS NULL;
UPDATE project_tasks SET updated_by = 1 WHERE updated_by IS NULL;

UPDATE projects SET created_by = 1 WHERE created_by IS NULL;
UPDATE projects SET updated_by = 1 WHERE updated_by IS NULL;

UPDATE holidays SET created_by = 1 WHERE created_by IS NULL;
UPDATE holidays SET updated_by = 1 WHERE updated_by IS NULL;

UPDATE leave_balances SET created_by = 1 WHERE created_by IS NULL;
UPDATE leave_balances SET updated_by = 1 WHERE updated_by IS NULL;

UPDATE leave_days SET created_by = 1 WHERE created_by IS NULL;
UPDATE leave_days SET updated_by = 1 WHERE updated_by IS NULL;

UPDATE leave_policy_configurations SET created_by = 1 WHERE created_by IS NULL;
UPDATE leave_policy_configurations SET updated_by = 1 WHERE updated_by IS NULL;

UPDATE leave_requests SET created_by = 1 WHERE created_by IS NULL;
UPDATE leave_requests SET updated_by = 1 WHERE updated_by IS NULL;

UPDATE leave_rules SET created_by = 1 WHERE created_by IS NULL;
UPDATE leave_rules SET updated_by = 1 WHERE updated_by IS NULL;

UPDATE leave_types SET created_by = 1 WHERE created_by IS NULL;
UPDATE leave_types SET updated_by = 1 WHERE updated_by IS NULL;

UPDATE password_reset_otps SET created_by = 1 WHERE created_by IS NULL;
UPDATE password_reset_otps SET updated_by = 1 WHERE updated_by IS NULL;

UPDATE policies SET created_by = 1 WHERE created_by IS NULL;
UPDATE policies SET updated_by = 1 WHERE updated_by IS NULL;

UPDATE project_entries SET created_by = 1 WHERE created_by IS NULL;
UPDATE project_entries SET updated_by = 1 WHERE updated_by IS NULL;

UPDATE users SET created_by = 1 WHERE created_by IS NULL;
UPDATE users SET updated_by = 1 WHERE updated_by IS NULL;

-- Step 3: Add NOT NULL constraints to all tables

-- activity_access
ALTER TABLE activity_access ALTER COLUMN created_by SET NOT NULL;
ALTER TABLE activity_access ALTER COLUMN updated_by SET NOT NULL;
ALTER TABLE activity_access ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE activity_access ALTER COLUMN updated_at SET NOT NULL;

-- module_access
ALTER TABLE module_access ALTER COLUMN created_by SET NOT NULL;
ALTER TABLE module_access ALTER COLUMN updated_by SET NOT NULL;
ALTER TABLE module_access ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE module_access ALTER COLUMN updated_at SET NOT NULL;

-- project_members
ALTER TABLE project_members ALTER COLUMN created_by SET NOT NULL;
ALTER TABLE project_members ALTER COLUMN updated_by SET NOT NULL;
ALTER TABLE project_members ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE project_members ALTER COLUMN updated_at SET NOT NULL;

-- task_access
ALTER TABLE task_access ALTER COLUMN created_by SET NOT NULL;
ALTER TABLE task_access ALTER COLUMN updated_by SET NOT NULL;
ALTER TABLE task_access ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE task_access ALTER COLUMN updated_at SET NOT NULL;

-- project_activities
ALTER TABLE project_activities ALTER COLUMN created_by SET NOT NULL;
ALTER TABLE project_activities ALTER COLUMN updated_by SET NOT NULL;
ALTER TABLE project_activities ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE project_activities ALTER COLUMN updated_at SET NOT NULL;

-- project_modules
ALTER TABLE project_modules ALTER COLUMN created_by SET NOT NULL;
ALTER TABLE project_modules ALTER COLUMN updated_by SET NOT NULL;
ALTER TABLE project_modules ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE project_modules ALTER COLUMN updated_at SET NOT NULL;

-- project_tasks
ALTER TABLE project_tasks ALTER COLUMN created_by SET NOT NULL;
ALTER TABLE project_tasks ALTER COLUMN updated_by SET NOT NULL;
ALTER TABLE project_tasks ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE project_tasks ALTER COLUMN updated_at SET NOT NULL;

-- projects
ALTER TABLE projects ALTER COLUMN created_by SET NOT NULL;
ALTER TABLE projects ALTER COLUMN updated_by SET NOT NULL;
ALTER TABLE projects ALTER COLUMN created_at SET NOT NULL;

-- holidays
ALTER TABLE holidays ALTER COLUMN created_by SET NOT NULL;
ALTER TABLE holidays ALTER COLUMN updated_by SET NOT NULL;
ALTER TABLE holidays ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE holidays ALTER COLUMN updated_at SET NOT NULL;

-- leave_balances
ALTER TABLE leave_balances ALTER COLUMN created_by SET NOT NULL;
ALTER TABLE leave_balances ALTER COLUMN updated_by SET NOT NULL;
ALTER TABLE leave_balances ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE leave_balances ALTER COLUMN updated_at SET NOT NULL;

-- leave_days
ALTER TABLE leave_days ALTER COLUMN created_by SET NOT NULL;
ALTER TABLE leave_days ALTER COLUMN updated_by SET NOT NULL;
ALTER TABLE leave_days ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE leave_days ALTER COLUMN updated_at SET NOT NULL;

-- leave_policy_configurations
ALTER TABLE leave_policy_configurations ALTER COLUMN created_by SET NOT NULL;
ALTER TABLE leave_policy_configurations ALTER COLUMN updated_by SET NOT NULL;
ALTER TABLE leave_policy_configurations ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE leave_policy_configurations ALTER COLUMN updated_at SET NOT NULL;

-- leave_requests
ALTER TABLE leave_requests ALTER COLUMN created_by SET NOT NULL;
ALTER TABLE leave_requests ALTER COLUMN updated_by SET NOT NULL;
ALTER TABLE leave_requests ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE leave_requests ALTER COLUMN updated_at SET NOT NULL;

-- leave_rules
ALTER TABLE leave_rules ALTER COLUMN created_by SET NOT NULL;
ALTER TABLE leave_rules ALTER COLUMN updated_by SET NOT NULL;
ALTER TABLE leave_rules ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE leave_rules ALTER COLUMN updated_at SET NOT NULL;

-- leave_types
ALTER TABLE leave_types ALTER COLUMN created_by SET NOT NULL;
ALTER TABLE leave_types ALTER COLUMN updated_by SET NOT NULL;
ALTER TABLE leave_types ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE leave_types ALTER COLUMN updated_at SET NOT NULL;

-- password_reset_otps
ALTER TABLE password_reset_otps ALTER COLUMN created_by SET NOT NULL;
ALTER TABLE password_reset_otps ALTER COLUMN updated_by SET NOT NULL;
ALTER TABLE password_reset_otps ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE password_reset_otps ALTER COLUMN updated_at SET NOT NULL;

-- policies
ALTER TABLE policies ALTER COLUMN created_by SET NOT NULL;
ALTER TABLE policies ALTER COLUMN updated_by SET NOT NULL;
ALTER TABLE policies ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE policies ALTER COLUMN updated_at SET NOT NULL;

-- project_entries
ALTER TABLE project_entries ALTER COLUMN created_by SET NOT NULL;
ALTER TABLE project_entries ALTER COLUMN updated_by SET NOT NULL;
ALTER TABLE project_entries ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE project_entries ALTER COLUMN updated_at SET NOT NULL;

-- users
ALTER TABLE users ALTER COLUMN created_by SET NOT NULL;
ALTER TABLE users ALTER COLUMN updated_by SET NOT NULL;
ALTER TABLE users ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE users ALTER COLUMN updated_at SET NOT NULL;
