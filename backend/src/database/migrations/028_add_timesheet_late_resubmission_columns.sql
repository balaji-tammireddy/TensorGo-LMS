-- Migration to add is_late and is_resubmission columns to project_entries
ALTER TABLE project_entries 
ADD COLUMN is_late BOOLEAN DEFAULT FALSE,
ADD COLUMN is_resubmission BOOLEAN DEFAULT FALSE;
