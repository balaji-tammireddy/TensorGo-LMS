import { pool } from '../database/db';
import { ProjectService } from './projectService';

async function test() {
    try {
        // Let's find a moduleId
        const res = await pool.query('SELECT id FROM project_modules LIMIT 1');
        if (res.rows.length === 0) {
            console.log('No modules found');
            return;
        }
        const moduleId = res.rows[0].id;
        console.log('Testing moduleId:', moduleId);

        // Get tasks
        const tasksRes = await ProjectService.getTasksForModule(moduleId, 1, 'super_admin');
        console.log('Tasks found:', tasksRes.rows.length);
        console.log('First task:', JSON.stringify(tasksRes.rows[0], null, 2));
    } catch (error) {
        console.error('Error testing ProjectService:', error);
    } finally {
        await pool.end();
    }
}

test();
