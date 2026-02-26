import { pool } from '../database/db';

async function inspect() {
    try {
        console.log('--- DB INSPECTION ---');

        const projects = await pool.query("SELECT id, custom_id, name FROM projects WHERE custom_id = 'PRO-035'");
        console.log('Project PRO-035:', projects.rows);

        if (projects.rows.length > 0) {
            const projectId = projects.rows[0].id;
            const modules = await pool.query("SELECT id, custom_id, name FROM project_modules WHERE project_id = $1", [projectId]);
            console.log('Modules for PRO-035:', modules.rows);

            for (const m of modules.rows) {
                const tasks = await pool.query("SELECT id, custom_id, name, module_id FROM project_tasks WHERE module_id = $1", [m.id]);
                console.log(`Tasks for module ${m.custom_id} (ID: ${m.id}):`, tasks.rows);
            }
        } else {
            console.log('Project PRO-035 not found');
        }

    } catch (error) {
        console.error('Inspection failed:', error);
    } finally {
        await pool.end();
    }
}

inspect();
