
import { pool } from '../database/db';

async function checkUsersTable() {
    try {
        const res = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'users' ORDER BY column_name");
        console.log(res.rows.map(r => r.column_name).join(', '));
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}
checkUsersTable();
