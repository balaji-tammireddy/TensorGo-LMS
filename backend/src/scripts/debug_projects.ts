
import { pool } from '../database/db';

const checkProjects = async () => {
    const client = await pool.connect();
    try {
        console.log('Checking projects table...');
        const res = await client.query('SELECT * FROM projects');
        console.log(`Total Projects Found: ${res.rows.length}`);
        if (res.rows.length > 0) {
            console.log('First 3 projects:');
            console.log(JSON.stringify(res.rows.slice(0, 3), null, 2));
        } else {
            console.log('No projects found in the database.');
        }

        console.log('\nChecking active users with role super_admin...');
        const adminRes = await client.query("SELECT id, email, user_role FROM users WHERE user_role = 'super_admin'");
        console.log(JSON.stringify(adminRes.rows, null, 2));

    } catch (err) {
        console.error('Error executing query', err);
    } finally {
        client.release();
        pool.end();
    }
};

checkProjects();
