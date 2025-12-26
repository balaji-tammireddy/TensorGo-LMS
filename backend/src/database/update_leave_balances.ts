import { pool } from './db';

async function updateLeaveBalances() {
  try {
    console.log('Starting leave balances update...');
    
    // Update all existing employees' casual and sick balances to 0
    const result = await pool.query(`
      UPDATE leave_balances
      SET casual_balance = 0,
          sick_balance = 0,
          last_updated = CURRENT_TIMESTAMP
      WHERE casual_balance != 0 OR sick_balance != 0
    `);
    
    console.log(`Updated ${result.rowCount} employee leave balance records`);
    console.log('Leave balances update completed successfully');
  } catch (error) {
    console.error('Leave balances update failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

updateLeaveBalances();

