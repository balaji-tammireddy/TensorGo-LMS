-- Migration 029: Add date, time_spent, and work_status fields to project_activities

ALTER TABLE project_activities
    ADD COLUMN IF NOT EXISTS date DATE,
    ADD COLUMN IF NOT EXISTS time_spent NUMERIC(5, 2),
    ADD COLUMN IF NOT EXISTS work_status VARCHAR(50) DEFAULT 'in_progress' 
        CHECK (work_status IN ('not_started', 'in_progress', 'completed', 'on_hold'));
