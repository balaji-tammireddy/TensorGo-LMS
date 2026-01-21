import { pool } from './src/database/db';

async function checkData() {
    try {
        const types = await pool.query('SELECT * FROM leave_types');
        console.log('--- LEAVE TYPES ---');
        console.table(types.rows);

        const configs = await pool.query('SELECT role, leave_type_id, annual_credit, effective_from FROM leave_policy_configurations');
        console.log('\n--- LEAVE POLICY CONFIGURATIONS ---');
        console.table(configs.rows);
    } catch (err) {
        console.error('Error checking data:', err);
    } finally {
        await pool.end();
    }
}

checkData();
