
import { pool } from '../database/db';

const addInternRole = async () => {
    const client = await pool.connect();
    try {
        console.log('🔄 Starting migration to add "intern" role...');

        await client.query('BEGIN');

        // 1. Drop existing constraint
        console.log('Dropping existing check constraint on users.role...');
        // We need to find the constraint name first, but usually it's something like users_role_check
        // Or we can just try to drop it if we know the name or drop the column default/check.
        // However, since we don't know the exact name, let's look it up or do a generic drop of the check.
        // Actually, in the initial schema it was defined inline: CHECK (role IN (...))
        // Postgres usually names it users_role_check.

        await client.query('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check');

        // 2. Add new constraint including 'intern'
        console.log('Adding new check constraint including "intern"...');
        await client.query(`
      ALTER TABLE users 
      ADD CONSTRAINT users_role_check 
      CHECK (role IN ('employee', 'manager', 'hr', 'super_admin', 'intern'))
    `);

        await client.query('COMMIT');
        console.log('✅ Successfully added "intern" role to users table constraint.');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Error adding "intern" role:', error);
    } finally {
        client.release();
        process.exit();
    }
};

addInternRole();
