import { pool } from './src/database/db';

async function fixSchema() {
    const client = await pool.connect();
    try {
        console.log('Adding missing columns to leave_requests...');
        await client.query(`
      ALTER TABLE leave_requests 
      ADD COLUMN IF NOT EXISTS last_updated_by INTEGER REFERENCES users(id),
      ADD COLUMN IF NOT EXISTS last_updated_by_role VARCHAR(20) DEFAULT NULL;
    `);
        console.log('✅ Columns added successfully.');
    } catch (error) {
        console.error('❌ Error adding columns:', error);
    } finally {
        client.release();
        process.exit();
    }
}

fixSchema();
