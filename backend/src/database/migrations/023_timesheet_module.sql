-- Migration to create timesheet-related tables (project_entries)
-- This table stores determination of time spent on specific activities

CREATE TABLE IF NOT EXISTS project_entries (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    project_id INTEGER NOT NULL REFERENCES projects(id),
    module_id INTEGER NOT NULL REFERENCES project_modules(id),
    task_id INTEGER NOT NULL REFERENCES project_tasks(id),
    activity_id INTEGER NOT NULL REFERENCES project_activities(id),
    log_date DATE NOT NULL,
    duration DECIMAL(4, 2) NOT NULL CHECK (duration > 0 AND duration <= 24),
    description TEXT NOT NULL,
    work_status VARCHAR(50) NOT NULL CHECK (work_status IN ('not_applicable', 'in_progress', 'closed', 'differed', 'review', 'testing', 'fixed')),
    log_status VARCHAR(50) DEFAULT 'draft' CHECK (log_status IN ('draft', 'submitted', 'approved', 'rejected')),
    rejection_reason TEXT,
    manager_comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(id),
    updated_by INTEGER REFERENCES users(id)
);

-- Index for efficient querying by user and date (for weekly view)
CREATE INDEX IF NOT EXISTS idx_project_entries_user_date ON project_entries(user_id, log_date);

-- Index for project filtering
CREATE INDEX IF NOT EXISTS idx_project_entries_project ON project_entries(project_id);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_project_entries_updated_at ON project_entries;
CREATE TRIGGER update_project_entries_updated_at BEFORE UPDATE ON project_entries FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
