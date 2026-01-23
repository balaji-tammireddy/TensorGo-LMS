
import { pool } from './database/db';
import dotenv from 'dotenv';
dotenv.config();

const listUsers = async () => {
    try {
        const res = await pool.query('SELECT id, email, user_role as role, status FROM users LIMIT 5');
        console.log('Users:', res.rows);
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await pool.end();
    }
};

listUsers();
