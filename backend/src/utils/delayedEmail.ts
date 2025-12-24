import { pool } from '../database/db';
import { sendEmail } from './email';
import { generateLeaveStatusEmail } from './emailTemplates';
import { logger } from './logger';

// Map to store scheduled email timeouts (key: leaveRequestId, value: NodeJS.Timeout)
const scheduledEmails = new Map<number, NodeJS.Timeout>();

/**
 * Schedule a delayed email for leave status update
 * @param leaveRequestId - The leave request ID
 * @param delayMinutes - Delay in minutes (default: 5)
 */
export const scheduleLeaveStatusEmail = (
  leaveRequestId: number,
  delayMinutes: number = 5
): void => {
  // Cancel any existing scheduled email for this leave request
  const existingTimeout = scheduledEmails.get(leaveRequestId);
  if (existingTimeout) {
    clearTimeout(existingTimeout);
    logger.info(`Cancelled existing scheduled email for leave request ${leaveRequestId}`);
  }

  // Schedule new email
  const delayMs = delayMinutes * 60 * 1000; // Convert minutes to milliseconds
  const timeout = setTimeout(async () => {
    try {
      await sendLeaveStatusEmailAfterDelay(leaveRequestId);
      scheduledEmails.delete(leaveRequestId);
    } catch (error) {
      logger.error(`Error sending delayed email for leave request ${leaveRequestId}:`, error);
      scheduledEmails.delete(leaveRequestId);
    }
  }, delayMs);

  scheduledEmails.set(leaveRequestId, timeout);
  logger.info(`Scheduled leave status email for leave request ${leaveRequestId} in ${delayMinutes} minutes`);
};

/**
 * Cancel a scheduled email for a leave request
 * @param leaveRequestId - The leave request ID
 */
export const cancelScheduledEmail = (leaveRequestId: number): void => {
  const timeout = scheduledEmails.get(leaveRequestId);
  if (timeout) {
    clearTimeout(timeout);
    scheduledEmails.delete(leaveRequestId);
    logger.info(`Cancelled scheduled email for leave request ${leaveRequestId}`);
  }
};

/**
 * Send leave status email after delay - checks current status and sends appropriate email
 * @param leaveRequestId - The leave request ID
 */
const sendLeaveStatusEmailAfterDelay = async (leaveRequestId: number): Promise<void> => {
  try {
    // Get current leave request status and details
    const leaveResult = await pool.query(
      `SELECT 
        lr.*,
        u.email as employee_email,
        u.first_name || ' ' || COALESCE(u.last_name, '') as employee_name,
        COALESCE(
          CASE 
            WHEN lr.super_admin_approved_by IS NOT NULL THEN 
              (SELECT first_name || ' ' || COALESCE(last_name, '') FROM users WHERE id = lr.super_admin_approved_by)
            WHEN lr.hr_approved_by IS NOT NULL THEN 
              (SELECT first_name || ' ' || COALESCE(last_name, '') FROM users WHERE id = lr.hr_approved_by)
            WHEN lr.manager_approved_by IS NOT NULL THEN 
              (SELECT first_name || ' ' || COALESCE(last_name, '') FROM users WHERE id = lr.manager_approved_by)
            ELSE NULL
          END,
          'System'
        ) as approver_name,
        CASE 
          WHEN lr.super_admin_approved_by IS NOT NULL THEN 'super_admin'
          WHEN lr.hr_approved_by IS NOT NULL THEN 'hr'
          WHEN lr.manager_approved_by IS NOT NULL THEN 'manager'
          ELSE 'system'
        END as approver_role
       FROM leave_requests lr
       JOIN users u ON lr.employee_id = u.id
       WHERE lr.id = $1`,
      [leaveRequestId]
    );

    if (leaveResult.rows.length === 0) {
      logger.warn(`Leave request ${leaveRequestId} not found when sending delayed email`);
      return;
    }

    const leave = leaveResult.rows[0];
    const employeeEmail = leave.employee_email;
    const employeeName = leave.employee_name || 'Employee';
    const approverName = leave.approver_name || 'System';
    const approverRole = leave.approver_role || 'system';

    if (!employeeEmail) {
      logger.warn(`Employee email not found for leave request ${leaveRequestId}`);
      return;
    }

    // Format dates for display
    const formatDateForEmail = (date: Date | string): string => {
      const d = typeof date === 'string' ? new Date(date) : date;
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    // Determine status - check if partially approved
    let status: 'approved' | 'rejected' | 'partially_approved';
    if (leave.current_status === 'rejected') {
      status = 'rejected';
    } else if (leave.current_status === 'approved') {
      // Check if there are any pending days
      const daysResult = await pool.query(
        'SELECT day_status FROM leave_days WHERE leave_request_id = $1',
        [leaveRequestId]
      );
      const hasPendingDays = daysResult.rows.some((d: any) => 
        d.day_status !== 'approved' && d.day_status !== 'rejected'
      );
      status = hasPendingDays ? 'partially_approved' : 'approved';
    } else {
      // Check day-wise status
      const daysResult = await pool.query(
        'SELECT day_status FROM leave_days WHERE leave_request_id = $1',
        [leaveRequestId]
      );
      const approvedDays = daysResult.rows.filter((d: any) => d.day_status === 'approved').length;
      const rejectedDays = daysResult.rows.filter((d: any) => d.day_status === 'rejected').length;
      const pendingDays = daysResult.rows.filter((d: any) => 
        d.day_status !== 'approved' && d.day_status !== 'rejected'
      ).length;

      if (approvedDays > 0 && (rejectedDays > 0 || pendingDays > 0)) {
        status = 'partially_approved';
      } else if (approvedDays > 0) {
        status = 'approved';
      } else {
        status = 'rejected';
      }
    }

    // Get rejection reason if rejected
    let rejectionReason: string | undefined;
    if (status === 'rejected') {
      rejectionReason = leave.super_admin_approval_comment || 
                        leave.hr_approval_comment || 
                        leave.manager_approval_comment || 
                        'No reason provided';
    }

    const emailData = {
      employeeName,
      employeeEmail,
      leaveType: leave.leave_type,
      startDate: formatDateForEmail(leave.start_date),
      endDate: formatDateForEmail(leave.end_date),
      noOfDays: parseFloat(leave.no_of_days) || 0,
      status,
      approverName,
      approverRole,
      rejectionReason,
    };

    const emailContent = generateLeaveStatusEmail(emailData);
    const emailSent = await sendEmail({
      to: employeeEmail,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
    });

    if (emailSent) {
      logger.info(`Delayed leave status email sent to employee ${employeeEmail} for leave request ${leaveRequestId} (Status: ${status})`);
    } else {
      logger.warn(`Failed to send delayed leave status email to employee ${employeeEmail}`);
    }
  } catch (error) {
    logger.error(`Error in sendLeaveStatusEmailAfterDelay for leave request ${leaveRequestId}:`, error);
    throw error;
  }
};

