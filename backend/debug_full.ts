
import { pool } from './src/database/db';

async function run() {
    try {
        const userId = 9;
        console.log('--- Testing User 9 (Jaiwanth) ---');
        const user = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
        console.log('User:', user.rows[0]);

        const balanceQuery = 'SELECT casual_balance, sick_balance, lop_balance FROM leave_balances WHERE employee_id = $1';
        const balanceResult = await pool.query(balanceQuery, [userId]);
        console.log('Balances:', balanceResult.rows);

        const historyQuery = 'SELECT leave_type, start_date, status, created_at FROM leave_requests WHERE employee_id = $1 ORDER BY created_at DESC LIMIT 3';
        const historyResult = await pool.query(historyQuery, [userId]);
        console.log('History:', historyResult.rows);

        console.log('--- Testing Global Hierarchy Data ---');
        const hierarchyQuery = `
            SELECT id, first_name, last_name, role, reporting_manager_id, status 
            FROM users 
            WHERE status IN ('active', 'on_leave', 'on_notice')
        `;
        const hierarchyRes = await pool.query(hierarchyQuery);
        console.log('Total Active Users:', hierarchyRes.rows.length);
        console.log('Roots (reporting_manager_id IS NULL):', hierarchyRes.rows.filter(r => !r.reporting_manager_id));

    } catch (err) {
        console.error('Debug Script Error:', err);
    } finally {
        await pool.end();
    }
}
run();
