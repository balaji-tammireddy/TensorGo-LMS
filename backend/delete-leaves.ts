import { pool } from './src/database/db';

async function deleteLeaves() {
    const client = await pool.connect();
    try {
        console.log('Starting deletion of all leave requests and days...');
        await client.query('BEGIN');

        // Delete child records first
        const daysResult = await client.query('DELETE FROM leave_days');
        console.log(`Deleted ${daysResult.rowCount} leave days.`);

        // Delete parent records
        const requestsResult = await client.query('DELETE FROM leave_requests');
        console.log(`Deleted ${requestsResult.rowCount} leave requests.`);

        // Reset sequences
        await client.query('ALTER SEQUENCE IF EXISTS leave_days_id_seq RESTART WITH 1');
        await client.query('ALTER SEQUENCE IF EXISTS leave_requests_id_seq RESTART WITH 1');

        await client.query('COMMIT');
        console.log('✅ All leave requests and days have been deleted successfully.');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Error deleting leave requests:', error);
    } finally {
        client.release();
        process.exit();
    }
}

deleteLeaves();
