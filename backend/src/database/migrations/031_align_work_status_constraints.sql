-- Migration 031: Align work_status constraints in project_entries with project_tasks/activities
-- This fixes the error where automatic timesheet sync fails due to new task statuses

-- Step 1: Drop the old restrictive constraint
ALTER TABLE project_entries 
    DROP CONSTRAINT IF EXISTS project_entries_work_status_check;

-- Step 2: Normalize any existing rows with old/invalid status values to 'in_progress'
UPDATE project_entries
SET work_status = 'in_progress'
WHERE work_status NOT IN ('not_started', 'in_progress', 'completed', 'on_hold', 'not_applicable', 'closed', 'differed', 'review', 'testing', 'fixed');

-- Step 3: Add the expanded constraint covering all valid values from both old and new status sets
ALTER TABLE project_entries
    ADD CONSTRAINT project_entries_work_status_check 
    CHECK (work_status IN ('not_started', 'in_progress', 'completed', 'on_hold', 'not_applicable', 'closed', 'differed', 'review', 'testing', 'fixed'));
