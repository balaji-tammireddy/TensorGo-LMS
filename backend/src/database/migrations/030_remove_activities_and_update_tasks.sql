-- Migration 030: Remove activities and update tasks
-- Add date, time_spent, and work_status fields to project_tasks (bringing Activity fields into Task)

ALTER TABLE project_tasks
    ADD COLUMN IF NOT EXISTS start_date DATE,
    ADD COLUMN IF NOT EXISTS end_date DATE,
    ADD COLUMN IF NOT EXISTS time_spent NUMERIC(5, 2),
    ADD COLUMN IF NOT EXISTS work_status VARCHAR(50) DEFAULT 'in_progress' 
        CHECK (work_status IN ('not_started', 'in_progress', 'completed', 'on_hold'));

-- Make activity_id optional in project_entries if we want to log time against tasks directly
ALTER TABLE project_entries ALTER COLUMN activity_id DROP NOT NULL;

-- Ensure task_id remains in project_entries (it likely is)
-- The existing project_entries already has task_id and activity_id.
