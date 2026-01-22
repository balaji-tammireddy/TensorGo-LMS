-- Force recreation of Project Management tables to fix corrupted schema
-- WARNING: This deletes all existing project data

DROP TABLE IF EXISTS activity_access CASCADE;
DROP TABLE IF EXISTS task_access CASCADE;
DROP TABLE IF EXISTS module_access CASCADE;
DROP TABLE IF EXISTS project_members CASCADE;
DROP TABLE IF EXISTS project_activities CASCADE;
DROP TABLE IF EXISTS project_tasks CASCADE;
DROP TABLE IF EXISTS project_modules CASCADE;
DROP TABLE IF EXISTS projects CASCADE;

-- 1. Projects (Top Level)
CREATE TABLE projects (
    id SERIAL PRIMARY KEY,
    custom_id VARCHAR(50) NOT NULL UNIQUE, 
    name VARCHAR(255) NOT NULL,
    description TEXT,
    project_manager_id INTEGER REFERENCES users(id),
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived', 'on_hold')),
    start_date DATE,
    end_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(id)
);

CREATE INDEX idx_projects_manager ON projects(project_manager_id);
CREATE INDEX idx_projects_status ON projects(status);

-- 2. Project Modules (Belong to Project)
CREATE TABLE project_modules (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    custom_id VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_id, custom_id)
);

CREATE INDEX idx_project_modules_project ON project_modules(project_id);

-- 3. Project Tasks (Belong to Module)
CREATE TABLE project_tasks (
    id SERIAL PRIMARY KEY,
    module_id INTEGER NOT NULL REFERENCES project_modules(id) ON DELETE CASCADE,
    custom_id VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'pending',
    due_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(module_id, custom_id)
);

CREATE INDEX idx_project_tasks_module ON project_tasks(module_id);

-- 4. Project Activities (Belong to Task)
CREATE TABLE project_activities (
    id SERIAL PRIMARY KEY,
    task_id INTEGER NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
    custom_id VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(task_id, custom_id)
);

CREATE INDEX idx_project_activities_task ON project_activities(task_id);

-- Access Control Tables

-- 5. Project Members
CREATE TABLE project_members (
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (project_id, user_id)
);

-- 6. Module Access
CREATE TABLE module_access (
    module_id INTEGER NOT NULL REFERENCES project_modules(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    granted_by INTEGER REFERENCES users(id),
    PRIMARY KEY (module_id, user_id)
);

-- 7. Task Access
CREATE TABLE task_access (
    task_id INTEGER NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    granted_by INTEGER REFERENCES users(id),
    PRIMARY KEY (task_id, user_id)
);

-- 8. Activity Access
CREATE TABLE activity_access (
    activity_id INTEGER NOT NULL REFERENCES project_activities(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    granted_by INTEGER REFERENCES users(id),
    PRIMARY KEY (activity_id, user_id)
);

-- Triggers for updated_at
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_project_modules_updated_at BEFORE UPDATE ON project_modules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_project_tasks_updated_at BEFORE UPDATE ON project_tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_project_activities_updated_at BEFORE UPDATE ON project_activities FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
