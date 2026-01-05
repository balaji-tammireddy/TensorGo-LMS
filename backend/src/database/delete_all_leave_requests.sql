-- Script to delete all leave requests from the database
-- This will also cascade delete all related leave_days records

-- Start transaction for safety
BEGIN;

-- Delete all records from leave_days table first (child table)
DELETE FROM leave_days;

-- Delete all records from leave_requests table
DELETE FROM leave_requests;

-- Reset the auto-increment sequences to start from 1 again
ALTER SEQUENCE leave_days_id_seq RESTART WITH 1;
ALTER SEQUENCE leave_requests_id_seq RESTART WITH 1;

-- Commit the transaction
COMMIT;

-- Display confirmation
SELECT 'All leave requests and leave days have been deleted successfully' AS status;
