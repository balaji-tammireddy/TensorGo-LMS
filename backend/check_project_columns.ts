import { pool } from './src/database/db';

async function checkProjectTables() {
    try {
        const tables = ['projects', 'project_modules', 'project_tasks', 'project_activities'];
        for (const table of tables) {
            const res = await pool.query(
                "SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public'",
                [table]
            );
            const columns = res.rows.map(r => r.column_name);
            console.log(`Table: ${table}`);
            console.log(`- created_by: ${columns.includes('created_by')}`);
            console.log(`- updated_by: ${columns.includes('updated_by')}`);
        }
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await pool.end();
    }
}

checkProjectTables();
