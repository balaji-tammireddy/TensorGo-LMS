import { pool } from './db';
import { processYearEndLeaveAdjustments } from '../services/leaveCredit.service';

async function processYearEndNow() {
  try {
    console.log('Starting year-end leave balance adjustments...');
    console.log('This will:');
    console.log('  - Delete all unused sick leaves (reset to 0)');
    console.log('  - Cap casual leaves at maximum 8 for carry forward (excess deleted)');
    console.log('');
    
    const result = await processYearEndLeaveAdjustments();
    
    console.log(`\nYear-end adjustments completed:`);
    console.log(`  - Employees adjusted: ${result.adjusted}`);
    console.log(`  - Errors: ${result.errors}`);
  } catch (error) {
    console.error('Year-end adjustments failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

processYearEndNow();

