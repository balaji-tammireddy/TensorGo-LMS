import { pool } from './db';

async function checkConstraints() {
    try {
        const query = `
            SELECT 
                n.nspname as schema_name,
                t.relname as table_name,
                c.conname as constraint_name,
                pg_get_constraintdef(c.oid) as constraint_definition
            FROM pg_constraint c
            JOIN pg_namespace n ON n.oid = c.connamespace
            JOIN pg_class t ON t.oid = c.conrelid
            WHERE c.conname = 'users_status_check' OR c.conname = 'users_role_check';
        `;
        const result = await pool.query(query);
        console.log('Constraints Details:', JSON.stringify(result.rows, null, 2));

    } catch (error) {
        console.error('Check failed:', error);
    } finally {
        await pool.end();
    }
}

checkConstraints();
