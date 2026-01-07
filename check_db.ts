import { Pool } from 'pg';

const pool = new Pool({
    connectionString: 'postgresql://hr_user:hr_password_123@localhost:5432/hr_lms_db'
});

async function check() {
    try {
        const res = await pool.query('SELECT id, employee_id, current_status FROM leave_requests WHERE id = 81');
        console.log('Request 81:', JSON.stringify(res.rows, null, 2));
        const user = await pool.query('SELECT id, role, reporting_manager_id FROM users WHERE id = 14');
        console.log('User 14:', JSON.stringify(user.rows, null, 2));

        if (res.rows.length > 0 && user.rows.length > 0) {
            const u = user.rows[0];
            const r = res.rows[0];
            console.log(`Checking permission: r.employee_id (${r.employee_id}) === userId (14): ${r.employee_id === 14}`);
        }
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

check();
