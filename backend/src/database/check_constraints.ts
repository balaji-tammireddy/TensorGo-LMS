import { pool } from './db';

async function checkConstraints() {
    try {
        const statusConstraint = await pool.query(`
      SELECT conname, pg_get_constraintdef(c.oid)
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE conname = 'users_status_check';
    `);
        console.log('Status Constraint:', JSON.stringify(statusConstraint.rows, null, 2));

        const roleConstraint = await pool.query(`
      SELECT conname, pg_get_constraintdef(c.oid)
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE conname = 'users_role_check' OR (conname LIKE '%role%' AND conname LIKE '%users%');
    `);
        console.log('Role Constraints:', JSON.stringify(roleConstraint.rows, null, 2));

    } catch (error) {
        console.error('Check failed:', error);
    } finally {
        await pool.end();
    }
}

checkConstraints();
