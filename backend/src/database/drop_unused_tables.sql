-- Drop unused tables: audit_logs and notifications
-- These tables are not used anywhere in the application

-- Drop notifications table (if exists)
DROP TABLE IF EXISTS notifications CASCADE;

-- Drop audit_logs table (if exists)
DROP TABLE IF EXISTS audit_logs CASCADE;

