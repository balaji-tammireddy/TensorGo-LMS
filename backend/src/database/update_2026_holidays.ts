import { pool } from './db';

async function update2026Holidays() {
  try {
    console.log('Updating 2026 holidays...');
    
    // Delete all existing holidays for 2026
    const deleteResult = await pool.query(
      `DELETE FROM holidays WHERE EXTRACT(YEAR FROM holiday_date) = 2026`
    );
    console.log(`Deleted ${deleteResult.rowCount} existing 2026 holidays`);
    
    // Insert new holidays for 2026
    await pool.query(`
      INSERT INTO holidays (holiday_date, holiday_name, is_active)
      VALUES 
        ('2026-01-01', 'New Year Day', true),
        ('2026-01-14', 'Sankranti', true),
        ('2026-02-15', 'Maha Shivaratri', true),
        ('2026-03-04', 'Holi', true),
        ('2026-08-15', 'Independence Day', true),
        ('2026-09-14', 'Ganesh Chaturthi', true),
        ('2026-10-20', 'Dussera', true),
        ('2026-11-08', 'Deepavali', true),
        ('2026-11-10', 'Govardhan Puja', true),
        ('2026-12-25', 'Christmas', true)
      ON CONFLICT (holiday_date) DO UPDATE
      SET holiday_name = EXCLUDED.holiday_name,
          is_active = EXCLUDED.is_active
    `);
    
    console.log('Successfully updated 2026 holidays');
    
    // Display the updated holidays
    const result = await pool.query(
      `SELECT holiday_date, holiday_name FROM holidays 
       WHERE EXTRACT(YEAR FROM holiday_date) = 2026 
       ORDER BY holiday_date`
    );
    
    console.log('\n2026 Holidays:');
    result.rows.forEach(row => {
      console.log(`  ${row.holiday_date}: ${row.holiday_name}`);
    });
    
  } catch (error) {
    console.error('Failed to update 2026 holidays:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

update2026Holidays();

