import { pool } from './src/database/db';

async function checkUserType() {
    try {
        const res = await pool.query(
            "SELECT data_type FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'id'"
        );
        console.log('Users ID Type:', res.rows[0].data_type);
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await pool.end();
    }
}

checkUserType();
