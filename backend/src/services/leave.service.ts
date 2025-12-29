import { pool } from '../database/db';
import { calculateLeaveDays } from '../utils/dateCalculator';
import { AuthRequest } from '../middleware/auth.middleware';
import { logger } from '../utils/logger';
import { deleteFromOVH } from '../utils/storage';
import { sendLeaveApplicationEmail, sendLeaveStatusEmail, sendUrgentLeaveApplicationEmail, sendLopToCasualConversionEmail } from '../utils/emailTemplates';

// Local date formatter to avoid timezone shifts
const formatDate = (date: Date | string): string => {
  if (typeof date === 'string') {
    return date;
  }
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export interface LeaveBalance {
  casual: number;
  sick: number;
  lop: number;
}

export const getLeaveBalances = async (userId: number): Promise<LeaveBalance> => {
  logger.info(`[LEAVE] [GET LEAVE BALANCES] ========== FUNCTION CALLED ==========`);
  logger.info(`[LEAVE] [GET LEAVE BALANCES] User ID: ${userId}`);
  
  const result = await pool.query(
    'SELECT casual_balance, sick_balance, lop_balance FROM leave_balances WHERE employee_id = $1',
    [userId]
  );

  if (result.rows.length === 0) {
    logger.info(`[LEAVE] [GET LEAVE BALANCES] No balance record found, initializing with defaults`);
    // Initialize balance if not exists (casual and sick start at 0, only LOP has default)
    await pool.query(
      'INSERT INTO leave_balances (employee_id, casual_balance, sick_balance, lop_balance) VALUES ($1, 0, 0, 10)',
      [userId]
    );
    logger.info(`[LEAVE] [GET LEAVE BALANCES] Balance initialized - Casual: 0, Sick: 0, LOP: 10`);
    return { casual: 0, sick: 0, lop: 10 };
  }

  const balance = result.rows[0];
  const balances = {
    casual: parseFloat(balance.casual_balance) || 0,
    sick: parseFloat(balance.sick_balance) || 0,
    lop: parseFloat(balance.lop_balance) || 0
  };
  logger.info(`[LEAVE] [GET LEAVE BALANCES] Balances retrieved - Casual: ${balances.casual}, Sick: ${balances.sick}, LOP: ${balances.lop}`);
  return balances;
};

export const getHolidays = async (year?: number) => {
  logger.info(`[LEAVE] [GET HOLIDAYS] ========== FUNCTION CALLED ==========`);
  logger.info(`[LEAVE] [GET HOLIDAYS] Year: ${year || 'all'}`);
  
  try {
    let query = 'SELECT holiday_date, holiday_name FROM holidays WHERE is_active = true';
    const params: any[] = [];
    
    // Ensure year is a valid number if provided
    if (year !== undefined && year !== null && !isNaN(year)) {
      const yearNum = parseInt(String(year), 10);
      query += ' AND EXTRACT(YEAR FROM holiday_date) = $1';
      params.push(yearNum);
      logger.info(`[LEAVE] [GET HOLIDAYS] Fetching holidays for year: ${yearNum}`);
    } else {
      logger.info(`[LEAVE] [GET HOLIDAYS] Fetching all active holidays (no year filter)`);
    }
    
    query += ' ORDER BY holiday_date';
    
    const result = await pool.query(query, params);
    
    // Log for debugging
    logger.info(`[LEAVE] [GET HOLIDAYS] Fetched ${result.rows.length} holidays${year ? ` for year ${year}` : ''}`);
    
    return result.rows.map(row => ({
      date: formatDate(row.holiday_date),
      name: row.holiday_name
    }));
  } catch (error: any) {
    logger.error(`[LEAVE] [GET HOLIDAYS] Error fetching holidays:`, error);
    throw new Error(`Failed to fetch holidays: ${error.message || error.toString()}`);
  }
};

/**
 * Get Leave Rules - READ ONLY
 * 
 * IMPORTANT: The leave_rules table should NEVER be modified through the application.
 * This is a read-only function. No create, update, or delete operations should be
 * implemented for leave_rules. Any changes to leave rules must be done directly
 * in the database by authorized administrators only.
 */
export const getLeaveRules = async () => {
  logger.info(`[LEAVE] [GET LEAVE RULES] ========== FUNCTION CALLED ==========`);
  
  try {
    logger.info(`[LEAVE] [GET LEAVE RULES] Fetching active leave rules`);
    const result = await pool.query(
      'SELECT leave_required_min, leave_required_max, prior_information_days FROM leave_rules WHERE is_active = true ORDER BY leave_required_min'
    );
    logger.info(`[LEAVE] [GET LEAVE RULES] Found ${result.rows.length} active leave rules`);
    
    return result.rows.map(row => ({
      leaveRequired: row.leave_required_max 
        ? `${row.leave_required_min} to ${row.leave_required_max} days`
        : `More Than ${row.leave_required_min} days`,
      priorInformation: `${row.prior_information_days} ${row.prior_information_days === 1 ? 'day' : row.prior_information_days === 30 ? 'Month' : 'days'}`
    }));
  } catch (error: any) {
    logger.error(`[LEAVE] [GET LEAVE RULES] Error fetching leave rules:`, error);
    throw new Error(`Failed to fetch leave rules: ${error.message || error.toString()}`);
  }
};

export const applyLeave = async (
  userId: number,
  leaveData: {
    leaveType: string;
    startDate: string;
    startType: string;
    endDate: string;
    endType: string;
    reason: string;
    timeForPermission?: { start?: string; end?: string };
    doctorNote?: string;
  }
) => {
  logger.info(`[LEAVE] [APPLY LEAVE] ========== FUNCTION CALLED ==========`);
  logger.info(`[LEAVE] [APPLY LEAVE] User ID: ${userId}, Leave Type: ${leaveData.leaveType}, Start Date: ${leaveData.startDate}, End Date: ${leaveData.endDate}`);
  
  try {
    // Parse dates in local timezone to avoid timezone shift issues
    // Create date objects from YYYY-MM-DD strings by parsing in local timezone
    if (!leaveData.startDate || !leaveData.endDate) {
      logger.warn(`[LEAVE] [APPLY LEAVE] Missing start date or end date`);
      throw new Error('Start date and end date are required');
    }
    
    const [startYear, startMonth, startDay] = leaveData.startDate.split('-').map(Number);
    const [endYear, endMonth, endDay] = leaveData.endDate.split('-').map(Number);
    
    if (isNaN(startYear) || isNaN(startMonth) || isNaN(startDay) || 
        isNaN(endYear) || isNaN(endMonth) || isNaN(endDay)) {
      throw new Error('Invalid date format');
    }
    
    const startDate = new Date(startYear, startMonth - 1, startDay);
    const endDate = new Date(endYear, endMonth - 1, endDay);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(0, 0, 0, 0);

    // Validation: Cannot select weekends (Saturday = 6, Sunday = 0)
    const startDayOfWeek = startDate.getDay();
    const endDayOfWeek = endDate.getDay();
    if (startDayOfWeek === 0 || startDayOfWeek === 6) {
      throw new Error('Cannot select Saturday or Sunday as start date. Please select a weekday.');
    }
    if (endDayOfWeek === 0 || endDayOfWeek === 6) {
      throw new Error('Cannot select Saturday or Sunday as end date. Please select a weekday.');
    }

    // Validation: Sick leave can be applied for past 3 days (including today) or ONLY tomorrow for future dates
    // For future dates, can ONLY apply for next day (tomorrow), not any other future dates
    if (leaveData.leaveType === 'sick') {
      const msPerDay = 1000 * 60 * 60 * 24;
      const daysDifference = Math.floor((startDate.getTime() - today.getTime()) / msPerDay);
      
      // Allow past 3 days: today - 3, today - 2, today - 1, today (daysDifference: -3, -2, -1, 0)
      // For future dates: ONLY allow tomorrow (daysDifference === 1)
      if (daysDifference < -3) {
        throw new Error('Cannot apply sick leave for dates more than 3 days in the past.');
      }
      if (daysDifference > 1) {
        throw new Error('For future dates, sick leave can only be applied for tomorrow (next day). You can apply for past dates (up to 3 days) or tomorrow only.');
      }
      if (daysDifference === 0 && startDate > today) {
        // This shouldn't happen, but just in case
        throw new Error('Cannot apply sick leave for today as a future date. You can apply for past dates (up to 3 days) or tomorrow only.');
      }
      // daysDifference === 1 is allowed (tomorrow only)
      // daysDifference between -3 and 0 is allowed (past 3 days + today)
    } else if (leaveData.leaveType === 'lop' || leaveData.leaveType === 'permission') {
      // LOP and permission: today is allowed, but not past dates
      if (startDate < today) {
        throw new Error('Cannot apply for past dates.');
      }
    } else {
      // Casual leaves cannot be applied for today or past dates
      if (startDate <= today) {
        throw new Error('Cannot apply for past dates or today.');
      }
    }

    // Validation: casual needs at least 3 days notice (block today + next two days)
    // LOP can be applied at any date except past dates (no advance notice required)
    // Sick leave validation is already handled above
    if (leaveData.leaveType === 'casual') {
      const msPerDay = 1000 * 60 * 60 * 24;
      const daysUntilStart = Math.ceil((startDate.getTime() - today.getTime()) / msPerDay);
      if (daysUntilStart < 3) {
        throw new Error('Casual leaves must be applied at least 3 days in advance.');
      }
    }

    // Validation: End date must be >= start date
    if (endDate < startDate) {
      throw new Error('End date must be greater than or equal to start date');
    }

    // Validation: For sick leave, end date has same restrictions as start date
    // Can be applied for past 3 days (including today) or ONLY tomorrow for future dates
    if (leaveData.leaveType === 'sick') {
      const msPerDay = 1000 * 60 * 60 * 24;
      const endDaysDifference = Math.floor((endDate.getTime() - today.getTime()) / msPerDay);
      
      // Allow past 3 days: today - 3, today - 2, today - 1, today (endDaysDifference: -3, -2, -1, 0)
      // For future dates: ONLY allow tomorrow (endDaysDifference === 1)
      if (endDaysDifference < -3) {
        throw new Error('Cannot apply sick leave for end dates more than 3 days in the past.');
      }
      if (endDaysDifference > 1) {
        throw new Error('For future dates, sick leave end date can only be tomorrow (next day). You can apply for past dates (up to 3 days) or tomorrow only.');
      }
    }

    // Check for existing leaves on the requested dates (exclude rejected)
    // Use DATE comparison to ensure accurate matching
    const checkStartDateStr = `${startYear}-${String(startMonth).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`;
    const checkEndDateStr = `${endYear}-${String(endMonth).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;
    
    const existingLeavesCheck = await pool.query(
      `SELECT DISTINCT ld.leave_date::text as leave_date, ld.day_type, ld.day_status, lr.id as request_id
       FROM leave_days ld
       JOIN leave_requests lr ON ld.leave_request_id = lr.id
       WHERE ld.employee_id = $1
         AND ld.leave_date >= $2::date
         AND ld.leave_date <= $3::date
         AND ld.day_status != 'rejected'
         AND lr.current_status != 'rejected'
       ORDER BY leave_date`,
      [userId, checkStartDateStr, checkEndDateStr]
    );

    if (existingLeavesCheck.rows.length > 0) {
      // Check each requested day against existing leaves
      const normalizedStartType = (leaveData.startType === 'first_half' || leaveData.startType === 'second_half') ? 'half' : leaveData.startType;
      const normalizedEndType = (leaveData.endType === 'first_half' || leaveData.endType === 'second_half') ? 'half' : leaveData.endType;
      
      const { leaveDays: requestedLeaveDays } = await calculateLeaveDays(
        startDate,
        endDate,
        normalizedStartType as 'full' | 'half',
        normalizedEndType as 'full' | 'half'
      );

      for (const requestedDay of requestedLeaveDays) {
        const requestedDateStr = `${requestedDay.date.getFullYear()}-${String(requestedDay.date.getMonth() + 1).padStart(2, '0')}-${String(requestedDay.date.getDate()).padStart(2, '0')}`;
        
        // Find existing leave by comparing date strings (handle both Date objects and strings)
        const existingLeave = existingLeavesCheck.rows.find((row: any) => {
          let existingDateStr: string;
          if (row.leave_date instanceof Date) {
            existingDateStr = `${row.leave_date.getFullYear()}-${String(row.leave_date.getMonth() + 1).padStart(2, '0')}-${String(row.leave_date.getDate()).padStart(2, '0')}`;
          } else if (typeof row.leave_date === 'string') {
            existingDateStr = row.leave_date.split('T')[0];
          } else {
            // Try to parse as date
            const d = new Date(row.leave_date);
            existingDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          }
          return existingDateStr === requestedDateStr;
        });
        
        if (existingLeave) {
          const existingType = existingLeave.day_type;
          const existingStatus = existingLeave.day_status || 'pending';
          const statusText = existingStatus === 'approved' ? 'approved' : existingStatus === 'partially_approved' ? 'partially approved' : 'pending';
          
          // If existing leave is full day, block any new leave
          if (existingType === 'full') {
            throw new Error(`Leave already exists for ${requestedDateStr} (${statusText} - full day). Cannot apply leave on this date.`);
          }
          
          // If existing leave is half day
          if (existingType === 'half') {
            // Block if new request is full day
            if (requestedDay.type === 'full') {
              throw new Error(`Leave already exists for ${requestedDateStr} (${statusText} - half day). Cannot apply full day leave on this date.`);
            }
            // If both are half days, block to prevent conflicts
            if (requestedDay.type === 'half') {
              throw new Error(`Leave already exists for ${requestedDateStr} (${statusText} - half day). Cannot apply leave on this date.`);
            }
          }
        }
      }
    }

    // Calculate leave days
    // Normalize first_half/second_half to half for calculation
    const normalizedStartType = (leaveData.startType === 'first_half' || leaveData.startType === 'second_half') ? 'half' : leaveData.startType;
    const normalizedEndType = (leaveData.endType === 'first_half' || leaveData.endType === 'second_half') ? 'half' : leaveData.endType;
    
    const { days, leaveDays } = await calculateLeaveDays(
      startDate,
      endDate,
      normalizedStartType as 'full' | 'half',
      normalizedEndType as 'full' | 'half'
    );

    // Require timings for permission
    if (leaveData.leaveType === 'permission' && 
        (!leaveData.timeForPermission?.start || !leaveData.timeForPermission?.end)) {
      throw new Error('Start and end timings are required for permission requests');
    }

    // Check balance for all leave types (permission skips balance)
    if (leaveData.leaveType !== 'permission') {
      const balance = await getLeaveBalances(userId);
      const balanceKey = `${leaveData.leaveType}_balance` as keyof LeaveBalance;
      if (balance[balanceKey] < days) {
        throw new Error(`Insufficient ${leaveData.leaveType} leave balance`);
      }
    }

    // Format dates as YYYY-MM-DD for database
    const startDateStr = `${startYear}-${String(startMonth).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`;
    const endDateStr = `${endYear}-${String(endMonth).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;

    // Declare variables for employee and manager information
    let reportingManagerId: number | null = null;
    let employeeName = 'Employee';
    let employeeEmpId = '';
    let managerEmail: string | null = null;
    let hrId: number | null = null;
    let hrEmail: string | null = null;
    let managerName: string | null = null;
    let hrName: string | null = null;

    // Get employee's information, reporting manager details, and HR (manager's reporting manager)
    // This query needs to be outside transaction to get role information for email logic
    const userResult = await pool.query(
      `SELECT 
        u.role as employee_role,
        u.reporting_manager_id,
        u.first_name || ' ' || COALESCE(u.last_name, '') as employee_name,
        u.emp_id as employee_emp_id,
        rm.email as manager_email,
        rm.first_name || ' ' || COALESCE(rm.last_name, '') as manager_name,
        rm.role as manager_role,
        rm.reporting_manager_id as hr_id,
        hr.email as hr_email,
        hr.first_name || ' ' || COALESCE(hr.last_name, '') as hr_name,
        hr.role as hr_role
      FROM users u
      LEFT JOIN users rm ON u.reporting_manager_id = rm.id
      LEFT JOIN users hr ON rm.reporting_manager_id = hr.id
      WHERE u.id = $1`,
      [userId]
    );
    
    const employeeRole = userResult.rows[0]?.employee_role;
    reportingManagerId = userResult.rows[0]?.reporting_manager_id;
    employeeName = userResult.rows[0]?.employee_name || 'Employee';
    employeeEmpId = userResult.rows[0]?.employee_emp_id || '';
    managerEmail = userResult.rows[0]?.manager_email;
    const managerRole = userResult.rows[0]?.manager_role;
    hrId = userResult.rows[0]?.hr_id;
    hrEmail = userResult.rows[0]?.hr_email;
    const hrRole = userResult.rows[0]?.hr_role;
    managerName = userResult.rows[0]?.manager_name;
    hrName = userResult.rows[0]?.hr_name;

    // Use transaction for all database operations to ensure atomicity
    const client = await pool.connect();
    let leaveRequestId: number;
    
    try {
      await client.query('BEGIN');

      // Insert leave request (don't store urgent flag - it's only for email template)
      const leaveRequestResult = await client.query(
        `INSERT INTO leave_requests (
          employee_id, leave_type, start_date, start_type, end_date, end_type,
          reason, no_of_days, time_for_permission_start, time_for_permission_end, doctor_note
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id`,
        [
          userId,
          leaveData.leaveType,
          startDateStr,
          leaveData.startType,
          endDateStr,
          leaveData.endType,
          leaveData.reason,
          days,
          leaveData.timeForPermission?.start || null,
          leaveData.timeForPermission?.end || null,
          leaveData.doctorNote || null
        ]
      );

      leaveRequestId = leaveRequestResult.rows[0].id;

      // Insert leave days
      for (const leaveDay of leaveDays) {
        // Format leave day date properly
        const leaveDayDate = new Date(leaveDay.date);
        const ldYear = leaveDayDate.getFullYear();
        const ldMonth = String(leaveDayDate.getMonth() + 1).padStart(2, '0');
        const ldDay = String(leaveDayDate.getDate()).padStart(2, '0');
        const leaveDayDateStr = `${ldYear}-${ldMonth}-${ldDay}`;
        
        await client.query(
          `INSERT INTO leave_days (leave_request_id, leave_date, day_type, leave_type, employee_id)
           VALUES ($1, $2, $3, $4, $5)`,
          [leaveRequestId, leaveDayDateStr, leaveDay.type, leaveData.leaveType, userId]
        );
      }

      // Deduct balance immediately on apply (all leave types except permission)
      if (leaveData.leaveType !== 'permission') {
        const balanceColumn =
          leaveData.leaveType === 'casual'
            ? 'casual_balance'
            : leaveData.leaveType === 'sick'
            ? 'sick_balance'
            : 'lop_balance';

        await client.query(
          `UPDATE leave_balances 
           SET ${balanceColumn} = ${balanceColumn} - $1
           WHERE employee_id = $2`,
          [days, userId]
        );
      }


      await client.query('COMMIT');
      logger.info(`[LEAVE] [APPLY LEAVE] Transaction committed successfully - Leave Request ID: ${leaveRequestId}`);
    } catch (error: any) {
      // Rollback transaction - wrap in try-catch to handle already-aborted transactions
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError: any) {
        // Transaction might already be aborted, log but don't throw
        logger.warn('Error during rollback (transaction may already be aborted):', rollbackError.message);
      }
      logger.error(`Error applying leave for user ${userId}:`, error);
      throw error;
    } finally {
      // Always release the client connection
      client.release();
    }

    // Return response immediately - don't wait for emails
    // Send email notifications asynchronously (fire and forget)
    const appliedDate = new Date().toISOString().split('T')[0]; // Use current date, no need for extra query

    // Prepare email data
    const emailData = {
      employeeName,
      employeeEmpId,
      managerName: managerName || 'Manager',
      leaveType: leaveData.leaveType,
      startDate: startDateStr,
      startType: leaveData.startType,
      endDate: endDateStr,
      endType: leaveData.endType,
      noOfDays: days,
      reason: leaveData.reason,
      timeForPermissionStart: leaveData.timeForPermission?.start || null,
      timeForPermissionEnd: leaveData.timeForPermission?.end || null,
      doctorNote: leaveData.doctorNote || null,
      appliedDate: appliedDate
    };

    // Determine if urgent: only if start date is today (same day application)
    const isUrgent = startDate.getTime() === today.getTime();

    // Send email notifications asynchronously (don't await - fire and forget)
    // This allows the API to return immediately while emails are sent in the background
    // For employees: Send to reporting manager and manager's manager (HR)
    // For managers: Send to their reporting manager (HR/Super Admin) and HR's manager (Super Admin)
    // For HR: Send to their reporting manager (Super Admin)
    // For Super Admin: Send to their reporting manager (if exists)

    // Send email to reporting manager (if exists and has email) - ASYNC
    if (managerEmail && reportingManagerId) {
      // Fire and forget - don't await
      (async () => {
        try {
          const emailSent = isUrgent
            ? await sendUrgentLeaveApplicationEmail(managerEmail, emailData)
            : await sendLeaveApplicationEmail(managerEmail, emailData);
          if (emailSent) {
            logger.info(`${isUrgent ? 'Urgent (same-day) ' : ''}Leave application email sent to reporting manager (${managerRole || 'Manager'}): ${managerEmail} for leave request ${leaveRequestId} (applied by ${employeeRole})`);
          } else {
            logger.warn(`Failed to send leave application email to reporting manager: ${managerEmail} for leave request ${leaveRequestId}`);
          }
        } catch (emailError: any) {
          // Don't fail the leave application if email fails
          logger.error(`Error sending email to reporting manager for leave request ${leaveRequestId}:`, emailError);
        }
      })().catch(err => logger.error(`[LEAVE] [APPLY LEAVE] Unhandled error in async email send:`, err));
    }

    // Send email to manager's reporting manager (if exists and has email) - ASYNC
    // This handles: Employee → Manager → HR, Manager → HR → Super Admin, HR → Super Admin
    if (hrEmail && hrId && managerEmail !== hrEmail) {
      // Fire and forget - don't await
      (async () => {
        try {
          // Update manager name for the second email
          const hrEmailData = {
            ...emailData,
            managerName: hrName || (hrRole === 'hr' ? 'HR' : hrRole === 'super_admin' ? 'Super Admin' : 'Manager')
          };
          const emailSent = isUrgent
            ? await sendUrgentLeaveApplicationEmail(hrEmail, hrEmailData)
            : await sendLeaveApplicationEmail(hrEmail, hrEmailData);
          if (emailSent) {
            logger.info(`${isUrgent ? 'Urgent (same-day) ' : ''}Leave application email sent to manager's reporting manager (${hrRole || 'HR'}): ${hrEmail} for leave request ${leaveRequestId} (applied by ${employeeRole})`);
          } else {
            logger.warn(`Failed to send leave application email to manager's reporting manager: ${hrEmail} for leave request ${leaveRequestId}`);
          }
        } catch (emailError: any) {
          // Don't fail the leave application if email fails
          logger.error(`Error sending email to manager's reporting manager for leave request ${leaveRequestId}:`, emailError);
        }
      })().catch(err => logger.error(`[LEAVE] [APPLY LEAVE] Unhandled error in async email send:`, err));
    }

    logger.info(`[LEAVE] [APPLY LEAVE] Leave application completed successfully - Leave Request ID: ${leaveRequestId}, Emails queued for async sending`);
    return { leaveRequestId, message: 'Leave request submitted successfully' };
  } catch (error: any) {
    console.error('Error in applyLeave:', error);
    console.error('Error stack:', error.stack);
    console.error('Leave data:', leaveData);
    console.error('User ID:', userId);
    // Re-throw with more context
    if (error.message) {
      throw error;
    } else {
      throw new Error(`Failed to apply leave: ${error.toString()}`);
    }
  }
};

export const getMyLeaveRequests = async (
  userId: number,
  page: number = 1,
  limit: number = 10,
  status?: string,
  userRole?: string
) => {
  logger.info(`[LEAVE] [GET MY LEAVE REQUESTS] ========== FUNCTION CALLED ==========`);
  logger.info(`[LEAVE] [GET MY LEAVE REQUESTS] User ID: ${userId}, Page: ${page}, Limit: ${limit}, Status: ${status || 'all'}, Role: ${userRole || 'none'}`);
  
  try {
    const offset = (page - 1) * limit;
    let query = `
      SELECT lr.id, lr.applied_date, lr.reason as leave_reason, lr.start_date, lr.start_type, lr.end_date, lr.end_type,
             lr.no_of_days, lr.leave_type, lr.current_status, lr.doctor_note,
             lr.manager_approval_comment, lr.hr_approval_comment, lr.super_admin_approval_comment,
             lr.last_updated_by, lr.last_updated_by_role,
             last_updater.first_name || ' ' || COALESCE(last_updater.last_name, '') AS approver_name
      FROM leave_requests lr
      LEFT JOIN users last_updater ON last_updater.id = lr.last_updated_by
      WHERE lr.employee_id = $1
    `;
    const params: any[] = [userId];
  
  if (status) {
    query += ' AND current_status = $2';
    params.push(status);
    query += ' ORDER BY applied_date DESC LIMIT $3 OFFSET $4';
    params.push(limit, offset);
  } else {
    query += ' ORDER BY applied_date DESC LIMIT $2 OFFSET $3';
    params.push(limit, offset);
  }

  const result = await pool.query(query, params);
  const countResult = await pool.query(
    'SELECT COUNT(*) FROM leave_requests WHERE employee_id = $1' + (status ? ' AND current_status = $2' : ''),
    status ? [userId, status] : [userId]
  );

  // Helper function to format date without timezone conversion
  const formatDate = (date: Date | string): string => {
    if (typeof date === 'string') {
      return date;
    }
    const d = new Date(date);
    // Use local timezone to avoid day shift
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const requests = [];
  for (const row of result.rows) {
    const daysResult = await pool.query(
      'SELECT leave_date, day_type, day_status FROM leave_days WHERE leave_request_id = $1 ORDER BY leave_date',
      [row.id]
    );
    const days = daysResult.rows || [];
    const totalDays = days.length || parseFloat(row.no_of_days) || 0;
    const approvedDays = days.reduce((acc, d) => acc + (d.day_status === 'approved' ? (d.day_type === 'half' ? 0.5 : 1) : 0), 0);
    const rejectedDays = days.reduce((acc, d) => acc + (d.day_status === 'rejected' ? (d.day_type === 'half' ? 0.5 : 1) : 0), 0);
    const pendingDays = days.reduce((acc, d) => acc + (d.day_status !== 'approved' && d.day_status !== 'rejected' ? (d.day_type === 'half' ? 0.5 : 1) : 0), 0);

    let displayStatus = row.current_status;
    if (approvedDays > 0 && (rejectedDays > 0 || pendingDays > 0)) {
      displayStatus = 'partially_approved';
    } else if (approvedDays > 0 && rejectedDays === 0 && pendingDays === 0) {
      displayStatus = 'approved';
    } else if (rejectedDays > 0 && approvedDays === 0 && pendingDays === 0) {
      displayStatus = 'rejected';
    } else if (pendingDays > 0 && approvedDays === 0 && rejectedDays === 0) {
      displayStatus = 'pending';
    }

    // Get rejection reason only if status is rejected (priority: super_admin > hr > manager)
    const rejectionReason = (displayStatus === 'rejected') 
      ? (row.super_admin_approval_comment || row.hr_approval_comment || row.manager_approval_comment || null)
      : null;
    
    // Get approver name from last_updated_by fields
    let approverName: string | null = row.approver_name || null;
    let approverRole: string | null = null;
    
    // Map role from database to display format
    if (row.last_updated_by_role === 'super_admin') {
      approverRole = 'Super Admin';
    } else if (row.last_updated_by_role === 'hr') {
      approverRole = 'HR';
    } else if (row.last_updated_by_role === 'manager') {
      approverRole = 'Manager';
    }

    requests.push({
      id: row.id,
      appliedDate: formatDate(row.applied_date),
      leaveReason: row.leave_reason,
      startDate: formatDate(row.start_date),
      startType: row.start_type || 'full',
      endDate: formatDate(row.end_date),
      endType: row.end_type || 'full',
      noOfDays: approvedDays > 0 ? approvedDays : parseFloat(row.no_of_days),
      leaveType: row.leave_type,
      currentStatus: displayStatus,
      rejectionReason,
      approverName,
      approverRole,
      doctorNote: row.doctor_note || null,
      // HR and Super Admin can edit/delete any leave, regular users can only edit/delete pending leaves
      canEdit: row.current_status === 'pending' || userRole === 'hr' || userRole === 'super_admin',
      canDelete: row.current_status === 'pending' || userRole === 'hr' || userRole === 'super_admin',
      leaveDays: days.map(d => ({
        date: formatDate(d.leave_date),
        type: d.day_type,
        status: d.day_status || 'pending'
      })),
      approvedDays,
      rejectedDays,
      pendingDays,
      totalDays
    });
  }

    return {
      requests,
      pagination: {
        page,
        limit,
        total: parseInt(countResult.rows[0].count)
      }
    };
  } catch (error: any) {
    logger.error(`[LEAVE] [GET MY LEAVE REQUESTS] Error fetching my leave requests:`, error);
    throw new Error(`Failed to fetch leave requests: ${error.message || error.toString()}`);
  }
};

export const getLeaveRequestById = async (requestId: number, userId: number, userRole?: string) => {
  logger.info(`[LEAVE] [GET LEAVE REQUEST BY ID] ========== FUNCTION CALLED ==========`);
  logger.info(`[LEAVE] [GET LEAVE REQUEST BY ID] Request ID: ${requestId}, User ID: ${userId}, User Role: ${userRole || 'none'}`);
  
  if (isNaN(requestId) || requestId <= 0) {
    logger.warn(`[LEAVE] [GET LEAVE REQUEST BY ID] Invalid leave request ID: ${requestId}`);
    throw new Error('Invalid leave request ID');
  }

  // HR and Super Admin can view any leave
  // Managers can view leaves of their direct reports
  // Others can only view their own
  const canViewAny = userRole === 'super_admin' || userRole === 'hr';
  
  let query: string;
  let params: any[];
  
  if (canViewAny) {
    query = `SELECT lr.id, lr.leave_type, lr.start_date, lr.start_type, lr.end_date, lr.end_type, 
                lr.reason, lr.time_for_permission_start, lr.time_for_permission_end,
                lr.current_status, lr.employee_id, lr.doctor_note,
                lr.manager_approval_comment, lr.hr_approval_comment, lr.super_admin_approval_comment,
                lr.last_updated_by, lr.last_updated_by_role,
                last_updater.first_name || ' ' || COALESCE(last_updater.last_name, '') AS approver_name
         FROM leave_requests lr
         LEFT JOIN users last_updater ON last_updater.id = lr.last_updated_by
         WHERE lr.id = $1`;
    params = [requestId];
  } else if (userRole === 'manager') {
    // Managers can view leaves of their direct reports
    query = `SELECT lr.id, lr.leave_type, lr.start_date, lr.start_type, lr.end_date, lr.end_type, 
                lr.reason, lr.time_for_permission_start, lr.time_for_permission_end,
                lr.current_status, lr.employee_id, lr.doctor_note,
                lr.manager_approval_comment, lr.hr_approval_comment, lr.super_admin_approval_comment,
                lr.last_updated_by, lr.last_updated_by_role,
                last_updater.first_name || ' ' || COALESCE(last_updater.last_name, '') AS approver_name
         FROM leave_requests lr
         JOIN users u ON lr.employee_id = u.id
         LEFT JOIN users last_updater ON last_updater.id = lr.last_updated_by
         WHERE lr.id = $1 AND (lr.employee_id = $2 OR u.reporting_manager_id = $2)`;
    params = [requestId, userId];
  } else {
    // Others can only view their own leaves
    query = `SELECT lr.id, lr.leave_type, lr.start_date, lr.start_type, lr.end_date, lr.end_type, 
            lr.reason, lr.time_for_permission_start, lr.time_for_permission_end,
            lr.current_status, lr.employee_id, lr.doctor_note,
            lr.manager_approval_comment, lr.hr_approval_comment, lr.super_admin_approval_comment,
            lr.last_updated_by, lr.last_updated_by_role,
            last_updater.first_name || ' ' || COALESCE(last_updater.last_name, '') AS approver_name
     FROM leave_requests lr
     LEFT JOIN users last_updater ON last_updater.id = lr.last_updated_by
     WHERE lr.id = $1 AND lr.employee_id = $2`;
    params = [requestId, userId];
  }
  
  const result = await pool.query(query, params);

  if (result.rows.length === 0) {
    // Log for debugging
    logger.warn(`Leave request not found: requestId=${requestId}, userId=${userId}, userRole=${userRole}`);
    throw new Error('Leave request not found or you do not have permission to access it');
  }

  const row = result.rows[0];
  
  // Note: We allow viewing all requests regardless of status
  // The edit/delete restrictions are handled in the update/delete functions

  // Helper function to format date without timezone conversion
  const formatDate = (date: Date | string): string => {
    if (typeof date === 'string') {
      return date;
    }
    const d = new Date(date);
    // Use local timezone to avoid day shift
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Get rejection reason only if status is rejected (priority: super_admin > hr > manager)
  const rejectionReason = (row.current_status === 'rejected') 
    ? (row.super_admin_approval_comment || row.hr_approval_comment || row.manager_approval_comment || null)
    : null;
  
  // Get approver name from last_updated_by fields
  let approverName: string | null = row.approver_name || null;
  let approverRole: string | null = null;
  
  // Map role from database to display format
  if (row.last_updated_by_role === 'super_admin') {
    approverRole = 'Super Admin';
  } else if (row.last_updated_by_role === 'hr') {
    approverRole = 'HR';
  } else if (row.last_updated_by_role === 'manager') {
    approverRole = 'Manager';
  }

  return {
    id: row.id,
    leaveType: row.leave_type,
    startDate: formatDate(row.start_date),
    startType: row.start_type,
    endDate: formatDate(row.end_date),
    endType: row.end_type,
    reason: row.reason,
    rejectionReason,
    approverName,
    approverRole,
    timeForPermission: row.time_for_permission_start && row.time_for_permission_end ? {
      start: typeof row.time_for_permission_start === 'string' ? row.time_for_permission_start : row.time_for_permission_start.toString().substring(0, 5),
      end: typeof row.time_for_permission_end === 'string' ? row.time_for_permission_end : row.time_for_permission_end.toString().substring(0, 5)
    } : undefined
  };
};

export const updateLeaveRequest = async (
  requestId: number,
  userId: number,
  userRole: string,
  leaveData: {
    leaveType: string;
    startDate: string;
    startType: string;
    endDate: string;
    endType: string;
    reason: string;
    timeForPermission?: { start?: string; end?: string };
    doctorNote?: string;
  }
) => {
  logger.info(`[LEAVE] [UPDATE LEAVE REQUEST] ========== FUNCTION CALLED ==========`);
  logger.info(`[LEAVE] [UPDATE LEAVE REQUEST] Request ID: ${requestId}, User ID: ${userId}, Role: ${userRole}, Leave Type: ${leaveData.leaveType}, Start: ${leaveData.startDate}, End: ${leaveData.endDate}`);
  // Verify the request and authorization
  const checkResult = await pool.query(
    'SELECT current_status, employee_id FROM leave_requests WHERE id = $1',
    [requestId]
  );

  if (checkResult.rows.length === 0) {
    throw new Error('Leave request not found');
  }

  const belongsToUser = checkResult.rows[0].employee_id === userId;
  const currentStatus = checkResult.rows[0].current_status;
  
  // HR and Super Admin can edit any leave (approved, rejected, etc.)
  // Regular users can only edit pending leaves
  const canEdit = currentStatus === 'pending' || userRole === 'hr' || userRole === 'super_admin';

  if (!canEdit) {
    throw new Error('Only pending leave requests can be edited');
  }
  
  // Authorization: Super Admin and HR can edit any leave, others can only edit their own
  if (userRole !== 'super_admin' && userRole !== 'hr' && !belongsToUser) {
    throw new Error('You do not have permission to edit this leave request');
  }

  // Parse dates in local timezone to avoid timezone shift issues
  // Create date objects from YYYY-MM-DD strings by parsing in local timezone
  if (!leaveData.startDate || !leaveData.endDate) {
    throw new Error('Start date and end date are required');
  }
  
  const [startYear, startMonth, startDay] = leaveData.startDate.split('-').map(Number);
  const [endYear, endMonth, endDay] = leaveData.endDate.split('-').map(Number);
  
  if (isNaN(startYear) || isNaN(startMonth) || isNaN(startDay) || 
      isNaN(endYear) || isNaN(endMonth) || isNaN(endDay)) {
    throw new Error('Invalid date format');
  }
  
    const startDate = new Date(startYear, startMonth - 1, startDay);
    const endDate = new Date(endYear, endMonth - 1, endDay);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(0, 0, 0, 0);

    // Validation: Cannot select weekends (Saturday = 6, Sunday = 0)
    const startDayOfWeek = startDate.getDay();
    const endDayOfWeek = endDate.getDay();
    if (startDayOfWeek === 0 || startDayOfWeek === 6) {
      throw new Error('Cannot select Saturday or Sunday as start date. Please select a weekday.');
    }
    if (endDayOfWeek === 0 || endDayOfWeek === 6) {
      throw new Error('Cannot select Saturday or Sunday as end date. Please select a weekday.');
    }

    // Validation: Sick leave can be applied for past 3 days (including today) or ONLY tomorrow for future dates
    // For future dates, can ONLY apply for next day (tomorrow), not any other future dates
    if (leaveData.leaveType === 'sick') {
      const msPerDay = 1000 * 60 * 60 * 24;
      const daysDifference = Math.floor((startDate.getTime() - today.getTime()) / msPerDay);
      
      // Allow past 3 days: today - 3, today - 2, today - 1, today (daysDifference: -3, -2, -1, 0)
      // For future dates: ONLY allow tomorrow (daysDifference === 1)
      if (daysDifference < -3) {
        throw new Error('Cannot apply sick leave for dates more than 3 days in the past.');
      }
      if (daysDifference > 1) {
        throw new Error('For future dates, sick leave can only be applied for tomorrow (next day). You can apply for past dates (up to 3 days) or tomorrow only.');
      }
      if (daysDifference === 0 && startDate > today) {
        // This shouldn't happen, but just in case
        throw new Error('Cannot apply sick leave for today as a future date. You can apply for past dates (up to 3 days) or tomorrow only.');
      }
      // daysDifference === 1 is allowed (tomorrow only)
      // daysDifference between -3 and 0 is allowed (past 3 days + today)
    } else if (leaveData.leaveType === 'lop') {
      // LOP: today is allowed, but not past dates
      if (startDate < today) {
        throw new Error('Cannot apply for past dates.');
      }
    } else {
      if (startDate <= today) {
        throw new Error('Cannot apply for past dates or today.');
      }
    }

  // Validation: casual needs at least 3 days notice (block today + next two days)
  // LOP can be applied at any date except past dates (no advance notice required)
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysUntilStart = Math.ceil((startDate.getTime() - today.getTime()) / msPerDay);
  if (leaveData.leaveType === 'casual' && daysUntilStart < 3) {
    throw new Error('Casual leaves must be applied at least 3 days in advance.');
  }

  // Validation: End date must be >= start date
  if (endDate < startDate) {
    throw new Error('End date must be greater than or equal to start date');
  }

  // Validation: For sick leave, end date has same restrictions as start date
  // Can be applied for past 3 days (including today) or ONLY tomorrow for future dates
  if (leaveData.leaveType === 'sick') {
    const msPerDay = 1000 * 60 * 60 * 24;
    const endDaysDifference = Math.floor((endDate.getTime() - today.getTime()) / msPerDay);
    
    // Allow past 3 days: today - 3, today - 2, today - 1, today (endDaysDifference: -3, -2, -1, 0)
    // For future dates: ONLY allow tomorrow (endDaysDifference === 1)
    if (endDaysDifference < -3) {
      throw new Error('Cannot apply sick leave for end dates more than 3 days in the past.');
    }
    if (endDaysDifference > 1) {
      throw new Error('For future dates, sick leave end date can only be tomorrow (next day). You can apply for past dates (up to 3 days) or tomorrow only.');
    }
  }

  // Check for existing leaves on the requested dates (exclude rejected and the request being updated)
  // Use DATE comparison to ensure accurate matching
  const checkStartDateStr = `${startYear}-${String(startMonth).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`;
  const checkEndDateStr = `${endYear}-${String(endMonth).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;
  
  const existingLeavesCheck = await pool.query(
    `SELECT DISTINCT ld.leave_date::text as leave_date, ld.day_type, ld.day_status, lr.id as request_id
     FROM leave_days ld
     JOIN leave_requests lr ON ld.leave_request_id = lr.id
     WHERE ld.employee_id = $1
       AND ld.leave_request_id != $2
       AND ld.leave_date >= $3::date
       AND ld.leave_date <= $4::date
       AND ld.day_status != 'rejected'
       AND lr.current_status != 'rejected'
     ORDER BY leave_date`,
    [userId, requestId, checkStartDateStr, checkEndDateStr]
  );

  if (existingLeavesCheck.rows.length > 0) {
    // Check each requested day against existing leaves
    const normalizedStartType = (leaveData.startType === 'first_half' || leaveData.startType === 'second_half') ? 'half' : leaveData.startType;
    const normalizedEndType = (leaveData.endType === 'first_half' || leaveData.endType === 'second_half') ? 'half' : leaveData.endType;
    
    const { leaveDays: requestedLeaveDays } = await calculateLeaveDays(
      startDate,
      endDate,
      normalizedStartType as 'full' | 'half',
      normalizedEndType as 'full' | 'half'
    );

    for (const requestedDay of requestedLeaveDays) {
      const requestedDateStr = `${requestedDay.date.getFullYear()}-${String(requestedDay.date.getMonth() + 1).padStart(2, '0')}-${String(requestedDay.date.getDate()).padStart(2, '0')}`;
      
      // Find existing leave by comparing date strings (handle both Date objects and strings)
      const existingLeave = existingLeavesCheck.rows.find((row: any) => {
        let existingDateStr: string;
        if (row.leave_date instanceof Date) {
          existingDateStr = `${row.leave_date.getFullYear()}-${String(row.leave_date.getMonth() + 1).padStart(2, '0')}-${String(row.leave_date.getDate()).padStart(2, '0')}`;
        } else if (typeof row.leave_date === 'string') {
          existingDateStr = row.leave_date.split('T')[0];
        } else {
          // Try to parse as date
          const d = new Date(row.leave_date);
          existingDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        }
        return existingDateStr === requestedDateStr;
      });
      
      if (existingLeave) {
        const existingType = existingLeave.day_type;
        const existingStatus = existingLeave.day_status || 'pending';
        const statusText = existingStatus === 'approved' ? 'approved' : existingStatus === 'partially_approved' ? 'partially approved' : 'pending';
        
        // If existing leave is full day, block any new leave
        if (existingType === 'full') {
          throw new Error(`Leave already exists for ${requestedDateStr} (${statusText} - full day). Cannot apply leave on this date.`);
        }
        
        // If existing leave is half day
        if (existingType === 'half') {
          // Block if new request is full day
          if (requestedDay.type === 'full') {
            throw new Error(`Leave already exists for ${requestedDateStr} (${statusText} - half day). Cannot apply full day leave on this date.`);
          }
          // If both are half days, block to prevent conflicts
          if (requestedDay.type === 'half') {
            throw new Error(`Leave already exists for ${requestedDateStr} (${statusText} - half day). Cannot apply leave on this date.`);
          }
        }
      }
    }
  }

  // Normalize first_half/second_half to half for calculation
  const normalizedStartType = (leaveData.startType === 'first_half' || leaveData.startType === 'second_half') ? 'half' : leaveData.startType;
  const normalizedEndType = (leaveData.endType === 'first_half' || leaveData.endType === 'second_half') ? 'half' : leaveData.endType;
  
  // Calculate leave days
  const { days, leaveDays } = await calculateLeaveDays(
    startDate,
    endDate,
    normalizedStartType as 'full' | 'half',
    normalizedEndType as 'full' | 'half'
  );

  // Require timings for permission
  if (leaveData.leaveType === 'permission' && 
      (!leaveData.timeForPermission?.start || !leaveData.timeForPermission?.end)) {
    throw new Error('Start and end timings are required for permission requests');
  }

  // For all leave types except permission, enforce available balance > 0 and sufficient for requested days
    if (leaveData.leaveType !== 'permission') {
      const balance = await getLeaveBalances(userId);
      const balanceKey = `${leaveData.leaveType}_balance` as keyof LeaveBalance;
      const currentBalance = balance[balanceKey];
      
      if (currentBalance <= 0) {
        throw new Error(`Insufficient ${leaveData.leaveType} leave balance. Available: ${currentBalance}, Required: ${days}`);
      }
      if (currentBalance < days) {
        throw new Error(`Insufficient ${leaveData.leaveType} leave balance. Available: ${currentBalance}, Required: ${days}`);
      }
    }

  // Start transaction
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Delete old leave days
    await client.query('DELETE FROM leave_days WHERE leave_request_id = $1', [requestId]);

    // Format dates as YYYY-MM-DD for database
    const startDateStr = `${startYear}-${String(startMonth).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`;
    const endDateStr = `${endYear}-${String(endMonth).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;

    // Update leave request
    await client.query(
      `UPDATE leave_requests 
       SET leave_type = $1, start_date = $2, start_type = $3, end_date = $4, end_type = $5,
           reason = $6, no_of_days = $7, time_for_permission_start = $8, time_for_permission_end = $9,
           doctor_note = $10, updated_at = CURRENT_TIMESTAMP
       WHERE id = $11`,
      [
        leaveData.leaveType,
        startDateStr,
        leaveData.startType,
        endDateStr,
        leaveData.endType,
        leaveData.reason,
        days,
        leaveData.timeForPermission?.start || null,
        leaveData.timeForPermission?.end || null,
        leaveData.doctorNote || null,
        requestId
      ]
    );

    // Insert new leave days
    for (const day of leaveDays) {
      // Format leave day date properly
      const leaveDayDate = new Date(day.date);
      const ldYear = leaveDayDate.getFullYear();
      const ldMonth = String(leaveDayDate.getMonth() + 1).padStart(2, '0');
      const ldDay = String(leaveDayDate.getDate()).padStart(2, '0');
      const leaveDayDateStr = `${ldYear}-${ldMonth}-${ldDay}`;
      
      await client.query(
        'INSERT INTO leave_days (leave_request_id, leave_date, day_type, leave_type, employee_id) VALUES ($1, $2, $3, $4, $5)',
        [requestId, leaveDayDateStr, day.type, leaveData.leaveType, userId]
      );
    }

    await client.query('COMMIT');

    return { message: 'Leave request updated successfully', id: requestId };
  } catch (error: any) {
    // Rollback transaction - wrap in try-catch to handle already-aborted transactions
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError: any) {
      // Transaction might already be aborted, log but don't throw
      logger.warn('Error during rollback (transaction may already be aborted):', rollbackError.message);
    }
    throw error;
  } finally {
    // Always release the client connection
    client.release();
  }
};

/**
 * Convert leave request from LOP to Casual
 * Only HR and Super Admin can perform this conversion
 * This will:
 * 1. Change leave_type from 'lop' to 'casual'
 * 2. Refund LOP balance (add back the days)
 * 3. Deduct casual balance (if sufficient)
 */
export const convertLeaveRequestLopToCasual = async (
  requestId: number,
  userId: number,
  userRole: string
) => {
  logger.info(`[LEAVE] [CONVERT LOP TO CASUAL] ========== FUNCTION CALLED ==========`);
  logger.info(`[LEAVE] [CONVERT LOP TO CASUAL] Request ID: ${requestId}, User ID: ${userId}, Role: ${userRole}`);
  
  // Only HR and Super Admin can convert leave types
  if (userRole !== 'hr' && userRole !== 'super_admin') {
    logger.warn(`[LEAVE] [CONVERT LOP TO CASUAL] Unauthorized attempt - User ID: ${userId}, Role: ${userRole}`);
    throw new Error('Only HR and Super Admin can convert leave types');
  }

  // Get leave request details with employee, approver, manager, and HR information
  const leaveResult = await pool.query(
    `SELECT 
      lr.id, lr.employee_id, lr.leave_type, lr.no_of_days, lr.current_status,
      lr.start_date, lr.start_type, lr.end_date, lr.end_type, lr.reason,
      u.first_name || ' ' || COALESCE(u.last_name, '') as employee_name,
      u.email as employee_email,
      u.emp_id as employee_emp_id,
      u.reporting_manager_id,
      approver.first_name || ' ' || COALESCE(approver.last_name, '') as converter_name,
      manager.email as manager_email,
      manager.first_name || ' ' || COALESCE(manager.last_name, '') as manager_name,
      hr.email as hr_email,
      hr.first_name || ' ' || COALESCE(hr.last_name, '') as hr_name
     FROM leave_requests lr
     JOIN users u ON lr.employee_id = u.id
     LEFT JOIN users approver ON approver.id = $2
     LEFT JOIN users manager ON u.reporting_manager_id = manager.id
     LEFT JOIN users hr ON manager.reporting_manager_id = hr.id
     WHERE lr.id = $1`,
    [requestId, userId]
  );

  if (leaveResult.rows.length === 0) {
    throw new Error('Leave request not found');
  }

  const leave = leaveResult.rows[0];

  logger.info(`[CONVERT LOP TO CASUAL] ========== FUNCTION CALLED ==========`);
  logger.info(`[CONVERT LOP TO CASUAL] Request ID: ${requestId}, User ID: ${userId}, Role: ${userRole}`);
  logger.info(`[CONVERT LOP TO CASUAL] Leave data:`, {
    employee_id: leave.employee_id,
    employee_name: leave.employee_name,
    employee_email: leave.employee_email,
    employee_emp_id: leave.employee_emp_id,
    leave_type: leave.leave_type,
    no_of_days: leave.no_of_days,
    hr_email: leave.hr_email,
    hr_name: leave.hr_name
  });

  // Only allow conversion from LOP to Casual
  if (leave.leave_type !== 'lop') {
    throw new Error('Can only convert LOP leave requests to Casual. Current leave type is not LOP.');
  }

  const employeeId = leave.employee_id;
  const noOfDays = parseFloat(leave.no_of_days) || 0;

  if (noOfDays <= 0) {
    throw new Error('Invalid number of days in leave request');
  }

  // Get current balances
  const balanceResult = await pool.query(
    'SELECT casual_balance, lop_balance FROM leave_balances WHERE employee_id = $1',
    [employeeId]
  );

  let currentCasual = 0;
  let currentLop = 0;

  if (balanceResult.rows.length === 0) {
    // Create balance record if it doesn't exist
    await pool.query(
      'INSERT INTO leave_balances (employee_id, casual_balance, sick_balance, lop_balance) VALUES ($1, 0, 0, 0)',
      [employeeId]
    );
  } else {
    currentCasual = parseFloat(balanceResult.rows[0].casual_balance || '0') || 0;
    currentLop = parseFloat(balanceResult.rows[0].lop_balance || '0') || 0;
  }

  // Check if casual balance is sufficient after conversion
  // When converting: refund LOP (add back), deduct Casual (subtract)
  let newLopBalance = currentLop + noOfDays; // Refund LOP
  const newCasualBalance = currentCasual - noOfDays; // Deduct Casual

  // Check if casual balance would go negative
  if (newCasualBalance < 0) {
    throw new Error(`Insufficient casual balance. Current: ${currentCasual}, Required: ${noOfDays}`);
  }

  // Check if casual balance would exceed 99 days (shouldn't happen since we're deducting, but check anyway)
  if (newCasualBalance > 99) {
    throw new Error(`Cannot convert. Casual balance would exceed 99 days. Current: ${currentCasual}, After conversion: ${newCasualBalance}`);
  }

  // Ensure LOP balance never exceeds 10
  if (newLopBalance > 10) {
    logger.warn(
      `LOP balance would exceed 10 after conversion. Current: ${currentLop}, Refunding: ${noOfDays}, Would be: ${newLopBalance}. Capping at 10.`
    );
    newLopBalance = 10;
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Update leave_type from LOP to Casual
    await client.query(
      `UPDATE leave_requests 
       SET leave_type = 'casual',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [requestId]
    );

    // Update leave_days to reflect new leave type
    await client.query(
      `UPDATE leave_days 
       SET leave_type = 'casual'
       WHERE leave_request_id = $1`,
      [requestId]
    );

    // Adjust balances:
    // Refund LOP (add back the days that were deducted when leave was applied)
    // Deduct Casual (subtract the days)
    await client.query(
      `UPDATE leave_balances 
       SET lop_balance = $1,
           casual_balance = $2,
           last_updated = CURRENT_TIMESTAMP,
           updated_by = $3
       WHERE employee_id = $4`,
      [newLopBalance, newCasualBalance, userId, employeeId]
    );

    await client.query('COMMIT');

    logger.info(
      `Leave request ${requestId} converted from LOP to Casual by ${userRole} (user ${userId}). ` +
      `Employee: ${leave.employee_name}, Days: ${noOfDays}. ` +
      `Balances: LOP ${currentLop} → ${newLopBalance} (refunded), Casual ${currentCasual} → ${newCasualBalance} (deducted)`
    );

    // ========== SEND EMAIL NOTIFICATIONS ==========
    logger.info(`[EMAIL] ========== STARTING EMAIL NOTIFICATION FOR LOP TO CASUAL CONVERSION ==========`);
    logger.info(`[EMAIL] Request ID: ${requestId}, Converter ID: ${userId}, Converter Role: ${userRole}`);
    
    const emailData = {
      employeeName: leave.employee_name || 'Employee',
      employeeEmpId: leave.employee_emp_id || '',
      leaveType: 'casual', // After conversion
      startDate: leave.start_date,
      startType: leave.start_type || 'full',
      endDate: leave.end_date,
      endType: leave.end_type || 'full',
      noOfDays: noOfDays,
      reason: leave.reason || '',
      converterName: leave.converter_name || 'Converter',
      converterRole: userRole,
      previousLopBalance: currentLop,
      newLopBalance: newLopBalance,
      previousCasualBalance: currentCasual,
      newCasualBalance: newCasualBalance
    };

    // Send email notifications based on converter role
    logger.info(`[EMAIL] Converter role: ${userRole}, Employee email: ${leave.employee_email || 'NO EMAIL'}, HR email: ${leave.hr_email || 'NO EMAIL'}`);
    
    if (userRole === 'hr') {
      // HR converts → Employee gets email
      logger.info(`[EMAIL] HR conversion - sending email to employee: ${leave.employee_email || 'NO EMAIL'}`);
      if (leave.employee_email) {
        try {
          logger.info(`[EMAIL] Calling sendLopToCasualConversionEmail with data:`, {
            recipientEmail: leave.employee_email,
            employeeName: emailData.employeeName,
            employeeEmpId: emailData.employeeEmpId,
            noOfDays: emailData.noOfDays
          });
          const emailResult = await sendLopToCasualConversionEmail(leave.employee_email, {
            ...emailData,
            recipientName: leave.employee_name || 'Employee',
            recipientRole: 'employee' as const
          });
          logger.info(`[EMAIL] ✅ Conversion email sent to employee: ${leave.employee_email}, Result: ${emailResult}`);
        } catch (err: any) {
          logger.error(`[EMAIL] ❌ Error sending to employee:`, err);
          logger.error(`[EMAIL] ❌ Error details:`, err.message, err.stack);
        }
      } else {
        logger.warn(`[EMAIL] ⚠️ No employee email found, cannot send conversion email`);
      }
    } else if (userRole === 'super_admin') {
      // Super Admin converts → HR and Employee get emails
      logger.info(`[EMAIL] Super Admin conversion - sending emails to employee and HR`);
      // Send to employee
      if (leave.employee_email) {
        try {
          logger.info(`[EMAIL] Calling sendLopToCasualConversionEmail for employee with data:`, {
            recipientEmail: leave.employee_email,
            employeeName: emailData.employeeName,
            employeeEmpId: emailData.employeeEmpId,
            noOfDays: emailData.noOfDays
          });
          const emailResult = await sendLopToCasualConversionEmail(leave.employee_email, {
            ...emailData,
            recipientName: leave.employee_name || 'Employee',
            recipientRole: 'employee' as const
          });
          logger.info(`[EMAIL] ✅ Conversion email sent to employee: ${leave.employee_email}, Result: ${emailResult}`);
        } catch (err: any) {
          logger.error(`[EMAIL] ❌ Error sending to employee:`, err);
          logger.error(`[EMAIL] ❌ Error details:`, err.message, err.stack);
        }
      } else {
        logger.warn(`[EMAIL] ⚠️ No employee email found, cannot send conversion email`);
      }
      // Send to HR (if exists and different from employee)
      if (leave.hr_email && leave.hr_email !== leave.employee_email) {
        try {
          logger.info(`[EMAIL] Calling sendLopToCasualConversionEmail for HR with data:`, {
            recipientEmail: leave.hr_email,
            employeeName: emailData.employeeName,
            employeeEmpId: emailData.employeeEmpId,
            noOfDays: emailData.noOfDays
          });
          const emailResult = await sendLopToCasualConversionEmail(leave.hr_email, {
            ...emailData,
            recipientName: leave.hr_name || 'HR',
            recipientRole: 'hr' as const
          });
          logger.info(`[EMAIL] ✅ Conversion email sent to HR: ${leave.hr_email}, Result: ${emailResult}`);
        } catch (err: any) {
          logger.error(`[EMAIL] ❌ Error sending to HR:`, err);
          logger.error(`[EMAIL] ❌ Error details:`, err.message, err.stack);
        }
      } else {
        logger.warn(`[EMAIL] ⚠️ No HR email found or HR email same as employee email, skipping HR email`);
      }
    }

    logger.info(`[EMAIL] ========== EMAIL NOTIFICATION COMPLETED FOR LOP TO CASUAL CONVERSION ==========`);

    return {
      message: `Leave request converted from LOP to Casual successfully`,
      previousLop: currentLop,
      newLop: newLopBalance,
      previousCasual: currentCasual,
      newCasual: newCasualBalance
    };
  } catch (error: any) {
    await client.query('ROLLBACK');
    logger.error(`Failed to convert leave request ${requestId} from LOP to Casual:`, error);
    throw error;
  } finally {
    client.release();
  }
};

export const deleteLeaveRequest = async (requestId: number, userId: number, userRole?: string) => {
  logger.info(`[LEAVE] [DELETE LEAVE REQUEST] ========== FUNCTION CALLED ==========`);
  logger.info(`[LEAVE] [DELETE LEAVE REQUEST] Request ID: ${requestId}, User ID: ${userId}, Role: ${userRole || 'none'}`);
  
  // Verify the request
  logger.info(`[LEAVE] [DELETE LEAVE REQUEST] Verifying leave request exists`);
  const checkResult = await pool.query(
    'SELECT current_status, employee_id, leave_type, no_of_days, doctor_note FROM leave_requests WHERE id = $1',
    [requestId]
  );

  if (checkResult.rows.length === 0) {
    logger.warn(`[LEAVE] [DELETE LEAVE REQUEST] Leave request not found - Request ID: ${requestId}`);
    throw new Error('Leave request not found');
  }
  logger.info(`[LEAVE] [DELETE LEAVE REQUEST] Leave request found - Status: ${checkResult.rows[0].current_status}, Employee ID: ${checkResult.rows[0].employee_id}`);

  const belongsToUser = checkResult.rows[0].employee_id === userId;
  const currentStatus = checkResult.rows[0].current_status;
  
  // Authorization: Super Admin and HR can delete any leave, others can only delete their own
  if (userRole !== 'super_admin' && userRole !== 'hr' && !belongsToUser) {
    throw new Error('You do not have permission to delete this leave request');
  }

  // No one can delete approved or rejected leaves (including HR and Super Admin)
  // Only pending leaves can be deleted
  if (currentStatus !== 'pending') {
    throw new Error('Only pending leave requests can be deleted');
  }

  const { leave_type, no_of_days } = checkResult.rows[0];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Restore balance on delete (except permission)
    // Since balance was deducted when leave was applied, we need to refund all non-rejected days
    // For pending leaves: refund all days (they were deducted but never approved)
    // For partially approved leaves: refund all non-rejected days (pending + approved)
    if (leave_type !== 'permission') {
      // Get total days that need to be refunded (all days minus rejected days)
      // Rejected days were already refunded when rejected, so don't refund again
      const daysToRefundResult = await client.query(
        `SELECT COALESCE(SUM(CASE WHEN day_status != 'rejected' THEN CASE WHEN day_type = 'half' THEN 0.5 ELSE 1 END ELSE 0 END), 0) as days_to_refund
         FROM leave_days
         WHERE leave_request_id = $1`,
        [requestId]
      );
      
      let daysToRefund = parseFloat(daysToRefundResult.rows[0]?.days_to_refund || '0');
      
      // If no leave_days exist (edge case) or query returned 0, use the original no_of_days
      // This handles cases where leave_days might not have been created yet
      if (daysToRefund === 0) {
        daysToRefund = parseFloat(no_of_days || '0');
      }
      
      if (daysToRefund > 0) {
        const balanceColumn =
          leave_type === 'casual'
            ? 'casual_balance'
            : leave_type === 'sick'
            ? 'sick_balance'
            : 'lop_balance';

        // For LOP, check if refund would exceed 10 and cap it
        if (leave_type === 'lop') {
          const currentBalanceResult = await client.query(
            'SELECT lop_balance FROM leave_balances WHERE employee_id = $1',
            [userId]
          );
          const currentLop = parseFloat(currentBalanceResult.rows[0]?.lop_balance || '0') || 0;
          const newLopBalance = currentLop + daysToRefund;
          
          if (newLopBalance > 10) {
            const cappedRefund = 10 - currentLop;
            if (cappedRefund > 0) {
              await client.query(
                `UPDATE leave_balances SET lop_balance = 10 WHERE employee_id = $1`,
                [userId]
              );
              logger.warn(
                `[DELETE LEAVE REQUEST] LOP balance would exceed 10. Current: ${currentLop}, Refunding: ${daysToRefund}, Would be: ${newLopBalance}. Capped at 10 (refunded ${cappedRefund} instead of ${daysToRefund}).`
              );
            } else {
              logger.warn(
                `[DELETE LEAVE REQUEST] LOP balance already at or above 10. Current: ${currentLop}. Cannot refund ${daysToRefund} days.`
              );
            }
          } else {
            await client.query(
              `UPDATE leave_balances SET lop_balance = lop_balance + $1 WHERE employee_id = $2`,
              [daysToRefund, userId]
            );
          }
        } else {
          await client.query(
            `UPDATE leave_balances 
             SET ${balanceColumn} = ${balanceColumn} + $1
             WHERE employee_id = $2`,
            [daysToRefund, userId]
          );
        }
      }
    }


    // Delete medical certificate from OVHcloud if it exists
    const doctorNote = checkResult.rows[0].doctor_note;
    if (doctorNote && doctorNote.startsWith('medical-certificates/')) {
      try {
        await deleteFromOVH(doctorNote);
        logger.info(`[LEAVE] [DELETE LEAVE REQUEST] Medical certificate deleted from OVHcloud: ${doctorNote}`);
      } catch (deleteError: any) {
        logger.warn(`[LEAVE] [DELETE LEAVE REQUEST] Failed to delete medical certificate from OVHcloud: ${deleteError.message}`);
        // Don't fail the request if file deletion fails
      }
    }

    // Delete leave days first (foreign key constraint)
    await client.query('DELETE FROM leave_days WHERE leave_request_id = $1', [requestId]);

    // Delete leave request
    await client.query('DELETE FROM leave_requests WHERE id = $1', [requestId]);

    await client.query('COMMIT');

    return { message: 'Leave request deleted successfully' };
  } catch (error: any) {
    // Rollback transaction - wrap in try-catch to handle already-aborted transactions
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError: any) {
      // Transaction might already be aborted, log but don't throw
      logger.warn('Error during rollback (transaction may already be aborted):', rollbackError.message);
    }
    logger.error(`[LEAVE] [DELETE LEAVE REQUEST] Error deleting leave request ${requestId}:`, error);
    throw new Error(error.message || 'Failed to delete leave request');
  } finally {
    // Always release the client connection
    client.release();
  }
};

export const getPendingLeaveRequests = async (
  approverId: number,
  approverRole: string,
  page: number = 1,
  limit: number = 10,
  search?: string,
  filter?: string
) => {
  logger.info(`[LEAVE] [GET PENDING LEAVE REQUESTS] ========== FUNCTION CALLED ==========`);
  logger.info(`[LEAVE] [GET PENDING LEAVE REQUESTS] Approver ID: ${approverId}, Role: ${approverRole}, Page: ${page}, Limit: ${limit}, Search: ${search || 'none'}, Filter: ${filter || 'none'}`);
  
  const offset = (page - 1) * limit;
  
  // Build query based on role
  let query = `
    SELECT DISTINCT lr.id, u.emp_id, u.first_name || ' ' || COALESCE(u.last_name, '') as emp_name,
           lr.applied_date, lr.start_date, lr.end_date, lr.start_type, lr.end_type,
           lr.leave_type, lr.no_of_days, lr.reason as leave_reason, lr.current_status,
           lr.doctor_note, u.reporting_manager_id,
           lr.manager_approval_comment, lr.hr_approval_comment, lr.super_admin_approval_comment,
           lr.manager_approved_by, lr.hr_approved_by, lr.super_admin_approved_by,
           manager.first_name || ' ' || COALESCE(manager.last_name, '') AS manager_approver_name,
           hr.first_name || ' ' || COALESCE(hr.last_name, '') AS hr_approver_name,
           super_admin.first_name || ' ' || COALESCE(super_admin.last_name, '') AS super_admin_approver_name
    FROM leave_requests lr
    JOIN users u ON lr.employee_id = u.id
    LEFT JOIN users manager ON manager.id = lr.manager_approved_by
    LEFT JOIN users hr ON hr.id = lr.hr_approved_by
    LEFT JOIN users super_admin ON super_admin.id = lr.super_admin_approved_by
    WHERE 1=1
  `;

  const params: any[] = [];

  // Role-based filtering
  if (approverRole === 'manager') {
    // CRITICAL: Managers can ONLY see leave requests from employees where they are the reporting manager
    query += ' AND u.reporting_manager_id = $1';
    params.push(approverId);
  } else if (approverRole === 'hr' || approverRole === 'super_admin') {
    // HR and Super Admin can see ALL employee leave requests (no filter)
  } else {
    return { requests: [], pagination: { page, limit, total: 0 } };
  }

  if (search) {
    query += ` AND (u.emp_id ILIKE $${params.length + 1} OR u.first_name ILIKE $${params.length + 1} OR u.last_name ILIKE $${params.length + 1})`;
    params.push(`%${search}%`);
  }

  if (filter) {
    query += ` AND lr.leave_type = $${params.length + 1}`;
    params.push(filter);
  }

  // Include requests that are pending or partially approved, or have any pending day
  query += ` AND (
      lr.current_status IN ('pending','partially_approved')
      OR EXISTS (
        SELECT 1 FROM leave_days ld
        WHERE ld.leave_request_id = lr.id
          AND COALESCE(ld.day_status, 'pending') = 'pending'
      )
    )`;

  query += ' ORDER BY lr.applied_date DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
  params.push(limit, offset);

  const result = await pool.query(query, params);

  // Additional safeguard: Filter out any requests that don't belong to manager's direct reports
  // This ensures data integrity even if query construction has issues
  const filteredRows = approverRole === 'manager' 
    ? result.rows.filter(row => row.reporting_manager_id === approverId)
    : result.rows;

  // Get day-wise breakdown for each request
  const requestsWithDays = await Promise.all(
    filteredRows.map(async (row) => {
      try {
      const daysResult = await pool.query(
          'SELECT id, leave_date, day_type, day_status FROM leave_days WHERE leave_request_id = $1 ORDER BY leave_date',
        [row.id]
      );

      // Get rejection reason only if status is rejected (priority: super_admin > hr > manager)
      const rejectionReason = (row.current_status === 'rejected') 
        ? (row.super_admin_approval_comment || row.hr_approval_comment || row.manager_approval_comment || null)
        : null;
      
      // Get approver name from last_updated_by fields
      let approverName: string | null = row.approver_name || null;
      let approverRole: string | null = null;
      
      // Map role from database to display format
      if (row.last_updated_by_role === 'super_admin') {
        approverRole = 'Super Admin';
      } else if (row.last_updated_by_role === 'hr') {
        approverRole = 'HR';
      } else if (row.last_updated_by_role === 'manager') {
        approverRole = 'Manager';
      }

      return {
        id: row.id,
        empId: row.emp_id,
        empName: row.emp_name,
          appliedDate: formatDate(row.applied_date),
          leaveDate: `${formatDate(row.start_date)} to ${formatDate(row.end_date)}`,
        leaveType: row.leave_type,
        noOfDays: parseFloat(row.no_of_days),
        leaveReason: row.leave_reason,
        currentStatus: row.current_status,
        startDate: formatDate(row.start_date),
        endDate: formatDate(row.end_date),
        startType: row.start_type,
        endType: row.end_type,
        doctorNote: row.doctor_note || null,
        rejectionReason,
        approverName,
        approverRole,
        leaveDays: daysResult.rows.map(d => ({
            id: d.id,
            date: formatDate(d.leave_date),
            type: d.day_type,
            status: d.day_status || 'pending'
        }))
      };
      } catch (e) {
        console.error('Pending leave days fetch failed', { leaveRequestId: row.id, error: e });
        throw e;
      }
    })
  );

  // Count total
  let countQuery = `
    SELECT COUNT(DISTINCT lr.id)
    FROM leave_requests lr
    JOIN users u ON lr.employee_id = u.id
    WHERE 1=1
      AND (
        lr.current_status IN ('pending','partially_approved')
        OR EXISTS (
          SELECT 1 FROM leave_days ld
          WHERE ld.leave_request_id = lr.id
            AND COALESCE(ld.day_status, 'pending') = 'pending'
        )
      )
  `;
  const countParams: any[] = [];

  if (approverRole === 'manager') {
    // CRITICAL: Managers can ONLY see leave requests from employees where they are the reporting manager
    countQuery += ' AND u.reporting_manager_id = $1';
    countParams.push(approverId);
  } else if (approverRole === 'hr' || approverRole === 'super_admin') {
    // HR and Super Admin can see ALL employee leave requests (no filter)
  }

  if (search) {
    countQuery += ` AND (u.emp_id ILIKE $${countParams.length + 1} OR u.first_name ILIKE $${countParams.length + 1})`;
    countParams.push(`%${search}%`);
  }

  if (filter) {
    countQuery += ` AND lr.leave_type = $${countParams.length + 1}`;
    countParams.push(filter);
  }

  const countResult = await pool.query(countQuery, countParams);

  return {
    requests: requestsWithDays,
    pagination: {
      page,
      limit,
      total: parseInt(countResult.rows[0].count)
    }
  };
};

export const approveLeave = async (
  leaveRequestId: number,
  approverId: number,
  approverRole: string,
  comment?: string
) => {
  logger.info(`[APPROVE LEAVE] ========== FUNCTION CALLED ==========`);
  logger.info(`[APPROVE LEAVE] Request ID: ${leaveRequestId}, Approver ID: ${approverId}, Role: ${approverRole}`);
  
  // Get leave request details with employee, approver, manager, and HR information
  const leaveResult = await pool.query(
    `SELECT 
      lr.*, 
      u.reporting_manager_id, 
      u.role as employee_role,
      u.email as employee_email,
      u.first_name || ' ' || COALESCE(u.last_name, '') as employee_name,
      u.emp_id as employee_emp_id,
      approver.first_name || ' ' || COALESCE(approver.last_name, '') as approver_name,
      manager.email as manager_email,
      manager.first_name || ' ' || COALESCE(manager.last_name, '') as manager_name,
      hr.email as hr_email,
      hr.first_name || ' ' || COALESCE(hr.last_name, '') as hr_name
     FROM leave_requests lr
     JOIN users u ON lr.employee_id = u.id
     LEFT JOIN users approver ON approver.id = $2
     LEFT JOIN users manager ON u.reporting_manager_id = manager.id
     LEFT JOIN users hr ON manager.reporting_manager_id = hr.id
     WHERE lr.id = $1`,
    [leaveRequestId, approverId]
  );

  if (leaveResult.rows.length === 0) {
    throw new Error('Leave request not found');
  }

  const leave = leaveResult.rows[0];

  // Block approving an already approved request
  if (leave.current_status === 'approved') {
    throw new Error('Leave request is already approved');
  }

  // Check authorization
  if (approverRole === 'manager') {
    // Managers can approve only their direct reports
    if (leave.reporting_manager_id !== approverId) {
      throw new Error('Not authorized to approve this leave');
    }
  } else if (approverRole === 'hr') {
    // HR can approve employee and manager leaves
    if (leave.employee_role !== 'employee' && leave.employee_role !== 'manager') {
      throw new Error('Not authorized to approve this leave');
    }
  } else if (approverRole !== 'super_admin') {
    throw new Error('Not authorized to approve leaves');
  }

  // Update approval status based on role
  if (approverRole === 'manager') {
    // Additional safeguard: ensure manager can only approve their direct reports
    const updateResult = await pool.query(
      `UPDATE leave_requests 
       SET manager_approval_status = 'approved',
           manager_approval_date = CURRENT_TIMESTAMP,
           manager_approval_comment = $1,
           manager_approved_by = $2,
           last_updated_by = $2,
           last_updated_by_role = 'manager'
       WHERE id = $3 
         AND EXISTS (
           SELECT 1 FROM users u 
           WHERE u.id = (SELECT employee_id FROM leave_requests WHERE id = $3)
           AND u.reporting_manager_id = $2
         )`,
      [comment || null, approverId, leaveRequestId]
    );
    
    if (updateResult.rowCount === 0) {
      throw new Error('Not authorized to approve this leave');
    }

    // Check if needs HR approval
    const managerRoleResult = await pool.query(
      'SELECT role FROM users WHERE id = $1',
      [leave.reporting_manager_id]
    );
    if (managerRoleResult.rows[0]?.role === 'hr') {
      // Manager is HR, so final approval
      await pool.query(
        `UPDATE leave_requests 
         SET current_status = 'approved',
             hr_approval_status = 'approved',
             hr_approval_date = CURRENT_TIMESTAMP,
             hr_approved_by = $1,
             last_updated_by = $1,
             last_updated_by_role = 'hr'
         WHERE id = $2`,
        [approverId, leaveRequestId]
      );
    }
  } else if (approverRole === 'hr') {
    await pool.query(
      `UPDATE leave_requests 
       SET hr_approval_status = 'approved',
           hr_approval_date = CURRENT_TIMESTAMP,
           hr_approval_comment = $1,
           hr_approved_by = $2,
           last_updated_by = $2,
           last_updated_by_role = 'hr'
       WHERE id = $3`,
      [comment || null, approverId, leaveRequestId]
    );

    // Check if needs Super Admin approval (if employee role is hr or super_admin)
    if (leave.employee_role === 'hr' || leave.employee_role === 'super_admin') {
      // Needs Super Admin approval
    } else {
      // Final approval
      await pool.query(
        `UPDATE leave_requests SET current_status = 'approved' WHERE id = $1`,
        [leaveRequestId]
      );
    }
  } else if (approverRole === 'super_admin') {
    await pool.query(
      `UPDATE leave_requests 
       SET super_admin_approval_status = 'approved',
           super_admin_approval_date = CURRENT_TIMESTAMP,
           super_admin_approval_comment = $1,
           super_admin_approved_by = $2,
           current_status = 'approved',
           last_updated_by = $2,
           last_updated_by_role = 'super_admin'
       WHERE id = $3`,
      [comment || null, approverId, leaveRequestId]
    );
  }

  logger.info(`[APPROVE LEAVE] Database updates completed, about to recalculate status`);

  // Recalculate status
  try {
    await recalcLeaveRequestStatus(leaveRequestId);
    logger.info(`[EMAIL DEBUG] Status recalculated successfully for leave request ${leaveRequestId}`);
  } catch (recalcError: any) {
    logger.error(`[EMAIL DEBUG] Error recalculating status for leave request ${leaveRequestId}:`, recalcError);
    // Continue with email sending even if recalc fails
  }

  logger.info(`[EMAIL] ========== ABOUT TO SEND EMAIL NOTIFICATIONS FOR APPROVAL ==========`);
  logger.info(`[EMAIL] Leave object check:`, {
    has_employee_email: !!leave.employee_email,
    has_manager_email: !!leave.manager_email,
    has_hr_email: !!leave.hr_email,
    approver_role: approverRole
  });

  // ========== SEND EMAIL NOTIFICATIONS ==========
  logger.info(`[EMAIL] ========== STARTING EMAIL NOTIFICATION FOR LEAVE APPROVAL ==========`);
  logger.info(`[EMAIL] Request ID: ${leaveRequestId}, Approver ID: ${approverId}, Approver Role: ${approverRole}`);
  
  // Send email notifications based on approver role
  if (approverRole === 'manager') {
    // Manager approves → Employee gets email
    logger.info(`[EMAIL] Manager approval - sending email to employee: ${leave.employee_email || 'NO EMAIL'}`);
    if (leave.employee_email) {
      try {
        await sendLeaveStatusEmail(leave.employee_email, {
          employeeName: leave.employee_name || 'Employee',
          employeeEmpId: leave.employee_emp_id || '',
          recipientName: leave.employee_name || 'Employee',
          recipientRole: 'employee' as const,
          leaveType: leave.leave_type,
          startDate: leave.start_date,
          startType: leave.start_type,
          endDate: leave.end_date,
          endType: leave.end_type,
          noOfDays: parseFloat(leave.no_of_days),
          reason: leave.reason,
          approverName: leave.approver_name || 'Approver',
          approverRole: approverRole,
          comment: comment || null,
          status: 'approved' as const
        });
        logger.info(`[EMAIL] ✅ Approval email sent to employee: ${leave.employee_email}`);
      } catch (err: any) {
        logger.error(`[EMAIL] ❌ Error sending to employee:`, err);
      }
    }
  } else if (approverRole === 'hr') {
    // HR approves → Manager and Employee get emails
    logger.info(`[EMAIL] HR approval - sending emails to employee and manager`);
    // Send to employee
    if (leave.employee_email) {
      try {
        await sendLeaveStatusEmail(leave.employee_email, {
          employeeName: leave.employee_name || 'Employee',
          employeeEmpId: leave.employee_emp_id || '',
          recipientName: leave.employee_name || 'Employee',
          recipientRole: 'employee' as const,
          leaveType: leave.leave_type,
          startDate: leave.start_date,
          startType: leave.start_type,
          endDate: leave.end_date,
          endType: leave.end_type,
          noOfDays: parseFloat(leave.no_of_days),
          reason: leave.reason,
          approverName: leave.approver_name || 'Approver',
          approverRole: approverRole,
          comment: comment || null,
          status: 'approved' as const
        });
        logger.info(`[EMAIL] ✅ Approval email sent to employee: ${leave.employee_email}`);
      } catch (err: any) {
        logger.error(`[EMAIL] ❌ Error sending to employee:`, err);
      }
    }
    // Send to manager (if exists and different from employee)
    if (leave.manager_email && leave.manager_email !== leave.employee_email) {
      try {
        await sendLeaveStatusEmail(leave.manager_email, {
          employeeName: leave.employee_name || 'Employee',
          employeeEmpId: leave.employee_emp_id || '',
          recipientName: leave.manager_name || 'Manager',
          recipientRole: 'manager' as const,
          leaveType: leave.leave_type,
          startDate: leave.start_date,
          startType: leave.start_type,
          endDate: leave.end_date,
          endType: leave.end_type,
          noOfDays: parseFloat(leave.no_of_days),
          reason: leave.reason,
          approverName: leave.approver_name || 'Approver',
          approverRole: approverRole,
          comment: comment || null,
          status: 'approved' as const
        });
        logger.info(`[EMAIL] ✅ Approval email sent to manager: ${leave.manager_email}`);
      } catch (err: any) {
        logger.error(`[EMAIL] ❌ Error sending to manager:`, err);
      }
    }
  } else if (approverRole === 'super_admin') {
    // Super Admin approves → HR, Manager, and Employee get emails
    logger.info(`[EMAIL] Super Admin approval - sending emails to employee, manager, and HR`);
    // Send to employee
    if (leave.employee_email) {
      try {
        await sendLeaveStatusEmail(leave.employee_email, {
          employeeName: leave.employee_name || 'Employee',
          employeeEmpId: leave.employee_emp_id || '',
          recipientName: leave.employee_name || 'Employee',
          recipientRole: 'employee' as const,
          leaveType: leave.leave_type,
          startDate: leave.start_date,
          startType: leave.start_type,
          endDate: leave.end_date,
          endType: leave.end_type,
          noOfDays: parseFloat(leave.no_of_days),
          reason: leave.reason,
          approverName: leave.approver_name || 'Approver',
          approverRole: approverRole,
          comment: comment || null,
          status: 'approved' as const
        });
        logger.info(`[EMAIL] ✅ Approval email sent to employee: ${leave.employee_email}`);
      } catch (err: any) {
        logger.error(`[EMAIL] ❌ Error sending to employee:`, err);
      }
    }
    // Send to manager (if exists and different from employee)
    if (leave.manager_email && leave.manager_email !== leave.employee_email) {
      try {
        await sendLeaveStatusEmail(leave.manager_email, {
          employeeName: leave.employee_name || 'Employee',
          employeeEmpId: leave.employee_emp_id || '',
          recipientName: leave.manager_name || 'Manager',
          recipientRole: 'manager' as const,
          leaveType: leave.leave_type,
          startDate: leave.start_date,
          startType: leave.start_type,
          endDate: leave.end_date,
          endType: leave.end_type,
          noOfDays: parseFloat(leave.no_of_days),
          reason: leave.reason,
          approverName: leave.approver_name || 'Approver',
          approverRole: approverRole,
          comment: comment || null,
          status: 'approved' as const
        });
        logger.info(`[EMAIL] ✅ Approval email sent to manager: ${leave.manager_email}`);
      } catch (err: any) {
        logger.error(`[EMAIL] ❌ Error sending to manager:`, err);
      }
    }
    // Send to HR (if exists and different from employee and manager)
    if (leave.hr_email && leave.hr_email !== leave.employee_email && leave.hr_email !== leave.manager_email) {
      try {
        await sendLeaveStatusEmail(leave.hr_email, {
          employeeName: leave.employee_name || 'Employee',
          employeeEmpId: leave.employee_emp_id || '',
          recipientName: leave.hr_name || 'HR',
          recipientRole: 'hr' as const,
          leaveType: leave.leave_type,
          startDate: leave.start_date,
          startType: leave.start_type,
          endDate: leave.end_date,
          endType: leave.end_type,
          noOfDays: parseFloat(leave.no_of_days),
          reason: leave.reason,
          approverName: leave.approver_name || 'Approver',
          approverRole: approverRole,
          comment: comment || null,
          status: 'approved' as const
        });
        logger.info(`[EMAIL] ✅ Approval email sent to HR: ${leave.hr_email}`);
      } catch (err: any) {
        logger.error(`[EMAIL] ❌ Error sending to HR:`, err);
      }
    }
  }
  logger.info(`[EMAIL] ========== EMAIL NOTIFICATION COMPLETED FOR LEAVE APPROVAL ==========`);
  logger.info(`[APPROVE LEAVE] ========== FUNCTION COMPLETING ==========`);

  return { message: 'Leave approved successfully' };
};

export const rejectLeave = async (
  leaveRequestId: number,
  approverId: number,
  approverRole: string,
  comment: string
) => {
  logger.info(`[REJECT LEAVE] ========== FUNCTION CALLED ==========`);
  logger.info(`[REJECT LEAVE] Request ID: ${leaveRequestId}, Approver ID: ${approverId}, Role: ${approverRole}`);
  
  // Similar authorization check as approve - get employee, approver, manager, and HR information
  const leaveResult = await pool.query(
    `SELECT 
      lr.*, 
      u.reporting_manager_id, 
      u.role as employee_role,
      u.email as employee_email,
      u.first_name || ' ' || COALESCE(u.last_name, '') as employee_name,
      u.emp_id as employee_emp_id,
      approver.first_name || ' ' || COALESCE(approver.last_name, '') as approver_name,
      manager.email as manager_email,
      manager.first_name || ' ' || COALESCE(manager.last_name, '') as manager_name,
      hr.email as hr_email,
      hr.first_name || ' ' || COALESCE(hr.last_name, '') as hr_name
     FROM leave_requests lr
     JOIN users u ON lr.employee_id = u.id
     LEFT JOIN users approver ON approver.id = $2
     LEFT JOIN users manager ON u.reporting_manager_id = manager.id
     LEFT JOIN users hr ON manager.reporting_manager_id = hr.id
     WHERE lr.id = $1`,
    [leaveRequestId, approverId]
  );

  if (leaveResult.rows.length === 0) {
    throw new Error('Leave request not found');
  }

  const leave = leaveResult.rows[0];

  // Collect day-level info to mark rejection and compute precise refund
  const leaveDaysResult = await pool.query(
    'SELECT id, day_status, day_type FROM leave_days WHERE leave_request_id = $1',
    [leaveRequestId]
  );
  const leaveDays = leaveDaysResult.rows || [];
  const refundDays = leaveDays
    .filter((d) => d.day_status !== 'rejected')
    .reduce((acc, d) => acc + (d.day_type === 'half' ? 0.5 : 1), 0);

  // Mark all days as rejected
  await pool.query(
    `UPDATE leave_days
     SET day_status = 'rejected'
     WHERE leave_request_id = $1`,
    [leaveRequestId]
  );

  // Check authorization (same as approve)
  if (approverRole === 'manager') {
    if (leave.reporting_manager_id !== approverId) {
      throw new Error('Not authorized to reject this leave');
    }
  } else if (approverRole === 'hr') {
    const managerResult = await pool.query(
      'SELECT role FROM users WHERE id = $1',
      [leave.reporting_manager_id]
    );
    if (managerResult.rows[0]?.role !== 'hr' && leave.employee_role !== 'manager') {
      throw new Error('Not authorized to reject this leave');
    }
  } else if (approverRole !== 'super_admin') {
    throw new Error('Not authorized to reject leaves');
  }

  // Update rejection status
  if (approverRole === 'manager') {
    // Additional safeguard: ensure manager can only reject their direct reports
    const updateResult = await pool.query(
      `UPDATE leave_requests 
       SET manager_approval_status = 'rejected',
           manager_approval_date = CURRENT_TIMESTAMP,
           manager_approval_comment = $1,
           manager_approved_by = $2,
           current_status = 'rejected'
       WHERE id = $3 
         AND EXISTS (
           SELECT 1 FROM users u 
           WHERE u.id = (SELECT employee_id FROM leave_requests WHERE id = $3)
           AND u.reporting_manager_id = $2
         )`,
      [comment, approverId, leaveRequestId]
    );
    
    if (updateResult.rowCount === 0) {
      throw new Error('Not authorized to reject this leave');
    }
  } else if (approverRole === 'hr') {
    await pool.query(
      `UPDATE leave_requests 
       SET hr_approval_status = 'rejected',
           hr_approval_date = CURRENT_TIMESTAMP,
           hr_approval_comment = $1,
           hr_approved_by = $2,
           current_status = 'rejected'
       WHERE id = $3`,
      [comment, approverId, leaveRequestId]
    );
  } else if (approverRole === 'super_admin') {
    await pool.query(
      `UPDATE leave_requests 
       SET super_admin_approval_status = 'rejected',
           super_admin_approval_date = CURRENT_TIMESTAMP,
           super_admin_approval_comment = $1,
           super_admin_approved_by = $2,
           current_status = 'rejected'
       WHERE id = $3`,
      [comment, approverId, leaveRequestId]
    );
  }

  logger.info(`[REJECT LEAVE] Database updates completed, about to process refunds`);

  // Refund only the days rejected in this action (except permission)
  if (leave.leave_type !== 'permission' && refundDays > 0) {
    const balanceColumn =
      leave.leave_type === 'casual'
        ? 'casual_balance'
        : leave.leave_type === 'sick'
        ? 'sick_balance'
        : 'lop_balance';
    
    // For LOP, check if refund would exceed 10 and cap it
    if (leave.leave_type === 'lop') {
      const currentBalanceResult = await pool.query(
        'SELECT lop_balance FROM leave_balances WHERE employee_id = $1',
        [leave.employee_id]
      );
      const currentLop = parseFloat(currentBalanceResult.rows[0]?.lop_balance || '0') || 0;
      const newLopBalance = currentLop + refundDays;
      
      if (newLopBalance > 10) {
        const cappedRefund = 10 - currentLop;
        if (cappedRefund > 0) {
          await pool.query(
            `UPDATE leave_balances SET lop_balance = 10 WHERE employee_id = $1`,
            [leave.employee_id]
          );
          logger.warn(
            `[REJECT LEAVE] LOP balance would exceed 10. Current: ${currentLop}, Refunding: ${refundDays}, Would be: ${newLopBalance}. Capped at 10 (refunded ${cappedRefund} instead of ${refundDays}).`
          );
        } else {
          logger.warn(
            `[REJECT LEAVE] LOP balance already at or above 10. Current: ${currentLop}. Cannot refund ${refundDays} days.`
          );
        }
      } else {
        await pool.query(
          `UPDATE leave_balances SET lop_balance = lop_balance + $1 WHERE employee_id = $2`,
          [refundDays, leave.employee_id]
        );
        logger.info(`[REJECT LEAVE] Refunded ${refundDays} days to employee ${leave.employee_id}`);
      }
    } else {
      await pool.query(
        `UPDATE leave_balances SET ${balanceColumn} = ${balanceColumn} + $1 WHERE employee_id = $2`,
        [refundDays, leave.employee_id]
      );
      logger.info(`[REJECT LEAVE] Refunded ${refundDays} days to employee ${leave.employee_id}`);
    }
  }

  logger.info(`[REJECT LEAVE] About to recalculate status`);

  // Recalculate status
  try {
    await recalcLeaveRequestStatus(leaveRequestId);
    logger.info(`[EMAIL DEBUG] Status recalculated successfully for leave request ${leaveRequestId}`);
  } catch (recalcError: any) {
    logger.error(`[EMAIL DEBUG] Error recalculating status for leave request ${leaveRequestId}:`, recalcError);
    // Continue with email sending even if recalc fails
  }

  logger.info(`[EMAIL] ========== ABOUT TO SEND EMAIL NOTIFICATIONS FOR REJECTION ==========`);
  logger.info(`[EMAIL] Leave object check:`, {
    has_employee_email: !!leave.employee_email,
    has_manager_email: !!leave.manager_email,
    has_hr_email: !!leave.hr_email,
    approver_role: approverRole
  });

  // ========== SEND EMAIL NOTIFICATIONS ==========
  logger.info(`[EMAIL] ========== STARTING EMAIL NOTIFICATION FOR LEAVE REJECTION ==========`);
  logger.info(`[EMAIL] Request ID: ${leaveRequestId}, Approver ID: ${approverId}, Approver Role: ${approverRole}`);
  
  // Send email notifications based on approver role
  if (approverRole === 'manager') {
    // Manager rejects → Employee gets email
    logger.info(`[EMAIL] Manager rejection - sending email to employee: ${leave.employee_email || 'NO EMAIL'}`);
    if (leave.employee_email) {
      try {
        await sendLeaveStatusEmail(leave.employee_email, {
          employeeName: leave.employee_name || 'Employee',
          employeeEmpId: leave.employee_emp_id || '',
          recipientName: leave.employee_name || 'Employee',
          recipientRole: 'employee' as const,
          leaveType: leave.leave_type,
          startDate: leave.start_date,
          startType: leave.start_type,
          endDate: leave.end_date,
          endType: leave.end_type,
          noOfDays: parseFloat(leave.no_of_days),
          reason: leave.reason,
          approverName: leave.approver_name || 'Approver',
          approverRole: approverRole,
          comment: comment || null,
          status: 'rejected' as const
        });
        logger.info(`[EMAIL] ✅ Rejection email sent to employee: ${leave.employee_email}`);
      } catch (err: any) {
        logger.error(`[EMAIL] ❌ Error sending to employee:`, err);
      }
    }
  } else if (approverRole === 'hr') {
    // HR rejects → Manager and Employee get emails
    logger.info(`[EMAIL] HR rejection - sending emails to employee and manager`);
    // Send to employee
    if (leave.employee_email) {
      try {
        await sendLeaveStatusEmail(leave.employee_email, {
          employeeName: leave.employee_name || 'Employee',
          employeeEmpId: leave.employee_emp_id || '',
          recipientName: leave.employee_name || 'Employee',
          recipientRole: 'employee' as const,
          leaveType: leave.leave_type,
          startDate: leave.start_date,
          startType: leave.start_type,
          endDate: leave.end_date,
          endType: leave.end_type,
          noOfDays: parseFloat(leave.no_of_days),
          reason: leave.reason,
          approverName: leave.approver_name || 'Approver',
          approverRole: approverRole,
          comment: comment || null,
          status: 'rejected' as const
        });
        logger.info(`[EMAIL] ✅ Rejection email sent to employee: ${leave.employee_email}`);
      } catch (err: any) {
        logger.error(`[EMAIL] ❌ Error sending to employee:`, err);
      }
    }
    // Send to manager (if exists and different from employee)
    if (leave.manager_email && leave.manager_email !== leave.employee_email) {
      try {
        await sendLeaveStatusEmail(leave.manager_email, {
          employeeName: leave.employee_name || 'Employee',
          employeeEmpId: leave.employee_emp_id || '',
          recipientName: leave.manager_name || 'Manager',
          recipientRole: 'manager' as const,
          leaveType: leave.leave_type,
          startDate: leave.start_date,
          startType: leave.start_type,
          endDate: leave.end_date,
          endType: leave.end_type,
          noOfDays: parseFloat(leave.no_of_days),
          reason: leave.reason,
          approverName: leave.approver_name || 'Approver',
          approverRole: approverRole,
          comment: comment || null,
          status: 'rejected' as const
        });
        logger.info(`[EMAIL] ✅ Rejection email sent to manager: ${leave.manager_email}`);
      } catch (err: any) {
        logger.error(`[EMAIL] ❌ Error sending to manager:`, err);
      }
    }
  } else if (approverRole === 'super_admin') {
    // Super Admin rejects → HR, Manager, and Employee get emails
    logger.info(`[EMAIL] Super Admin rejection - sending emails to employee, manager, and HR`);
    // Send to employee
    if (leave.employee_email) {
      try {
        await sendLeaveStatusEmail(leave.employee_email, {
          employeeName: leave.employee_name || 'Employee',
          employeeEmpId: leave.employee_emp_id || '',
          recipientName: leave.employee_name || 'Employee',
          recipientRole: 'employee' as const,
          leaveType: leave.leave_type,
          startDate: leave.start_date,
          startType: leave.start_type,
          endDate: leave.end_date,
          endType: leave.end_type,
          noOfDays: parseFloat(leave.no_of_days),
          reason: leave.reason,
          approverName: leave.approver_name || 'Approver',
          approverRole: approverRole,
          comment: comment || null,
          status: 'rejected' as const
        });
        logger.info(`[EMAIL] ✅ Rejection email sent to employee: ${leave.employee_email}`);
      } catch (err: any) {
        logger.error(`[EMAIL] ❌ Error sending to employee:`, err);
      }
    }
    // Send to manager (if exists and different from employee)
    if (leave.manager_email && leave.manager_email !== leave.employee_email) {
      try {
        await sendLeaveStatusEmail(leave.manager_email, {
          employeeName: leave.employee_name || 'Employee',
          employeeEmpId: leave.employee_emp_id || '',
          recipientName: leave.manager_name || 'Manager',
          recipientRole: 'manager' as const,
          leaveType: leave.leave_type,
          startDate: leave.start_date,
          startType: leave.start_type,
          endDate: leave.end_date,
          endType: leave.end_type,
          noOfDays: parseFloat(leave.no_of_days),
          reason: leave.reason,
          approverName: leave.approver_name || 'Approver',
          approverRole: approverRole,
          comment: comment || null,
          status: 'rejected' as const
        });
        logger.info(`[EMAIL] ✅ Rejection email sent to manager: ${leave.manager_email}`);
      } catch (err: any) {
        logger.error(`[EMAIL] ❌ Error sending to manager:`, err);
      }
    }
    // Send to HR (if exists and different from employee and manager)
    if (leave.hr_email && leave.hr_email !== leave.employee_email && leave.hr_email !== leave.manager_email) {
      try {
        await sendLeaveStatusEmail(leave.hr_email, {
          employeeName: leave.employee_name || 'Employee',
          employeeEmpId: leave.employee_emp_id || '',
          recipientName: leave.hr_name || 'HR',
          recipientRole: 'hr' as const,
          leaveType: leave.leave_type,
          startDate: leave.start_date,
          startType: leave.start_type,
          endDate: leave.end_date,
          endType: leave.end_type,
          noOfDays: parseFloat(leave.no_of_days),
          reason: leave.reason,
          approverName: leave.approver_name || 'Approver',
          approverRole: approverRole,
          comment: comment || null,
          status: 'rejected' as const
        });
        logger.info(`[EMAIL] ✅ Rejection email sent to HR: ${leave.hr_email}`);
      } catch (err: any) {
        logger.error(`[EMAIL] ❌ Error sending to HR:`, err);
      }
    }
  }
  logger.info(`[EMAIL] ========== EMAIL NOTIFICATION COMPLETED FOR LEAVE REJECTION ==========`);
  logger.info(`[REJECT LEAVE] ========== FUNCTION COMPLETING ==========`);

  return { message: 'Leave rejected successfully' };
};

// Helper: recalc request status based on day_status values
const recalcLeaveRequestStatus = async (leaveRequestId: number) => {
  const leaveResult = await pool.query(
    'SELECT employee_id, leave_type, no_of_days, current_status FROM leave_requests WHERE id = $1',
    [leaveRequestId]
  );
  if (leaveResult.rows.length === 0) {
    throw new Error('Leave request not found');
  }
  const leave = leaveResult.rows[0];

  const daysResult = await pool.query(
    'SELECT day_status, day_type FROM leave_days WHERE leave_request_id = $1',
    [leaveRequestId]
  );
  if (daysResult.rows.length === 0) {
    return;
  }

  const approvedDays = daysResult.rows
    .filter((d) => d.day_status === 'approved')
    .reduce((acc, d) => acc + (d.day_type === 'half' ? 0.5 : 1), 0);
  const rejectedDays = daysResult.rows
    .filter((d) => d.day_status === 'rejected')
    .reduce((acc, d) => acc + (d.day_type === 'half' ? 0.5 : 1), 0);
  const pendingDays = daysResult.rows
    .filter((d) => d.day_status !== 'approved' && d.day_status !== 'rejected')
    .reduce((acc, d) => acc + (d.day_type === 'half' ? 0.5 : 1), 0);
  const hasPending = pendingDays > 0;
  const allApproved = pendingDays === 0 && rejectedDays === 0 && approvedDays > 0;
  const allRejected = pendingDays === 0 && approvedDays === 0 && rejectedDays > 0;

  let newStatus: string = leave.current_status;
  if (allApproved) {
    newStatus = 'approved';
  } else if (allRejected && !hasPending) {
    newStatus = 'rejected';
  } else if (approvedDays > 0 && (rejectedDays > 0 || hasPending)) {
    newStatus = 'partially_approved';
  } else {
    newStatus = 'pending';
  }

  // Update header status only; keep original no_of_days for balance refunds
  await pool.query(
    `UPDATE leave_requests SET current_status = $1 WHERE id = $2`,
    [newStatus, leaveRequestId]
  );
};

export const approveLeaveDay = async (
  leaveRequestId: number,
  dayId: number,
  approverId: number,
  approverRole: string,
  comment?: string
) => {
  logger.info(`[APPROVE LEAVE DAY] ========== FUNCTION CALLED ==========`);
  logger.info(`[APPROVE LEAVE DAY] Request ID: ${leaveRequestId}, Day ID: ${dayId}, Approver ID: ${approverId}, Role: ${approverRole}`);
  
  // Get leave request details with employee, approver, manager, and HR information
  const leaveResult = await pool.query(
    `SELECT 
      lr.*, 
      u.reporting_manager_id, 
      u.role as employee_role,
      u.email as employee_email,
      u.first_name || ' ' || COALESCE(u.last_name, '') as employee_name,
      u.emp_id as employee_emp_id,
      approver.first_name || ' ' || COALESCE(approver.last_name, '') as approver_name,
      manager.email as manager_email,
      manager.first_name || ' ' || COALESCE(manager.last_name, '') as manager_name,
      hr.email as hr_email,
      hr.first_name || ' ' || COALESCE(hr.last_name, '') as hr_name
     FROM leave_requests lr
     JOIN users u ON lr.employee_id = u.id
     LEFT JOIN users approver ON approver.id = $2
     LEFT JOIN users manager ON u.reporting_manager_id = manager.id
     LEFT JOIN users hr ON manager.reporting_manager_id = hr.id
     WHERE lr.id = $1`,
    [leaveRequestId, approverId]
  );

  if (leaveResult.rows.length === 0) {
    throw new Error('Leave request not found');
  }

  const leave = leaveResult.rows[0];

  if (leave.current_status === 'approved') {
    throw new Error('Leave request is already approved');
  }

  // Auth: manager -> direct reports; HR -> employee/manager; super_admin -> all
  if (approverRole === 'manager') {
    if (leave.reporting_manager_id !== approverId) {
      throw new Error('Not authorized to approve this leave');
    }
  } else if (approverRole === 'hr') {
    if (leave.employee_role !== 'employee' && leave.employee_role !== 'manager') {
      throw new Error('Not authorized to approve this leave');
    }
  } else if (approverRole !== 'super_admin') {
    throw new Error('Not authorized to approve leaves');
  }

  const dayResult = await pool.query(
    'SELECT id, day_status, day_type FROM leave_days WHERE id = $1 AND leave_request_id = $2',
    [dayId, leaveRequestId]
  );
  if (dayResult.rows.length === 0) {
    throw new Error('Leave day not found');
  }
  const currentDayStatus = dayResult.rows[0].day_status || 'pending';

  // If already approved, no-op
  if (currentDayStatus !== 'approved') {
    await pool.query(
      `UPDATE leave_days
       SET day_status = 'approved'
       WHERE id = $1`,
      [dayId]
    );
  }

  // mark role-specific approval fields
  if (approverRole === 'manager') {
    // Additional safeguard: ensure manager can only approve their direct reports
    const updateResult = await pool.query(
      `UPDATE leave_requests 
       SET manager_approval_status = 'approved',
           manager_approval_date = CURRENT_TIMESTAMP,
           manager_approval_comment = $1,
           manager_approved_by = $2,
           last_updated_by = $2,
           last_updated_by_role = 'manager'
       WHERE id = $3 
         AND EXISTS (
           SELECT 1 FROM users u 
           WHERE u.id = (SELECT employee_id FROM leave_requests WHERE id = $3)
           AND u.reporting_manager_id = $2
         )`,
      [comment || null, approverId, leaveRequestId]
    );
    
    if (updateResult.rowCount === 0) {
      throw new Error('Not authorized to approve this leave');
    }
  } else if (approverRole === 'hr') {
    await pool.query(
      `UPDATE leave_requests 
       SET hr_approval_status = 'approved',
           hr_approval_date = CURRENT_TIMESTAMP,
           hr_approval_comment = $1,
           hr_approved_by = $2,
           last_updated_by = $2,
           last_updated_by_role = 'hr'
       WHERE id = $3`,
      [comment || null, approverId, leaveRequestId]
    );
  } else if (approverRole === 'super_admin') {
    await pool.query(
      `UPDATE leave_requests 
       SET super_admin_approval_status = 'approved',
           super_admin_approval_date = CURRENT_TIMESTAMP,
           super_admin_approval_comment = $1,
           super_admin_approved_by = $2,
           last_updated_by = $2,
           last_updated_by_role = 'super_admin'
       WHERE id = $3`,
      [comment || null, approverId, leaveRequestId]
    );
  }

  logger.info(`[APPROVE LEAVE DAY] Database updates completed, about to recalculate status`);

  // Recalculate status only (no balance changes)
  try {
    await recalcLeaveRequestStatus(leaveRequestId);
    logger.info(`[APPROVE LEAVE DAY] Status recalculated successfully for leave request ${leaveRequestId}`);
  } catch (recalcError: any) {
    logger.error(`[APPROVE LEAVE DAY] Error recalculating status for leave request ${leaveRequestId}:`, recalcError);
    // Continue with email sending even if recalc fails
  }

  logger.info(`[EMAIL] ========== ABOUT TO SEND EMAIL NOTIFICATIONS FOR DAY APPROVAL ==========`);
  logger.info(`[EMAIL] Leave object check:`, {
    has_employee_email: !!leave.employee_email,
    has_manager_email: !!leave.manager_email,
    has_hr_email: !!leave.hr_email,
    approver_role: approverRole
  });

  // ========== SEND EMAIL NOTIFICATIONS ==========
  logger.info(`[EMAIL] ========== STARTING EMAIL NOTIFICATION FOR LEAVE DAY APPROVAL ==========`);
  logger.info(`[EMAIL] Request ID: ${leaveRequestId}, Day ID: ${dayId}, Approver ID: ${approverId}, Approver Role: ${approverRole}`);
  
  // Send email notifications based on approver role
  if (approverRole === 'manager') {
    // Manager approves → Employee gets email
    logger.info(`[EMAIL] Manager day approval - sending email to employee: ${leave.employee_email || 'NO EMAIL'}`);
    if (leave.employee_email) {
      try {
        await sendLeaveStatusEmail(leave.employee_email, {
          employeeName: leave.employee_name || 'Employee',
          employeeEmpId: leave.employee_emp_id || '',
          recipientName: leave.employee_name || 'Employee',
          recipientRole: 'employee' as const,
          leaveType: leave.leave_type,
          startDate: leave.start_date,
          startType: leave.start_type,
          endDate: leave.end_date,
          endType: leave.end_type,
          noOfDays: parseFloat(leave.no_of_days),
          reason: leave.reason,
          approverName: leave.approver_name || 'Approver',
          approverRole: approverRole,
          comment: comment || null,
          status: 'approved' as const
        });
        logger.info(`[EMAIL] ✅ Day approval email sent to employee: ${leave.employee_email}`);
      } catch (err: any) {
        logger.error(`[EMAIL] ❌ Error sending to employee:`, err);
      }
    }
  } else if (approverRole === 'hr') {
    // HR approves → Manager and Employee get emails
    logger.info(`[EMAIL] HR day approval - sending emails to employee and manager`);
    // Send to employee
    if (leave.employee_email) {
      try {
        await sendLeaveStatusEmail(leave.employee_email, {
          employeeName: leave.employee_name || 'Employee',
          employeeEmpId: leave.employee_emp_id || '',
          recipientName: leave.employee_name || 'Employee',
          recipientRole: 'employee' as const,
          leaveType: leave.leave_type,
          startDate: leave.start_date,
          startType: leave.start_type,
          endDate: leave.end_date,
          endType: leave.end_type,
          noOfDays: parseFloat(leave.no_of_days),
          reason: leave.reason,
          approverName: leave.approver_name || 'Approver',
          approverRole: approverRole,
          comment: comment || null,
          status: 'approved' as const
        });
        logger.info(`[EMAIL] ✅ Day approval email sent to employee: ${leave.employee_email}`);
      } catch (err: any) {
        logger.error(`[EMAIL] ❌ Error sending to employee:`, err);
      }
    }
    // Send to manager (if exists and different from employee)
    if (leave.manager_email && leave.manager_email !== leave.employee_email) {
      try {
        await sendLeaveStatusEmail(leave.manager_email, {
          employeeName: leave.employee_name || 'Employee',
          employeeEmpId: leave.employee_emp_id || '',
          recipientName: leave.manager_name || 'Manager',
          recipientRole: 'manager' as const,
          leaveType: leave.leave_type,
          startDate: leave.start_date,
          startType: leave.start_type,
          endDate: leave.end_date,
          endType: leave.end_type,
          noOfDays: parseFloat(leave.no_of_days),
          reason: leave.reason,
          approverName: leave.approver_name || 'Approver',
          approverRole: approverRole,
          comment: comment || null,
          status: 'approved' as const
        });
        logger.info(`[EMAIL] ✅ Day approval email sent to manager: ${leave.manager_email}`);
      } catch (err: any) {
        logger.error(`[EMAIL] ❌ Error sending to manager:`, err);
      }
    }
  } else if (approverRole === 'super_admin') {
    // Super Admin approves → HR, Manager, and Employee get emails
    logger.info(`[EMAIL] Super Admin day approval - sending emails to employee, manager, and HR`);
    // Send to employee
    if (leave.employee_email) {
      try {
        await sendLeaveStatusEmail(leave.employee_email, {
          employeeName: leave.employee_name || 'Employee',
          employeeEmpId: leave.employee_emp_id || '',
          recipientName: leave.employee_name || 'Employee',
          recipientRole: 'employee' as const,
          leaveType: leave.leave_type,
          startDate: leave.start_date,
          startType: leave.start_type,
          endDate: leave.end_date,
          endType: leave.end_type,
          noOfDays: parseFloat(leave.no_of_days),
          reason: leave.reason,
          approverName: leave.approver_name || 'Approver',
          approverRole: approverRole,
          comment: comment || null,
          status: 'approved' as const
        });
        logger.info(`[EMAIL] ✅ Day approval email sent to employee: ${leave.employee_email}`);
      } catch (err: any) {
        logger.error(`[EMAIL] ❌ Error sending to employee:`, err);
      }
    }
    // Send to manager (if exists and different from employee)
    if (leave.manager_email && leave.manager_email !== leave.employee_email) {
      try {
        await sendLeaveStatusEmail(leave.manager_email, {
          employeeName: leave.employee_name || 'Employee',
          employeeEmpId: leave.employee_emp_id || '',
          recipientName: leave.manager_name || 'Manager',
          recipientRole: 'manager' as const,
          leaveType: leave.leave_type,
          startDate: leave.start_date,
          startType: leave.start_type,
          endDate: leave.end_date,
          endType: leave.end_type,
          noOfDays: parseFloat(leave.no_of_days),
          reason: leave.reason,
          approverName: leave.approver_name || 'Approver',
          approverRole: approverRole,
          comment: comment || null,
          status: 'approved' as const
        });
        logger.info(`[EMAIL] ✅ Day approval email sent to manager: ${leave.manager_email}`);
      } catch (err: any) {
        logger.error(`[EMAIL] ❌ Error sending to manager:`, err);
      }
    }
    // Send to HR (if exists and different from employee and manager)
    if (leave.hr_email && leave.hr_email !== leave.employee_email && leave.hr_email !== leave.manager_email) {
      try {
        await sendLeaveStatusEmail(leave.hr_email, {
          employeeName: leave.employee_name || 'Employee',
          employeeEmpId: leave.employee_emp_id || '',
          recipientName: leave.hr_name || 'HR',
          recipientRole: 'hr' as const,
          leaveType: leave.leave_type,
          startDate: leave.start_date,
          startType: leave.start_type,
          endDate: leave.end_date,
          endType: leave.end_type,
          noOfDays: parseFloat(leave.no_of_days),
          reason: leave.reason,
          approverName: leave.approver_name || 'Approver',
          approverRole: approverRole,
          comment: comment || null,
          status: 'approved' as const
        });
        logger.info(`[EMAIL] ✅ Day approval email sent to HR: ${leave.hr_email}`);
      } catch (err: any) {
        logger.error(`[EMAIL] ❌ Error sending to HR:`, err);
      }
    }
  }

  logger.info(`[EMAIL] ========== EMAIL NOTIFICATION COMPLETED FOR LEAVE DAY APPROVAL ==========`);
  logger.info(`[APPROVE LEAVE DAY] ========== FUNCTION COMPLETING ==========`);

  return { message: 'Leave day approved successfully' };
};

// Approve multiple leave days and auto-reject remaining pending days
export const approveLeaveDays = async (
  leaveRequestId: number,
  dayIds: number[],
  approverId: number,
  approverRole: string,
  comment?: string
) => {
  logger.info(`[APPROVE LEAVE DAYS] ========== FUNCTION CALLED ==========`);
  logger.info(`[APPROVE LEAVE DAYS] Request ID: ${leaveRequestId}, Day IDs: ${dayIds.join(', ')}, Approver ID: ${approverId}, Role: ${approverRole}`);
  
  if (!dayIds || dayIds.length === 0) {
    throw new Error('No days specified for approval');
  }

  // Get leave request details with employee, approver, manager, and HR information
  const leaveResult = await pool.query(
    `SELECT 
      lr.*, 
      u.reporting_manager_id, 
      u.role as employee_role,
      u.email as employee_email,
      u.first_name || ' ' || COALESCE(u.last_name, '') as employee_name,
      u.emp_id as employee_emp_id,
      approver.first_name || ' ' || COALESCE(approver.last_name, '') as approver_name,
      manager.email as manager_email,
      manager.first_name || ' ' || COALESCE(manager.last_name, '') as manager_name,
      hr.email as hr_email,
      hr.first_name || ' ' || COALESCE(hr.last_name, '') as hr_name
     FROM leave_requests lr
     JOIN users u ON lr.employee_id = u.id
     LEFT JOIN users approver ON approver.id = $2
     LEFT JOIN users manager ON u.reporting_manager_id = manager.id
     LEFT JOIN users hr ON manager.reporting_manager_id = hr.id
     WHERE lr.id = $1`,
    [leaveRequestId, approverId]
  );

  if (leaveResult.rows.length === 0) {
    throw new Error('Leave request not found');
  }

  const leave = leaveResult.rows[0];

  if (leave.current_status === 'approved') {
    throw new Error('Leave request is already approved');
  }

  // Auth: manager -> direct reports; HR -> employee/manager; super_admin -> all
  if (approverRole === 'manager') {
    if (leave.reporting_manager_id !== approverId) {
      throw new Error('Not authorized to approve this leave');
    }
  } else if (approverRole === 'hr') {
    if (leave.employee_role !== 'employee' && leave.employee_role !== 'manager') {
      throw new Error('Not authorized to approve this leave');
    }
  } else if (approverRole !== 'super_admin') {
    throw new Error('Not authorized to approve leaves');
  }

  // Get all pending days for this request
  const allPendingDaysResult = await pool.query(
    `SELECT id FROM leave_days 
     WHERE leave_request_id = $1 
     AND (day_status IS NULL OR day_status = 'pending')`,
    [leaveRequestId]
  );

  const allPendingDayIds = allPendingDaysResult.rows.map(row => row.id);
  const daysToApprove = dayIds.filter(id => allPendingDayIds.includes(id));
  const daysToReject = allPendingDayIds.filter(id => !daysToApprove.includes(id));

  if (daysToApprove.length === 0) {
    throw new Error('No valid pending days to approve');
  }

  // Approve selected days
  if (daysToApprove.length > 0) {
    await pool.query(
      `UPDATE leave_days
       SET day_status = 'approved'
       WHERE id = ANY($1::int[])
       AND leave_request_id = $2
       AND (day_status IS NULL OR day_status = 'pending')`,
      [daysToApprove, leaveRequestId]
    );
  }

  // Auto-reject remaining pending days
  if (daysToReject.length > 0) {
    await pool.query(
      `UPDATE leave_days
       SET day_status = 'rejected'
       WHERE id = ANY($1::int[])
       AND leave_request_id = $2
       AND (day_status IS NULL OR day_status = 'pending')`,
      [daysToReject, leaveRequestId]
    );
  }

  // Mark role-specific approval fields
  if (approverRole === 'manager') {
    const updateResult = await pool.query(
      `UPDATE leave_requests 
       SET manager_approval_status = 'approved',
           manager_approval_date = CURRENT_TIMESTAMP,
           manager_approval_comment = $1,
           manager_approved_by = $2,
           last_updated_by = $2,
           last_updated_by_role = 'manager'
       WHERE id = $3 
         AND EXISTS (
           SELECT 1 FROM users u 
           WHERE u.id = (SELECT employee_id FROM leave_requests WHERE id = $3)
           AND u.reporting_manager_id = $2
         )`,
      [comment || null, approverId, leaveRequestId]
    );
    
    if (updateResult.rowCount === 0) {
      throw new Error('Not authorized to approve this leave');
    }
  } else if (approverRole === 'hr') {
    await pool.query(
      `UPDATE leave_requests 
       SET hr_approval_status = 'approved',
           hr_approval_date = CURRENT_TIMESTAMP,
           hr_approval_comment = $1,
           hr_approved_by = $2,
           last_updated_by = $2,
           last_updated_by_role = 'hr'
       WHERE id = $3`,
      [comment || null, approverId, leaveRequestId]
    );
  } else if (approverRole === 'super_admin') {
    await pool.query(
      `UPDATE leave_requests 
       SET super_admin_approval_status = 'approved',
           super_admin_approval_date = CURRENT_TIMESTAMP,
           super_admin_approval_comment = $1,
           super_admin_approved_by = $2,
           last_updated_by = $2,
           last_updated_by_role = 'super_admin'
       WHERE id = $3`,
      [comment || null, approverId, leaveRequestId]
    );
  }

  logger.info(`[APPROVE LEAVE DAYS] Database updates completed, about to recalculate status`);

  // Recalculate status
  try {
    await recalcLeaveRequestStatus(leaveRequestId);
    logger.info(`[APPROVE LEAVE DAYS] Status recalculated successfully for leave request ${leaveRequestId}`);
  } catch (recalcError: any) {
    logger.error(`[APPROVE LEAVE DAYS] Error recalculating status for leave request ${leaveRequestId}:`, recalcError);
    // Continue with email sending even if recalc fails
  }

  logger.info(`[EMAIL] ========== ABOUT TO SEND EMAIL NOTIFICATIONS FOR DAYS APPROVAL ==========`);
  logger.info(`[EMAIL] Leave object check:`, {
    has_employee_email: !!leave.employee_email,
    has_manager_email: !!leave.manager_email,
    has_hr_email: !!leave.hr_email,
    approver_role: approverRole
  });

  // ========== SEND EMAIL NOTIFICATIONS ==========
  logger.info(`[EMAIL] ========== STARTING EMAIL NOTIFICATION FOR LEAVE DAYS APPROVAL ==========`);
  logger.info(`[EMAIL] Request ID: ${leaveRequestId}, Day IDs: ${dayIds.join(', ')}, Approver ID: ${approverId}, Approver Role: ${approverRole}`);
  
  // Send email notifications based on approver role
  if (approverRole === 'manager') {
    // Manager approves → Employee gets email
    logger.info(`[EMAIL] Manager days approval - sending email to employee: ${leave.employee_email || 'NO EMAIL'}`);
    if (leave.employee_email) {
      try {
        await sendLeaveStatusEmail(leave.employee_email, {
          employeeName: leave.employee_name || 'Employee',
          employeeEmpId: leave.employee_emp_id || '',
          recipientName: leave.employee_name || 'Employee',
          recipientRole: 'employee' as const,
          leaveType: leave.leave_type,
          startDate: leave.start_date,
          startType: leave.start_type,
          endDate: leave.end_date,
          endType: leave.end_type,
          noOfDays: parseFloat(leave.no_of_days),
          reason: leave.reason,
          approverName: leave.approver_name || 'Approver',
          approverRole: approverRole,
          comment: comment || null,
          status: 'approved' as const
        });
        logger.info(`[EMAIL] ✅ Days approval email sent to employee: ${leave.employee_email}`);
      } catch (err: any) {
        logger.error(`[EMAIL] ❌ Error sending to employee:`, err);
      }
    }
  } else if (approverRole === 'hr') {
    // HR approves → Manager and Employee get emails
    logger.info(`[EMAIL] HR days approval - sending emails to employee and manager`);
    // Send to employee
    if (leave.employee_email) {
      try {
        await sendLeaveStatusEmail(leave.employee_email, {
          employeeName: leave.employee_name || 'Employee',
          employeeEmpId: leave.employee_emp_id || '',
          recipientName: leave.employee_name || 'Employee',
          recipientRole: 'employee' as const,
          leaveType: leave.leave_type,
          startDate: leave.start_date,
          startType: leave.start_type,
          endDate: leave.end_date,
          endType: leave.end_type,
          noOfDays: parseFloat(leave.no_of_days),
          reason: leave.reason,
          approverName: leave.approver_name || 'Approver',
          approverRole: approverRole,
          comment: comment || null,
          status: 'approved' as const
        });
        logger.info(`[EMAIL] ✅ Days approval email sent to employee: ${leave.employee_email}`);
      } catch (err: any) {
        logger.error(`[EMAIL] ❌ Error sending to employee:`, err);
      }
    }
    // Send to manager (if exists and different from employee)
    if (leave.manager_email && leave.manager_email !== leave.employee_email) {
      try {
        await sendLeaveStatusEmail(leave.manager_email, {
          employeeName: leave.employee_name || 'Employee',
          employeeEmpId: leave.employee_emp_id || '',
          recipientName: leave.manager_name || 'Manager',
          recipientRole: 'manager' as const,
          leaveType: leave.leave_type,
          startDate: leave.start_date,
          startType: leave.start_type,
          endDate: leave.end_date,
          endType: leave.end_type,
          noOfDays: parseFloat(leave.no_of_days),
          reason: leave.reason,
          approverName: leave.approver_name || 'Approver',
          approverRole: approverRole,
          comment: comment || null,
          status: 'approved' as const
        });
        logger.info(`[EMAIL] ✅ Days approval email sent to manager: ${leave.manager_email}`);
      } catch (err: any) {
        logger.error(`[EMAIL] ❌ Error sending to manager:`, err);
      }
    }
  } else if (approverRole === 'super_admin') {
    // Super Admin approves → HR, Manager, and Employee get emails
    logger.info(`[EMAIL] Super Admin days approval - sending emails to employee, manager, and HR`);
    // Send to employee
    if (leave.employee_email) {
      try {
        await sendLeaveStatusEmail(leave.employee_email, {
          employeeName: leave.employee_name || 'Employee',
          employeeEmpId: leave.employee_emp_id || '',
          recipientName: leave.employee_name || 'Employee',
          recipientRole: 'employee' as const,
          leaveType: leave.leave_type,
          startDate: leave.start_date,
          startType: leave.start_type,
          endDate: leave.end_date,
          endType: leave.end_type,
          noOfDays: parseFloat(leave.no_of_days),
          reason: leave.reason,
          approverName: leave.approver_name || 'Approver',
          approverRole: approverRole,
          comment: comment || null,
          status: 'approved' as const
        });
        logger.info(`[EMAIL] ✅ Days approval email sent to employee: ${leave.employee_email}`);
      } catch (err: any) {
        logger.error(`[EMAIL] ❌ Error sending to employee:`, err);
      }
    }
    // Send to manager (if exists and different from employee)
    if (leave.manager_email && leave.manager_email !== leave.employee_email) {
      try {
        await sendLeaveStatusEmail(leave.manager_email, {
          employeeName: leave.employee_name || 'Employee',
          employeeEmpId: leave.employee_emp_id || '',
          recipientName: leave.manager_name || 'Manager',
          recipientRole: 'manager' as const,
          leaveType: leave.leave_type,
          startDate: leave.start_date,
          startType: leave.start_type,
          endDate: leave.end_date,
          endType: leave.end_type,
          noOfDays: parseFloat(leave.no_of_days),
          reason: leave.reason,
          approverName: leave.approver_name || 'Approver',
          approverRole: approverRole,
          comment: comment || null,
          status: 'approved' as const
        });
        logger.info(`[EMAIL] ✅ Days approval email sent to manager: ${leave.manager_email}`);
      } catch (err: any) {
        logger.error(`[EMAIL] ❌ Error sending to manager:`, err);
      }
    }
    // Send to HR (if exists and different from employee and manager)
    if (leave.hr_email && leave.hr_email !== leave.employee_email && leave.hr_email !== leave.manager_email) {
      try {
        await sendLeaveStatusEmail(leave.hr_email, {
          employeeName: leave.employee_name || 'Employee',
          employeeEmpId: leave.employee_emp_id || '',
          recipientName: leave.hr_name || 'HR',
          recipientRole: 'hr' as const,
          leaveType: leave.leave_type,
          startDate: leave.start_date,
          startType: leave.start_type,
          endDate: leave.end_date,
          endType: leave.end_type,
          noOfDays: parseFloat(leave.no_of_days),
          reason: leave.reason,
          approverName: leave.approver_name || 'Approver',
          approverRole: approverRole,
          comment: comment || null,
          status: 'approved' as const
        });
        logger.info(`[EMAIL] ✅ Days approval email sent to HR: ${leave.hr_email}`);
      } catch (err: any) {
        logger.error(`[EMAIL] ❌ Error sending to HR:`, err);
      }
    }
  }

  logger.info(`[EMAIL] ========== EMAIL NOTIFICATION COMPLETED FOR LEAVE DAYS APPROVAL ==========`);
  logger.info(`[APPROVE LEAVE DAYS] ========== FUNCTION COMPLETING ==========`);
  
  return { 
    message: `Approved ${daysToApprove.length} day(s), rejected ${daysToReject.length} day(s)` 
  };
};

export const rejectLeaveDay = async (
  leaveRequestId: number,
  dayId: number,
  approverId: number,
  approverRole: string,
  comment: string
) => {
  logger.info(`[REJECT LEAVE DAY] ========== FUNCTION CALLED ==========`);
  logger.info(`[REJECT LEAVE DAY] Request ID: ${leaveRequestId}, Day ID: ${dayId}, Approver ID: ${approverId}, Role: ${approverRole}`);
  
  // Get leave request details with employee, approver, manager, and HR information
  const leaveResult = await pool.query(
    `SELECT 
      lr.*, 
      u.reporting_manager_id, 
      u.role as employee_role,
      u.email as employee_email,
      u.first_name || ' ' || COALESCE(u.last_name, '') as employee_name,
      u.emp_id as employee_emp_id,
      approver.first_name || ' ' || COALESCE(approver.last_name, '') as approver_name,
      manager.email as manager_email,
      manager.first_name || ' ' || COALESCE(manager.last_name, '') as manager_name,
      hr.email as hr_email,
      hr.first_name || ' ' || COALESCE(hr.last_name, '') as hr_name
     FROM leave_requests lr
     JOIN users u ON lr.employee_id = u.id
     LEFT JOIN users approver ON approver.id = $2
     LEFT JOIN users manager ON u.reporting_manager_id = manager.id
     LEFT JOIN users hr ON manager.reporting_manager_id = hr.id
     WHERE lr.id = $1`,
    [leaveRequestId, approverId]
  );

  if (leaveResult.rows.length === 0) {
    throw new Error('Leave request not found');
  }

  const leave = leaveResult.rows[0];

  // Auth: manager -> direct reports; HR -> employee/manager; super_admin -> all
  if (approverRole === 'manager') {
    if (leave.reporting_manager_id !== approverId) {
      throw new Error('Not authorized to reject this leave');
    }
  } else if (approverRole === 'hr') {
    if (leave.employee_role !== 'employee' && leave.employee_role !== 'manager') {
      throw new Error('Not authorized to reject this leave');
    }
  } else if (approverRole !== 'super_admin') {
    throw new Error('Not authorized to reject leaves');
  }

  const dayResult = await pool.query(
    'SELECT id, day_status, day_type FROM leave_days WHERE id = $1 AND leave_request_id = $2',
    [dayId, leaveRequestId]
  );
  if (dayResult.rows.length === 0) {
    throw new Error('Leave day not found');
  }
  const existingStatus = dayResult.rows[0].day_status || 'pending';
  const dayType = dayResult.rows[0].day_type || 'full';

  if (existingStatus !== 'rejected') {
    await pool.query(
      `UPDATE leave_days
       SET day_status = 'rejected'
       WHERE id = $1`,
      [dayId]
    );

    // Refund balance for this rejected day (except permission)
    if (leave.leave_type !== 'permission') {
      const refund = dayType === 'half' ? 0.5 : 1;
      const balanceColumn =
        leave.leave_type === 'casual'
          ? 'casual_balance'
          : leave.leave_type === 'sick'
          ? 'sick_balance'
          : 'lop_balance';
      
      // For LOP, check if refund would exceed 10 and cap it
      if (leave.leave_type === 'lop') {
        const currentBalanceResult = await pool.query(
          'SELECT lop_balance FROM leave_balances WHERE employee_id = $1',
          [leave.employee_id]
        );
        const currentLop = parseFloat(currentBalanceResult.rows[0]?.lop_balance || '0') || 0;
        const newLopBalance = currentLop + refund;
        
        if (newLopBalance > 10) {
          const cappedRefund = 10 - currentLop;
          if (cappedRefund > 0) {
            await pool.query(
              `UPDATE leave_balances SET lop_balance = 10 WHERE employee_id = $1`,
              [leave.employee_id]
            );
            logger.warn(
              `[REJECT LEAVE DAY] LOP balance would exceed 10. Current: ${currentLop}, Refunding: ${refund}, Would be: ${newLopBalance}. Capped at 10 (refunded ${cappedRefund} instead of ${refund}).`
            );
          } else {
            logger.warn(
              `[REJECT LEAVE DAY] LOP balance already at or above 10. Current: ${currentLop}. Cannot refund ${refund} days.`
            );
          }
        } else {
          await pool.query(
            `UPDATE leave_balances SET lop_balance = lop_balance + $1 WHERE employee_id = $2`,
            [refund, leave.employee_id]
          );
        }
      } else {
        await pool.query(
          `UPDATE leave_balances SET ${balanceColumn} = ${balanceColumn} + $1 WHERE employee_id = $2`,
          [refund, leave.employee_id]
        );
      }
    }
  }

  if (approverRole === 'manager') {
    // Additional safeguard: ensure manager can only reject their direct reports
    const updateResult = await pool.query(
      `UPDATE leave_requests 
       SET manager_approval_status = 'rejected',
           manager_approval_date = CURRENT_TIMESTAMP,
           manager_approval_comment = $1,
           manager_approved_by = $2,
           last_updated_by = $2,
           last_updated_by_role = 'manager'
       WHERE id = $3 
         AND EXISTS (
           SELECT 1 FROM users u 
           WHERE u.id = (SELECT employee_id FROM leave_requests WHERE id = $3)
           AND u.reporting_manager_id = $2
         )`,
      [comment || null, approverId, leaveRequestId]
    );
    
    if (updateResult.rowCount === 0) {
      throw new Error('Not authorized to reject this leave');
    }
  } else if (approverRole === 'hr') {
    await pool.query(
      `UPDATE leave_requests 
       SET hr_approval_status = 'rejected',
           hr_approval_date = CURRENT_TIMESTAMP,
           hr_approval_comment = $1,
           hr_approved_by = $2,
           last_updated_by = $2,
           last_updated_by_role = 'hr'
       WHERE id = $3`,
      [comment || null, approverId, leaveRequestId]
    );
  } else if (approverRole === 'super_admin') {
    await pool.query(
      `UPDATE leave_requests 
       SET super_admin_approval_status = 'rejected',
           super_admin_approval_date = CURRENT_TIMESTAMP,
           super_admin_approval_comment = $1,
           super_admin_approved_by = $2,
           last_updated_by = $2,
           last_updated_by_role = 'super_admin'
       WHERE id = $3`,
      [comment || null, approverId, leaveRequestId]
    );
  }

  // Refund only the days actually rejected in this action (except permission).
  // Since this is a day-level rejection, a single day's refund has already been applied above.
  // No additional bulk refund needed here.

  logger.info(`[REJECT LEAVE DAY] Database updates completed, about to recalculate status`);

  // Recalculate status
  try {
    await recalcLeaveRequestStatus(leaveRequestId);
    logger.info(`[REJECT LEAVE DAY] Status recalculated successfully for leave request ${leaveRequestId}`);
  } catch (recalcError: any) {
    logger.error(`[REJECT LEAVE DAY] Error recalculating status for leave request ${leaveRequestId}:`, recalcError);
    // Continue with email sending even if recalc fails
  }

  logger.info(`[EMAIL] ========== ABOUT TO SEND EMAIL NOTIFICATIONS FOR DAY REJECTION ==========`);
  logger.info(`[EMAIL] Leave object check:`, {
    has_employee_email: !!leave.employee_email,
    has_manager_email: !!leave.manager_email,
    has_hr_email: !!leave.hr_email,
    approver_role: approverRole
  });

  // ========== SEND EMAIL NOTIFICATIONS ==========
  logger.info(`[EMAIL] ========== STARTING EMAIL NOTIFICATION FOR LEAVE DAY REJECTION ==========`);
  logger.info(`[EMAIL] Request ID: ${leaveRequestId}, Day ID: ${dayId}, Approver ID: ${approverId}, Approver Role: ${approverRole}`);
  
  // Send email notifications based on approver role
  if (approverRole === 'manager') {
    // Manager rejects → Employee gets email
    logger.info(`[EMAIL] Manager day rejection - sending email to employee: ${leave.employee_email || 'NO EMAIL'}`);
    if (leave.employee_email) {
      try {
        await sendLeaveStatusEmail(leave.employee_email, {
          employeeName: leave.employee_name || 'Employee',
          employeeEmpId: leave.employee_emp_id || '',
          recipientName: leave.employee_name || 'Employee',
          recipientRole: 'employee' as const,
          leaveType: leave.leave_type,
          startDate: leave.start_date,
          startType: leave.start_type,
          endDate: leave.end_date,
          endType: leave.end_type,
          noOfDays: parseFloat(leave.no_of_days),
          reason: leave.reason,
          approverName: leave.approver_name || 'Approver',
          approverRole: approverRole,
          comment: comment || null,
          status: 'rejected' as const
        });
        logger.info(`[EMAIL] ✅ Day rejection email sent to employee: ${leave.employee_email}`);
      } catch (err: any) {
        logger.error(`[EMAIL] ❌ Error sending to employee:`, err);
      }
    }
  } else if (approverRole === 'hr') {
    // HR rejects → Manager and Employee get emails
    logger.info(`[EMAIL] HR day rejection - sending emails to employee and manager`);
    // Send to employee
    if (leave.employee_email) {
      try {
        await sendLeaveStatusEmail(leave.employee_email, {
          employeeName: leave.employee_name || 'Employee',
          employeeEmpId: leave.employee_emp_id || '',
          recipientName: leave.employee_name || 'Employee',
          recipientRole: 'employee' as const,
          leaveType: leave.leave_type,
          startDate: leave.start_date,
          startType: leave.start_type,
          endDate: leave.end_date,
          endType: leave.end_type,
          noOfDays: parseFloat(leave.no_of_days),
          reason: leave.reason,
          approverName: leave.approver_name || 'Approver',
          approverRole: approverRole,
          comment: comment || null,
          status: 'rejected' as const
        });
        logger.info(`[EMAIL] ✅ Day rejection email sent to employee: ${leave.employee_email}`);
      } catch (err: any) {
        logger.error(`[EMAIL] ❌ Error sending to employee:`, err);
      }
    }
    // Send to manager
    if (leave.manager_email) {
      try {
        await sendLeaveStatusEmail(leave.manager_email, {
          employeeName: leave.employee_name || 'Employee',
          employeeEmpId: leave.employee_emp_id || '',
          recipientName: leave.manager_name || 'Manager',
          recipientRole: 'manager' as const,
          leaveType: leave.leave_type,
          startDate: leave.start_date,
          startType: leave.start_type,
          endDate: leave.end_date,
          endType: leave.end_type,
          noOfDays: parseFloat(leave.no_of_days),
          reason: leave.reason,
          approverName: leave.approver_name || 'Approver',
          approverRole: approverRole,
          comment: comment || null,
          status: 'rejected' as const
        });
        logger.info(`[EMAIL] ✅ Day rejection email sent to manager: ${leave.manager_email}`);
      } catch (err: any) {
        logger.error(`[EMAIL] ❌ Error sending to manager:`, err);
      }
    }
  } else if (approverRole === 'super_admin') {
    // Super Admin rejects → HR, Manager, and Employee get emails
    logger.info(`[EMAIL] Super Admin day rejection - sending emails to employee, manager, and HR`);
    // Send to employee
    if (leave.employee_email) {
      try {
        await sendLeaveStatusEmail(leave.employee_email, {
          employeeName: leave.employee_name || 'Employee',
          employeeEmpId: leave.employee_emp_id || '',
          recipientName: leave.employee_name || 'Employee',
          recipientRole: 'employee' as const,
          leaveType: leave.leave_type,
          startDate: leave.start_date,
          startType: leave.start_type,
          endDate: leave.end_date,
          endType: leave.end_type,
          noOfDays: parseFloat(leave.no_of_days),
          reason: leave.reason,
          approverName: leave.approver_name || 'Approver',
          approverRole: approverRole,
          comment: comment || null,
          status: 'rejected' as const
        });
        logger.info(`[EMAIL] ✅ Day rejection email sent to employee: ${leave.employee_email}`);
      } catch (err: any) {
        logger.error(`[EMAIL] ❌ Error sending to employee:`, err);
      }
    }
    // Send to manager
    if (leave.manager_email) {
      try {
        await sendLeaveStatusEmail(leave.manager_email, {
          employeeName: leave.employee_name || 'Employee',
          employeeEmpId: leave.employee_emp_id || '',
          recipientName: leave.manager_name || 'Manager',
          recipientRole: 'manager' as const,
          leaveType: leave.leave_type,
          startDate: leave.start_date,
          startType: leave.start_type,
          endDate: leave.end_date,
          endType: leave.end_type,
          noOfDays: parseFloat(leave.no_of_days),
          reason: leave.reason,
          approverName: leave.approver_name || 'Approver',
          approverRole: approverRole,
          comment: comment || null,
          status: 'rejected' as const
        });
        logger.info(`[EMAIL] ✅ Day rejection email sent to manager: ${leave.manager_email}`);
      } catch (err: any) {
        logger.error(`[EMAIL] ❌ Error sending to manager:`, err);
      }
    }
    // Send to HR
    if (leave.hr_email) {
      try {
        await sendLeaveStatusEmail(leave.hr_email, {
          employeeName: leave.employee_name || 'Employee',
          employeeEmpId: leave.employee_emp_id || '',
          recipientName: leave.hr_name || 'HR',
          recipientRole: 'hr' as const,
          leaveType: leave.leave_type,
          startDate: leave.start_date,
          startType: leave.start_type,
          endDate: leave.end_date,
          endType: leave.end_type,
          noOfDays: parseFloat(leave.no_of_days),
          reason: leave.reason,
          approverName: leave.approver_name || 'Approver',
          approverRole: approverRole,
          comment: comment || null,
          status: 'rejected' as const
        });
        logger.info(`[EMAIL] ✅ Day rejection email sent to HR: ${leave.hr_email}`);
      } catch (err: any) {
        logger.error(`[EMAIL] ❌ Error sending to HR:`, err);
      }
    }
  }

  logger.info(`[EMAIL] ========== EMAIL NOTIFICATION COMPLETED FOR LEAVE DAY REJECTION ==========`);
  logger.info(`[REJECT LEAVE DAY] ========== FUNCTION COMPLETING ==========`);

  return { message: 'Leave day rejected successfully' };
};

// Update leave status for HR/Super Admin (bypasses normal authorization)
export const updateLeaveStatus = async (
  leaveRequestId: number,
  approverId: number,
  approverRole: string,
  newStatus: string,
  selectedDayIds?: number[],
  rejectReason?: string,
  leaveReason?: string
) => {
  logger.info(`[LEAVE] [UPDATE LEAVE STATUS] ========== FUNCTION CALLED ==========`);
  logger.info(`[LEAVE] [UPDATE LEAVE STATUS] Request ID: ${leaveRequestId}, Approver ID: ${approverId}, Role: ${approverRole}, New Status: ${newStatus}, Selected Day IDs: ${selectedDayIds?.join(', ') || 'none'}`);
  
  // Only HR and Super Admin can use this function
  if (approverRole !== 'hr' && approverRole !== 'super_admin') {
    logger.warn(`[LEAVE] [UPDATE LEAVE STATUS] Unauthorized attempt - Approver ID: ${approverId}, Role: ${approverRole}`);
    throw new Error('Not authorized to update leave status');
  }

  const leaveResult = await pool.query(
    `SELECT lr.*, u.role as employee_role, u.email as employee_email,
            u.first_name || ' ' || COALESCE(u.last_name, '') as employee_name,
            approver.first_name || ' ' || COALESCE(approver.last_name, '') as approver_name,
            lr.manager_approval_date, lr.hr_approval_date, lr.super_admin_approval_date
     FROM leave_requests lr
     JOIN users u ON lr.employee_id = u.id
     LEFT JOIN users approver ON approver.id = $2
     WHERE lr.id = $1`,
    [leaveRequestId, approverId]
  );

  if (leaveResult.rows.length === 0) {
    throw new Error('Leave request not found');
  }

  const leave = leaveResult.rows[0];

  // Check who last updated the leave using last_updated_by_role
  const lastUpdaterRole = leave.last_updated_by_role;

  // Validate hierarchy: Check if current user can update based on who last updated
  if (lastUpdaterRole === 'super_admin') {
    // If super admin updated, only super admin can update
    if (approverRole !== 'super_admin') {
      throw new Error('Super Admin has updated the status of this leave. You cannot update it now.');
    }
  } else if (lastUpdaterRole === 'hr') {
    // If HR updated, both HR and super admin can update (manager check already done at function start)
    // No additional check needed since approverRole is already restricted to 'hr' | 'super_admin'
  }
  // If manager updated (or no one updated yet), HR and super admin can update (already checked at function start)

  // Get all leave days
  const leaveDaysResult = await pool.query(
    'SELECT id, leave_date, day_status, day_type FROM leave_days WHERE leave_request_id = $1 ORDER BY leave_date',
    [leaveRequestId]
  );
  const allLeaveDays = leaveDaysResult.rows || [];

  if (newStatus === 'approved') {
    // Approve all days
    await pool.query(
      `UPDATE leave_days SET day_status = 'approved' WHERE leave_request_id = $1`,
      [leaveRequestId]
    );
    
    // Update leave request status and reason
    // Clear rejection comments when changing to approved
    // Update the appropriate approval field based on role
    if (approverRole === 'super_admin') {
      await pool.query(
        `UPDATE leave_requests 
         SET current_status = 'approved',
             super_admin_approval_status = 'approved',
             super_admin_approval_date = CURRENT_TIMESTAMP,
             super_admin_approval_comment = $1,
             super_admin_approved_by = $2,
             reason = COALESCE($4, reason),
             manager_approval_comment = NULL,
             hr_approval_comment = NULL,
             last_updated_by = $2,
             last_updated_by_role = 'super_admin'
         WHERE id = $3`,
        [`Status updated by Super Admin`, approverId, leaveRequestId, leaveReason]
      );
    } else if (approverRole === 'hr') {
      await pool.query(
        `UPDATE leave_requests 
         SET current_status = 'approved',
             hr_approval_status = 'approved',
             hr_approval_date = CURRENT_TIMESTAMP,
             hr_approval_comment = $1,
             hr_approved_by = $2,
             reason = COALESCE($4, reason),
             manager_approval_comment = NULL,
             last_updated_by = $2,
             last_updated_by_role = 'hr'
         WHERE id = $3`,
        [`Status updated by HR`, approverId, leaveRequestId, leaveReason]
      );
    }

  } else if (newStatus === 'rejected') {
    // Reject all days
    await pool.query(
      `UPDATE leave_days SET day_status = 'rejected' WHERE leave_request_id = $1`,
      [leaveRequestId]
    );

    // Update leave request status and reason
    // Update the appropriate approval field based on role
    if (approverRole === 'super_admin') {
      await pool.query(
        `UPDATE leave_requests 
         SET current_status = 'rejected',
             super_admin_approval_status = 'rejected',
             super_admin_approval_date = CURRENT_TIMESTAMP,
             super_admin_approval_comment = $1,
             super_admin_approved_by = $2,
             reason = COALESCE($4, reason),
             manager_approval_comment = NULL,
             hr_approval_comment = NULL,
             last_updated_by = $2,
             last_updated_by_role = 'super_admin'
         WHERE id = $3`,
        [rejectReason || 'Status updated by Super Admin', approverId, leaveRequestId, leaveReason]
      );
    } else if (approverRole === 'hr') {
      await pool.query(
        `UPDATE leave_requests 
         SET current_status = 'rejected',
             hr_approval_status = 'rejected',
             hr_approval_date = CURRENT_TIMESTAMP,
             hr_approval_comment = $1,
             hr_approved_by = $2,
             reason = COALESCE($4, reason),
             manager_approval_comment = NULL,
             last_updated_by = $2,
             last_updated_by_role = 'hr'
         WHERE id = $3`,
        [rejectReason || 'Status updated by HR', approverId, leaveRequestId, leaveReason]
      );
    }

  } else if (newStatus === 'partially_approved' && selectedDayIds && selectedDayIds.length > 0) {
    // Approve selected days, reject remaining
    const allDayIds = allLeaveDays.map(d => d.id);
    const daysToReject = allDayIds.filter(id => !selectedDayIds.includes(id));

    // Approve selected days
    await pool.query(
      `UPDATE leave_days SET day_status = 'approved' WHERE id = ANY($1::int[]) AND leave_request_id = $2`,
      [selectedDayIds, leaveRequestId]
    );

    // Reject remaining days
    if (daysToReject.length > 0) {
      await pool.query(
        `UPDATE leave_days SET day_status = 'rejected' WHERE id = ANY($1::int[]) AND leave_request_id = $2`,
        [daysToReject, leaveRequestId]
      );
    }

    // Update leave request and reason
    // Clear rejection comments when partially approving
    // Update the appropriate approval field based on role
    if (approverRole === 'super_admin') {
      await pool.query(
        `UPDATE leave_requests 
         SET super_admin_approval_status = 'approved',
             super_admin_approval_date = CURRENT_TIMESTAMP,
             super_admin_approval_comment = $1,
             super_admin_approved_by = $2,
             reason = COALESCE($4, reason),
             manager_approval_comment = NULL,
             hr_approval_comment = NULL,
             last_updated_by = $2,
             last_updated_by_role = 'super_admin'
         WHERE id = $3`,
        [`Status updated by Super Admin`, approverId, leaveRequestId, leaveReason]
      );
    } else if (approverRole === 'hr') {
      await pool.query(
        `UPDATE leave_requests 
         SET hr_approval_status = 'approved',
             hr_approval_date = CURRENT_TIMESTAMP,
             hr_approval_comment = $1,
             hr_approved_by = $2,
             reason = COALESCE($4, reason),
             manager_approval_comment = NULL,
             last_updated_by = $2,
             last_updated_by_role = 'hr'
         WHERE id = $3`,
        [`Status updated by HR`, approverId, leaveRequestId, leaveReason]
      );
    }

    // Recalculate status
    await recalcLeaveRequestStatus(leaveRequestId);
  } else {
    throw new Error('Invalid status or missing required parameters');
  }

  // Send email notifications for status updates (approved/rejected)
  if (newStatus === 'approved' || newStatus === 'rejected') {
    try {
      logger.info(`[EMAIL DEBUG] Starting email notification for updateLeaveStatus. Request ID: ${leaveRequestId}, Status: ${newStatus}, Approver Role: ${approverRole}`);
      
      // Get employee, manager, and HR information for emails
      const emailResult = await pool.query(
        `SELECT 
          lr.*,
          u.email as employee_email,
          u.first_name || ' ' || COALESCE(u.last_name, '') as employee_name,
          u.emp_id as employee_emp_id,
          manager.email as manager_email,
          manager.first_name || ' ' || COALESCE(manager.last_name, '') as manager_name,
          hr.email as hr_email,
          hr.first_name || ' ' || COALESCE(hr.last_name, '') as hr_name,
          approver.first_name || ' ' || COALESCE(approver.last_name, '') as approver_name
         FROM leave_requests lr
         JOIN users u ON lr.employee_id = u.id
         LEFT JOIN users approver ON approver.id = $2
         LEFT JOIN users manager ON u.reporting_manager_id = manager.id
         LEFT JOIN users hr ON manager.reporting_manager_id = hr.id
         WHERE lr.id = $1`,
        [leaveRequestId, approverId]
      );

      if (emailResult.rows.length > 0) {
        const emailLeave = emailResult.rows[0];
        // Determine recipients based on approver role (same logic as approve/reject)
        // Note: updateLeaveStatus only allows 'hr' and 'super_admin', so manager case is not needed here
        if (approverRole === 'hr') {
          // HR updates → Manager and Employee get emails
          // Send to employee
          if (emailLeave.employee_email) {
            const employeeEmailData = {
              employeeName: emailLeave.employee_name || 'Employee',
              employeeEmpId: emailLeave.employee_emp_id || '',
              recipientName: emailLeave.employee_name || 'Employee',
              recipientRole: 'employee' as const,
              leaveType: emailLeave.leave_type,
              startDate: emailLeave.start_date,
              startType: emailLeave.start_type,
              endDate: emailLeave.end_date,
              endType: emailLeave.end_type,
              noOfDays: parseFloat(emailLeave.no_of_days),
              reason: emailLeave.reason,
              approverName: emailLeave.approver_name || 'Approver',
              approverRole: approverRole,
              comment: newStatus === 'rejected' ? (rejectReason || null) : null,
              status: newStatus as 'approved' | 'rejected'
            };
            const emailSent = await sendLeaveStatusEmail(emailLeave.employee_email, employeeEmailData);
            if (emailSent) {
              logger.info(`✅ Leave ${newStatus} email sent to employee: ${emailLeave.employee_email}`);
            } else {
              logger.warn(`⚠️ Failed to send leave ${newStatus} email to employee: ${emailLeave.employee_email}`);
            }
          }
          // Send to manager (if exists and different from employee)
          if (emailLeave.manager_email && emailLeave.manager_email !== emailLeave.employee_email) {
            const managerEmailData = {
              employeeName: emailLeave.employee_name || 'Employee',
              employeeEmpId: emailLeave.employee_emp_id || '',
              recipientName: emailLeave.manager_name || 'Manager',
              recipientRole: 'manager' as const,
              leaveType: emailLeave.leave_type,
              startDate: emailLeave.start_date,
              startType: emailLeave.start_type,
              endDate: emailLeave.end_date,
              endType: emailLeave.end_type,
              noOfDays: parseFloat(emailLeave.no_of_days),
              reason: emailLeave.reason,
              approverName: emailLeave.approver_name || 'Approver',
              approverRole: approverRole,
              comment: newStatus === 'rejected' ? (rejectReason || null) : null,
              status: newStatus as 'approved' | 'rejected'
            };
            const emailSent = await sendLeaveStatusEmail(emailLeave.manager_email, managerEmailData);
            if (emailSent) {
              logger.info(`✅ Leave ${newStatus} email sent to manager: ${emailLeave.manager_email}`);
            } else {
              logger.warn(`⚠️ Failed to send leave ${newStatus} email to manager: ${emailLeave.manager_email}`);
            }
          }
        } else if (approverRole === 'super_admin') {
          // Super Admin updates → HR, Manager, and Employee get emails
          // Send to employee
          if (emailLeave.employee_email) {
            const employeeEmailData = {
              employeeName: emailLeave.employee_name || 'Employee',
              employeeEmpId: emailLeave.employee_emp_id || '',
              recipientName: emailLeave.employee_name || 'Employee',
              recipientRole: 'employee' as const,
              leaveType: emailLeave.leave_type,
              startDate: emailLeave.start_date,
              startType: emailLeave.start_type,
              endDate: emailLeave.end_date,
              endType: emailLeave.end_type,
              noOfDays: parseFloat(emailLeave.no_of_days),
              reason: emailLeave.reason,
              approverName: emailLeave.approver_name || 'Approver',
              approverRole: approverRole,
              comment: newStatus === 'rejected' ? (rejectReason || null) : null,
              status: newStatus as 'approved' | 'rejected'
            };
            const emailSent = await sendLeaveStatusEmail(emailLeave.employee_email, employeeEmailData);
            if (emailSent) {
              logger.info(`✅ Leave ${newStatus} email sent to employee: ${emailLeave.employee_email}`);
            } else {
              logger.warn(`⚠️ Failed to send leave ${newStatus} email to employee: ${emailLeave.employee_email}`);
            }
          }
          // Send to manager (if exists and different from employee)
          if (emailLeave.manager_email && emailLeave.manager_email !== emailLeave.employee_email) {
            const managerEmailData = {
              employeeName: emailLeave.employee_name || 'Employee',
              employeeEmpId: emailLeave.employee_emp_id || '',
              recipientName: emailLeave.manager_name || 'Manager',
              recipientRole: 'manager' as const,
              leaveType: emailLeave.leave_type,
              startDate: emailLeave.start_date,
              startType: emailLeave.start_type,
              endDate: emailLeave.end_date,
              endType: emailLeave.end_type,
              noOfDays: parseFloat(emailLeave.no_of_days),
              reason: emailLeave.reason,
              approverName: emailLeave.approver_name || 'Approver',
              approverRole: approverRole,
              comment: newStatus === 'rejected' ? (rejectReason || null) : null,
              status: newStatus as 'approved' | 'rejected'
            };
            const emailSent = await sendLeaveStatusEmail(emailLeave.manager_email, managerEmailData);
            if (emailSent) {
              logger.info(`✅ Leave ${newStatus} email sent to manager: ${emailLeave.manager_email}`);
            } else {
              logger.warn(`⚠️ Failed to send leave ${newStatus} email to manager: ${emailLeave.manager_email}`);
            }
          }
          // Send to HR (if exists and different from employee and manager)
          if (emailLeave.hr_email && emailLeave.hr_email !== emailLeave.employee_email && emailLeave.hr_email !== emailLeave.manager_email) {
            const hrEmailData = {
              employeeName: emailLeave.employee_name || 'Employee',
              employeeEmpId: emailLeave.employee_emp_id || '',
              recipientName: emailLeave.hr_name || 'HR',
              recipientRole: 'hr' as const,
              leaveType: emailLeave.leave_type,
              startDate: emailLeave.start_date,
              startType: emailLeave.start_type,
              endDate: emailLeave.end_date,
              endType: emailLeave.end_type,
              noOfDays: parseFloat(emailLeave.no_of_days),
              reason: emailLeave.reason,
              approverName: emailLeave.approver_name || 'Approver',
              approverRole: approverRole,
              comment: newStatus === 'rejected' ? (rejectReason || null) : null,
              status: newStatus as 'approved' | 'rejected'
            };
            const emailSent = await sendLeaveStatusEmail(emailLeave.hr_email, hrEmailData);
            if (emailSent) {
              logger.info(`✅ Leave ${newStatus} email sent to HR: ${emailLeave.hr_email}`);
            } else {
              logger.warn(`⚠️ Failed to send leave ${newStatus} email to HR: ${emailLeave.hr_email}`);
            }
          }
        }
      }
    } catch (emailError: any) {
      logger.error(`❌ Error sending emails in updateLeaveStatus for leave request ${leaveRequestId}:`, emailError);
    }
  }

  return { message: 'Leave status updated successfully' };
};

export const getApprovedLeaves = async (
  page: number = 1,
  limit: number = 10,
  userRole?: string
) => {
  logger.info(`[LEAVE] [GET APPROVED LEAVES] ========== FUNCTION CALLED ==========`);
  logger.info(`[LEAVE] [GET APPROVED LEAVES] Page: ${page}, Limit: ${limit}, User Role: ${userRole || 'none'}`);
  
  const offset = (page - 1) * limit;
  
  const result = await pool.query(
    `SELECT
        lr.id,
        u.emp_id,
        u.first_name || ' ' || COALESCE(u.last_name, '') AS emp_name,
        lr.applied_date,
        lr.start_date,
        lr.end_date,
        lr.leave_type,
        lr.no_of_days,
        lr.current_status AS leave_status,
        lr.manager_approval_comment,
        lr.hr_approval_comment,
        lr.super_admin_approval_comment,
        lr.last_updated_by,
        lr.last_updated_by_role,
        last_updater.first_name || ' ' || COALESCE(last_updater.last_name, '') AS approver_name,
        COALESCE(SUM(CASE WHEN ld.day_status = 'approved' THEN CASE WHEN ld.day_type = 'half' THEN 0.5 ELSE 1 END ELSE 0 END), 0) AS approved_days,
        COALESCE(SUM(CASE WHEN ld.day_status = 'rejected' THEN CASE WHEN ld.day_type = 'half' THEN 0.5 ELSE 1 END ELSE 0 END), 0) AS rejected_days,
        COALESCE(SUM(CASE WHEN ld.day_status = 'pending' THEN CASE WHEN ld.day_type = 'half' THEN 0.5 ELSE 1 END ELSE 0 END), 0) AS pending_days,
        ARRAY_REMOVE(ARRAY_AGG(CASE WHEN ld.day_status = 'approved' THEN ld.leave_date END ORDER BY ld.leave_date), NULL) AS approved_dates,
        ARRAY_REMOVE(ARRAY_AGG(CASE WHEN ld.day_status = 'rejected' THEN ld.leave_date END ORDER BY ld.leave_date), NULL) AS rejected_dates
     FROM leave_requests lr
     JOIN users u ON lr.employee_id = u.id
     LEFT JOIN leave_days ld ON ld.leave_request_id = lr.id
     LEFT JOIN users last_updater ON last_updater.id = lr.last_updated_by
     WHERE lr.current_status != 'pending'
        OR EXISTS (
          SELECT 1 FROM leave_days ld2
          WHERE ld2.leave_request_id = lr.id 
            AND (ld2.day_status = 'approved' OR ld2.day_status = 'rejected')
        )
     GROUP BY lr.id, u.emp_id, u.first_name, u.last_name, lr.applied_date, lr.start_date, lr.end_date, lr.leave_type, lr.no_of_days, lr.current_status,
              lr.manager_approval_comment, lr.hr_approval_comment, lr.super_admin_approval_comment,
              lr.last_updated_by, lr.last_updated_by_role,
              last_updater.first_name, last_updater.last_name
     ORDER BY lr.applied_date DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  const countResult = await pool.query(
    `SELECT COUNT(DISTINCT lr.id)
     FROM leave_requests lr
     WHERE lr.current_status != 'pending'
        OR EXISTS (
          SELECT 1 FROM leave_days ld2
          WHERE ld2.leave_request_id = lr.id 
            AND (ld2.day_status = 'approved' OR ld2.day_status = 'rejected')
        )`
  );

  // Get leave days for each request
  const requestsWithDays = await Promise.all(
    result.rows.map(async (row) => {
      const daysResult = await pool.query(
        'SELECT id, leave_date, day_type, day_status FROM leave_days WHERE leave_request_id = $1 ORDER BY leave_date',
        [row.id]
      );

      const approvedDates = Array.isArray(row.approved_dates) ? row.approved_dates.filter((d: any) => d) : [];
      const rejectedDates = Array.isArray(row.rejected_dates) ? row.rejected_dates.filter((d: any) => d) : [];
      const approvedDays = parseFloat(row.approved_days) || 0;
      const rejectedDays = parseFloat(row.rejected_days) || 0;
      const pendingDays = parseFloat(row.pending_days) || 0;

      let displayStatus = row.leave_status;
      if (approvedDays > 0 && (rejectedDays > 0 || pendingDays > 0)) {
        displayStatus = 'partially_approved';
      } else if (approvedDays > 0 && rejectedDays === 0 && pendingDays === 0) {
        displayStatus = 'approved';
      } else if (rejectedDays > 0 && approvedDays === 0 && pendingDays === 0) {
        displayStatus = 'rejected';
      } else if (pendingDays > 0 && approvedDays === 0 && rejectedDays === 0) {
        displayStatus = 'pending';
      }

      // Format leave date - show approved dates if available, otherwise show rejected dates, otherwise show full range
      let leaveDate: string;
      if (approvedDates.length > 0) {
        const formatted = approvedDates.map((d: Date) => formatDate(d));
        const first = formatted[0];
        const last = formatted[formatted.length - 1];
        leaveDate = formatted.length === 1 ? first : `${first} to ${last}`;
      } else if (rejectedDates.length > 0 && approvedDays === 0) {
        // If all rejected, show rejected date range
        const formatted = rejectedDates.map((d: Date) => formatDate(d));
        const first = formatted[0];
        const last = formatted[formatted.length - 1];
        leaveDate = formatted.length === 1 ? first : `${first} to ${last}`;
      } else {
        leaveDate = `${formatDate(row.start_date)} to ${formatDate(row.end_date)}`;
      }

      // Calculate total days based on status
      let noOfDays: number;
      if (displayStatus === 'approved' || displayStatus === 'partially_approved') {
        noOfDays = approvedDays > 0 ? approvedDays : parseFloat(row.no_of_days);
      } else if (displayStatus === 'rejected') {
        noOfDays = rejectedDays > 0 ? rejectedDays : parseFloat(row.no_of_days);
      } else {
        noOfDays = parseFloat(row.no_of_days);
      }

      // Manager can only view, HR and Super Admin can view and edit
      // No one can delete approved/rejected leaves
      const canEdit = userRole === 'hr' || userRole === 'super_admin';
      const canDelete = false; // Approved/rejected leaves cannot be deleted

      // Get rejection reason only if status is rejected (priority: super_admin > hr > manager)
      const rejectionReason = (displayStatus === 'rejected') 
        ? (row.super_admin_approval_comment || row.hr_approval_comment || row.manager_approval_comment || null)
        : null;
      
      // Get approver name from last_updated_by fields
      let approverName: string | null = row.approver_name || null;
      let approverRole: string | null = null;
      
      // Map role from database to display format
      if (row.last_updated_by_role === 'super_admin') {
        approverRole = 'Super Admin';
      } else if (row.last_updated_by_role === 'hr') {
        approverRole = 'HR';
      } else if (row.last_updated_by_role === 'manager') {
        approverRole = 'Manager';
      }

      return {
        id: row.id,
        empId: row.emp_id,
        empName: row.emp_name,
        appliedDate: formatDate(row.applied_date),
        leaveDate,
        startDate: formatDate(row.start_date),
        endDate: formatDate(row.end_date),
        leaveType: row.leave_type,
        noOfDays,
        leaveStatus: displayStatus,
        rejectionReason,
        approverName,
        approverRole,
        lastUpdatedByRole: row.last_updated_by_role || null,
        canEdit,
        canDelete,
        leaveDays: daysResult.rows.map(d => ({
          id: d.id,
          date: formatDate(d.leave_date),
          type: d.day_type,
          status: d.day_status || 'pending'
        }))
      };
    })
  );

  return {
    requests: requestsWithDays,
    pagination: {
      page,
      limit,
      total: parseInt(countResult.rows[0].count)
    }
  };
};

