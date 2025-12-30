import cron from 'node-cron';
import { pool } from '../database/db';
import { logger } from './logger';
import { sendPendingLeaveReminderEmail, sendBirthdayWishEmail } from './emailTemplates';

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
      WHERE u.role IN ('manager', 'hr')
        AND u.status = 'active'
        AND EXISTS (
          SELECT 1 FROM leave_requests lr
          JOIN users emp ON lr.employee_id = emp.id
          WHERE (emp.reporting_manager_id = u.id OR u.role IN ('hr', 'super_admin'))
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
          'SELECT role FROM users WHERE id = $1',
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
            lr.no_of_days,
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
      WHERE status = 'active'
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
        WHERE status = 'active'`
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

  // Run immediately on startup for testing (optional - remove in production)
  // sendDailyPendingLeaveReminders();
  // sendBirthdayWishes();
};

