import { pool } from './db';
import { creditMonthlyLeaves } from '../services/leaveCredit.service';

async function creditAnniversaryLeavesNow() {
  try {
    console.log('Starting monthly and anniversary leave credit check...');

    const result = await creditMonthlyLeaves();

    console.log(`\nAnniversary leave credit completed:`);
    console.log(`  - Employees credited: ${result.credited}`);
    console.log(`  - Errors: ${result.errors}`);
    console.log('\nEach eligible employee received: +3 casual leaves');
  } catch (error) {
    console.error('Anniversary leave credit failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

creditAnniversaryLeavesNow();

