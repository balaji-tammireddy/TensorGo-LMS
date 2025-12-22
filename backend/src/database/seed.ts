import { pool } from './db';
import { hashPassword } from '../services/auth.service';

async function seed() {
  try {
    // Create a super admin user
    const superAdminPassword = await hashPassword('admin123');
    const superAdminResult = await pool.query(
      `INSERT INTO users (
        emp_id, email, password_hash, role, first_name, last_name,
        designation, department, date_of_joining, status
      ) VALUES (
        'SA001', 'admin@tensorgo.com', $1, 'super_admin', 'Super', 'Admin',
        'Administrator', 'IT', CURRENT_DATE, 'active'
      ) ON CONFLICT (emp_id) DO NOTHING
      RETURNING id`,
      [superAdminPassword]
    );

    // Create an HR user (update password if exists)
    const hrPassword = await hashPassword('hr1234');
    const hrResult = await pool.query(
      `INSERT INTO users (
        emp_id, email, password_hash, role, first_name, last_name,
        designation, department, date_of_joining, status, reporting_manager_id
      ) VALUES (
        'HR001', 'hr@tensorgo.com', $1, 'hr', 'HR', 'Manager',
        'HR Manager', 'HR', CURRENT_DATE, 'active', $2
      ) ON CONFLICT (emp_id) DO UPDATE 
        SET password_hash = EXCLUDED.password_hash,
            email = EXCLUDED.email,
            status = 'active'
      RETURNING id`,
      [hrPassword, superAdminResult.rows[0]?.id || null]
    );

    // Create a manager user
    const managerPassword = await hashPassword('manager123');
    const managerResult = await pool.query(
      `INSERT INTO users (
        emp_id, email, password_hash, role, first_name, last_name,
        designation, department, date_of_joining, status, reporting_manager_id
      ) VALUES (
        'M001', 'balaji@tensorgo.com', $1, 'manager', 'Balaji', '',
        'Team Lead', 'IT - Engineering', CURRENT_DATE, 'active', $2
      ) ON CONFLICT (emp_id) DO NOTHING
      RETURNING id`,
      [managerPassword, hrResult.rows[0]?.id || null]
    );

    // Create sample employees
    const employeePassword = await hashPassword('emp123');
    await pool.query(
      `INSERT INTO users (
        emp_id, email, password_hash, role, first_name, last_name,
        designation, department, date_of_joining, status, reporting_manager_id
      ) VALUES 
        ('121', 'jaiwanth@tensorgo.com', $1, 'employee', 'Jaiwanth', '',
         'Software Developer', 'IT - Engineering', '2020-07-15', 'active', $2),
        ('122', 'xyz@tensorgo.com', $1, 'employee', 'Xyz', '',
         'Developer', 'IT - Engineering', '2021-01-10', 'active', $2),
        ('125', 'abc@tensorgo.com', $1, 'employee', 'Abc', '',
         'Developer', 'IT - Engineering', '2021-03-20', 'active', $2)
      ON CONFLICT (emp_id) DO NOTHING`,
      [employeePassword, managerResult.rows[0]?.id || null]
    );

    // Initialize leave balances for all users
    await pool.query(
      `INSERT INTO leave_balances (employee_id, casual_balance, sick_balance, lop_balance)
       SELECT id, 12, 6, 10 FROM users
       WHERE id NOT IN (SELECT employee_id FROM leave_balances)
       ON CONFLICT (employee_id) DO NOTHING`
    );

    // Refresh 2025 holidays to match the latest calendar
    await pool.query('BEGIN');
    await pool.query('DELETE FROM holidays');
    await pool.query(
      `INSERT INTO holidays (holiday_date, holiday_name, is_active) VALUES
        ('2025-01-01', 'New Year Day', true),
        ('2025-01-14', 'Sankranti', true),
        ('2025-02-26', 'Maha Shivaratri', true),
        ('2025-03-14', 'Holi', true),
        ('2025-08-15', 'Independence Day', true),
        ('2025-08-27', 'Ganesh Chaturthi', true),
        ('2025-10-02', 'Dussera', true),
        ('2025-10-20', 'Deepavali', true),
        ('2025-10-21', 'Govardhan Puja', true),
        ('2025-12-25', 'Christmas', true)`
    );
    await pool.query('COMMIT');

    console.log('Seed data created successfully');
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('Seed failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();

