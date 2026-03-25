import { pool } from '../database/db';
import { calculateAllLeaveCredits } from '../utils/leaveCredit';

async function auditAccruals() {
    console.log("--- Leave Accrual Audit Started ---");
    console.log(`Current System Date: ${new Date().toLocaleString()}`);

    try {
        const result = await pool.query(`
            SELECT u.id, u.emp_id, u.first_name, u.date_of_joining, u.user_role,
                   lb.casual_balance, lb.sick_balance, lb.last_updated
            FROM users u
            LEFT JOIN leave_balances lb ON u.id = lb.employee_id
            WHERE u.status IN ('active', 'on_notice')
              AND u.user_role IN ('employee', 'manager', 'hr', 'intern')
            ORDER BY u.emp_id ASC
        `);

        console.log(`Found ${result.rows.length} active employees.\n`);
        console.log(`+-----------+----------------------+------------+--------+--------+---------------------+`);
        console.log(`| EMP ID    | Name                 | Joined     | Casual | Sick   | Last Updated        |`);
        console.log(`+-----------+----------------------+------------+--------+--------+---------------------+`);

        for (const emp of result.rows) {
            const joinDate = emp.date_of_joining ? new Date(emp.date_of_joining).toISOString().split('T')[0] : 'N/A';
            const lastUpdated = emp.last_updated ? new Date(emp.last_updated).toLocaleString() : 'Never';

            console.log(`| ${emp.emp_id.padEnd(9)} | ${emp.first_name.padEnd(20)} | ${joinDate.padEnd(10)} | ${String(emp.casual_balance).padEnd(6)} | ${String(emp.sick_balance).padEnd(6)} | ${lastUpdated.padEnd(19)} |`);

            if (emp.date_of_joining) {
                const today = new Date();
                const credits = calculateAllLeaveCredits(emp.date_of_joining, today);

                // Calculate years
                const join = new Date(emp.date_of_joining);
                let years = today.getFullYear() - join.getFullYear();
                const mDiff = today.getMonth() - join.getMonth();
                const dDiff = today.getDate() - join.getDate();
                if (mDiff < 0 || (mDiff === 0 && dDiff < 0)) years--;

                console.log(`  > Analysis: Years of Service: ${years}`);
                console.log(`  > Expected Total (Calc): Casual: ${credits.casual}`);

                const currentMonth = today.getMonth() + 1;
                const bonus3Months = [4, 8, 12];
                const bonus5Months = [6, 12];

                if (bonus3Months.includes(currentMonth) && years >= 3 && years < 5) {
                    console.log(`  > [BONUS] Eligible for 3-year bonus today (+3).`);
                } else if (bonus5Months.includes(currentMonth) && years >= 5) {
                    console.log(`  > [BONUS] Eligible for 5-year bonus today (+5).`);
                } else {
                    console.log(`  > [INFO] No bonus expected for month ${currentMonth}.`);
                }
            } else {
                console.log(`  > [WARN] Missing date_of_joining!`);
            }
            console.log(`+-----------+----------------------+------------+--------+--------+---------------------+`);
        }

    } catch (err) {
        console.error("Audit failed:", err);
    } finally {
        await pool.end();
        console.log("\n--- Audit Finished ---");
    }
}

auditAccruals();
