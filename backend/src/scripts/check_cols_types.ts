
import { pool } from '../database/db';

async function checkUsersTable() {
    try {
        const res = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'users' AND column_name IN ('created_by', 'updated_by')");
        console.table(res.rows);
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}
checkUsersTable();
