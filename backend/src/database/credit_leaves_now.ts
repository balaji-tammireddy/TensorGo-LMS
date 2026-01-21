import { pool } from './db';
import { creditMonthlyLeaves } from '../services/leaveCredit.service';

async function creditLeavesNow() {
  try {
    console.log('Starting leave credit for all active employees...');

    const result = await creditMonthlyLeaves();

    console.log(`\nLeave credit completed:`);
    console.log(`  - Employees credited: ${result.credited}`);
    console.log(`  - Errors: ${result.errors}`);
    console.log('\nEach employee received: +1 casual leave, +0.5 sick leave');
  } catch (error) {
    console.error('Leave credit failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

creditLeavesNow();

