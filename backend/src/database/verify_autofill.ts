
import { query, pool } from './db';
import { TimesheetService } from '../services/timesheet.service';

const verifyDailyAutoFill = async () => {
    try {
        const todayStr = new Date().toISOString().split('T')[0];
        console.log(`Checking holiday for ${todayStr}...`);

        // 1. Ensure a holiday exists for today
        const holidays = await query('SELECT * FROM holidays WHERE holiday_date = $1', [todayStr]);
        if (holidays.rows.length === 0) {
            console.log('Adding test holiday for today...');
            await query("INSERT INTO holidays (holiday_date, holiday_name, is_active, created_by) VALUES ($1, 'Test Holiday', true, 1)", [todayStr]);
        } else {
            console.log('Holiday already exists:', holidays.rows[0].holiday_name);
        }

        // 2. Clear project_entries just to be sure
        await query('TRUNCATE TABLE project_entries RESTART IDENTITY CASCADE');

        // 3. Trigger Auto-Fill
        console.log('Triggering processDailyAutoFill()...');
        await TimesheetService.processDailyAutoFill();

        // 4. Verify Results
        const entries = await query('SELECT pe.*, u.first_name FROM project_entries pe JOIN users u ON pe.user_id = u.id');
        console.log(`\nFound ${entries.rows.length} entries created.`);
        entries.rows.forEach(r => {
            console.log(`  User: ${r.first_name} | Date: ${r.log_date.toISOString().split('T')[0]} | Duration: ${r.duration} | Desc: ${r.description}`);
        });

    } catch (error) {
        console.error('Verification failed:', error);
    } finally {
        await pool.end();
    }
};

verifyDailyAutoFill();
