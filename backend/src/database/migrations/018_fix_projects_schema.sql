-- Migration to add custom_id column if missing (Fix for existing tables)

-- 1. Projects
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'custom_id') THEN
        ALTER TABLE projects ADD COLUMN custom_id VARCHAR(50);
        -- Note: We cannot easily enforce NOT NULL on existing rows without default, so we add it nullable first
        -- or update existing rows. For development, we assume user can truncate or we leave it nullable temporarily.
        -- Ideally: ALTER TABLE projects ADD COLUMN custom_id VARCHAR(50) NOT NULL DEFAULT 'TEMP-' || id;
        -- Let's try to set it to NOT NULL after Update.
    END IF;
END $$;

-- Update existing projects with a temporary custom_id if it's null
UPDATE projects SET custom_id = 'PRJ-' || id WHERE custom_id IS NULL;

-- Now enforce NOT NULL and UNIQUE
DO $$
BEGIN
    ALTER TABLE projects ALTER COLUMN custom_id SET NOT NULL;
    ALTER TABLE projects ADD CONSTRAINT projects_custom_id_key UNIQUE (custom_id);
EXCEPTION
    WHEN others THEN NULL; -- Ignore if constraint already exists or fails
END $$;


-- 2. Project Modules
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'project_modules' AND column_name = 'custom_id') THEN
        ALTER TABLE project_modules ADD COLUMN custom_id VARCHAR(50);
    END IF;
END $$;
UPDATE project_modules SET custom_id = 'MOD-' || id WHERE custom_id IS NULL;
DO $$
BEGIN
    ALTER TABLE project_modules ALTER COLUMN custom_id SET NOT NULL;
    ALTER TABLE project_modules ADD CONSTRAINT project_modules_project_id_custom_id_key UNIQUE (project_id, custom_id);
EXCEPTION WHEN others THEN NULL; END $$;


-- 3. Project Tasks
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'project_tasks' AND column_name = 'custom_id') THEN
        ALTER TABLE project_tasks ADD COLUMN custom_id VARCHAR(50);
    END IF;
END $$;
UPDATE project_tasks SET custom_id = 'TSK-' || id WHERE custom_id IS NULL;
DO $$
BEGIN
    ALTER TABLE project_tasks ALTER COLUMN custom_id SET NOT NULL;
    ALTER TABLE project_tasks ADD CONSTRAINT project_tasks_module_id_custom_id_key UNIQUE (module_id, custom_id);
EXCEPTION WHEN others THEN NULL; END $$;


-- 4. Project Activities
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'project_activities' AND column_name = 'custom_id') THEN
        ALTER TABLE project_activities ADD COLUMN custom_id VARCHAR(50);
    END IF;
END $$;
UPDATE project_activities SET custom_id = 'ACT-' || id WHERE custom_id IS NULL;
DO $$
BEGIN
    ALTER TABLE project_activities ALTER COLUMN custom_id SET NOT NULL;
    ALTER TABLE project_activities ADD CONSTRAINT project_activities_task_id_custom_id_key UNIQUE (task_id, custom_id);
EXCEPTION WHEN others THEN NULL; END $$;
