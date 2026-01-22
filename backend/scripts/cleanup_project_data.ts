
import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

// Fix: resolve path relative to this script in backend/scripts
const envPath = path.resolve(__dirname, '../.env');
console.log('Loading .env from:', envPath);
dotenv.config({ path: envPath });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

async function cleanupData() {
    const client = await pool.connect();
    try {
        console.log('Starting data cleanup...');

        // Check if connected
        console.log('Connected to database:', process.env.DB_NAME || 'via DATABASE_URL');

        // Truncate tables in order of dependency
        await client.query('TRUNCATE TABLE projects RESTART IDENTITY CASCADE;');

        console.log('Successfully truncated project management tables.');
    } catch (error) {
        console.error('Error during data cleanup:', error);
    } finally {
        client.release();
        pool.end();
    }
}

cleanupData();
