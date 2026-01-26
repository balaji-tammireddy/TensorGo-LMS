
import { query, pool } from './db';

const debugTimesheets = async () => {
    try {
        const userId = 1; // Assuming checking for user 1 (the one usually logged in)
        // Or fetch all logs for the week.

        console.log('Fetching logs for 2026-01-26 to 2026-02-01...');

        // Query timesheet_entries
        // Query holidays
        const holidaysRes = await query(`
            SELECT holiday_date, holiday_name 
            FROM holidays 
            WHERE holiday_date >= '2026-01-26' AND holiday_date <= '2026-02-01'
        `);
        console.log('\nHOLIDAYS:');
        holidaysRes.rows.forEach(h => console.log(`  DATE: ${h.holiday_date.toISOString().split('T')[0]} | NAME: ${h.holiday_name}`));

        // Query detailed entries
        const res = await query(`
            SELECT pe.user_id, u.first_name, pe.log_date, pe.duration, pe.description, pe.work_status
            FROM project_entries pe
            LEFT JOIN users u ON pe.user_id = u.id
            WHERE pe.log_date >= '2026-01-26' AND pe.log_date <= '2026-02-01'
            ORDER BY pe.user_id, pe.log_date
        `);

        console.log('\nENTRIES:');
        res.rows.forEach(r => {
            const dateStr = r.log_date instanceof Date ? r.log_date.toISOString().split('T')[0] : r.log_date;
            console.log(`  USER: ${r.first_name} (${r.user_id}) | DATE: ${dateStr} | HRS: ${r.duration} | DESC: ${r.description} | STATUS: ${r.work_status}`);
        });

        // Totals
        const userTotals: any = {};
        res.rows.forEach(r => {
            userTotals[r.user_id] = (userTotals[r.user_id] || 0) + parseFloat(r.duration);
        });

        console.log('\nTOTALS:');
        Object.keys(userTotals).forEach(uid => {
            const user = res.rows.find(r => r.user_id == parseInt(uid));
            console.log(`  USER: ${user?.first_name} (${uid}) | TOTAL: ${userTotals[uid]} hrs`);
        });

        // If User 1 has no logs, verify if User 1 exists or if logged in user is someone else
        if (!res.rows.find(r => r.user_id == 1)) {
            console.log('\nWARNING: User ID 1 has NO logs in this period.');
            const allUsers = await query('SELECT id, first_name, email FROM users ORDER BY id LIMIT 5');
            console.log('First 5 users in DB:', allUsers.rows);
        }

    } catch (error) {
        console.error('Error fetching logs:', error);
    } finally {
        await pool.end();
    }
};

debugTimesheets();
