import { pool } from './src/database/db';

async function checkAllUpdatedBy() {
    try {
        const res = await pool.query(
            "SELECT table_name FROM information_schema.columns WHERE column_name = 'updated_by' AND table_schema = 'public' ORDER BY table_name"
        );
        console.log('Tables with updated_by column:', res.rows.map(r => r.table_name));
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await pool.end();
    }
}

checkAllUpdatedBy();
