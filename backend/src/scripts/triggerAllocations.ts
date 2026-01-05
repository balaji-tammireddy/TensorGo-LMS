
import { processDailyLeaveCredits } from '../utils/cronJobs';
import { pool } from '../database/db';

const run = async () => {
    console.log('----------------------------------------');
    console.log('MANUAL TRIGGER: Daily Leave Credits Check');
    console.log('----------------------------------------');
    try {
        await processDailyLeaveCredits();
        console.log('----------------------------------------');
        console.log('SUCCESS: Process completed.');
        console.log('----------------------------------------');
    } catch (error) {
        console.error('ERROR:', error);
    } finally {
        await pool.end();
    }
};

run();
