const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function checkUser(id) {
    try {
        const res = await pool.query('SELECT emp_id, email, alt_contact, emergency_contact_no FROM users WHERE id = $1', [id]);
        console.log(JSON.stringify(res.rows[0], null, 2));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

// Checking user ID 25 as seen in logs
checkUser(25);
