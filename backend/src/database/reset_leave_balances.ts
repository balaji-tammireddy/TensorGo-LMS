import { pool } from './db';

async function resetLeaveBalances() {
  try {
    console.log('Resetting all casual and sick leave balances to zero...');
    
    const result = await pool.query(`
      UPDATE leave_balances
      SET casual_balance = 0,
          sick_balance = 0,
          last_updated = CURRENT_TIMESTAMP
    `);
    
    console.log(`Successfully reset ${result.rowCount} employee leave balance records`);
    console.log('All casual and sick leave balances are now set to 0');
  } catch (error) {
    console.error('Reset failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

resetLeaveBalances();

