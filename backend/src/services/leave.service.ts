import { pool } from '../database/db';
import { calculateLeaveDays } from '../utils/dateCalculator';
import { AuthRequest } from '../middleware/auth.middleware';
import { sendEmail } from '../utils/email';
import { generateLeaveApplicationEmail, generateLeaveStatusEmail } from '../utils/emailTemplates';
import { scheduleLeaveStatusEmail, cancelScheduledEmail } from '../utils/delayedEmail';
import { logger } from '../utils/logger';

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
  // Default casual leave balance is 12 for all roles
  const defaultCasual = 12;

  const result = await pool.query(
    'SELECT casual_balance, sick_balance, lop_balance FROM leave_balances WHERE employee_id = $1',
    [userId]
  );

  if (result.rows.length === 0) {
    // Initialize balance if not exists
    await pool.query(
      'INSERT INTO leave_balances (employee_id, casual_balance, sick_balance, lop_balance) VALUES ($1, $2, 6, 10)',
      [userId, defaultCasual]
    );
    return { casual: defaultCasual, sick: 6, lop: 10 };
  }

  const balance = result.rows[0];
  return {
    casual: parseFloat(balance.casual_balance) || 0,
    sick: parseFloat(balance.sick_balance) || 0,
    lop: parseFloat(balance.lop_balance) || 0
  };
};

export const getHolidays = async () => {
  const result = await pool.query(
    'SELECT holiday_date, holiday_name FROM holidays WHERE is_active = true ORDER BY holiday_date'
  );
  return result.rows.map(row => ({
    date: formatDate(row.holiday_date),
    name: row.holiday_name
  }));
};

export const getLeaveRules = async () => {
  const result = await pool.query(
    'SELECT leave_required_min, leave_required_max, prior_information_days FROM leave_rules WHERE is_active = true ORDER BY leave_required_min'
  );
  return result.rows.map(row => ({
    leaveRequired: row.leave_required_max 
      ? `${row.leave_required_min} to ${row.leave_required_max} days`
      : `More Than ${row.leave_required_min} days`,
    priorInformation: `${row.prior_information_days} ${row.prior_information_days === 1 ? 'day' : row.prior_information_days === 30 ? 'Month' : 'days'}`
  }));
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
  }
) => {
  try {
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

    // Validation: Cannot apply for past dates; today is allowed only for sick
    if (leaveData.leaveType === 'sick') {
      if (startDate < today) {
        throw new Error('Cannot apply for past dates.');
      }
    } else {
    if (startDate <= today) {
        throw new Error('Cannot apply for past dates or today.');
      }
    }

    // Validation: casual/LOP need at least 3 days notice (block today + next two days)
    const msPerDay = 1000 * 60 * 60 * 24;
    const daysUntilStart = Math.ceil((startDate.getTime() - today.getTime()) / msPerDay);
    if ((leaveData.leaveType === 'casual' || leaveData.leaveType === 'lop') && daysUntilStart < 3) {
      throw new Error('Casual and LOP leaves must be applied at least 3 days in advance.');
    }

    // Validation: End date must be >= start date
    if (endDate < startDate) {
      throw new Error('End date must be greater than or equal to start date');
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

    // LOP requires zero casual balance
    if (leaveData.leaveType === 'lop') {
      const balance = await getLeaveBalances(userId);
      if ((balance.casual || 0) > 0) {
        throw new Error('LOP can be applied only when casual leave balance is 0');
      }
    } else if (leaveData.leaveType !== 'permission') {
      // Check balance for other leave types (permission skips balance)
      const balance = await getLeaveBalances(userId);
      const balanceKey = `${leaveData.leaveType}_balance` as keyof LeaveBalance;
      if (balance[balanceKey] < days) {
        throw new Error(`Insufficient ${leaveData.leaveType} leave balance`);
      }
    }

    // Get employee's information, reporting manager details, and HR (manager's reporting manager)
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
    const reportingManagerId = userResult.rows[0]?.reporting_manager_id;
    const employeeName = userResult.rows[0]?.employee_name || 'Employee';
    const employeeEmpId = userResult.rows[0]?.employee_emp_id || '';
    const managerEmail = userResult.rows[0]?.manager_email;
    const managerRole = userResult.rows[0]?.manager_role;
    const hrId = userResult.rows[0]?.hr_id;
    const hrEmail = userResult.rows[0]?.hr_email;
    const hrRole = userResult.rows[0]?.hr_role;

    // Format dates as YYYY-MM-DD for database
    const startDateStr = `${startYear}-${String(startMonth).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`;
    const endDateStr = `${endYear}-${String(endMonth).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;

    // Insert leave request
    const leaveRequestResult = await pool.query(
      `INSERT INTO leave_requests (
        employee_id, leave_type, start_date, start_type, end_date, end_type,
        reason, no_of_days, time_for_permission_start, time_for_permission_end
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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
        leaveData.timeForPermission?.end || null
      ]
    );

    const leaveRequestId = leaveRequestResult.rows[0].id;

    // Insert leave days
    for (const leaveDay of leaveDays) {
      // Format leave day date properly
      const leaveDayDate = new Date(leaveDay.date);
      const ldYear = leaveDayDate.getFullYear();
      const ldMonth = String(leaveDayDate.getMonth() + 1).padStart(2, '0');
      const ldDay = String(leaveDayDate.getDate()).padStart(2, '0');
      const leaveDayDateStr = `${ldYear}-${ldMonth}-${ldDay}`;
      
      await pool.query(
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

      await pool.query(
        `UPDATE leave_balances 
         SET ${balanceColumn} = ${balanceColumn} - $1
         WHERE employee_id = $2`,
        [days, userId]
      );
    }

    // Create notification for reporting manager (if notifications table exists)
    if (reportingManagerId) {
      try {
        await pool.query(
          `INSERT INTO notifications (user_id, title, message, type)
           VALUES ($1, 'New Leave Request', 'A leave request requires your approval', 'leave_request')`,
          [reportingManagerId]
        );
      } catch (notifError: any) {
        // Log but don't fail the leave request if notification fails
        logger.warn('Failed to create notification:', notifError.message);
      }
    }

    // Prepare base email data
    const baseEmailData = {
      employeeName,
      employeeEmpId,
      leaveType: leaveData.leaveType,
      startDate: startDateStr,
      endDate: endDateStr,
      reason: leaveData.reason,
      noOfDays: days,
      startType: leaveData.startType,
      endType: leaveData.endType,
      timeForPermission: leaveData.timeForPermission,
    };

    // Send emails based on employee role
    if (employeeRole === 'employee') {
      // Employee applies: send to manager and manager's HR
      
      // Send email notification to reporting manager (skip if manager is super_admin)
      if (reportingManagerId && managerEmail && managerRole !== 'super_admin') {
        try {
          const managerName = userResult.rows[0]?.manager_name;
          const emailData = {
            ...baseEmailData,
            recipientName: managerName || undefined,
          };
          const emailContent = generateLeaveApplicationEmail(emailData);
          
          const emailSent = await sendEmail({
            to: managerEmail,
            subject: emailContent.subject,
            html: emailContent.html,
            text: emailContent.text,
          });

          if (emailSent) {
            logger.info(`Leave application email sent to manager ${managerEmail} for employee ${employeeName}`);
          } else {
            logger.warn(`Failed to send leave application email to manager ${managerEmail}`);
          }
        } catch (emailError: any) {
          logger.error('Failed to send leave application email to manager:', emailError);
        }
      } else if (reportingManagerId && !managerEmail) {
        logger.warn(`Reporting manager ID ${reportingManagerId} exists but has no email address`);
      } else if (reportingManagerId && managerRole === 'super_admin') {
        logger.info(`Skipping email to manager ${managerEmail} - super admin should not receive leave emails`);
      }

      // Send email notification to HR (manager's reporting manager) (skip if HR is super_admin)
      if (hrId && hrEmail && hrRole !== 'super_admin') {
        try {
          const hrName = userResult.rows[0]?.hr_name;
          const emailData = {
            ...baseEmailData,
            recipientName: hrName || undefined,
          };
          const emailContent = generateLeaveApplicationEmail(emailData);
          
          const emailSent = await sendEmail({
            to: hrEmail,
            subject: emailContent.subject,
            html: emailContent.html,
            text: emailContent.text,
          });

          if (emailSent) {
            logger.info(`Leave application email sent to HR ${hrEmail} for employee ${employeeName}`);
          } else {
            logger.warn(`Failed to send leave application email to HR ${hrEmail}`);
          }
        } catch (emailError: any) {
          logger.error('Failed to send leave application email to HR:', emailError);
        }
      } else if (hrId && hrRole === 'super_admin') {
        logger.info(`Skipping email to HR ${hrEmail} - super admin should not receive leave emails`);
      }
    } else if (employeeRole === 'manager') {
      // Manager applies: send to manager's HR only
      if (hrId && hrEmail && hrRole !== 'super_admin') {
        try {
          const hrName = userResult.rows[0]?.hr_name;
          const emailData = {
            ...baseEmailData,
            recipientName: hrName || undefined,
          };
          const emailContent = generateLeaveApplicationEmail(emailData);
          
          const emailSent = await sendEmail({
            to: hrEmail,
            subject: emailContent.subject,
            html: emailContent.html,
            text: emailContent.text,
          });

          if (emailSent) {
            logger.info(`Leave application email sent to HR ${hrEmail} for manager ${employeeName}`);
          } else {
            logger.warn(`Failed to send leave application email to HR ${hrEmail}`);
          }
        } catch (emailError: any) {
          logger.error('Failed to send leave application email to HR:', emailError);
        }
      } else if (hrId && hrRole === 'super_admin') {
        logger.info(`Skipping email to HR ${hrEmail} - super admin should not receive leave emails`);
      } else if (!hrId || !hrEmail) {
        logger.warn(`Manager ${employeeName} has no reporting HR to notify`);
      }
    } else if (employeeRole === 'hr') {
      // HR applies: send to super admin only
      try {
        const superAdminResult = await pool.query(
          `SELECT id, email, first_name || ' ' || COALESCE(last_name, '') as name
           FROM users
           WHERE role = 'super_admin' AND status = 'active'`,
          []
        );

        if (superAdminResult.rows.length === 0) {
          logger.warn(`No active super admin found to notify for HR leave application from ${employeeName}`);
        } else {
          for (const superAdmin of superAdminResult.rows) {
            try {
              const emailData = {
                ...baseEmailData,
                recipientName: superAdmin.name || undefined,
              };
              const emailContent = generateLeaveApplicationEmail(emailData);
              
              const emailSent = await sendEmail({
                to: superAdmin.email,
                subject: emailContent.subject,
                html: emailContent.html,
                text: emailContent.text,
              });

              if (emailSent) {
                logger.info(`Leave application email sent to super admin ${superAdmin.email} for HR ${employeeName}`);
              } else {
                logger.warn(`Failed to send leave application email to super admin ${superAdmin.email}`);
              }
            } catch (emailError: any) {
              logger.error(`Failed to send leave application email to super admin ${superAdmin.email}:`, emailError);
            }
          }
        }
      } catch (error: any) {
        logger.error('Failed to fetch super admin users for HR leave notification:', error);
      }
    } else if (hrId && !hrEmail) {
      logger.warn(`HR ID ${hrId} exists but has no email address`);
    }

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
  status?: string
) => {
  const offset = (page - 1) * limit;
  let query = `
    SELECT id, applied_date, reason as leave_reason, start_date, end_date,
           no_of_days, leave_type, current_status
    FROM leave_requests
    WHERE employee_id = $1
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

    requests.push({
      id: row.id,
      appliedDate: formatDate(row.applied_date),
      leaveReason: row.leave_reason,
      startDate: formatDate(row.start_date),
      endDate: formatDate(row.end_date),
      noOfDays: approvedDays > 0 ? approvedDays : parseFloat(row.no_of_days),
      leaveType: row.leave_type,
      currentStatus: displayStatus,
      rejectionReason: row.manager_rejection_comment || row.hr_rejection_comment || row.super_admin_rejection_comment || null,
      canEdit: row.current_status === 'pending',
      canDelete: row.current_status === 'pending',
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
};

export const getLeaveRequestById = async (requestId: number, userId: number, userRole?: string) => {
  const result = await pool.query(
    userRole === 'super_admin'
      ? `SELECT id, leave_type, start_date, start_type, end_date, end_type, 
                reason, time_for_permission_start, time_for_permission_end,
                current_status, employee_id
         FROM leave_requests
         WHERE id = $1`
      : `SELECT id, leave_type, start_date, start_type, end_date, end_type, 
            reason, time_for_permission_start, time_for_permission_end,
            current_status, employee_id
     FROM leave_requests
     WHERE id = $1 AND employee_id = $2`,
    userRole === 'super_admin' ? [requestId] : [requestId, userId]
  );

  if (result.rows.length === 0) {
    throw new Error('Leave request not found or you do not have permission to access it');
  }

  const row = result.rows[0];
  
  if (row.current_status !== 'pending' && userRole !== 'super_admin') {
    throw new Error('Only pending leave requests can be edited');
  }

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

  return {
    id: row.id,
    leaveType: row.leave_type,
    startDate: formatDate(row.start_date),
    startType: row.start_type,
    endDate: formatDate(row.end_date),
    endType: row.end_type,
    reason: row.reason,
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
  }
) => {
  // Verify the request and authorization
  const checkResult = await pool.query(
    'SELECT current_status, employee_id FROM leave_requests WHERE id = $1',
    [requestId]
  );

  if (checkResult.rows.length === 0) {
    throw new Error('Leave request not found');
  }

  const belongsToUser = checkResult.rows[0].employee_id === userId;
  const isPending = checkResult.rows[0].current_status === 'pending';

  if (!isPending) {
    throw new Error('Only pending leave requests can be edited');
  }
  if (userRole !== 'super_admin' && !belongsToUser) {
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

  // Validation: Cannot apply for past dates; today is allowed only for sick
  if (leaveData.leaveType === 'sick') {
    if (startDate < today) {
      throw new Error('Cannot apply for past dates.');
    }
  } else {
  if (startDate <= today) {
      throw new Error('Cannot apply for past dates or today.');
    }
  }

  // Validation: casual/LOP need at least 3 days notice (block today + next two days)
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysUntilStart = Math.ceil((startDate.getTime() - today.getTime()) / msPerDay);
  if ((leaveData.leaveType === 'casual' || leaveData.leaveType === 'lop') && daysUntilStart < 3) {
    throw new Error('Casual and LOP leaves must be applied at least 3 days in advance.');
  }

  // Validation: End date must be >= start date
  if (endDate < startDate) {
    throw new Error('End date must be greater than or equal to start date');
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

  // LOP requires zero casual balance
    let balance: LeaveBalance | null = null;

    if (leaveData.leaveType === 'lop') {
      balance = await getLeaveBalances(userId);
      if ((balance.casual || 0) > 0) {
        throw new Error('LOP can be applied only when casual leave balance is 0');
      }
  }

    // For all leave types except permission, enforce available balance > 0 and sufficient for requested days
    if (leaveData.leaveType !== 'permission') {
      if (!balance) {
        balance = await getLeaveBalances(userId);
      }
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
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $10`,
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
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const deleteLeaveRequest = async (requestId: number, userId: number) => {
  // Verify the request belongs to the user and is pending
  const checkResult = await pool.query(
    'SELECT current_status, employee_id, leave_type, no_of_days FROM leave_requests WHERE id = $1',
    [requestId]
  );

  if (checkResult.rows.length === 0) {
    throw new Error('Leave request not found');
  }

  if (checkResult.rows[0].employee_id !== userId) {
    throw new Error('You do not have permission to delete this leave request');
  }

  if (checkResult.rows[0].current_status !== 'pending') {
    throw new Error('Only pending leave requests can be deleted');
  }

  const { leave_type, no_of_days } = checkResult.rows[0];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Restore balance on delete (except permission)
    if (leave_type !== 'permission') {
      const balanceColumn =
        leave_type === 'casual'
          ? 'casual_balance'
          : leave_type === 'sick'
          ? 'sick_balance'
          : 'lop_balance';

      await client.query(
        `UPDATE leave_balances 
         SET ${balanceColumn} = ${balanceColumn} + $1
         WHERE employee_id = $2`,
        [no_of_days, userId]
      );
    }

    // Delete leave days first (foreign key constraint)
    await client.query('DELETE FROM leave_days WHERE leave_request_id = $1', [requestId]);

    // Delete leave request
    await client.query('DELETE FROM leave_requests WHERE id = $1', [requestId]);

    await client.query('COMMIT');

    return { message: 'Leave request deleted successfully' };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
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
  const offset = (page - 1) * limit;
  
  // Build query based on role
  let query = `
    SELECT DISTINCT lr.id, u.emp_id, u.first_name || ' ' || COALESCE(u.last_name, '') as emp_name,
           lr.applied_date, lr.start_date, lr.end_date, lr.start_type, lr.end_type,
           lr.leave_type, lr.no_of_days, lr.reason as leave_reason, lr.current_status,
           u.reporting_manager_id
    FROM leave_requests lr
    JOIN users u ON lr.employee_id = u.id
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
  // Get leave request details with employee and approver information
  const leaveResult = await pool.query(
    `SELECT 
      lr.*, 
      u.reporting_manager_id, 
      u.role as employee_role,
      u.email as employee_email,
      u.first_name || ' ' || COALESCE(u.last_name, '') as employee_name,
      approver.first_name || ' ' || COALESCE(approver.last_name, '') as approver_name
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
           manager_approved_by = $2
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
             hr_approved_by = $1
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
           hr_approved_by = $2
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
           current_status = 'approved'
       WHERE id = $3`,
      [comment || null, approverId, leaveRequestId]
    );

  }

  // Recalculate status
  await recalcLeaveRequestStatus(leaveRequestId);

  // Create notification for employee
  await pool.query(
    `INSERT INTO notifications (user_id, title, message, type)
     VALUES ($1, 'Leave Approved', 'Your leave request has been approved', 'leave_approval')`,
    [leave.employee_id]
  );

  // Schedule delayed email (1 minute) to check final status and send appropriate email
  scheduleLeaveStatusEmail(leaveRequestId, 1);

  return { message: 'Leave approved successfully' };
};

export const rejectLeave = async (
  leaveRequestId: number,
  approverId: number,
  approverRole: string,
  comment: string
) => {
  // Similar authorization check as approve - get employee and approver information
  const leaveResult = await pool.query(
    `SELECT 
      lr.*, 
      u.reporting_manager_id, 
      u.role as employee_role,
      u.email as employee_email,
      u.first_name || ' ' || COALESCE(u.last_name, '') as employee_name,
      approver.first_name || ' ' || COALESCE(approver.last_name, '') as approver_name
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

  // Refund only the days rejected in this action (except permission)
  if (leave.leave_type !== 'permission' && refundDays > 0) {
    const balanceColumn =
      leave.leave_type === 'casual'
        ? 'casual_balance'
        : leave.leave_type === 'sick'
        ? 'sick_balance'
        : 'lop_balance';
    await pool.query(
      `UPDATE leave_balances SET ${balanceColumn} = ${balanceColumn} + $1 WHERE employee_id = $2`,
      [refundDays, leave.employee_id]
    );
  }

  // Create notification for employee
  await pool.query(
    `INSERT INTO notifications (user_id, title, message, type)
     VALUES ($1, 'Leave Rejected', $2, 'leave_rejection')`,
    [leave.employee_id, `Your leave request has been rejected. Reason: ${comment}`]
  );

  // Cancel any scheduled approval email since leave is rejected
  cancelScheduledEmail(leaveRequestId);

  // Send rejection email immediately (no delay needed for rejections)
  // Skip email if employee is super_admin
  const employeeEmail = leaveResult.rows[0]?.employee_email;
  const employeeName = leaveResult.rows[0]?.employee_name || 'Employee';
  const employeeRole = leaveResult.rows[0]?.employee_role;
  const approverName = leaveResult.rows[0]?.approver_name || (approverRole === 'manager' ? 'Manager' : approverRole === 'hr' ? 'HR' : 'Super Admin');
  
  if (employeeEmail && employeeRole !== 'super_admin') {
    try {
      // Format dates for display
      const formatDateForEmail = (date: Date | string): string => {
        const d = typeof date === 'string' ? new Date(date) : date;
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };

      const emailData = {
        employeeName,
        employeeEmail,
        leaveType: leave.leave_type,
        startDate: formatDateForEmail(leave.start_date),
        endDate: formatDateForEmail(leave.end_date),
        noOfDays: parseFloat(leave.no_of_days) || 0,
        status: 'rejected' as const,
        approverName,
        approverRole,
        rejectionReason: comment,
      };

      const emailContent = generateLeaveStatusEmail(emailData);
      const emailSent = await sendEmail({
        to: employeeEmail,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
      });

      if (emailSent) {
        logger.info(`Leave rejection email sent to employee ${employeeEmail} for leave request ${leaveRequestId}`);
      } else {
        logger.warn(`Failed to send leave rejection email to employee ${employeeEmail}`);
      }
      } catch (emailError: any) {
        logger.error('Failed to send leave rejection email to employee:', emailError);
      }
  } else if (employeeRole === 'super_admin') {
    logger.info(`Skipping rejection email to employee ${employeeEmail} - super admin should not receive leave emails`);
  }

  await recalcLeaveRequestStatus(leaveRequestId);
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
  const leaveResult = await pool.query(
    `SELECT lr.*, u.reporting_manager_id, u.role as employee_role
     FROM leave_requests lr
     JOIN users u ON lr.employee_id = u.id
     WHERE lr.id = $1`,
    [leaveRequestId]
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
           manager_approved_by = $2
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
           hr_approved_by = $2
       WHERE id = $3`,
      [comment || null, approverId, leaveRequestId]
    );
  } else if (approverRole === 'super_admin') {
    await pool.query(
      `UPDATE leave_requests 
       SET super_admin_approval_status = 'approved',
           super_admin_approval_date = CURRENT_TIMESTAMP,
           super_admin_approval_comment = $1,
           super_admin_approved_by = $2
       WHERE id = $3`,
      [comment || null, approverId, leaveRequestId]
    );
  }

  // Recalculate status only (no balance changes)
  await recalcLeaveRequestStatus(leaveRequestId);
  return { message: 'Leave day approved successfully' };
};

export const rejectLeaveDay = async (
  leaveRequestId: number,
  dayId: number,
  approverId: number,
  approverRole: string,
  comment: string
) => {
  const leaveResult = await pool.query(
    `SELECT lr.*, u.reporting_manager_id, u.role as employee_role
     FROM leave_requests lr
     JOIN users u ON lr.employee_id = u.id
     WHERE lr.id = $1`,
    [leaveRequestId]
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
      await pool.query(
        `UPDATE leave_balances SET ${balanceColumn} = ${balanceColumn} + $1 WHERE employee_id = $2`,
        [refund, leave.employee_id]
      );
    }
  }

  if (approverRole === 'manager') {
    // Additional safeguard: ensure manager can only reject their direct reports
    const updateResult = await pool.query(
      `UPDATE leave_requests 
       SET manager_approval_status = 'rejected',
           manager_approval_date = CURRENT_TIMESTAMP,
           manager_approval_comment = $1,
           manager_approved_by = $2
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
           hr_approved_by = $2
       WHERE id = $3`,
      [comment || null, approverId, leaveRequestId]
    );
  } else if (approverRole === 'super_admin') {
    await pool.query(
      `UPDATE leave_requests 
       SET super_admin_approval_status = 'rejected',
           super_admin_approval_date = CURRENT_TIMESTAMP,
           super_admin_approval_comment = $1,
           super_admin_approved_by = $2
       WHERE id = $3`,
      [comment || null, approverId, leaveRequestId]
    );
  }

  // Refund only the days actually rejected in this action (except permission).
  // Since this is a day-level rejection, a single day's refund has already been applied above.
  // No additional bulk refund needed here.

  await recalcLeaveRequestStatus(leaveRequestId);
  return { message: 'Leave day rejected successfully' };
};

export const getApprovedLeaves = async (
  page: number = 1,
  limit: number = 10
) => {
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
        COALESCE(SUM(CASE WHEN ld.day_status = 'approved' THEN CASE WHEN ld.day_type = 'half' THEN 0.5 ELSE 1 END ELSE 0 END), 0) AS approved_days,
        COALESCE(SUM(CASE WHEN ld.day_status = 'rejected' THEN CASE WHEN ld.day_type = 'half' THEN 0.5 ELSE 1 END ELSE 0 END), 0) AS rejected_days,
        COALESCE(SUM(CASE WHEN ld.day_status = 'pending' THEN CASE WHEN ld.day_type = 'half' THEN 0.5 ELSE 1 END ELSE 0 END), 0) AS pending_days,
        ARRAY_REMOVE(ARRAY_AGG(CASE WHEN ld.day_status = 'approved' THEN ld.leave_date END ORDER BY ld.leave_date), NULL) AS approved_dates,
        ARRAY_REMOVE(ARRAY_AGG(CASE WHEN ld.day_status = 'rejected' THEN ld.leave_date END ORDER BY ld.leave_date), NULL) AS rejected_dates
     FROM leave_requests lr
     JOIN users u ON lr.employee_id = u.id
     LEFT JOIN leave_days ld ON ld.leave_request_id = lr.id
     WHERE lr.current_status != 'pending'
        OR EXISTS (
          SELECT 1 FROM leave_days ld2
          WHERE ld2.leave_request_id = lr.id 
            AND (ld2.day_status = 'approved' OR ld2.day_status = 'rejected')
        )
     GROUP BY lr.id, u.emp_id, u.first_name, u.last_name, lr.applied_date, lr.start_date, lr.end_date, lr.leave_type, lr.no_of_days, lr.current_status
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

  return {
    requests: result.rows.map(row => {
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

      return {
        id: row.id,
        empId: row.emp_id,
        empName: row.emp_name,
        appliedDate: formatDate(row.applied_date),
        leaveDate,
        leaveType: row.leave_type,
        noOfDays,
        leaveStatus: displayStatus
      };
    }),
    pagination: {
      page,
      limit,
      total: parseInt(countResult.rows[0].count)
    }
  };
};

