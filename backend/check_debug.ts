
import { pool } from './src/database/db';

async function checkUser() {
    try {
        const userRes = await pool.query("SELECT id, first_name, last_name, role, emp_id, reporting_manager_id FROM users WHERE emp_id = '004' OR first_name ILIKE '%Jaiwanth%';");
        console.log('User Details:', userRes.rows);

        if (userRes.rows.length > 0) {
            const userId = userRes.rows[0].id;
            const balanceRes = await pool.query("SELECT * FROM leave_balances WHERE employee_id = $1;", [userId]);
            console.log('Leave Balances:', balanceRes.rows);

            const countSubordinates = await pool.query("SELECT count(*) FROM users WHERE reporting_manager_id = $1;", [userId]);
            console.log('Subordinates count:', countSubordinates.rows[0].count);
        }
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await pool.end();
    }
}

checkUser();
