import { pool } from '../database/db';

async function test() {
    try {
        const modulesRes = await pool.query('SELECT id, name FROM project_modules');
        console.log('Modules found:', modulesRes.rows);

        for (const m of modulesRes.rows) {
            const tasksRes = await pool.query('SELECT id, name FROM project_tasks WHERE module_id = $1', [m.id]);
            console.log(`Module ID ${m.id} (${m.name}) has ${tasksRes.rows.length} tasks:`, tasksRes.rows);
        }
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await pool.end();
    }
}

test();
