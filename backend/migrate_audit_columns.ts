import { pool } from './src/database/db';

async function migrate() {
    try {
        console.log('Starting migration...');

        // 1. Projects table - already has created_by (from previous check), but lacks updated_by
        await pool.query('ALTER TABLE projects ADD COLUMN IF NOT EXISTS updated_by INTEGER;');
        console.log('Updated projects table');

        // 2. Project Modules
        await pool.query('ALTER TABLE project_modules ADD COLUMN IF NOT EXISTS created_by INTEGER;');
        await pool.query('ALTER TABLE project_modules ADD COLUMN IF NOT EXISTS updated_by INTEGER;');
        console.log('Updated project_modules table');

        // 3. Project Tasks
        await pool.query('ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS created_by INTEGER;');
        await pool.query('ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS updated_by INTEGER;');
        console.log('Updated project_tasks table');

        // 4. Project Activities
        await pool.query('ALTER TABLE project_activities ADD COLUMN IF NOT EXISTS created_by INTEGER;');
        await pool.query('ALTER TABLE project_activities ADD COLUMN IF NOT EXISTS updated_by INTEGER;');
        console.log('Updated project_activities table');

        console.log('Migration completed successfully');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await pool.end();
    }
}

migrate();
