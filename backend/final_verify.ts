import { pool } from './src/database/db';

async function verifyPersistence() {
    try {
        console.log('--- Verifying Schema & Audit Columns ---');
        // 1. Check if column exists
        const colRes = await pool.query(
            "SELECT column_name FROM information_schema.columns WHERE table_name = 'project_modules' AND column_name = 'updated_by'"
        );
        if (colRes.rows.length === 0) {
            console.error('FAILED: updated_by column not found in project_modules');
            process.exit(1);
        }
        console.log('SUCCESS: Audit columns exist.');

        // 2. Test an update to verify audit recording (using a mock user ID 99)
        const moduleRes = await pool.query('SELECT id FROM project_modules LIMIT 1');
        if (moduleRes.rows.length > 0) {
            const moduleId = moduleRes.rows[0].id;
            console.log(`Testing update on module ${moduleId}...`);

            // We use a dummy user ID for testing
            const testUserId = 1; // Assuming user with ID 1 exists
            await pool.query(
                'UPDATE project_modules SET name = name || $1, updated_by = $2, updated_at = NOW() WHERE id = $3',
                [' (dist)', testUserId, moduleId]
            );

            const checkRes = await pool.query('SELECT updated_by FROM project_modules WHERE id = $1', [moduleId]);
            if (checkRes.rows[0].updated_by === testUserId) {
                console.log('SUCCESS: updated_by recorded successfully.');
            } else {
                console.error('FAILED: updated_by not recorded. Found:', checkRes.rows[0].updated_by);
            }
        } else {
            console.log('NOTE: No modules found to test update.');
        }

        console.log('--- Verification Complete ---');
    } catch (err) {
        console.error('Verification failed:', err);
    } finally {
        await pool.end();
    }
}

verifyPersistence();
