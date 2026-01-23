
import { ProjectService } from './src/services/projectService';
import { pool } from './src/database/db';

async function test() {
    try {
        // Find a module and a user
        const modRes = await pool.query('SELECT id FROM project_modules LIMIT 1');
        const userRes = await pool.query('SELECT id FROM users WHERE user_role != \'pm\' LIMIT 1');

        if (modRes.rows.length === 0 || userRes.rows.length === 0) {
            console.log('No module or user found to test with.');
            return;
        }

        const moduleId = modRes.rows[0].id;
        const userId = userRes.rows[0].id;
        const pmId = 1; // Assume some ID for granter

        console.log(`Testing with moduleId=${moduleId}, userId=${userId}`);

        // 1. ADD
        console.log('--- Action: ADD ---');
        const addResult = await ProjectService.toggleAccess('module', moduleId, userId, 'add', pmId);
        console.log('Add Result:', JSON.stringify(addResult, null, 2));

        // 2. CHECK DB
        const checkRes = await pool.query('SELECT * FROM module_access WHERE module_id = $1 AND user_id = $2', [moduleId, userId]);
        console.log('DB Check after ADD:', checkRes.rows.length === 1 ? 'SUCCESS' : 'FAILED');

        // 3. REMOVE
        console.log('--- Action: REMOVE ---');
        const removeResult = await ProjectService.toggleAccess('module', moduleId, userId, 'remove', pmId);
        console.log('Remove Result:', JSON.stringify(removeResult, null, 2));

        // 4. CHECK DB
        const checkRes2 = await pool.query('SELECT * FROM module_access WHERE module_id = $1 AND user_id = $2', [moduleId, userId]);
        console.log('DB Check after REMOVE:', checkRes2.rows.length === 0 ? 'SUCCESS' : 'FAILED');

    } catch (err) {
        console.error('Test Error:', err);
    } finally {
        await pool.end();
    }
}

test();
