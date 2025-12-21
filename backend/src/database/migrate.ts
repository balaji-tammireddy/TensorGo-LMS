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
    
    // Insert default leave rules
    await pool.query(`
      INSERT INTO leave_rules (leave_required_min, leave_required_max, prior_information_days, is_active)
      VALUES 
        (0.5, 4, 3, true),
        (4, 10, 14, true),
        (10, NULL, 30, true)
      ON CONFLICT DO NOTHING
    `);
    
    // Insert sample holidays
    await pool.query(`
      INSERT INTO holidays (holiday_date, holiday_name, is_active)
      VALUES 
        ('2025-01-01', 'New Year', true),
        ('2025-01-14', 'Sankranthi', true),
        ('2025-01-26', 'Republic Day', true),
        ('2025-02-26', 'Maha Shivaratri', true),
        ('2025-03-08', 'Holi', true),
        ('2025-03-29', 'Good Friday', true),
        ('2025-04-14', 'Ambedkar Jayanti', true),
        ('2025-04-17', 'Ramzan', true),
        ('2025-05-01', 'Labour Day', true),
        ('2025-06-17', 'Eid ul-Fitr', true),
        ('2025-08-15', 'Independence Day', true),
        ('2025-08-26', 'Raksha Bandhan', true),
        ('2025-09-07', 'Ganesh Chaturthi', true),
        ('2025-10-02', 'Gandhi Jayanti', true),
        ('2025-10-12', 'Dussehra', true),
        ('2025-10-27', 'Diwali', true),
        ('2025-11-15', 'Guru Nanak Jayanti', true),
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

