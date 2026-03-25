import { pool } from '../database/db';

const leaveData = [
    { "emp_id": "TG10001", "casual": null, "sick": null, "lop": null },
    { "emp_id": "TG10002", "casual": null, "sick": null, "lop": null },
    { "emp_id": "TG10003", "casual": 1.0, "sick": 0.5, "lop": 10.0 },
    { "emp_id": "TG20005", "casual": 1.0, "sick": 0.5, "lop": 10.0 },
    { "emp_id": "TG20006", "casual": 1.0, "sick": 0.5, "lop": 10.0 },
    { "emp_id": "TG20014", "casual": 1.0, "sick": 0.5, "lop": 10.0 },
    { "emp_id": "TG20017", "casual": 1.0, "sick": 0.5, "lop": 10.0 },
    { "emp_id": "TG20018", "casual": 1.0, "sick": 0.5, "lop": 10.0 },
    { "emp_id": "TG20025", "casual": 1.0, "sick": 0.5, "lop": 10.0 },
    { "emp_id": "TG20026", "casual": 1.0, "sick": 0.5, "lop": 10.0 },
    { "emp_id": "TG20024", "casual": 1.0, "sick": 0.5, "lop": 10.0 },
    { "emp_id": "TG30046", "casual": 0.5, "sick": 0.5, "lop": 10.0 },
    { "emp_id": "TG30051", "casual": 0.5, "sick": 0.5, "lop": 10.0 },
    { "emp_id": "TG30059", "casual": 0.5, "sick": 0.5, "lop": 10.0 },
    { "emp_id": "TG30061", "casual": 0.5, "sick": 0.5, "lop": 10.0 },
    { "emp_id": "TG30062", "casual": 0.5, "sick": 0.5, "lop": 10.0 },
    { "emp_id": "TG30063", "casual": 0.5, "sick": 0.5, "lop": 10.0 },
    { "emp_id": "TG30064", "casual": 0.5, "sick": 0.5, "lop": 10.0 },
    { "emp_id": "TG30065", "casual": 0.5, "sick": 0.5, "lop": 10.0 },
    { "emp_id": "TG30066", "casual": 0.5, "sick": 0.5, "lop": 10.0 },
    { "emp_id": "TG30067", "casual": 0.5, "sick": 0.5, "lop": 10.0 },
    { "emp_id": "TG30068", "casual": 0.5, "sick": 0.5, "lop": 10.0 },
    { "emp_id": "TG30069", "casual": 0.5, "sick": 0.5, "lop": 10.0 },
    { "emp_id": "TG30070", "casual": 0.5, "sick": 0.5, "lop": 10.0 },
    { "emp_id": "TG40019", "casual": 0.5, "sick": 0.5, "lop": 10.0 }
];

const ADMIN_ID = 64; // Super Admin (TG10002)

async function importLeaveBalances() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        console.log('Starting leave balance import...');

        for (const data of leaveData) {
            // Skip if all balances are null
            if (data.casual === null && data.sick === null && data.lop === null) {
                console.log(`Skipping ${data.emp_id} (all nulls)`);
                continue;
            }

            // Find user id by emp_id
            const userRes = await client.query('SELECT id FROM users WHERE emp_id = $1', [data.emp_id]);
            if (userRes.rows.length === 0) {
                console.warn(`User with emp_id ${data.emp_id} not found.`);
                continue;
            }
            const userId = userRes.rows[0].id;

            // Upsert leave balances
            await client.query(`
                INSERT INTO leave_balances (employee_id, casual_balance, sick_balance, lop_balance, last_updated, created_by, updated_by)
                VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, $5, $5)
                ON CONFLICT (employee_id) DO UPDATE SET
                    casual_balance = EXCLUDED.casual_balance,
                    sick_balance = EXCLUDED.sick_balance,
                    lop_balance = EXCLUDED.lop_balance,
                    last_updated = CURRENT_TIMESTAMP,
                    updated_by = $5
            `, [userId, data.casual || 0, data.sick || 0, data.lop || 0, ADMIN_ID]);

            console.log(`Updated balances for ${data.emp_id} (UserID: ${userId})`);
        }

        await client.query('COMMIT');
        console.log('Leave balance import completed successfully.');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error importing leave balances:', error);
    } finally {
        client.release();
        await pool.end();
    }
}

importLeaveBalances();
