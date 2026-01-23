
import { pool } from './src/database/db';
async function run() {
    const res = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'module_access'");
    console.table(res.rows);
    await pool.end();
}
run();
