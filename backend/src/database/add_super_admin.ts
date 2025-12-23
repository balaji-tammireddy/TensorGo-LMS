import { pool } from './db';
import { hashPassword } from '../services/auth.service';

/**
 * Upserts a super admin user.
 *
 * Configure via env if needed:
 * - SUPER_ADMIN_EMAIL
 * - SUPER_ADMIN_PASSWORD
 * - SUPER_ADMIN_EMP_ID
 * - SUPER_ADMIN_FIRST_NAME
 * - SUPER_ADMIN_LAST_NAME
 * - SUPER_ADMIN_DOJ (YYYY-MM-DD)
 */
const email = process.env.SUPER_ADMIN_EMAIL || 'superadmin@tensorgo.com';
const password = process.env.SUPER_ADMIN_PASSWORD || 'SuperAdmin@123';
const empId = process.env.SUPER_ADMIN_EMP_ID || 'SA-0001';
const firstName = process.env.SUPER_ADMIN_FIRST_NAME || 'Super';
const lastName = process.env.SUPER_ADMIN_LAST_NAME || 'Admin';
const dateOfJoining = process.env.SUPER_ADMIN_DOJ || new Date().toISOString().slice(0, 10);

async function upsertSuperAdmin() {
  try {
    const passwordHash = await hashPassword(password);

    await pool.query(
      `
      INSERT INTO users (
        emp_id,
        email,
        password_hash,
        role,
        first_name,
        last_name,
        date_of_joining,
        status,
        must_change_password
      )
      VALUES ($1, $2, $3, 'super_admin', $4, $5, $6, 'active', false)
      ON CONFLICT (email) DO UPDATE SET
        emp_id = EXCLUDED.emp_id,
        password_hash = EXCLUDED.password_hash,
        role = 'super_admin',
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        date_of_joining = EXCLUDED.date_of_joining,
        status = 'active',
        must_change_password = false,
        updated_at = CURRENT_TIMESTAMP;
      `,
      [empId, email, passwordHash, firstName, lastName, dateOfJoining]
    );

    console.log('✅ Super admin ready');
    console.log(`Email: ${email}`);
    console.log(`Emp ID: ${empId}`);
    console.log(`Temporary password: ${password}`);
  } catch (error) {
    console.error('❌ Error upserting super admin:', error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

upsertSuperAdmin();

