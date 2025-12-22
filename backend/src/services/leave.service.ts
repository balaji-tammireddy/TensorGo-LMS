import { pool } from '../database/db';
import { calculateLeaveDays } from '../utils/dateCalculator';
import { AuthRequest } from '../middleware/auth.middleware';

export interface LeaveBalance {
  casual: number;
  sick: number;
  lop: number;
}

export const getLeaveBalances = async (userId: number): Promise<LeaveBalance> => {
  const result = await pool.query(
    'SELECT casual_balance, sick_balance, lop_balance FROM leave_balances WHERE employee_id = $1',
    [userId]
  );

  if (result.rows.length === 0) {
    // Initialize balance if not exists
    await pool.query(
      'INSERT INTO leave_balances (employee_id, casual_balance, sick_balance, lop_balance) VALUES ($1, 12, 6, 10)',
      [userId]
    );
    return { casual: 12, sick: 6, lop: 10 };
  }

  const balance = result.rows[0];
  return {
    casual: parseFloat(balance.casual_balance) || 0,
    sick: parseFloat(balance.sick_balance) || 0,
    lop: parseFloat(balance.lop_balance) || 0
  };
};

export const getHolidays = async () => {
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
    const { days, leaveDays } = await calculateLeaveDays(
      startDate,
      endDate,
      leaveData.startType as 'full' | 'half',
      leaveData.endType as 'full' | 'half'
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

    // Get employee's reporting manager
    const userResult = await pool.query(
      'SELECT reporting_manager_id FROM users WHERE id = $1',
      [userId]
    );
    const reportingManagerId = userResult.rows[0]?.reporting_manager_id;

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
        console.warn('Failed to create notification:', notifError.message);
      }
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

  return {
    requests: result.rows.map(row => ({
      id: row.id,
      appliedDate: formatDate(row.applied_date),
      leaveReason: row.leave_reason,
      startDate: formatDate(row.start_date),
      endDate: formatDate(row.end_date),
      noOfDays: parseFloat(row.no_of_days),
      leaveType: row.leave_type,
      currentStatus: row.current_status,
      rejectionReason: row.manager_rejection_comment || row.hr_rejection_comment || row.super_admin_rejection_comment || null,
      canEdit: row.current_status === 'pending',
      canDelete: row.current_status === 'pending'
    })),
    pagination: {
      page,
      limit,
      total: parseInt(countResult.rows[0].count)
    }
  };
};

export const getLeaveRequestById = async (requestId: number, userId: number) => {
  const result = await pool.query(
    `SELECT id, leave_type, start_date, start_type, end_date, end_type, 
            reason, time_for_permission_start, time_for_permission_end,
            current_status, employee_id
     FROM leave_requests
     WHERE id = $1 AND employee_id = $2`,
    [requestId, userId]
  );

  if (result.rows.length === 0) {
    throw new Error('Leave request not found or you do not have permission to access it');
  }

  const row = result.rows[0];
  
  if (row.current_status !== 'pending') {
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
  // Verify the request belongs to the user and is pending
  const checkResult = await pool.query(
    'SELECT current_status, employee_id FROM leave_requests WHERE id = $1',
    [requestId]
  );

  if (checkResult.rows.length === 0) {
    throw new Error('Leave request not found');
  }

  if (checkResult.rows[0].employee_id !== userId) {
    throw new Error('You do not have permission to edit this leave request');
  }

  if (checkResult.rows[0].current_status !== 'pending') {
    throw new Error('Only pending leave requests can be edited');
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

  // Calculate leave days
  const { days, leaveDays } = await calculateLeaveDays(
    startDate,
    endDate,
    leaveData.startType as 'full' | 'half',
    leaveData.endType as 'full' | 'half'
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
    const currentBalance = balance[balanceKey];
    
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
    'SELECT current_status, employee_id FROM leave_requests WHERE id = $1',
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

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

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
           lr.applied_date, lr.start_date, lr.end_date, lr.leave_type,
           lr.no_of_days, lr.reason as leave_reason, lr.current_status,
           u.reporting_manager_id
    FROM leave_requests lr
    JOIN users u ON lr.employee_id = u.id
    WHERE lr.current_status = 'pending'
  `;

  const params: any[] = [];

  // Role-based filtering
  if (approverRole === 'manager') {
    query += ' AND u.reporting_manager_id = $1';
    params.push(approverId);
  } else if (approverRole === 'hr') {
    // HR can see manager leaves or employees whose manager is HR
    query += ` AND (
      u.reporting_manager_id IN (SELECT id FROM users WHERE role = 'manager' OR role = 'hr')
      OR u.reporting_manager_id IS NULL
      OR EXISTS (SELECT 1 FROM users WHERE id = u.reporting_manager_id AND role = 'hr')
    )`;
  } else if (approverRole === 'super_admin') {
    // Super Admin can see all
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

  query += ' ORDER BY lr.applied_date DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
  params.push(limit, offset);

  const result = await pool.query(query, params);

  // Get day-wise breakdown for each request
  const requestsWithDays = await Promise.all(
    result.rows.map(async (row) => {
      const daysResult = await pool.query(
        'SELECT leave_date, day_type FROM leave_days WHERE leave_request_id = $1 ORDER BY leave_date',
        [row.id]
      );

      return {
        id: row.id,
        empId: row.emp_id,
        empName: row.emp_name,
        appliedDate: row.applied_date.toISOString().split('T')[0],
        leaveDate: `${row.start_date.toISOString().split('T')[0]} to ${row.end_date.toISOString().split('T')[0]}`,
        leaveType: row.leave_type,
        noOfDays: parseFloat(row.no_of_days),
        leaveReason: row.leave_reason,
        currentStatus: row.current_status,
        leaveDays: daysResult.rows.map(d => ({
          date: d.leave_date.toISOString().split('T')[0],
          type: d.day_type
        }))
      };
    })
  );

  // Count total
  let countQuery = `
    SELECT COUNT(DISTINCT lr.id)
    FROM leave_requests lr
    JOIN users u ON lr.employee_id = u.id
    WHERE lr.current_status = 'pending'
  `;
  const countParams: any[] = [];

  if (approverRole === 'manager') {
    countQuery += ' AND u.reporting_manager_id = $1';
    countParams.push(approverId);
  } else if (approverRole === 'hr') {
    countQuery += ` AND (
      u.reporting_manager_id IN (SELECT id FROM users WHERE role = 'manager' OR role = 'hr')
      OR u.reporting_manager_id IS NULL
    )`;
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
  // Get leave request details
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

  // Check authorization
  if (approverRole === 'manager') {
    if (leave.reporting_manager_id !== approverId) {
      throw new Error('Not authorized to approve this leave');
    }
  } else if (approverRole === 'hr') {
    // HR can approve if manager is HR or if it's a manager's leave
    const managerResult = await pool.query(
      'SELECT role FROM users WHERE id = $1',
      [leave.reporting_manager_id]
    );
    if (managerResult.rows[0]?.role !== 'hr' && leave.employee_role !== 'manager') {
      throw new Error('Not authorized to approve this leave');
    }
  } else if (approverRole !== 'super_admin') {
    throw new Error('Not authorized to approve leaves');
  }

  // Update approval status based on role
  if (approverRole === 'manager') {
    await pool.query(
      `UPDATE leave_requests 
       SET manager_approval_status = 'approved',
           manager_approval_date = CURRENT_TIMESTAMP,
           manager_approval_comment = $1,
           manager_approved_by = $2
       WHERE id = $3`,
      [comment || null, approverId, leaveRequestId]
    );

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

      // Update leave balance (except for LOP/permission)
      if (leave.leave_type !== 'lop' && leave.leave_type !== 'permission') {
        // Map leave type to balance column name explicitly
        let balanceColumn: string;
        if (leave.leave_type === 'casual') {
          balanceColumn = 'casual_balance';
        } else if (leave.leave_type === 'sick') {
          balanceColumn = 'sick_balance';
        } else {
          balanceColumn = 'lop_balance'; // Should not reach here due to check above
        }
        
        await pool.query(
          `UPDATE leave_balances 
           SET ${balanceColumn} = ${balanceColumn} - $1
           WHERE employee_id = $2`,
          [leave.no_of_days, leave.employee_id]
        );
      }
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

      // Update leave balance (except for LOP/permission)
      if (leave.leave_type !== 'lop' && leave.leave_type !== 'permission') {
        // Map leave type to balance column name explicitly
        let balanceColumn: string;
        if (leave.leave_type === 'casual') {
          balanceColumn = 'casual_balance';
        } else if (leave.leave_type === 'sick') {
          balanceColumn = 'sick_balance';
        } else {
          balanceColumn = 'lop_balance'; // Should not reach here due to check above
        }
        
        await pool.query(
          `UPDATE leave_balances 
           SET ${balanceColumn} = ${balanceColumn} - $1
           WHERE employee_id = $2`,
          [leave.no_of_days, leave.employee_id]
        );
      }
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

    // Update leave balance (except for LOP/permission)
    if (leave.leave_type !== 'lop' && leave.leave_type !== 'permission') {
      const balanceColumn = `${leave.leave_type}_balance`;
      await pool.query(
        `UPDATE leave_balances 
         SET ${balanceColumn} = ${balanceColumn} - $1
         WHERE employee_id = $2`,
        [leave.no_of_days, leave.employee_id]
      );
    }
  }

  // Create notification for employee
  await pool.query(
    `INSERT INTO notifications (user_id, title, message, type)
     VALUES ($1, 'Leave Approved', 'Your leave request has been approved', 'leave_approval')`,
    [leave.employee_id]
  );

  return { message: 'Leave approved successfully' };
};

export const rejectLeave = async (
  leaveRequestId: number,
  approverId: number,
  approverRole: string,
  comment: string
) => {
  // Similar authorization check as approve
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
    await pool.query(
      `UPDATE leave_requests 
       SET manager_approval_status = 'rejected',
           manager_approval_date = CURRENT_TIMESTAMP,
           manager_approval_comment = $1,
           manager_approved_by = $2,
           current_status = 'rejected'
       WHERE id = $3`,
      [comment, approverId, leaveRequestId]
    );
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

  // Create notification for employee
  await pool.query(
    `INSERT INTO notifications (user_id, title, message, type)
     VALUES ($1, 'Leave Rejected', $2, 'leave_rejection')`,
    [leave.employee_id, `Your leave request has been rejected. Reason: ${comment}`]
  );

  return { message: 'Leave rejected successfully' };
};

export const getApprovedLeaves = async (
  page: number = 1,
  limit: number = 10
) => {
  const offset = (page - 1) * limit;
  
  const result = await pool.query(
    `SELECT lr.id, u.emp_id, u.first_name || ' ' || COALESCE(u.last_name, '') as emp_name,
            lr.applied_date, lr.start_date, lr.end_date, lr.leave_type,
            lr.no_of_days, lr.current_status as leave_status
     FROM leave_requests lr
     JOIN users u ON lr.employee_id = u.id
     WHERE lr.current_status = 'approved'
     ORDER BY lr.applied_date DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  const countResult = await pool.query(
    'SELECT COUNT(*) FROM leave_requests WHERE current_status = $1',
    ['approved']
  );

  return {
    requests: result.rows.map(row => ({
      id: row.id,
      empId: row.emp_id,
      empName: row.emp_name,
      appliedDate: row.applied_date.toISOString().split('T')[0],
      leaveDate: `${row.start_date.toISOString().split('T')[0]} to ${row.end_date.toISOString().split('T')[0]}`,
      leaveType: row.leave_type,
      noOfDays: parseFloat(row.no_of_days),
      leaveStatus: row.leave_status
    })),
    pagination: {
      page,
      limit,
      total: parseInt(countResult.rows[0].count)
    }
  };
};

