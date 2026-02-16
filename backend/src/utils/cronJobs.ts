import cron from 'node-cron';
import { pool } from '../database/db';
import { logger } from './logger';
import { sendPendingLeaveReminderEmail, sendBirthdayWishEmail, sendHolidayCalendarReminderEmail, sendLeaveAllocationEmail } from './emailTemplates';
import { isLastWorkingDayOfMonth } from './leaveCredit';
import { TimesheetService } from '../services/timesheet.service';

/**
 * Send daily pending leave reminders to managers and HR
 * Runs every day at 9:00 AM
 */
const sendDailyPendingLeaveReminders = async () => {
  try {
    logger.info('🔄 Starting daily pending leave reminders job...');

    // Get all managers and HR who have pending leave requests
    const managersResult = await pool.query(
      `SELECT DISTINCT 
        u.id as manager_id,
        u.email as manager_email,
        u.first_name || ' ' || COALESCE(u.last_name, '') as manager_name
      FROM users u
      WHERE u.user_role IN ('manager', 'hr')
        AND u.status NOT IN ('inactive', 'resigned')
        AND EXISTS (
          SELECT 1 FROM leave_requests lr
          JOIN users emp ON lr.employee_id = emp.id
          WHERE (emp.reporting_manager_id = u.id OR u.user_role IN ('hr', 'super_admin'))
            AND lr.current_status = 'pending'
            AND NOT EXISTS (
              SELECT 1 FROM leave_days ld
              WHERE ld.leave_request_id = lr.id
                AND ld.day_status != 'pending'
            )
        )`
    );

    const managers = managersResult.rows;
    logger.info(`Found ${managers.length} managers/HR with pending leave requests`);

    for (const manager of managers) {
      try {
        // Get manager role
        const managerRoleResult = await pool.query(
          'SELECT user_role as role FROM users WHERE id = $1',
          [manager.manager_id]
        );
        const managerRole = managerRoleResult.rows[0]?.role || '';

        // Get pending leave requests for this manager
        const pendingLeavesResult = await pool.query(
          `SELECT 
            lr.id,
            lr.leave_type,
            lr.start_date,
            lr.end_date,
            (lr.end_date - lr.start_date + 1) as no_of_days,
            lr.applied_date,
            emp.first_name || ' ' || COALESCE(emp.last_name, '') as employee_name,
            emp.emp_id as employee_emp_id
          FROM leave_requests lr
          JOIN users emp ON lr.employee_id = emp.id
          WHERE (
            (emp.reporting_manager_id = $1)
            OR $2 IN ('hr', 'super_admin')
          )
            AND lr.current_status = 'pending'
            AND NOT EXISTS (
              SELECT 1 FROM leave_days ld
              WHERE ld.leave_request_id = lr.id
                AND ld.day_status != 'pending'
            )
          ORDER BY lr.applied_date ASC`,
          [manager.manager_id, managerRole]
        );

        const pendingLeaves = pendingLeavesResult.rows;

        if (pendingLeaves.length > 0) {
          // Calculate days pending for each leave
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          const leavesWithDaysPending = pendingLeaves.map((leave: any) => {
            const appliedDate = new Date(leave.applied_date);
            appliedDate.setHours(0, 0, 0, 0);
            const daysPending = Math.floor((today.getTime() - appliedDate.getTime()) / (1000 * 60 * 60 * 24));

            return {
              employeeName: leave.employee_name,
              employeeEmpId: leave.employee_emp_id,
              leaveType: leave.leave_type,
              startDate: leave.start_date,
              endDate: leave.end_date,
              noOfDays: parseFloat(leave.no_of_days),
              appliedDate: leave.applied_date,
              daysPending: daysPending
            };
          });

          await sendPendingLeaveReminderEmail(manager.manager_email, {
            managerName: manager.manager_name,
            pendingLeaves: leavesWithDaysPending
          });

          logger.info(`✅ Pending leave reminder sent to ${manager.manager_email} (${leavesWithDaysPending.length} pending requests)`);
        }
      } catch (error: any) {
        logger.error(`❌ Error sending reminder to ${manager.manager_email}:`, error);
      }
    }

    logger.info('✅ Daily pending leave reminders job completed');
  } catch (error: any) {
    logger.error('❌ Error in daily pending leave reminders job:', error);
  }
};

/**
 * Send birthday wishes to employees
 * Runs every day at 9:00 AM
 */
const sendBirthdayWishes = async () => {
  try {
    logger.info('🔄 Starting birthday wishes job...');

    const today = new Date();
    const month = today.getMonth() + 1; // JavaScript months are 0-indexed
    const day = today.getDate();

    // Get employees whose birthday is today
    const birthdayEmployeesResult = await pool.query(
      `SELECT 
        id,
        email,
        emp_id,
        first_name || ' ' || COALESCE(last_name, '') as employee_name
      FROM users
      WHERE status NOT IN ('inactive', 'resigned')
        AND date_of_birth IS NOT NULL
        AND EXTRACT(MONTH FROM date_of_birth) = $1
        AND EXTRACT(DAY FROM date_of_birth) = $2`,
      [month, day]
    );

    const birthdayEmployees = birthdayEmployeesResult.rows;
    logger.info(`Found ${birthdayEmployees.length} employees with birthdays today`);

    if (birthdayEmployees.length > 0) {
      // Get all active employees for CC
      const allEmployeesResult = await pool.query(
        `SELECT 
          id,
          email,
          emp_id,
          first_name || ' ' || COALESCE(last_name, '') as employee_name
        FROM users
        WHERE status NOT IN ('inactive', 'resigned')`
      );

      const allEmployees = allEmployeesResult.rows;
      logger.info(`Sending birthday wishes for ${birthdayEmployees.length} birthday(s) today`);

      // Send birthday wishes - one email per birthday person with all others CC'd
      for (const birthdayEmployee of birthdayEmployees) {
        try {
          // Get CC list (all employees except the birthday person)
          const ccEmails = allEmployees
            .filter(emp => emp.email !== birthdayEmployee.email)
            .map(emp => emp.email);

          logger.info(`Sending birthday email to ${birthdayEmployee.email} with ${ccEmails.length} employees CC'd`);

          await sendBirthdayWishEmail(
            birthdayEmployee.email,
            {
              employeeName: birthdayEmployee.employee_name,
              employeeEmpId: birthdayEmployee.emp_id,
            },
            ccEmails
          );

          logger.info(`✅ Birthday wish sent to ${birthdayEmployee.email} with ${ccEmails.length} employees CC'd`);
        } catch (error: any) {
          logger.error(`❌ Error sending birthday wish to ${birthdayEmployee.email}:`, error);
        }
      }
    }

    logger.info('✅ Birthday wishes job completed');
  } catch (error: any) {
    logger.error('❌ Error in birthday wishes job:', error);
  }
};

/**
 * Send reminder to HR to add next year's holidays
 * Runs daily in November to check for last working day
 * Trigger: Last working day of November
 */
const checkAndSendHolidayListReminder = async () => {
  try {
    const today = new Date();
    const month = today.getMonth(); // 0-11. November is 10.

    // Only run in November
    if (month !== 10) return;

    // Check if today is last working day of month
    if (!isLastWorkingDayOfMonth()) return;

    logger.info('📅 Last working day of November detected. Sending Holiday List Reminder...');

    // 1. Get all HRs
    const hrResult = await pool.query(
      `SELECT email, first_name || ' ' || COALESCE(last_name, '') as name 
       FROM users WHERE user_role = 'hr' AND status NOT IN ('inactive', 'resigned')`
    );

    if (hrResult.rows.length === 0) {
      logger.warn('⚠️ No active HRs found to send holiday list reminder.');
      return;
    }

    // 2. Get all Super Admins for CC
    const adminResult = await pool.query(
      `SELECT email FROM users WHERE user_role = 'super_admin' AND status NOT IN ('inactive', 'resigned')`
    );

    // Filter out admins who might also be HR to avoid duplicate/confusion (optional, but safe)
    // Actually, CCing them is fine even if they are HR? Usually separate users.
    const adminEmails = adminResult.rows.map(r => r.email);
    const nextYear = today.getFullYear() + 1;

    logger.info(`📧 Sending holiday reminder to ${hrResult.rows.length} HRs (CC: ${adminEmails.length} Admins) for Year ${nextYear}`);

    // 3. Send email to each HR
    for (const hr of hrResult.rows) {
      try {
        await sendHolidayCalendarReminderEmail(
          hr.email,
          { recipientName: hr.name, nextYear },
          adminEmails.length > 0 ? adminEmails : undefined
        );
        logger.info(`✅ Holiday list reminder sent to HR: ${hr.email}`);
      } catch (err) {
        logger.error(`❌ Failed to send holiday reminder to HR ${hr.email}:`, err);
      }
    }
  } catch (error) {
    logger.error('❌ Error in holiday list reminder job:', error);
  }
};

/**
 * Cleanup old holidays
 * Keeps holidays from (Current Year - 1) onwards
 * Runs annually on Dec 31st
 */
const cleanupOldHolidays = async () => {
  try {
    logger.info('🧹 Starting old holidays cleanup job...');

    const currentYear = new Date().getFullYear();
    const cutoffYear = currentYear - 1;

    // Delete holidays older than (currentYear - 1)
    const result = await pool.query(
      'DELETE FROM holidays WHERE EXTRACT(YEAR FROM holiday_date) < $1',
      [cutoffYear]
    );

    if (result.rowCount && result.rowCount > 0) {
      logger.info(`✅ Deleted ${result.rowCount} old holidays (older than ${cutoffYear})`);
    } else {
      logger.info('✅ No old holidays found to delete');
    }
  } catch (error: any) {
    logger.error('❌ Error in old holidays cleanup job:', error);
  }
};
/**
 * Auto-approve pending leave requests where the end date has passed
 * Runs daily at 00:01 AM
 */
const autoApprovePastPendingLeaves = async () => {
  try {
    logger.info('🔄 Starting auto-approval of past pending leaves job...');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Find all pending leave requests where the end date is before today
      // Using CURRENT_DATE ensures we compare with the start of today
      const pastPendingResult = await client.query(
        `SELECT id, employee_id, leave_type 
         FROM leave_requests 
         WHERE current_status = 'pending' 
           AND end_date < CURRENT_DATE`
      );

      const pastRequests = pastPendingResult.rows;
      logger.info(`Found ${pastRequests.length} past pending leave requests for auto-approval`);

      if (pastRequests.length > 0) {
        // Get a Super Admin ID to use as the system approver
        const superAdminResult = await client.query(
          "SELECT id FROM users WHERE user_role = 'super_admin' LIMIT 1"
        );
        const superAdminId = superAdminResult.rows[0]?.id;

        if (!superAdminId) {
          throw new Error('No Super Admin found in the database for auto-approval attribution');
        }

        for (const request of pastRequests) {
          // 2. Update leave_requests header
          await client.query(
            `UPDATE leave_requests 
             SET current_status = 'approved',
                 super_admin_approval_status = 'approved',
                 super_admin_approval_date = CURRENT_TIMESTAMP,
                 super_admin_approval_comment = 'Auto-approved: Leave date has passed',
                 super_admin_approved_by = $1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [superAdminId, request.id]
          );

          // 3. Update all associated leave_days
          await client.query(
            "UPDATE leave_days SET day_status = 'approved' WHERE leave_request_id = $1",
            [request.id]
          );

          logger.info(`✅ Auto-approved past pending leave request ID: ${request.id} for employee ID: ${request.employee_id}`);
        }
      }

      await client.query('COMMIT');
      logger.info(`✅ Auto-approval of past pending leaves job completed. Processed ${pastRequests.length} requests.`);
    } catch (error: any) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error: any) {
    logger.error('❌ Error in auto-approval of past pending leaves job:', error);
  }
};



/**
 * Initialize and start all cron jobs
 */
export const initializeCronJobs = () => {
  // Daily pending leave reminders at 9:00 AM
  cron.schedule('0 9 * * *', sendDailyPendingLeaveReminders, {
    timezone: 'Asia/Kolkata' // Adjust timezone as needed
  });
  logger.info('✅ Cron job scheduled: Daily pending leave reminders (9:00 AM)');

  // Daily birthday wishes at 9:00 AM
  cron.schedule('0 9 * * *', sendBirthdayWishes, {
    timezone: 'Asia/Kolkata' // Adjust timezone as needed
  });
  logger.info('✅ Cron job scheduled: Daily birthday wishes (9:00 AM)');

  // Holiday List Reminder - Checks daily from Nov 23-30 to find the last working day
  // Note: We scan the date range including weekends, but the code logic explicitly checks for 
  // "Last Working Day" (Mon-Fri) and ignores Sat/Sun automatically.
  cron.schedule('0 9 23-30 11 *', checkAndSendHolidayListReminder, {
    timezone: 'Asia/Kolkata'
  });
  logger.info('✅ Cron job scheduled: Holiday List Reminder (Checks Nov 23-30 at 9:00 AM)');

  // Holiday cleanup once a year on Dec 31st at 00:00
  cron.schedule('0 0 31 12 *', cleanupOldHolidays, {
    timezone: 'Asia/Kolkata'
  });
  logger.info('✅ Cron job scheduled: Holiday cleanup (Annually Dec 31st 00:00)');



  // Auto-approve past pending leaves at 00:01 AM
  cron.schedule('1 0 * * *', autoApprovePastPendingLeaves, {
    timezone: 'Asia/Kolkata'
  });
  logger.info('✅ Cron job scheduled: Auto-approve past pending leaves (00:01 AM)');

  // Run on startup to ensure clean state
  cleanupOldHolidays();
  autoApprovePastPendingLeaves();

  // Run immediately on startup for testing (optional - remove in production)
  // sendDailyPendingLeaveReminders();
  // sendBirthdayWishes();

  // --- Timesheet Cron Jobs ---

  // 1. Daily Auto-Fill: Daily 08:00 AM
  cron.schedule('0 8 * * *', TimesheetService.processDailyAutoFill, {
    timezone: 'Asia/Kolkata'
  });
  logger.info('✅ Cron job scheduled: Timesheet Daily Auto-Fill (08:00 AM)');

  // 2. Daily Reminders: 5 PM Daily
  cron.schedule('0 17 * * *', TimesheetService.processDailyReminders, {
    timezone: 'Asia/Kolkata'
  });
  logger.info('✅ Cron job scheduled: Timesheet Daily Reminder (5 PM)');

  // 3. Friday Validation: 4 PM (Fri only)
  cron.schedule('0 16 * * 5', TimesheetService.processFridayValidation, {
    timezone: 'Asia/Kolkata'
  });
  logger.info('✅ Cron job scheduled: Timesheet Friday Validation (4 PM)');

  // 4. Weekly Auto-Processing: Sunday 11:59 PM
  cron.schedule('59 23 * * 0', TimesheetService.processWeeklySubmission, {
    timezone: 'Asia/Kolkata'
  });
  logger.info('✅ Cron job scheduled: Timesheet Weekly Processing (Sun 11:59 PM)');
};

