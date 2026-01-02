import { readFileSync } from 'fs';
import { join } from 'path';
import { pool } from './db';

async function migrate() {
  try {
    const migrationFile = readFileSync(
      join(__dirname, 'migrations', '001_initial_schema.sql'),
      'utf-8'
    );

    await pool.query(migrationFile);
    console.log('Migration completed successfully');

    // Ensure current_status supports partially_approved (idempotent)
    await pool.query(`
      ALTER TABLE leave_requests
      DROP CONSTRAINT IF EXISTS leave_requests_current_status_check;
      ALTER TABLE leave_requests
      ADD CONSTRAINT leave_requests_current_status_check
      CHECK (current_status IN ('pending','approved','rejected','cancelled','partially_approved'));
    `);

    // Add day_status to leave_days (idempotent)
    await pool.query(`
      ALTER TABLE leave_days
      ADD COLUMN IF NOT EXISTS day_status VARCHAR(20) DEFAULT 'pending' CHECK (day_status IN ('pending','approved','rejected'));
      UPDATE leave_days SET day_status = 'pending' WHERE day_status IS NULL;
    `);

    // Ensure leave_type supports permission (idempotent)
    await pool.query(`
      ALTER TABLE leave_requests 
      DROP CONSTRAINT IF EXISTS leave_requests_leave_type_check;
      ALTER TABLE leave_requests 
      ADD CONSTRAINT leave_requests_leave_type_check 
      CHECK (leave_type IN ('casual', 'sick', 'lop', 'permission'));
    `);

    // Add doctor_note column for sick leave prescriptions (idempotent)
    await pool.query(`
      ALTER TABLE leave_requests
      ADD COLUMN IF NOT EXISTS doctor_note TEXT;
    `);

    // Add last_updated_by and last_updated_by_role columns for tracking last approver (idempotent)
    await pool.query(`
      ALTER TABLE leave_requests
      ADD COLUMN IF NOT EXISTS last_updated_by INTEGER REFERENCES users(id);
      ALTER TABLE leave_requests
      ADD COLUMN IF NOT EXISTS last_updated_by_role VARCHAR(20) CHECK (last_updated_by_role IN ('manager', 'hr', 'super_admin'));
    `);

    // Ensure LOP balance never exceeds 10 (idempotent)
    await pool.query(`
      ALTER TABLE leave_balances
      DROP CONSTRAINT IF EXISTS leave_balances_lop_balance_max_check;
      ALTER TABLE leave_balances
      ADD CONSTRAINT leave_balances_lop_balance_max_check
      CHECK (lop_balance <= 10);
    `);

    // Leave rules insertion disabled - rules cannot be changed until explicitly enabled
    // await pool.query(`
    //   INSERT INTO leave_rules (leave_required_min, leave_required_max, prior_information_days, is_active)
    //   VALUES 
    //     (0.5, 4, 3, true),
    //     (4, 10, 14, true),
    //     (10, NULL, 30, true)
    //   ON CONFLICT DO NOTHING
    // `);

    // Insert sample holidays (2025 calendar)
    await pool.query(`
      INSERT INTO holidays (holiday_date, holiday_name, is_active)
      VALUES 
        ('2025-01-01', 'New Year Day', true),
        ('2025-01-14', 'Sankranti', true),
        ('2025-02-26', 'Maha Shivaratri', true),
        ('2025-03-14', 'Holi', true),
        ('2025-08-15', 'Independence Day', true),
        ('2025-08-27', 'Ganesh Chaturthi', true),
        ('2025-10-02', 'Dussera', true),
        ('2025-10-20', 'Deepavali', true),
        ('2025-10-21', 'Govardhan Puja', true),
        ('2025-12-25', 'Christmas', true)
      ON CONFLICT (holiday_date) DO NOTHING
    `);

    // Update existing employees' casual and sick leave balances to 0 (remove defaults)
    const updateResult = await pool.query(`
      UPDATE leave_balances
      SET casual_balance = 0,
          sick_balance = 0,
          last_updated = CURRENT_TIMESTAMP
      WHERE casual_balance != 0 OR sick_balance != 0
    `);
    console.log(`Updated ${updateResult.rowCount} employee leave balance records (casual and sick set to 0)`);

    // Run password reset OTP migration
    try {
      const otpMigrationFile = readFileSync(
        join(__dirname, 'migrations', '002_add_password_reset_otp.sql'),
        'utf-8'
      );
      await pool.query(otpMigrationFile);
      console.log('Password reset OTP table migration completed');
    } catch (otpError: any) {
      // If table already exists, that's fine
      if (!otpError.message.includes('already exists')) {
        console.warn('OTP migration warning:', otpError.message);
      }
    }

    // Run urgent flag migration
    try {
      const urgentMigrationFile = readFileSync(
        join(__dirname, 'migrations', '003_add_urgent_flag_to_leave_requests.sql'),
        'utf-8'
      );
      await pool.query(urgentMigrationFile);
      console.log('Urgent flag migration completed');
    } catch (urgentError: any) {
      if (!urgentError.message.includes('already exists') && !urgentError.message.includes('duplicate')) {
        console.warn('Urgent flag migration warning:', urgentError.message);
      }
    }

    // Run policies table migration
    try {
      const policiesMigrationFile = readFileSync(
        join(__dirname, 'migrations', '004_create_policies_table.sql'),
        'utf-8'
      );
      await pool.query(policiesMigrationFile);
      console.log('Policies table migration completed');
    } catch (policiesError: any) {
      if (!policiesError.message.includes('already exists')) {
        console.warn('Policies migration warning:', policiesError.message);
      }
    }

    console.log('Default data inserted');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();

