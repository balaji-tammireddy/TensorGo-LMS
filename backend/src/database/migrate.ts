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
    
    // Insert default leave rules
    await pool.query(`
      INSERT INTO leave_rules (leave_required_min, leave_required_max, prior_information_days, is_active)
      VALUES 
        (0.5, 4, 3, true),
        (4, 10, 14, true),
        (10, NULL, 30, true)
      ON CONFLICT DO NOTHING
    `);
    
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
    
    console.log('Default data inserted');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();

