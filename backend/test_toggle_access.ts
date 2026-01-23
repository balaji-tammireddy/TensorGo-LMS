import { ProjectService } from './src/services/projectService';
import { pool } from './src/database/db';

async function testToggle() {
    try {
        console.log('--- Testing Atomic Toggle Concurrency ---');

        // 1. Setup identifiers
        const moduleRes = await pool.query('SELECT id FROM project_modules LIMIT 1');
        if (moduleRes.rows.length === 0) {
            console.log('No modules found to test.');
            return;
        }
        const moduleId = moduleRes.rows[0].id;

        const usersRes = await pool.query('SELECT id FROM users LIMIT 10');
        const userIds = usersRes.rows.map(r => r.id);
        if (userIds.length < 3) {
            console.log('Not enough users for test.');
            return;
        }
        const [u1, u2, u3] = userIds;
        const requestedBy = userIds[userIds.length - 1];

        // 2. Clear initial state for these users
        await pool.query('DELETE FROM module_access WHERE module_id = $1 AND user_id = ANY($2)', [moduleId, [u1, u2, u3]]);
        console.log(`Cleared module ${moduleId} for users ${u1}, ${u2}, ${u3}`);

        // 3. Simulating rapid simultaneous additions
        console.log('Sending simultaneous ADD requests...');
        await Promise.all([
            ProjectService.toggleAccess('module', moduleId, u1, 'add', requestedBy),
            ProjectService.toggleAccess('module', moduleId, u2, 'add', requestedBy),
            ProjectService.toggleAccess('module', moduleId, u3, 'add', requestedBy)
        ]);

        // 4. Verify all 3 added
        const checkAdd = await pool.query('SELECT user_id FROM module_access WHERE module_id = $1 AND user_id = ANY($2)', [moduleId, [u1, u2, u3]]);
        console.log(`Assigned count (expected 3): ${checkAdd.rows.length}`);
        if (checkAdd.rows.length === 3) {
            console.log('SUCCESS: All simultaneous additions persisted.');
        } else {
            console.error('FAILED: Some additions were lost!');
        }

        // 5. Simulating rapid removals
        console.log('Sending simultaneous REMOVE requests for user 1 and user 2...');
        await Promise.all([
            ProjectService.toggleAccess('module', moduleId, u1, 'remove', requestedBy),
            ProjectService.toggleAccess('module', moduleId, u2, 'remove', requestedBy)
        ]);

        // 6. Verify only user 3 remains
        const checkRem = await pool.query('SELECT user_id FROM module_access WHERE module_id = $1 AND user_id = ANY($2)', [moduleId, [u1, u2, u3]]);
        console.log(`Remaining assigned count (expected 1): ${checkRem.rows.length}`);
        const remainingIds = checkRem.rows.map(r => r.user_id);
        if (remainingIds.length === 1 && remainingIds[0] === u3) {
            console.log('SUCCESS: Atomic removals worked as expected.');
        } else {
            console.error('FAILED: Removal state is inconsistent!', remainingIds);
        }

        console.log('--- Test Complete ---');
    } catch (err) {
        console.error('Test failed with error:', err);
    } finally {
        await pool.end();
    }
}

testToggle();
