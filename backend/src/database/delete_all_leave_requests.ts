import { pool } from './db';

async function deleteAllLeaveRequests() {
  try {
    console.log('Starting deletion of all leave requests...');
    
    // First, get count of leave requests before deletion
    const countResult = await pool.query('SELECT COUNT(*) FROM leave_requests');
    const countBefore = countResult.rows[0].count;
    console.log(`Found ${countBefore} leave request(s) to delete`);
    
    // Delete all leave requests
    // Note: leave_days will be automatically deleted due to ON DELETE CASCADE
    const result = await pool.query('DELETE FROM leave_requests');
    
    console.log(`Successfully deleted ${result.rowCount} leave request(s)`);
    console.log('All leave requests and associated leave days have been removed from the database');
    
    // Verify deletion
    const verifyResult = await pool.query('SELECT COUNT(*) FROM leave_requests');
    const countAfter = verifyResult.rows[0].count;
    console.log(`Verification: ${countAfter} leave request(s) remaining in database`);
    
    if (countAfter === '0') {
      console.log('✅ All leave requests successfully deleted');
    } else {
      console.log('⚠️ Warning: Some leave requests may still exist');
    }
  } catch (error) {
    console.error('Deletion failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

deleteAllLeaveRequests();

