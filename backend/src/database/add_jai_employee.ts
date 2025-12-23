import { pool } from './db';
import { hashPassword } from '../services/auth.service';

/**
 * Adds an employee named "Jai"
 */
const email = process.env.JAI_EMAIL || 'jai@tensorgo.com';
const password = process.env.JAI_PASSWORD || 'Jai@123';
const empId = process.env.JAI_EMP_ID || '1001';
const firstName = process.env.JAI_FIRST_NAME || 'Jai';
const lastName = process.env.JAI_LAST_NAME || '';
const dateOfJoining = process.env.JAI_DOJ || new Date().toISOString().slice(0, 10);

async function addJaiEmployee() {
  try {
    // Check if employee already exists
    const existingResult = await pool.query(
      'SELECT id FROM users WHERE emp_id = $1 OR email = $2',
      [empId, email]
    );

    if (existingResult.rows.length > 0) {
      console.log('⚠️  Employee already exists with this emp_id or email');
      return;
    }

    const passwordHash = await hashPassword(password);

    // Insert employee
    const result = await pool.query(
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
      VALUES ($1, $2, $3, 'employee', $4, $5, $6, 'active', false)
      RETURNING id
      `,
      [empId, email, passwordHash, firstName, lastName, dateOfJoining]
    );

    const userId = result.rows[0].id;

    // Initialize leave balance (casual = 0 for employees)
    await pool.query(
      'INSERT INTO leave_balances (employee_id, casual_balance, sick_balance, lop_balance) VALUES ($1, 0, 6, 10)',
      [userId]
    );

    console.log('✅ Employee "Jai" added successfully');
    console.log(`Email: ${email}`);
    console.log(`Emp ID: ${empId}`);
    console.log(`Temporary password: ${password}`);
  } catch (error) {
    console.error('❌ Error adding employee:', error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

addJaiEmployee();

