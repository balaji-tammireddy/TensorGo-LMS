import { pool } from '../database/db';
import { logger } from '../utils/logger';
import { sendEmail } from '../utils/email';
import { sendTimesheetStatusEmail, sendTimesheetReminderEmail, sendTimesheetSubmissionEmail } from '../utils/emailTemplates';

export interface TimesheetEntry {
    id?: number;
    user_id: number;
    project_id: number;
    module_id: number;
    task_id: number;
    activity_id: number;
    log_date: string; // YYYY-MM-DD
    duration: number;
    description: string;
    work_status: string;
    log_status?: string;
    rejection_reason?: string;
    manager_comment?: string;
    is_late?: boolean;
    is_resubmission?: boolean;
}

export class TimesheetService {

    // Helper to format date safely without timezone shift
    private static formatDate(date: Date | string): string {
        if (!date) return '';
        const d = new Date(date);
        if (isNaN(d.getTime())) {
            return typeof date === 'string' ? date : '';
        }
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // Helper to get start/end of the current week (Mon-Sun)
    private static getCurrentWeekRange() {
        const today = new Date();
        const day = today.getDay(); // 0=Sun, 1=Mon...
        const diff = today.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
        const monday = new Date(today.setDate(diff));
        monday.setHours(0, 0, 0, 0);

        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        sunday.setHours(23, 59, 59, 999);

        return { start: monday, end: sunday };
    }

    static async getEntriesForWeek(userId: number, startDateStr: string, endDateStr: string) {
        console.log(`[Timesheet] Fetching entries for user ${userId} from ${startDateStr} to ${endDateStr}`);
        try {
            const res = await pool.query(`
                SELECT t.id, t.user_id, t.project_id, t.module_id, t.task_id, t.activity_id, 
                       t.log_date, t.duration::float, t.description, t.work_status, t.log_status, 
                       t.rejection_reason, t.manager_comment, t.created_at, t.updated_at,
                       COALESCE(p.name, 'Unknown Project') as project_name, 
                       COALESCE(m.name, 'Unknown Module') as module_name, 
                       COALESCE(tk.name, 'Unknown Task') as task_name, 
                       COALESCE(a.name, 'Unknown Activity') as activity_name
                FROM project_entries t
                LEFT JOIN projects p ON t.project_id = p.id
                LEFT JOIN project_modules m ON t.module_id = m.id
                LEFT JOIN project_tasks tk ON t.task_id = tk.id
                LEFT JOIN project_activities a ON t.activity_id = a.id
                WHERE t.user_id = $1 
                  AND t.log_date >= $2 
                  AND t.log_date <= $3
                ORDER BY t.log_date ASC, t.created_at ASC
            `, [userId, startDateStr, endDateStr]);
            return res.rows;
        } catch (error) {
            console.error('[TimesheetService] Query Error:', error);
            throw error;
        }
    }

    static async upsertEntry(userId: number, entry: TimesheetEntry) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const logDate = new Date(entry.log_date);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const logDateOnly = new Date(logDate);
            logDateOnly.setHours(0, 0, 0, 0);

            // Validation 1: Future Date
            if (logDateOnly > today) {
                throw new Error("Cannot log time for future dates");
            }

            // Validation 2: Current Week and One Previous
            // Validation 2: Current Week and One Previous
            const { start, end } = TimesheetService.getCurrentWeekRange();
            const previousWeekStart = new Date(start);
            previousWeekStart.setDate(previousWeekStart.getDate() - 7);

            // Relax validation for Updates (to allow fixing rejected logs from older weeks)
            // Allow logging from previous week Monday to today
            if (!entry.id && (logDateOnly < previousWeekStart || logDateOnly > today)) {
                throw new Error("Can only log time for the current week or previous week");
            }

            // Validation 3: Past Week Submission Restriction
            // If the date being logged is before the current week, check if that week is already submitted or approved
            if (logDateOnly < start) {
                const logDay = logDateOnly.getDay();
                const logDiff = logDateOnly.getDate() - logDay + (logDay === 0 ? -6 : 1);
                const logMonday = new Date(logDateOnly);
                logMonday.setDate(logDiff);
                logMonday.setHours(0, 0, 0, 0);
                const logSunday = new Date(logMonday);
                logSunday.setDate(logMonday.getDate() + 6);
                logSunday.setHours(23, 59, 59, 999);

                const lockCheck = await client.query(`
                    SELECT 1 FROM project_entries 
                    WHERE user_id = $1 
                      AND log_date >= $2 AND log_date <= $3
                      AND log_status IN ('submitted', 'approved')
                    LIMIT 1
                `, [userId, logMonday.toISOString().split('T')[0], logSunday.toISOString().split('T')[0]]);

                if (lockCheck.rows.length > 0) {
                    throw new Error("Cannot add or modify logs for a week that is already submitted or approved.");
                }
            }

            // Validation 4: Max 24 Hours Per Day
            const dailyTotalRes = await client.query(`
                SELECT COALESCE(SUM(duration), 0)::float as total
                FROM project_entries
                WHERE user_id = $1 AND log_date = $2 AND id != $3
            `, [userId, entry.log_date, entry.id || -1]);

            const existingDailyTotal = parseFloat(dailyTotalRes.rows[0].total);
            if (existingDailyTotal + entry.duration > 24) {
                throw new Error(`Cannot log ${entry.duration} hours. You already have ${existingDailyTotal} hours logged for ${TimesheetService.formatDate(entry.log_date)}. Day total cannot exceed 24 hours.`);
            }

            if (entry.id) {
                const existingRes = await client.query('SELECT log_status, user_id FROM project_entries WHERE id = $1', [entry.id]);
                if (existingRes.rows.length === 0) throw new Error("Entry not found");
                const existing = existingRes.rows[0];

                if (existing.user_id !== userId) throw new Error("Unauthorized");
                if (existing.log_status !== 'draft' && existing.log_status !== 'rejected') {
                    throw new Error("Cannot edit submitted or approved logs");
                }

                const updateRes = await client.query(`
                    UPDATE project_entries 
                    SET project_id=$1, module_id=$2, task_id=$3, activity_id=$4, 
                        log_date=$5, duration=$6, description=$7, work_status=$8,
                        log_status = 'draft',
                        updated_by = $9, updated_at = CURRENT_TIMESTAMP
                    WHERE id=$10
                    RETURNING *
                `, [
                    entry.project_id, entry.module_id, entry.task_id, entry.activity_id,
                    entry.log_date, entry.duration, entry.description, entry.work_status,
                    userId, entry.id
                ]);
                await client.query('COMMIT');
                return updateRes.rows[0];

            } else {
                const insertRes = await client.query(`
                    INSERT INTO project_entries (
                        user_id, project_id, module_id, task_id, activity_id,
                        log_date, duration, description, work_status,
                        log_status, created_by, updated_by
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'draft', $10, $10)
                    RETURNING *
                `, [
                    userId, entry.project_id, entry.module_id, entry.task_id, entry.activity_id,
                    entry.log_date, entry.duration, entry.description, entry.work_status,
                    userId
                ]);
                await client.query('COMMIT');
                return insertRes.rows[0];
            }

        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }

    static async deleteEntry(userId: number, entryId: number) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const existingRes = await client.query('SELECT log_status, user_id FROM project_entries WHERE id = $1', [entryId]);
            if (existingRes.rows.length === 0) throw new Error("Entry not found");
            const existing = existingRes.rows[0];

            if (existing.user_id !== userId) throw new Error("Unauthorized");
            if (existing.log_status !== 'draft' && existing.log_status !== 'rejected') {
                throw new Error("Cannot delete submitted or approved logs");
            }

            await client.query('DELETE FROM project_entries WHERE id = $1', [entryId]);
            await client.query('COMMIT');
            return { success: true };
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }

    // --- APPROVAL MODULE ---

    static async getTeamStatus(approverId: number, role: string, startDateStr: string, endDateStr: string) {
        // 1. Determine User Scope
        let userFilter = '';
        const params: any[] = [startDateStr, endDateStr];
        let paramIdx = 3;

        if (role === 'super_admin' || role === 'hr') {
            // Can view all, but for "Team Status" specifically, we might want to return ALL employees?
            // The requirement says: "HR and Super admin role users can see all users time sheets".
            // So no extra filter on users table, other than active/non-admin.
        } else {
            // Manager: Direct reportees only
            userFilter = `AND u.reporting_manager_id = $${paramIdx}`;
            params.push(approverId);
        }

        const query = `
            SELECT 
                u.id, 
                u.first_name || ' ' || COALESCE(u.last_name, '') as name,
                u.emp_id,
                u.designation,
                COALESCE(SUM(pe.duration), 0)::float as total_hours,
                COUNT(pe.id) as log_count,
                COUNT(CASE WHEN pe.log_status = 'approved' THEN 1 END) as approved_count,
                COUNT(CASE WHEN pe.log_status = 'rejected' THEN 1 END) as rejected_count,
                COUNT(CASE WHEN pe.log_status = 'submitted' THEN 1 END) as submitted_count,
                COUNT(CASE WHEN pe.log_status = 'draft' THEN 1 END) as draft_count,
                BOOL_OR(pe.is_late) as is_late,
                BOOL_OR(pe.is_resubmission) as is_resubmission
            FROM users u
            LEFT JOIN project_entries pe ON u.id = pe.user_id 
                AND pe.log_date >= $1 AND pe.log_date <= $2
            WHERE u.status = 'active' 
              AND u.user_role != 'super_admin'
              ${userFilter}
            GROUP BY u.id
            ORDER BY u.first_name ASC
        `;

        const res = await pool.query(query, params);

        return res.rows.map(row => {
            let status = 'draft';
            if (row.rejected_count > 0) status = 'rejected';
            else if (row.log_count > 0 && row.approved_count === row.log_count) status = 'approved';
            else if (row.submitted_count > 0 && row.draft_count === 0) status = 'submitted';
            else if (row.total_hours >= 40 && row.draft_count > 0) status = 'pending_submission'; // Highlight readily submittable

            return {
                id: row.id,
                name: row.name,
                emp_id: row.emp_id,
                designation: row.designation,
                total_hours: row.total_hours,
                status, // 'draft', 'submitted', 'approved', 'rejected', 'pending_submission'
                is_late: row.is_late || false,
                is_resubmission: row.is_resubmission || false
            };
        });
    }

    static async approveTimesheet(approverId: number, targetUserId: number, startDateStr: string, endDateStr: string) {
        // Validate Access: In a real controller we check if approver manages targetUser.
        // For Service, we simply execute. Controller checks permissions.

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Approve all entries in range that are 'submitted' (or 'draft' if we allow direct approval)
            // Ideally only 'submitted' should be approvable? 
            // The requirement says automatic submission happens on Sunday. 
            // But managers can approve "weeks timesheet".
            // Let's allow approving any non-approved entry to be safe.

            await client.query(`
                UPDATE project_entries 
                SET log_status = 'approved', 
                    manager_comment = 'Approved by Manager',
                    updated_by = $1, 
                    updated_at = CURRENT_TIMESTAMP
                WHERE user_id = $2 
                  AND log_date >= $3 AND log_date <= $4
                  AND log_status != 'approved'
            `, [approverId, targetUserId, startDateStr, endDateStr]);

            // Notify User
            const userRes = await client.query('SELECT email, first_name FROM users WHERE id = $1', [targetUserId]);
            if (userRes.rows.length > 0) {
                await sendTimesheetStatusEmail(userRes.rows[0].email, {
                    employeeName: userRes.rows[0].first_name,
                    status: 'approved',
                    startDate: startDateStr,
                    endDate: endDateStr
                });
            }

            await client.query('COMMIT');
            return { success: true };
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }

    static async approveTimesheetEntry(approverId: number, entryId: number) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            await client.query(`
                UPDATE project_entries 
                SET log_status = 'approved', 
                    manager_comment = 'Approved by Manager',
                    updated_by = $1, 
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $2
                  AND log_status != 'approved'
            `, [approverId, entryId]);

            await client.query('COMMIT');
            return { success: true };
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }

    static async rejectTimesheetEntry(approverId: number, entryId: number, reason: string) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const res = await client.query(`
                UPDATE project_entries 
                SET log_status = 'rejected', 
                    rejection_reason = $1,
                    updated_by = $2, 
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $3
                RETURNING user_id, log_date
            `, [reason, approverId, entryId]);

            if (res.rows.length > 0) {
                const { user_id, log_date } = res.rows[0];
                // Notify User
                const userRes = await client.query('SELECT email, first_name FROM users WHERE id = $1', [user_id]);
                if (userRes.rows.length > 0) {
                    await sendTimesheetStatusEmail(userRes.rows[0].email, {
                        employeeName: userRes.rows[0].first_name,
                        status: 'rejected',
                        logDate: this.formatDate(log_date),
                        reason: reason
                    });
                }
            }

            await client.query('COMMIT');
            return { success: true };
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }

    static async rejectTimesheet(approverId: number, targetUserId: number, startDate: string, endDate: string, reason: string) {
        // Validate Access
        if (!(await this.isManagerOrAdmin(approverId, targetUserId))) {
            throw new Error('Unauthorized');
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const res = await client.query(`
                UPDATE project_entries
                SET log_status = 'rejected', rejection_reason = $1, updated_by = $2, updated_at = NOW()
                WHERE user_id = $3 AND log_date BETWEEN $4 AND $5
                AND log_status != 'approved'
                RETURNING id
            `, [reason, approverId, targetUserId, startDate, endDate]);

            // Notify User
            if (res.rowCount && res.rowCount > 0) {
                const userRes = await client.query('SELECT email, first_name FROM users WHERE id = $1', [targetUserId]);
                if (userRes.rows.length > 0) {
                    sendTimesheetStatusEmail(userRes.rows[0].email, {
                        employeeName: userRes.rows[0].first_name,
                        status: 'rejected',
                        startDate: startDate,
                        endDate: endDate,
                        reason: reason
                    }).catch(console.error);
                }
            }

            await client.query('COMMIT');
            return { success: true };
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }

    static async manualSubmitTimesheet(userId: number, startStr: string, endStr: string) {
        const client = await pool.connect();
        try {
            // 1. Validate Week (Must be Past Week)
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const weekEnd = new Date(endStr);
            if (weekEnd >= today) {
                // If it's a current week, we generally block, unless today is Monday and week ended yesterday.
                // The requirement is "Past 1 week".
            }

            // 2. Calculate Total Hours
            const res = await client.query(`
                SELECT COALESCE(SUM(duration), 0)::float as total
                FROM project_entries
                WHERE user_id = $1 AND log_date >= $2 AND log_date <= $3
            `, [userId, startStr, endStr]);

            const total = parseFloat(res.rows[0].total);
            if (total < 40) {
                throw new Error(`Cannot submit timesheet: Total hours (${total}) is less than 40.`);
            }

            // 3. Update Status
            await client.query('BEGIN');

            // Check if this is a resubmission (were there rejected entries?)
            const rejectCheck = await client.query(`
                SELECT 1 FROM project_entries 
                WHERE user_id = $1 AND log_date >= $2 AND log_date <= $3 
                AND log_status = 'rejected'
                LIMIT 1
            `, [userId, startStr, endStr]);

            const isResubmission = rejectCheck.rows.length > 0;

            // Late Check: If submitting after Monday 00:00 AM of the week following the timesheet week
            const nextMonday = new Date(endStr);
            nextMonday.setDate(nextMonday.getDate() + 1);
            nextMonday.setHours(0, 0, 0, 0);
            const isLate = today > nextMonday;

            await client.query(`
            UPDATE project_entries
            SET log_status = 'submitted', 
                updated_at = CURRENT_TIMESTAMP,
                is_late = $4,
                is_resubmission = $5
            WHERE user_id = $1 
              AND log_date >= $2 AND log_date <= $3
              AND log_status IN ('draft', 'rejected')
        `, [userId, startStr, endStr, isLate, isResubmission]);

            await client.query('COMMIT');

            // Notify Manager
            const uRes = await pool.query('SELECT first_name, reporting_manager_id FROM users WHERE id = $1', [userId]);
            const user = uRes.rows[0];
            if (user && user.reporting_manager_id) {
                const mgrRes = await pool.query('SELECT email FROM users WHERE id = $1', [user.reporting_manager_id]);
                if (mgrRes.rows.length > 0) {
                    sendTimesheetSubmissionEmail(mgrRes.rows[0].email, {
                        employeeName: user.first_name,
                        hoursLogged: total,
                        startDate: startStr,
                        endDate: endStr,
                        isLate,
                        isResubmission
                    }).catch(console.error);
                }
            }

        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }


    // 1. Daily Auto-Fill (8 AM)
    static async processDailyAutoFill() {
        logger.info('[Timesheet] Starting Daily Auto-Fill (8 AM)...');
        const client = await pool.connect();
        try {
            const todayStr = this.formatDate(new Date());

            // A. Check for Holidays TODAY
            const holidaysRes = await client.query(`
                SELECT holiday_name FROM holidays 
                WHERE holiday_date = $1 AND is_active = true
            `, [todayStr]);

            // B. Get active users
            const usersRes = await client.query("SELECT id FROM users WHERE status = 'active' AND user_role != 'super_admin'");

            if (holidaysRes.rows.length > 0) {
                const h = holidaysRes.rows[0];
                const ids = await this.ensureSystemProjectStructure(client, 'Holiday');
                for (const u of usersRes.rows) {
                    await this.insertSystemEntry(client, u.id, todayStr, ids, 8, h.holiday_name);
                }
                logger.info(`[Timesheet] Logged holiday '${h.holiday_name}' for ${usersRes.rows.length} users.`);
            }

            // C. Check for Approved Leaves TODAY
            const leavesRes = await client.query(`
                SELECT lr.employee_id, lr.leave_type, ld.day_type, lr.time_for_permission_start, lr.time_for_permission_end
                FROM leave_days ld
                JOIN leave_requests lr ON ld.leave_request_id = lr.id
                WHERE ld.leave_date = $1 AND ld.day_status = 'approved'
            `, [todayStr]);

            if (leavesRes.rows.length > 0) {
                const ids = await this.ensureSystemProjectStructure(client, 'Leave');
                for (const l of leavesRes.rows) {
                    let duration = l.day_type === 'half' ? 4 : 8;
                    let desc = 'On Leave';
                    if (l.leave_type === 'permission') {
                        desc = 'Permission';
                        if (l.time_for_permission_start && l.time_for_permission_end) {
                            const [h1, m1] = l.time_for_permission_start.split(':').map(Number);
                            const [h2, m2] = l.time_for_permission_end.split(':').map(Number);
                            let hoursDiff = h2 - h1;
                            let minsDiff = m2 - m1;
                            duration = hoursDiff + (minsDiff / 60);

                            // Round to nearest 0.5
                            duration = Math.round(duration * 2) / 2;
                            // Ensure at least 0.5 if valid time exists
                            if (duration < 0.5) duration = 0.5;
                        } else {
                            duration = 2; // Default fallback
                        }
                    }
                    await this.insertSystemEntry(client, l.employee_id, todayStr, ids, duration, desc);
                }
                logger.info(`[Timesheet] Logged leaves for ${leavesRes.rows.length} users.`);
            }

            logger.info('[Timesheet] Daily Auto-Fill Completed');
        } catch (e) {
            logger.error('[Timesheet] Daily Auto-Fill Error', e);
        } finally {
            client.release();
        }
    }

    // 2. Daily Reminder (8 PM)
    static async processDailyReminders() {
        logger.info('[Timesheet] Processing Daily Check...');
        // Users who haven't logged for Today
        const todayStr = new Date().toISOString().split('T')[0];
        const res = await pool.query(`
            SELECT u.id, u.email, u.first_name 
            FROM users u
            WHERE u.status = 'active' AND u.user_role != 'super_admin'
            AND NOT EXISTS (
                SELECT 1 FROM project_entries pe 
                WHERE pe.user_id = u.id AND pe.log_date = $1
            )
        `, [todayStr]);

        for (const u of res.rows) {
            await sendTimesheetReminderEmail(u.email, {
                employeeName: u.first_name,
                reminderType: 'daily',
                date: todayStr
            });
        }
    }

    // 3. Friday Validation (4 PM)
    static async processFridayValidation() {
        logger.info('[Timesheet] Processing Friday Validation...');
        const { start, end } = TimesheetService.getCurrentWeekRange();
        const startStr = TimesheetService.formatDate(start);
        const endStr = TimesheetService.formatDate(end);

        // Find users with < 32 hours logged
        const res = await pool.query(`
            SELECT u.id, u.email, u.first_name, COALESCE(SUM(pe.duration), 0) as total_hours
            FROM users u
            LEFT JOIN project_entries pe ON u.id = pe.user_id 
                AND pe.log_date >= $1 AND pe.log_date <= $2
            WHERE u.status = 'active' AND u.user_role != 'super_admin'
            GROUP BY u.id
            HAVING COALESCE(SUM(pe.duration), 0) < 32
        `, [startStr, endStr]);

        for (const u of res.rows) {
            await sendTimesheetReminderEmail(u.email, {
                employeeName: u.first_name,
                reminderType: 'friday_alert',
                hoursLogged: parseFloat(u.total_hours)
            });
        }
    }

    // 4. Sunday Submission (9 PM)
    static async processWeeklySubmission() {
        logger.info('[Timesheet] Processing Weekly Submission...');
        let client;
        try {
            client = await pool.connect();
            const { start, end } = TimesheetService.getCurrentWeekRange();

            const startStr = TimesheetService.formatDate(start);
            const endStr = TimesheetService.formatDate(end);

            await client.query('BEGIN');

            const res = await client.query(`
                SELECT u.id, u.email, u.first_name, u.reporting_manager_id, 
                       mgr.email as manager_email, mgr.first_name as manager_name,
                       COALESCE(SUM(pe.duration), 0) as total_hours
                FROM users u
                LEFT JOIN users mgr ON u.reporting_manager_id = mgr.id
                LEFT JOIN project_entries pe ON u.id = pe.user_id 
                    AND pe.log_date >= $1 AND pe.log_date <= $2
                WHERE u.status = 'active' AND u.user_role != 'super_admin'
                GROUP BY u.id, mgr.email, mgr.first_name
            `, [startStr, endStr]);

            // Map to store summary data per manager: managerEmail -> { name, submissions: [], failures: [] }
            const managerSummaries = new Map<string, any>();

            for (const u of res.rows) {
                const hours = parseFloat(u.total_hours);
                const employeeInfo = { name: u.first_name, hours };

                if (hours >= 40) {
                    await client.query(`
                        UPDATE project_entries 
                        SET log_status = 'submitted', updated_at = CURRENT_TIMESTAMP
                        WHERE user_id = $1 AND log_date >= $2 AND log_date <= $3 AND log_status = 'draft'
                    `, [u.id, startStr, endStr]);

                    logger.info(`[Timesheet] User ${u.id} Auto-Submitted (${hours} hrs)`);

                    if (u.manager_email) {
                        if (!managerSummaries.has(u.manager_email)) {
                            managerSummaries.set(u.manager_email, { name: u.manager_name, submissions: [], failures: [] });
                        }
                        managerSummaries.get(u.manager_email).submissions.push(employeeInfo);
                    }
                } else {
                    await sendTimesheetReminderEmail(u.email, {
                        employeeName: u.first_name,
                        reminderType: 'criteria_not_met',
                        hoursLogged: hours
                    });
                    logger.info(`[Timesheet] User ${u.id} Not Submitted (<40h). Warning sent.`);

                    if (u.manager_email) {
                        if (!managerSummaries.has(u.manager_email)) {
                            managerSummaries.set(u.manager_email, { name: u.manager_name, submissions: [], failures: [] });
                        }
                        managerSummaries.get(u.manager_email).failures.push(employeeInfo);
                    }
                }
            }

            // Send consolidated emails to managers
            for (const [email, data] of managerSummaries.entries()) {
                await import('../utils/emailTemplates').then(m =>
                    m.sendTimesheetSummaryEmail(email, {
                        managerName: data.name,
                        startDate: startStr,
                        endDate: endStr,
                        submissions: data.submissions,
                        failures: data.failures
                    })
                );
                logger.info(`[Timesheet] Summary email sent to manager: ${email}`);
            }

            if (client) await client.query('COMMIT');
        } catch (e) {
            if (client) await client.query('ROLLBACK');
            logger.error('[Timesheet] Submission Error', e);
        } finally {
            if (client) client.release();
        }
    }

    // Helper functions
    private static async ensureSystemProjectStructure(client: any, type: 'Holiday' | 'Leave') {
        const customIdPrefix = 'SYS-TG';
        const projectCustomId = 'SYS-TG';

        // 1. Project
        let pRes = await client.query("SELECT id FROM projects WHERE custom_id = $1", [projectCustomId]);
        if (pRes.rows.length === 0) {
            logger.info(`[Timesheet] Creating System Project '${projectCustomId}'...`);
            const ins = await client.query("INSERT INTO projects (custom_id, name, description, status, created_by, updated_by) VALUES ($1, 'TensorGo', 'System Project', 'active', 1, 1) RETURNING id", [projectCustomId]);
            pRes = ins;
        }
        const pid = pRes.rows[0].id;

        // 2. Module
        const moduleCustomId = `SYS-${type.toUpperCase()}`;
        let mRes = await client.query("SELECT id FROM project_modules WHERE project_id = $1 AND custom_id = $2", [pid, moduleCustomId]);
        let mid;
        if (mRes.rows.length === 0) {
            logger.info(`[Timesheet] Creating System Module '${moduleCustomId}'...`);
            const ins = await client.query("INSERT INTO project_modules (project_id, custom_id, name, description, status, created_by, updated_by) VALUES ($1, $2, $3, 'System Module', 'active', 1, 1) RETURNING id", [pid, moduleCustomId, type]);
            mid = ins.rows[0].id;
        } else {
            mid = mRes.rows[0].id;
        }

        // 3. Task
        const taskCustomId = `SYS-TSK-${type.toUpperCase()}`;
        let tRes = await client.query("SELECT id FROM project_tasks WHERE module_id = $1 AND custom_id = $2", [mid, taskCustomId]);
        let tid;
        if (tRes.rows.length === 0) {
            logger.info(`[Timesheet] Creating System Task '${taskCustomId}'...`);
            const ins = await client.query("INSERT INTO project_tasks (module_id, custom_id, name, status, created_by, updated_by) VALUES ($1, $2, $3, 'active', 1, 1) RETURNING id", [mid, taskCustomId, type]);
            tid = ins.rows[0].id;
        } else {
            tid = tRes.rows[0].id;
        }

        // 4. Activity
        const activityCustomId = `SYS-ACT-${type.toUpperCase()}`;
        let aRes = await client.query("SELECT id FROM project_activities WHERE task_id = $1 AND custom_id = $2", [tid, activityCustomId]);
        let aid;
        if (aRes.rows.length === 0) {
            logger.info(`[Timesheet] Creating System Activity '${activityCustomId}'...`);
            const ins = await client.query("INSERT INTO project_activities (task_id, custom_id, name, status, created_by, updated_by) VALUES ($1, $2, $3, 'active', 1, 1) RETURNING id", [tid, activityCustomId, type]);
            aid = ins.rows[0].id;
        } else {
            aid = aRes.rows[0].id;
        }

        return { projectId: pid, moduleId: mid, taskId: tid, activityId: aid };
    }

    private static async insertSystemEntry(client: any, userId: number, date: string, ids: any, duration: number, desc: string) {
        const check = await client.query(`
            SELECT id FROM project_entries 
            WHERE user_id = $1 AND log_date = $2 AND activity_id = $3
        `, [userId, date, ids.activityId]);

        if (check.rows.length > 0) return;

        await client.query(`
            INSERT INTO project_entries (
                user_id, project_id, module_id, task_id, activity_id,
                log_date, duration, description, work_status, log_status, created_by, updated_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'not_applicable', 'draft', $1, $1)
        `, [userId, ids.projectId, ids.moduleId, ids.taskId, ids.activityId, date, duration, desc]);
    }

    // --- EVENT DRIVEN HOOKS ---

    // 1. Log Holiday Immediately
    static async logHolidayForEveryone(dateStr: string, name: string) {
        logger.info(`[Timesheet] Processing Immediate Holiday Log: ${dateStr} - ${name}`);
        const client = await pool.connect();
        try {
            const usersRes = await client.query("SELECT id FROM users WHERE status = 'active' AND user_role != 'super_admin'");
            if (usersRes.rows.length === 0) return;

            const ids = await this.ensureSystemProjectStructure(client, 'Holiday');

            await client.query('BEGIN');
            for (const u of usersRes.rows) {
                // Check if entry exists to avoid duplicates
                await this.insertSystemEntry(client, u.id, dateStr, ids, 8, name);
            }
            await client.query('COMMIT');
            logger.info(`[Timesheet] Logged holiday for ${usersRes.rows.length} users.`);
        } catch (e) {
            await client.query('ROLLBACK');
            logger.error('[Timesheet] Holiday Log Error', e);
        } finally {
            client.release();
        }
    }

    // 2. Sync Approved Leave Immediately
    static async syncApprovedLeave(userId: number, leaveRequestId: number) {
        logger.info(`[Timesheet] Syncing Approved Leave Request: ${leaveRequestId} for User ${userId}`);
        const client = await pool.connect();
        try {
            // Fetch Approved Days for this request
            const res = await client.query(`
                SELECT ld.leave_date, ld.day_type, lr.leave_type, 
                       lr.time_for_permission_start, lr.time_for_permission_end 
                FROM leave_days ld
                JOIN leave_requests lr ON ld.leave_request_id = lr.id
                WHERE ld.leave_request_id = $1 AND ld.day_status = 'approved'
            `, [leaveRequestId]);

            if (res.rows.length === 0) return;

            const ids = await this.ensureSystemProjectStructure(client, 'Leave');

            await client.query('BEGIN');
            for (const row of res.rows) {
                const dateStr = this.formatDate(row.leave_date);
                let duration = 8;
                let desc = 'On Leave';

                if (row.day_type === 'half') duration = 4;

                if (row.leave_type === 'permission') {
                    desc = 'Permission';
                    // Calculate duration from time range if needed, or default to 2
                    // Assuming permissions are short, usually < 4 hours. 
                    // Let's check start/end time difference if available
                    if (row.time_for_permission_start && row.time_for_permission_end) {
                        // Simple parse H:M
                        const [h1, m1] = row.time_for_permission_start.split(':').map(Number);
                        const [h2, m2] = row.time_for_permission_end.split(':').map(Number);
                        if (!isNaN(h1) && !isNaN(h2)) {
                            const diff = (h2 + m2 / 60) - (h1 + m1 / 60);
                            duration = diff > 0 ? parseFloat(diff.toFixed(1)) : 2;
                        } else {
                            duration = 2;
                        }
                    } else {
                        duration = 2;
                    }
                }

                await this.insertSystemEntry(client, userId, dateStr, ids, duration, desc);
            }
            await client.query('COMMIT');
            logger.info(`[Timesheet] Synced ${res.rows.length} approved leave days.`);
        } catch (e) {
            await client.query('ROLLBACK');
            logger.error('[Timesheet] Leave Sync Error', e);
        } finally {
            client.release();
        }
    }

    // 3. Update Existing Holiday Logs

    static async updateHolidayLog(oldDateStr: string, newDateStr: string, newName: string) {
        logger.info(`[Timesheet] Updating Holiday Log: ${oldDateStr} -> ${newDateStr} (${newName})`);
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            // Update the date and description for entries matching the old date and system holiday activity
            const ids = await this.ensureSystemProjectStructure(client, 'Holiday');
            await client.query(`
                UPDATE project_entries 
                SET log_date = $1, description = $2, updated_at = CURRENT_TIMESTAMP
                WHERE log_date = $3 AND activity_id = $4
            `, [newDateStr, newName, oldDateStr, ids.activityId]);
            await client.query('COMMIT');
            logger.info(`[Timesheet] Holiday logs updated successfully.`);
        } catch (e) {
            await client.query('ROLLBACK');
            logger.error('[Timesheet] Holiday Log Update Error', e);
        } finally {
            client.release();
        }
    }

    // 4. Remove Holiday Logs
    static async removeHolidayLog(dateStr: string) {
        logger.info(`[Timesheet] Removing Holiday Logs for date: ${dateStr}`);
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const ids = await this.ensureSystemProjectStructure(client, 'Holiday');
            await client.query(`
                DELETE FROM project_entries 
                WHERE log_date = $1 AND activity_id = $2
            `, [dateStr, ids.activityId]);
            await client.query('COMMIT');
            logger.info(`[Timesheet] Holiday logs removed successfully.`);
        } catch (e) {
            await client.query('ROLLBACK');
            logger.error('[Timesheet] Holiday Log Removal Error', e);
        } finally {
            client.release();
        }
    }


    static async isManagerOrAdmin(approverId: number, targetUserId: number) {
        // Prevent Self-Approval
        if (approverId === targetUserId) return false;

        const client = await pool.connect();
        try {
            // Check Role
            const roleRes = await client.query('SELECT user_role FROM users WHERE id = $1', [approverId]);
            const role = roleRes.rows[0]?.user_role;
            if (role === 'super_admin' || role === 'hr') return true;

            // Check Manager Link
            const linkRes = await client.query('SELECT 1 FROM users WHERE id = $1 AND reporting_manager_id = $2', [targetUserId, approverId]);
            return linkRes.rows.length > 0;
        } finally {
            client.release();
        }
    }

    static async getReportData(filters: any) {
        // Build dynamic query
        let query = `
            SELECT 
                u.first_name || ' ' || COALESCE(u.last_name, '') as employee_name,
                pe.log_date,
                p.name as project_name,
                m.name as module_name,
                t.name as task_name,
                a.name as activity_name,
                pe.duration::float,
                pe.description,
                pe.work_status,
                pe.log_status,
                manager.first_name || ' ' || COALESCE(manager.last_name, '') as manager_name
            FROM project_entries pe
            JOIN users u ON pe.user_id = u.id
            LEFT JOIN users manager ON u.reporting_manager_id = manager.id
            LEFT JOIN projects p ON pe.project_id = p.id
            LEFT JOIN project_modules m ON pe.module_id = m.id
            LEFT JOIN project_tasks t ON pe.task_id = t.id
            LEFT JOIN project_activities a ON pe.activity_id = a.id
            WHERE pe.log_status = 'approved'
        `;
        const params: any[] = [];
        let pIdx = 1;

        if (filters.startDate) { query += ` AND pe.log_date >= $${pIdx++}`; params.push(filters.startDate); }
        if (filters.endDate) { query += ` AND pe.log_date <= $${pIdx++}`; params.push(filters.endDate); }
        if (filters.userId) { query += ` AND pe.user_id = $${pIdx++}`; params.push(filters.userId); }
        if (filters.projectId) { query += ` AND pe.project_id = $${pIdx++}`; params.push(filters.projectId); }
        // If module, task, activity are passed
        if (filters.moduleId) { query += ` AND pe.module_id = $${pIdx++}`; params.push(filters.moduleId); }
        if (filters.taskId) { query += ` AND pe.task_id = $${pIdx++}`; params.push(filters.taskId); }
        if (filters.activityId) { query += ` AND pe.activity_id = $${pIdx++}`; params.push(filters.activityId); }

        // Scope Filter (Manager sees only reportees)
        if (filters.managerScopeId) {
            query += ` AND (u.reporting_manager_id = $${pIdx++})`; params.push(filters.managerScopeId);
        }

        query += ` ORDER BY pe.log_date DESC, u.first_name ASC`;

        const res = await pool.query(query, params);
        return res.rows;
    }
}
