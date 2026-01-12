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
    let query = 'SELECT id, holiday_date, holiday_name FROM holidays WHERE is_active = true';
    const params: any[] = [];

    // Always include current year and next year
    if (year !== undefined && year !== null && !isNaN(year)) {
      const yearNum = parseInt(String(year), 10);
      const nextYear = yearNum + 1;
      query += ' AND (EXTRACT(YEAR FROM holiday_date) = $1 OR EXTRACT(YEAR FROM holiday_date) = $2)';
      params.push(yearNum, nextYear);
      logger.info(`[LEAVE] [GET HOLIDAYS] Fetching holidays for year: ${yearNum} and next year: ${nextYear}`);
    } else {
      // If no year provided, get current year and next year
      const currentYear = new Date().getFullYear();
      const nextYear = currentYear + 1;
      query += ' AND (EXTRACT(YEAR FROM holiday_date) = $1 OR EXTRACT(YEAR FROM holiday_date) = $2)';
      params.push(currentYear, nextYear);
      logger.info(`[LEAVE] [GET HOLIDAYS] Fetching holidays for current year: ${currentYear} and next year: ${nextYear}`);
    }

    query += ' ORDER BY holiday_date';

    const result = await pool.query(query, params);

    // Log for debugging
    const years = year !== undefined && year !== null && !isNaN(year)
      ? `${year} and ${year + 1}`
      : `${new Date().getFullYear()} and ${new Date().getFullYear() + 1}`;
    logger.info(`[LEAVE] [GET HOLIDAYS] Fetched ${result.rows.length} holidays for years: ${years}`);

    return result.rows.map(row => ({
      id: row.id,
      date: formatDate(row.holiday_date),
      name: row.holiday_name
    }));
  } catch (error: any) {
    logger.error(`[LEAVE] [GET HOLIDAYS] Error fetching holidays:`, error);
    throw new Error(`Failed to fetch holidays: ${error.message || error.toString()}`);
  }
};

export const createHoliday = async (holidayDate: string, holidayName: string) => {
  logger.info(`[LEAVE] [CREATE HOLIDAY] ========== FUNCTION CALLED ==========`);

  try {
    const trimmedName = holidayName.trim();
    // Validate holiday name: only letters and spaces allowed
    if (!/^[a-zA-Z\s]+$/.test(trimmedName)) {
      throw new Error('Holiday name cannot contain numbers or special characters');
    }

    // Prevent past dates
    const selectedDate = new Date(holidayDate + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (selectedDate < today) {
      throw new Error('Holiday Cannot be Added in Past Dates');
    }

    const result = await pool.query(
      `INSERT INTO holidays (holiday_date, holiday_name, is_active)
       VALUES ($1, $2, true)
       RETURNING id, holiday_date, holiday_name, is_active, created_at`,
      [holidayDate, trimmedName]
    );

    logger.info(`[LEAVE] [CREATE HOLIDAY] Holiday created successfully - ID: ${result.rows[0].id}`);

    return {
      id: result.rows[0].id,
      date: formatDate(result.rows[0].holiday_date),
      name: result.rows[0].holiday_name,
      isActive: result.rows[0].is_active,
      createdAt: result.rows[0].created_at
    };
  } catch (error: any) {
    logger.error(`[LEAVE] [CREATE HOLIDAY] Error creating holiday:`, error);
    if (error.code === '23505') { // duplicate key
      throw new Error('A holiday already exists for this date');
    }
    throw new Error(`Failed to create holiday: ${error.message}`);
  }
};

export const deleteHoliday = async (holidayId: number) => {
  logger.info(`[LEAVE] [DELETE HOLIDAY] ========== FUNCTION CALLED ==========`);

  try {
    const result = await pool.query(
      'DELETE FROM holidays WHERE id = $1 RETURNING id, holiday_date, holiday_name',
      [holidayId]
    );

    if (result.rows.length === 0) {
      throw new Error('Holiday not found');
    }

    logger.info(`[LEAVE] [DELETE HOLIDAY] Holiday deleted successfully - ID: ${holidayId}`);

    return {
      id: result.rows[0].id,
      date: formatDate(result.rows[0].holiday_date),
      name: result.rows[0].holiday_name
    };
  } catch (error: any) {
    logger.error(`[LEAVE] [DELETE HOLIDAY] Error deleting holiday:`, error);
    throw error;
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

    return result.rows.map(row => {
      const min = parseFloat(row.leave_required_min);
      const max = row.leave_required_max ? parseFloat(row.leave_required_max) : null;
      const prior = parseFloat(row.prior_information_days);

      logger.info(`[LEAVE] [GET LEAVE RULES] Formatting rule: min=${row.leave_required_min}->${min}, max=${row.leave_required_max}->${max}`);

      return {
        leaveRequired: max !== null
          ? `${min} to ${max} days`
          : `More Than ${min} days`,
        priorInformation: row.prior_information_days === 30 ? '1 Month' : row.prior_information_days === 14 ? '2 weeks' : `${prior} ${prior === 1 ? 'day' : 'days'}`
      };
    });
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

    // Fetch user role and reporting manager info
    const userResult = await pool.query(
      `SELECT u.role as employee_role, u.status,
              COALESCE(rm.id, sa.sa_id) as reporting_manager_id, 
              u.first_name || ' ' || COALESCE(u.last_name, '') as employee_name,
              u.emp_id as employee_emp_id, 
              COALESCE(rm.email, sa.sa_email) as manager_email, 
              COALESCE(u.reporting_manager_name, rm.first_name || ' ' || COALESCE(rm.last_name, ''), sa.sa_full_name) as manager_name,
              COALESCE(rm.role, 'super_admin') as manager_role, 
              rm.reporting_manager_id as hr_id, 
              hr.email as hr_email,
              hr.first_name || ' ' || COALESCE(hr.last_name, '') as hr_name, 
              hr.role as hr_role
      FROM users u
      LEFT JOIN users rm ON u.reporting_manager_id = rm.id
      LEFT JOIN users hr ON rm.reporting_manager_id = hr.id
      LEFT JOIN LATERAL (
        SELECT id as sa_id, email as sa_email, first_name || ' ' || COALESCE(last_name, '') as sa_full_name
        FROM users 
        WHERE role = 'super_admin'
        ORDER BY id ASC
        LIMIT 1
      ) sa ON u.reporting_manager_id IS NULL AND u.role != 'super_admin'
      WHERE u.id = $1`,
      [userId]
    );

    const userData = userResult.rows[0];
    const userRole = userData.employee_role;

    // Validation: Cannot select weekends (Saturday = 6, Sunday = 0)
    // EXCEPTION: LOP leaves can start/end on weekends
    // EXCEPTION: For interns, Saturday is a working day
    if (leaveData.leaveType !== 'lop') {
      const startDayOfWeek = startDate.getDay();
      const endDayOfWeek = endDate.getDay();

      const isWeekendCheck = (day: number) => {
        return day === 0 || (day === 6 && userRole !== 'intern');
      };

      if (isWeekendCheck(startDayOfWeek)) {
        const dayName = startDayOfWeek === 0 ? 'Sunday' : 'Saturday';
        throw new Error(`Cannot select ${dayName} as start date. Please select a working day.`);
      }
      if (isWeekendCheck(endDayOfWeek)) {
        const dayName = endDayOfWeek === 0 ? 'Sunday' : 'Saturday';
        throw new Error(`Cannot select ${dayName} as end date. Please select a working day.`);
      }
    }

    // Validation: Sick leave can be applied for past 3 days (including today) or ONLY tomorrow for future dates
    if (leaveData.leaveType === 'sick') {
      const msPerDay = 1000 * 60 * 60 * 24;
      const daysDifference = Math.floor((startDate.getTime() - today.getTime()) / msPerDay);

      if (daysDifference < -3) {
        throw new Error('Cannot apply sick leave for dates more than 3 days in the past.');
      }
      if (daysDifference > 1) {
        throw new Error('For future dates, sick leave can only be applied for tomorrow (next day). You can apply for past dates (up to 3 days) or tomorrow only.');
      }
    } else if (leaveData.leaveType === 'lop' || leaveData.leaveType === 'permission') {
      if (startDate < today) {
        throw new Error('Cannot apply for past dates.');
      }
    } else {
      if (startDate <= today) {
        throw new Error('Cannot apply for past dates or today.');
      }
    }



    if (endDate < startDate) {
      throw new Error('End date must be greater than or equal to start date');
    }

    // Fetch holidays once
    const holidayYears = startYear === endYear ? [startYear] : [startYear, endYear];
    const holidaysResult = await pool.query(
      `SELECT holiday_date, holiday_name FROM holidays 
       WHERE is_active = true 
       AND EXTRACT(YEAR FROM holiday_date) = ANY($1)
       ORDER BY holiday_date`,
      [holidayYears]
    );

    const holidayDates = new Set<string>();
    const holidayNames = new Map<string, string>();

    holidaysResult.rows.forEach((row: any) => {
      const holidayDate = new Date(row.holiday_date);
      const holidayDateStr = `${holidayDate.getFullYear()}-${String(holidayDate.getMonth() + 1).padStart(2, '0')}-${String(holidayDate.getDate()).padStart(2, '0')}`;
      holidayDates.add(holidayDateStr);
      holidayNames.set(holidayDateStr, row.holiday_name);
    });

    const holidayStartDateStr = `${startYear}-${String(startMonth).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`;
    const holidayEndDateStr = `${endYear}-${String(endMonth).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;

    if (leaveData.leaveType !== 'lop') {
      if (holidayDates.has(holidayStartDateStr)) {
        const holidayName = holidayNames.get(holidayStartDateStr) || 'Holiday';
        throw new Error(`Cannot select ${holidayName} (${holidayStartDateStr}) as start date. Please select a working day.`);
      }
      if (holidayDates.has(holidayEndDateStr)) {
        const holidayName = holidayNames.get(holidayEndDateStr) || 'Holiday';
        throw new Error(`Cannot select ${holidayName} (${holidayEndDateStr}) as end date. Please select a working day.`);
      }
    }

    // Check for existing leaves
    const checkStartDateStr = holidayStartDateStr;
    const checkEndDateStr = holidayEndDateStr;

    const existingLeavesCheck = await pool.query(
      `SELECT ld.leave_date::text as leave_date, ld.day_type, ld.day_status, lr.id as request_id
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

    const normalizedStartType = (leaveData.startType === 'first_half' || leaveData.startType === 'second_half') ? 'half' : leaveData.startType;
    const normalizedEndType = (leaveData.endType === 'first_half' || leaveData.endType === 'second_half') ? 'half' : leaveData.endType;

    // Calculate leave days ONCE
    const { days, leaveDays } = await calculateLeaveDays(
      startDate,
      endDate,
      normalizedStartType as 'full' | 'half',
      normalizedEndType as 'full' | 'half',
      leaveData.leaveType,
      userRole
    );

    // Validation: Prior Notice for Casual Leaves
    if (leaveData.leaveType === 'casual') {
      const msPerDay = 1000 * 60 * 60 * 24;
      const daysUntilStart = Math.ceil((startDate.getTime() - today.getTime()) / msPerDay);

      if (days <= 2) {
        if (daysUntilStart < 3) {
          throw new Error('Casual leaves of 0.5 to 2.0 days must be applied at least 3 days in advance.');
        }
      } else if (days <= 5) {
        if (daysUntilStart < 7) {
          throw new Error('Casual leaves of 3.0 to 5.0 days must be applied at least 7 days in advance.');
        }
      } else {
        if (daysUntilStart < 30) {
          throw new Error('Casual leaves of More Than 5.0 days must be applied at least 1 Month in advance.');
        }
      }
    }

    if (existingLeavesCheck.rows.length > 0) {
      for (const requestedDay of leaveDays) {
        const requestedDateStr = `${requestedDay.date.getFullYear()}-${String(requestedDay.date.getMonth() + 1).padStart(2, '0')}-${String(requestedDay.date.getDate()).padStart(2, '0')}`;

        const existingLeave = existingLeavesCheck.rows.find((row: any) => {
          let existingDateStr: string;
          if (row.leave_date instanceof Date) {
            existingDateStr = `${row.leave_date.getFullYear()}-${String(row.leave_date.getMonth() + 1).padStart(2, '0')}-${String(row.leave_date.getDate()).padStart(2, '0')}`;
          } else if (typeof row.leave_date === 'string') {
            existingDateStr = row.leave_date.split('T')[0];
          } else {
            const d = new Date(row.leave_date);
            existingDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          }
          return existingDateStr === requestedDateStr;
        });

        if (existingLeave) {
          const existingType = existingLeave.day_type;
          const statusText = existingLeave.day_status || 'pending';
          if (existingType === 'full' || requestedDay.type === 'full' || existingType === requestedDay.type) {
            throw new Error(`Leave already exists for ${requestedDateStr} (${statusText}).`);
          }
        }
      }
    }

    // Validation: LOP leaves cannot exceed 5 days per month
    if (leaveData.leaveType === 'lop') {
      const monthCounts = new Map<string, number>();

      // Group requested days by month
      for (const day of leaveDays) {
        const monthKey = `${day.date.getFullYear()}-${String(day.date.getMonth() + 1).padStart(2, '0')}`;
        const dayValue = day.type === 'half' ? 0.5 : 1;
        monthCounts.set(monthKey, (monthCounts.get(monthKey) || 0) + dayValue);
      }

      // Check against database for each month involved
      for (const [monthKey, newCount] of monthCounts.entries()) {
        const [year, month] = monthKey.split('-');

        // Count existing LOP days for this month (excluding rejected ones)
        // We look for any leave_days of type 'lop' in this month
        const existingLopResult = await pool.query(
          `SELECT COALESCE(SUM(CASE WHEN day_type = 'half' THEN 0.5 ELSE 1 END), 0) as total_days
           FROM leave_days ld
           JOIN leave_requests lr ON ld.leave_request_id = lr.id
           WHERE ld.employee_id = $1 
             AND ld.leave_type = 'lop'
             AND EXTRACT(YEAR FROM ld.leave_date) = $2
             AND EXTRACT(MONTH FROM ld.leave_date) = $3
             AND ld.day_status != 'rejected'
             AND lr.current_status != 'rejected'`,
          [userId, parseInt(year), parseInt(month)]
        );

        const existingCount = parseFloat(existingLopResult.rows[0].total_days) || 0;
        const totalLopDays = existingCount + newCount;

        if (totalLopDays > 5) {
          throw new Error(`LOP request exceeds monthly limit of 5 days. You have already used/requested ${existingCount} LOP days in ${monthKey}, and this request adds ${newCount} days.`);
        }
      }
    }

    // Validation: Casual leaves cannot exceed 10 days per month
    if (leaveData.leaveType === 'casual') {
      const monthCounts = new Map<string, number>();

      // Group requested days by month
      for (const day of leaveDays) {
        const monthKey = `${day.date.getFullYear()}-${String(day.date.getMonth() + 1).padStart(2, '0')}`;
        const dayValue = day.type === 'half' ? 0.5 : 1;
        monthCounts.set(monthKey, (monthCounts.get(monthKey) || 0) + dayValue);
      }

      // Check against database for each month involved
      for (const [monthKey, newCount] of monthCounts.entries()) {
        const [year, month] = monthKey.split('-');

        // Count existing Casual days for this month (excluding rejected ones)
        const existingCasualResult = await pool.query(
          `SELECT COALESCE(SUM(CASE WHEN day_type = 'half' THEN 0.5 ELSE 1 END), 0) as total_days
           FROM leave_days ld
           JOIN leave_requests lr ON ld.leave_request_id = lr.id
           WHERE ld.employee_id = $1 
             AND ld.leave_type = 'casual'
             AND EXTRACT(YEAR FROM ld.leave_date) = $2
             AND EXTRACT(MONTH FROM ld.leave_date) = $3
             AND ld.day_status != 'rejected'
             AND lr.current_status != 'rejected'`,
          [userId, parseInt(year), parseInt(month)]
        );

        const existingCount = parseFloat(existingCasualResult.rows[0].total_days) || 0;
        const totalCasualDays = existingCount + newCount;

        if (totalCasualDays > 10) {
          throw new Error(`Casual leave request exceeds monthly limit of 10 days. You have already used/requested ${existingCount} casual days in ${monthKey}, and this request adds ${newCount} days.`);
        }
      }
    }

    if (leaveData.leaveType === 'permission' && (!leaveData.timeForPermission?.start || !leaveData.timeForPermission?.end)) {
      throw new Error('Start and end timings are required for permission requests');
    }

    if (leaveData.leaveType !== 'permission') {
      const balance = await getLeaveBalances(userId);
      const balanceKey = `${leaveData.leaveType}` as keyof LeaveBalance;
      if (balance[balanceKey] < days) {
        throw new Error(`Insufficient ${leaveData.leaveType} leave balance`);
      }
    }

    // We already fetched userData above, skipping re-fetch
    /*
    const userResult = await pool.query(
      ...
    );
    const userData = userResult.rows[0];
    */

    // Check for 'On Notice' status restrictions
    if (userData.status === 'on_notice') {
      if (leaveData.leaveType !== 'lop' && leaveData.leaveType !== 'permission' && leaveData.leaveType !== 'sick') {
        throw new Error('Employees on notice period can only apply for Sick, LOP or Permission.');
      }
    }

    const client = await pool.connect();
    let leaveRequestId: number;

    try {
      await client.query('BEGIN');
      // Store RAW types in DB to preserve UI state (first_half vs second_half)
      // Constraint has been updated to allow these values.
      const leaveRequestResult = await client.query(
        `INSERT INTO leave_requests (employee_id, leave_type, start_date, start_type, end_date, end_type, reason, no_of_days, time_for_permission_start, time_for_permission_end, doctor_note)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
        [userId, leaveData.leaveType, checkStartDateStr, leaveData.startType, checkEndDateStr, leaveData.endType, leaveData.reason, days, leaveData.timeForPermission?.start || null, leaveData.timeForPermission?.end || null, leaveData.doctorNote || null]
      );
      leaveRequestId = leaveRequestResult.rows[0].id;

      for (const leaveDay of leaveDays) {
        const leaveDayDateStr = `${leaveDay.date.getFullYear()}-${String(leaveDay.date.getMonth() + 1).padStart(2, '0')}-${String(leaveDay.date.getDate()).padStart(2, '0')}`;
        await client.query(
          `INSERT INTO leave_days (leave_request_id, leave_date, day_type, leave_type, employee_id) VALUES ($1, $2, $3, $4, $5)`,
          [leaveRequestId, leaveDayDateStr, leaveDay.type, leaveData.leaveType, userId]
        );
      }

      if (leaveData.leaveType !== 'permission') {
        const balanceColumn = leaveData.leaveType === 'casual' ? 'casual_balance' : leaveData.leaveType === 'sick' ? 'sick_balance' : 'lop_balance';
        await client.query(`UPDATE leave_balances SET ${balanceColumn} = ${balanceColumn} - $1 WHERE employee_id = $2`, [days, userId]);
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    // Fire and forget email
    // Fire and forget email - STRICT HIERARCHY
    (async () => {
      try {
        // Fetch valid hierarchy chain (L1, L2, L3)
        // This works for all roles because:
        // - Employee: L1=Manager, L2=HR, L3=SA
        // - Manager:  L1=HR,      L2=SA, L3=null
        // - HR:       L1=SA,      L2=null
        const hierarchyResult = await pool.query(`
          SELECT 
            l1.email as l1_email, l1.first_name as l1_name,
            l2.email as l2_email, l2.first_name as l2_name,
            l3.email as l3_email, l3.first_name as l3_name
          FROM users u
          LEFT JOIN users l1 ON u.reporting_manager_id = l1.id
          LEFT JOIN users l2 ON l1.reporting_manager_id = l2.id
          LEFT JOIN users l3 ON l2.reporting_manager_id = l3.id
          WHERE u.id = $1
        `, [userId]);

        const chain = hierarchyResult.rows[0];
        const isUrgent = startDate.getTime() === today.getTime();
        const appliedDate = new Date().toISOString().split('T')[0];

        const baseEmailData = {
          employeeName: userData.employee_name,
          employeeEmpId: userData.employee_emp_id,
          leaveType: leaveData.leaveType,
          startDate: checkStartDateStr,
          startType: leaveData.startType,
          endDate: checkEndDateStr,
          endType: leaveData.endType,
          noOfDays: days,
          reason: leaveData.reason,
          timeForPermissionStart: leaveData.timeForPermission?.start || null,
          timeForPermissionEnd: leaveData.timeForPermission?.end || null,
          doctorNote: leaveData.doctorNote || null,
          appliedDate
        };

        // Determine recipients
        const toEmail = chain.l1_email;
        const toName = chain.l1_name || 'Reporting Manager';

        // CC list: Reporting HR (L2) only if employee/intern applied
        const ccSet = new Set<string>();
        if (chain.l2_email) ccSet.add(chain.l2_email);

        // Remove 'To' email from CC if somehow duplicated
        if (toEmail) ccSet.delete(toEmail);

        const ccEmails = Array.from(ccSet);

        if (toEmail) {
          const emailData = { ...baseEmailData, managerName: toName };
          if (isUrgent) {
            await sendUrgentLeaveApplicationEmail(toEmail, emailData, ccEmails.length > 0 ? ccEmails : undefined);
          } else {
            await sendLeaveApplicationEmail(toEmail, emailData, ccEmails.length > 0 ? ccEmails : undefined);
          }
        } else {
          logger.warn(`No reporting manager (L1) found for user ${userId}. Email not sent.`);
        }

      } catch (e) {
        logger.error('Async email error in applyLeave:', e);
      }
    })();

    return { leaveRequestId, message: 'Leave request submitted successfully' };
  } catch (error: any) {
    logger.error(`Error in applyLeave for user ${userId}:`, error);
    throw error;
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

    const requestIds = result.rows.map(r => r.id);
    const allLeaveDaysMap = new Map<number, any[]>();

    if (requestIds.length > 0) {
      const allDaysResult = await pool.query(
        'SELECT leave_request_id, leave_date, day_type, day_status FROM leave_days WHERE leave_request_id = ANY($1) ORDER BY leave_date',
        [requestIds]
      );

      allDaysResult.rows.forEach(day => {
        if (!allLeaveDaysMap.has(day.leave_request_id)) {
          allLeaveDaysMap.set(day.leave_request_id, []);
        }
        allLeaveDaysMap.get(day.leave_request_id)?.push(day);
      });
    }

    const requests = [];
    for (const row of result.rows) {
      const days = allLeaveDaysMap.get(row.id) || [];
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

  // STRICT HIERARCHY CHECK (L1/L2/L3)
  let query = '';
  let params: any[] = [];

  if (userRole === 'super_admin' || userRole === 'hr' || userRole === 'manager') {
    query = `
      SELECT lr.id, lr.leave_type, lr.start_date, lr.start_type, lr.end_date, lr.end_type, 
             lr.reason, lr.time_for_permission_start, lr.time_for_permission_end,
             lr.no_of_days, lr.applied_date,
             lr.current_status, lr.employee_id, lr.doctor_note,
             lr.manager_approval_comment, lr.hr_approval_comment, lr.super_admin_approval_comment,
             lr.last_updated_by, lr.last_updated_by_role,
             u.emp_id, u.first_name || ' ' || COALESCE(u.last_name, '') as emp_name,
             u.status AS emp_status, u.role AS emp_role,
             last_updater.first_name || ' ' || COALESCE(last_updater.last_name, '') AS approver_name
      FROM leave_requests lr
      JOIN users u ON u.id = lr.employee_id
      LEFT JOIN users l1 ON u.reporting_manager_id = l1.id
      LEFT JOIN users l2 ON l1.reporting_manager_id = l2.id
      LEFT JOIN users l3 ON l2.reporting_manager_id = l3.id
      LEFT JOIN users last_updater ON last_updater.id = lr.last_updated_by
      WHERE lr.id = $1 
      AND (
           lr.employee_id = $2            -- It's my own request
        OR u.reporting_manager_id = $2    -- I am Direct Manager (L1)
        OR l1.reporting_manager_id = $2   -- I am Manager's Manager (L2/HR)
        OR l2.reporting_manager_id = $2   -- I am HR's Manager (L3/Super Admin)
      )
    `;
    params = [requestId, userId];
  } else {
    // Regular employees can only view their own
    query = `SELECT lr.id, lr.leave_type, lr.start_date, lr.start_type, lr.end_date, lr.end_type, 
            lr.reason, lr.time_for_permission_start, lr.time_for_permission_end,
            lr.no_of_days, lr.applied_date,
            lr.current_status, lr.employee_id, lr.doctor_note,
            lr.manager_approval_comment, lr.hr_approval_comment, lr.super_admin_approval_comment,
            lr.last_updated_by, lr.last_updated_by_role,
            u.emp_id, u.first_name || ' ' || COALESCE(u.last_name, '') as emp_name,
            u.status AS emp_status, u.role AS emp_role,
            last_updater.first_name || ' ' || COALESCE(last_updater.last_name, '') AS approver_name
     FROM leave_requests lr
     JOIN users u ON u.id = lr.employee_id
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

  const row: any = result.rows[0];

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
  // Get leave days for this request
  const daysResult = await pool.query(
    'SELECT id, leave_date, day_type, day_status FROM leave_days WHERE leave_request_id = $1 ORDER BY leave_date',
    [requestId]
  );

  logger.info(`[LEAVE] [GET LEAVE REQUEST BY ID] Found ${daysResult.rows.length} leave days for request ${requestId}`);
  daysResult.rows.forEach(d => {
    logger.info(`[LEAVE] [GET LEAVE REQUEST BY ID] Day ID: ${d.id}, Date: ${d.leave_date}, Status: ${d.day_status}`);
  });

  return {
    id: row.id,
    empId: row.emp_id,
    empName: row.emp_name,
    empStatus: row.emp_status,
    appliedDate: formatDate(row.applied_date),
    noOfDays: parseFloat(row.no_of_days),
    currentStatus: row.current_status,
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
    } : undefined,
    leaveDays: daysResult.rows.map(day => ({
      id: day.id,
      date: formatDate(day.leave_date),
      type: day.day_type,
      status: day.day_status || 'pending'
    }))
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
    'SELECT lr.current_status, lr.employee_id, lr.leave_type, lr.no_of_days, u.role as employee_role FROM leave_requests lr JOIN users u ON lr.employee_id = u.id WHERE lr.id = $1',
    [requestId]
  );

  if (checkResult.rows.length === 0) {
    throw new Error('Leave request not found');
  }

  const belongsToUser = checkResult.rows[0].employee_id === userId;
  const currentStatus = checkResult.rows[0].current_status;
  const oldLeaveType = checkResult.rows[0].leave_type;
  const oldDays = parseFloat(checkResult.rows[0].no_of_days);
  const employeeRole = checkResult.rows[0].employee_role;

  // HR and Super Admin can edit any leave (approved, rejected, etc.)
  // Regular users can only edit pending leaves
  const canEdit = currentStatus === 'pending' || userRole === 'hr' || userRole === 'super_admin';

  if (!canEdit) {
    throw new Error('Only pending leave requests can be edited');
  }

  // STRICT HIERARCHY VALIDATION for Edit
  if (userRole !== 'super_admin' && userRole !== 'hr' && !belongsToUser) {
    // Only SA, HR, and Employee (own) can edit usually. 
    // But strictly, anyone in the chain should be able to edit pending leaves if they have permissions.
    // However, legacy logic suggests mostly employee/admin. 
    // Let's stick to the plan: "Apply the same L1/L2/L3 visibility check to restrict viewing/editing".

    // Actually, for UPDATE, usually only the employee updates their request or an admin/manager fixes it.
    // If userRole is manager/hr/super_admin, we check if they are in the chain.
  }

  // Permissions Check
  if (userRole === 'super_admin') {
    // SA can edit ANY request (except own, but canEdit check handles pending)
  } else if (userRole === 'hr' && !belongsToUser) {
    // HR: L1/L2 + Role Filter
    const permissionCheck = await pool.query(
      `SELECT 1 
       FROM users u
       LEFT JOIN users l1 ON u.reporting_manager_id = l1.id
       WHERE u.id = $1 
       AND (
         u.reporting_manager_id = $2    -- I am Direct Manager (L1)
         OR l1.reporting_manager_id = $2   -- I am Manager's Manager (L2)
       ) 
       AND LOWER(u.role) IN ('intern', 'employee', 'manager')`,
      [checkResult.rows[0].employee_id, userId]
    );
    if (permissionCheck.rows.length === 0) {
      throw new Error('You do not have permission to edit this leave request');
    }
  } else if (userRole === 'manager' && !belongsToUser) {
    const permissionCheck = await pool.query(
      `SELECT 1 FROM users WHERE id = $1 AND reporting_manager_id = $2`,
      [checkResult.rows[0].employee_id, userId]
    );
    if (permissionCheck.rows.length === 0) {
      throw new Error('You do not have permission to edit this leave request');
    }
  } else if (!belongsToUser) {
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
  // EXCEPTION: LOP leaves can start/end on weekends
  if (leaveData.leaveType !== 'lop') {
    const startDayOfWeek = startDate.getDay();
    const endDayOfWeek = endDate.getDay();

    const isWeekendCheck = (day: number) => {
      return day === 0 || (day === 6 && employeeRole !== 'intern');
    };

    if (isWeekendCheck(startDayOfWeek)) {
      const dayName = startDayOfWeek === 0 ? 'Sunday' : 'Saturday';
      throw new Error(`Cannot select ${dayName} as start date. Please select a working day.`);
    }
    if (isWeekendCheck(endDayOfWeek)) {
      const dayName = endDayOfWeek === 0 ? 'Sunday' : 'Saturday';
      throw new Error(`Cannot select ${dayName} as end date. Please select a working day.`);
    }
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
    // LOP/Permission: today is allowed, but not past dates
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

  // Validation: Cannot select holidays (for all leave types including permission)
  const holidayStartYear = startDate.getFullYear();
  const holidayEndYear = endDate.getFullYear();
  let holidaysQuery: string;
  let holidaysParams: number[];

  if (holidayStartYear === holidayEndYear) {
    holidaysQuery = `SELECT holiday_date, holiday_name FROM holidays 
                     WHERE is_active = true 
                     AND EXTRACT(YEAR FROM holiday_date) = $1
                     ORDER BY holiday_date`;
    holidaysParams = [holidayStartYear];
  } else {
    holidaysQuery = `SELECT holiday_date, holiday_name FROM holidays 
                     WHERE is_active = true 
                     AND (EXTRACT(YEAR FROM holiday_date) = $1 OR EXTRACT(YEAR FROM holiday_date) = $2)
                     ORDER BY holiday_date`;
    holidaysParams = [holidayStartYear, holidayEndYear];
  }

  const holidaysResult = await pool.query(holidaysQuery, holidaysParams);
  const holidayDates = new Set<string>();
  const holidayNames = new Map<string, string>();

  holidaysResult.rows.forEach((row: any) => {
    const holidayDate = new Date(row.holiday_date);
    const holidayDateStr = `${holidayDate.getFullYear()}-${String(holidayDate.getMonth() + 1).padStart(2, '0')}-${String(holidayDate.getDate()).padStart(2, '0')}`;
    holidayDates.add(holidayDateStr);
    holidayNames.set(holidayDateStr, row.holiday_name);
  });

  const holidayStartDateStr = `${startYear}-${String(startMonth).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`;
  const holidayEndDateStr = `${endYear}-${String(endMonth).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;

  if (leaveData.leaveType !== 'lop') {
    if (holidayDates.has(holidayStartDateStr)) {
      const holidayName = holidayNames.get(holidayStartDateStr) || 'Holiday';
      throw new Error(`Cannot select ${holidayName} (${holidayStartDateStr}) as start date. Please select a working day.`);
    }
    if (holidayDates.has(holidayEndDateStr)) {
      const holidayName = holidayNames.get(holidayEndDateStr) || 'Holiday';
      throw new Error(`Cannot select ${holidayName} (${holidayEndDateStr}) as end date. Please select a working day.`);
    }
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
      normalizedEndType as 'full' | 'half',
      leaveData.leaveType,
      employeeRole
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
    normalizedEndType as 'full' | 'half',
    leaveData.leaveType,
    employeeRole
  );

  // Require timings for permission
  if (leaveData.leaveType === 'permission' &&
    (!leaveData.timeForPermission?.start || !leaveData.timeForPermission?.end)) {
    throw new Error('Start and end timings are required for permission requests');
  }

  // Validate that permission time is not in the past if start date is today
  if (leaveData.leaveType === 'permission' && leaveData.timeForPermission?.start) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isToday = startDate.getTime() === today.getTime();
    if (isToday) {
      const now = new Date();
      const [startHours, startMinutes] = leaveData.timeForPermission.start.split(':').map(Number);
      if (!isNaN(startHours) && !isNaN(startMinutes)) {
        const permissionStartTime = new Date();
        permissionStartTime.setHours(startHours, startMinutes, 0, 0);

        if (permissionStartTime < now) {
          throw new Error('Cannot apply permission for past times. Please select a future time.');
        }
      }
    }
  }

  // For all leave types except permission, enforce available balance > 0 and sufficient for requested days
  if (leaveData.leaveType !== 'permission') {
    const balances = await getLeaveBalances(userId);
    let requestedDays = days; // Default to calculated days
    let availableBalance = 0;

    // Fetch the original request to handle "balance refund" logic during edit
    const originalRequestResult = await pool.query(
      'SELECT leave_type, no_of_days FROM leave_requests WHERE id = $1',
      [requestId]
    );
    const originalRequest = originalRequestResult.rows[0];

    // Determine the relevant balance
    // Determine the relevant balance
    if (leaveData.leaveType === 'casual') availableBalance = Number(balances.casual);
    else if (leaveData.leaveType === 'sick') availableBalance = Number(balances.sick);
    else if (leaveData.leaveType === 'lop') availableBalance = Number(balances.lop);

    // If we are updating the SAME leave type, valid available balance = current + old days
    // (Because the old days will be refunded when this update succeeds)
    if (originalRequest && originalRequest.leave_type === leaveData.leaveType) {
      availableBalance += Number(originalRequest.no_of_days);
    }

    if (leaveData.leaveType !== 'lop' && availableBalance < requestedDays) {
      // Special check: if balance is 0 but we have enough "effective" balance, it should pass.
      // But we already added it to availableBalance above.

      // Formatting for error message
      const balanceName = leaveData.leaveType.charAt(0).toUpperCase() + leaveData.leaveType.slice(1);
      if (availableBalance <= 0) {
        throw new Error(`${balanceName} leave balance is zero. You cannot apply ${leaveData.leaveType} leave.`);
      }
      throw new Error(`Insufficient ${leaveData.leaveType} leave balance. Available: ${originalRequest && originalRequest.leave_type === leaveData.leaveType ? (availableBalance - Number(originalRequest.no_of_days)) : availableBalance}, Requested: ${requestedDays}.`);
    }
  }

  // Start transaction
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Delete old leave days
    await client.query('DELETE FROM leave_days WHERE leave_request_id = $1', [requestId]);

    // Update balances: Refund old days and Deduct new days
    // 1. Refund old balance (if not permission AND not rejected)
    // If status is rejected, the balance was already refunded (or never deducted), so don't refund again
    if (oldLeaveType !== 'permission' && currentStatus !== 'rejected') {
      const oldBalanceColumn = oldLeaveType === 'casual' ? 'casual_balance' : oldLeaveType === 'sick' ? 'sick_balance' : 'lop_balance';
      await client.query(`UPDATE leave_balances SET ${oldBalanceColumn} = ${oldBalanceColumn} + $1 WHERE employee_id = $2`, [oldDays, userId]);
    }

    // 2. Deduct new balance (if not permission)
    if (leaveData.leaveType !== 'permission') {
      const newBalanceColumn = leaveData.leaveType === 'casual' ? 'casual_balance' : leaveData.leaveType === 'sick' ? 'sick_balance' : 'lop_balance';
      await client.query(`UPDATE leave_balances SET ${newBalanceColumn} = ${newBalanceColumn} - $1 WHERE employee_id = $2`, [days, userId]);
    }

    // Format dates as YYYY-MM-DD for database
    const startDateStr = `${startYear}-${String(startMonth).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`;
    const endDateStr = `${endYear}-${String(endMonth).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;

    // Update leave request
    // We pass the RAW start/end type to the database for the request record (to preserve 1st/2nd half info)
    // But we pass NORMALIZED types to calculateLeaveDays (as it expects 'full' or 'half')

    await client.query(
      `UPDATE leave_requests 
       SET leave_type = $1, start_date = $2, start_type = $3, end_date = $4, end_type = $5, 
           reason = $6, no_of_days = $7, time_for_permission_start = $8, time_for_permission_end = $9,
           doctor_note = $10, updated_at = CURRENT_TIMESTAMP,
           current_status = 'pending',
           manager_approval_status = 'pending', hr_approval_status = 'pending', super_admin_approval_status = 'pending'
       WHERE id = $11`,
      [
        leaveData.leaveType,
        startDateStr,
        leaveData.startType, // Pass RAW type to DB
        endDateStr,
        leaveData.endType,   // Pass RAW type to DB
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
      u.role as employee_role,
      u.reporting_manager_id,
      approver.first_name || ' ' || COALESCE(approver.last_name, '') as converter_name,
      approver.emp_id as converter_emp_id,
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

  // Restrict conversion to pending requests only
  if (leave.current_status !== 'pending') {
    throw new Error('Cannot convert leave type: Request is already approved or rejected');
  }

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
  /* REMOVED: Old hardcoded noOfDays logic
  const noOfDays = parseFloat(leave.no_of_days) || 0;
  if (noOfDays <= 0) { throw new Error('Invalid number of days in leave request'); }
  */

  // Recalculate days based on 'casual' rules (excludes weekends/holidays)
  // This handles the edge case where LOP included weekends/holidays but Casual should not.
  const normalizedStartType = (leave.start_type === 'first_half' || leave.start_type === 'second_half') ? 'half' : leave.start_type;
  const normalizedEndType = (leave.end_type === 'first_half' || leave.end_type === 'second_half') ? 'half' : leave.end_type;

  const { days: newNoOfDays, leaveDays: newLeaveDaysList } = await calculateLeaveDays(
    new Date(leave.start_date),
    new Date(leave.end_date),
    normalizedStartType as 'full' | 'half',
    normalizedEndType as 'full' | 'half',
    'casual',
    leave.employee_role
  );

  const originalLopDays = parseFloat(leave.no_of_days) || 0;

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
  // Refund ORIGINAL LOP days, Deduct NEW calculated casual days
  let newLopBalance = currentLop + originalLopDays; // Refund what was originally taken
  const newCasualBalance = currentCasual - newNoOfDays; // Deduct what is valid for casual

  // Check if casual balance would go negative
  if (newCasualBalance < 0) {
    throw new Error(`Insufficient casual balance. Available: ${currentCasual}, Required: ${newNoOfDays}`);
  }

  // Check if casual balance would exceed 99 days
  if (newCasualBalance > 99) {
    throw new Error(`Cannot convert. Casual balance would exceed 99 days. Current: ${currentCasual}, After conversion: ${newCasualBalance}`);
  }

  // Ensure LOP balance never exceeds 10
  if (newLopBalance > 10) {
    logger.warn(
      `LOP balance would exceed 10 after conversion. Current: ${currentLop}, Refunding: ${originalLopDays}, Would be: ${newLopBalance}. Capping at 10.`
    );
    newLopBalance = 10;
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Update leave_type AND no_of_days (since casual excludes weekends)
    await client.query(
      `UPDATE leave_requests 
       SET leave_type = 'casual',
           no_of_days = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [newNoOfDays, requestId]
    );

    // Delete OLD leave days (which may include weekends/holidays)
    await client.query('DELETE FROM leave_days WHERE leave_request_id = $1', [requestId]);

    // Insert NEW leave days (only valid casual days)
    for (const day of newLeaveDaysList) {
      const leaveDayDate = new Date(day.date);
      const ldYear = leaveDayDate.getFullYear();
      const ldMonth = String(leaveDayDate.getMonth() + 1).padStart(2, '0');
      const ldDay = String(leaveDayDate.getDate()).padStart(2, '0');
      const leaveDayDateStr = `${ldYear}-${ldMonth}-${ldDay}`;

      await client.query(
        'INSERT INTO leave_days (leave_request_id, leave_date, day_type, leave_type, employee_id) VALUES ($1, $2, $3, $4, $5)',
        [requestId, leaveDayDateStr, day.type, 'casual', employeeId]
      );
    }

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

    // Recalculate status just in case (to ensure current_status mirrors the new days)
    try {
      await recalcLeaveRequestStatus(requestId);
    } catch (recalcError) {
      logger.error(`Failed to recalculate status after conversion for request ${requestId}:`, recalcError);
    }

    logger.info(
      `Leave request ${requestId} converted from LOP to Casual by ${userRole} (user ${userId}). ` +
      `Employee: ${leave.employee_name}. ` +
      `Days: ${originalLopDays} (LOP) -> ${newNoOfDays} (Casual). ` +
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
      noOfDays: newNoOfDays,
      reason: leave.reason || '',
      converterName: leave.converter_name || 'Converter',
      converterEmpId: leave.converter_emp_id || '',
      converterRole: userRole,
      previousLopBalance: currentLop,
      newLopBalance: newLopBalance,
      previousCasualBalance: currentCasual,
      newCasualBalance: newCasualBalance,
      conversionDate: new Date().toISOString()
    };

    // Send email notifications based on converter role - ONE EMAIL with TO/CC
    logger.info(`[EMAIL] Converter role: ${userRole}, Employee email: ${leave.employee_email || 'NO EMAIL'}, HR email: ${leave.hr_email || 'NO EMAIL'}`);

    if (leave.employee_email) {
      try {
        // No CC for LOP to Casual conversion (Item 5: send mail only to the employee)
        const ccEmails: string[] = [];
        logger.info(`[EMAIL] sending LOP to Casual conversion email to employee (TO) only`);

        const emailResult = await sendLopToCasualConversionEmail(leave.employee_email, {
          ...emailData,
          recipientName: leave.employee_name || 'Employee',
          recipientRole: 'employee' as const
        }, ccEmails.length > 0 ? ccEmails : undefined);

        logger.info(`[EMAIL] ✅ Conversion email sent to employee: ${leave.employee_email}${ccEmails.length > 0 ? ` with CC: ${ccEmails.join(', ')}` : ''}, Result: ${emailResult}`);
      } catch (err: any) {
        logger.error(`[EMAIL] ❌ Error sending conversion email:`, err);
        logger.error(`[EMAIL] ❌ Error details:`, err.message, err.stack);
      }
    } else {
      logger.warn(`[EMAIL] ⚠️ No employee email found, cannot send conversion email`);
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
      let daysToRefund = parseFloat(no_of_days || '0');

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

  // Normalize role to lowercase for consistent checking
  const normalizedRole = approverRole?.toLowerCase().trim();
  logger.info(`[LEAVE] [GET PENDING] Normalized Role: '${normalizedRole}' (Original: '${approverRole}')`);

  // Build query based on role
  // Removed DISTINCT as lr.id is primary key and joins are 1:1, improving query execution time
  let query = `
    SELECT lr.id, lr.employee_id, u.emp_id, u.first_name || ' ' || COALESCE(u.last_name, '') as emp_name, u.status as emp_status, u.role as emp_role,
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
    LEFT JOIN users l1 ON u.reporting_manager_id = l1.id
    WHERE 1=1
  `;

  const params: any[] = [];

  // SUPER ADMIN: Global Visibility (All leaves except own)
  if (normalizedRole === 'super_admin') {
    query += ` AND lr.employee_id != $1`;
    params.push(approverId);
  }
  // HR: Strict Hierarchy (L1/L2) + Role Exclusion (No HRs/SAs)
  else if (normalizedRole === 'hr') {
    query += ` AND lr.employee_id != $1 AND (
       u.reporting_manager_id = $1    -- I am Direct Manager (L1)
       OR l1.reporting_manager_id = $1   -- I am Manager's Manager (L2)
     ) AND LOWER(u.role) IN ('intern', 'employee', 'manager')`;
    params.push(approverId);
  }
  // MANAGER: Strict Hierarchy (L1 only)
  else if (normalizedRole === 'manager') {
    query += ` AND u.reporting_manager_id = $1 AND lr.employee_id != $1`;
    params.push(approverId);
  } else {
    // Should not happen for approvers, but safety net
    return { requests: [], pagination: { page, limit, total: 0 } };
  }

  if (search) {
    // Check for special characters and emojis (allow only alphanumeric and spaces)
    const isValid = /^[a-zA-Z0-9\s]*$/.test(search);
    if (!isValid) {
      logger.warn(`[LEAVE] [GET PENDING] Invalid search term detected: ${search}`);
      throw new Error('Search term contains invalid characters. Emojis and special characters are not allowed.');
    }

    // ILIKE with leading wildcards can be slow, but the new indexes on names will help with non-leading searches
    query += ` AND (u.emp_id ILIKE $${params.length + 1} OR u.first_name ILIKE $${params.length + 1} OR u.last_name ILIKE $${params.length + 1})`;
    params.push(`%${search}%`);
  }

  if (filter) {
    query += ` AND lr.leave_type = $${params.length + 1}`;
    params.push(filter);
  }

  // Include requests that are pending or partially approved, or have any pending day
  // Optimized the condition for better performance
  query += ` AND (
      lr.current_status IN ('pending', 'partially_approved')
      OR EXISTS (
        SELECT 1 FROM leave_days ld
        WHERE ld.leave_request_id = lr.id
          AND (ld.day_status = 'pending' OR ld.day_status IS NULL)
      )
    )`;

  query += ' ORDER BY lr.applied_date DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
  params.push(limit, offset);

  const result = await pool.query(query, params);

  // Log the effective query for debugging (safely)
  logger.info(`[LEAVE] [GET PENDING] Query executed for ${normalizedRole}. Params count: ${params.length}. Rows found: ${result.rows.length}`);
  if (result.rows.length > 0) {
    // Log first row names to check visibility
    logger.info(`[LEAVE] [GET PENDING] First row visible: ${result.rows[0].emp_name} (${result.rows[0].emp_role})`);
  }

  // Additional safeguard: Filter out any requests that don't belong to manager's direct reports
  // Also filter out approver's own requests to prevent self-approval
  // This ensures data integrity even if query construction has issues
  // Use Number() to handle type coercion (PostgreSQL may return strings)
  const filteredRows = normalizedRole === 'manager'
    ? result.rows.filter(row => Number(row.reporting_manager_id) === Number(approverId))
    : result.rows.filter(row => {
      // For HR and Super Admin, exclude their own requests (no self-approval)
      if (approverRole === 'hr' || approverRole === 'super_admin') {
        return Number(row.employee_id) !== Number(approverId);
      }
      return true;
    });

  // Batch fetch leave days for all request IDs to avoid N+1 query problem
  const requestIds = filteredRows.map(r => r.id);
  const daysMap = new Map<number, any[]>();

  if (requestIds.length > 0) {
    const daysResult = await pool.query(
      'SELECT id, leave_request_id, leave_date, day_type, day_status FROM leave_days WHERE leave_request_id = ANY($1) ORDER BY leave_date',
      [requestIds]
    );

    daysResult.rows.forEach(day => {
      if (!daysMap.has(day.leave_request_id)) {
        daysMap.set(day.leave_request_id, []);
      }
      daysMap.get(day.leave_request_id)?.push(day);
    });
  }

  // Get day-wise breakdown for each request
  const requestsWithDays = filteredRows.map((row) => {
    try {
      const days = daysMap.get(row.id) || [];
      const empRole = row.emp_role; // Add empRole to the mapped object

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
        empStatus: row.emp_status,
        empRole: row.emp_role,
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
        leaveDays: days.map(d => ({
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
  });

  // Count total
  let countQuery = `
    SELECT COUNT(DISTINCT lr.id)
    FROM leave_requests lr
    JOIN users u ON lr.employee_id = u.id
    LEFT JOIN users l1 ON u.reporting_manager_id = l1.id
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

  // SUPER ADMIN: Global Visibility
  if (normalizedRole === 'super_admin') {
    countQuery += ` AND lr.employee_id != $1`;
    countParams.push(approverId);
  }
  // HR: Strict Hierarchy + Role Exclusion
  else if (normalizedRole === 'hr') {
    countQuery += ` AND lr.employee_id != $1 AND (
       u.reporting_manager_id = $1    -- I am Direct Manager (L1)
       OR l1.reporting_manager_id = $1   -- I am Manager's Manager (L2)
     ) AND LOWER(u.role) IN ('intern', 'employee', 'manager')`;
    countParams.push(approverId);
  }
  // MANAGER: Direct Reports
  else if (normalizedRole === 'manager') {
    countQuery += ` AND u.reporting_manager_id = $1 AND lr.employee_id != $1`;
    countParams.push(approverId);
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
      approver.emp_id as approver_emp_id,
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

  // Check authorization - STRICT HIERARCHY
  // Use Number() for consistent type comparison (PostgreSQL may return integers as strings in some cases)
  const employeeId = Number(leave.employee_id);
  const approverIdNum = Number(approverId);

  // Prevent self-approval
  if (employeeId === approverIdNum) {
    throw new Error('Cannot approve your own leave request');
  }

  // Check authorization
  // Super Admin: Global
  if (approverRole === 'super_admin') {
    // Allowed
  }
  // HR: Strict L1/L2 + Role Filter
  else if (approverRole === 'hr') {
    const permissionCheck = await pool.query(
      `SELECT 1 
       FROM users u
       LEFT JOIN users l1 ON u.reporting_manager_id = l1.id
       WHERE u.id = $1 
       AND (
         u.reporting_manager_id = $2    -- I am Direct Manager (L1)
         OR l1.reporting_manager_id = $2   -- I am Manager's Manager (L2)
       ) 
       AND LOWER(u.role) IN ('intern', 'employee', 'manager')`,
      [leave.employee_id, approverId]
    );
    if (permissionCheck.rows.length === 0) {
      throw new Error('Not authorized to approve this leave');
    }
  }
  // Manager: L1
  else if (approverRole === 'manager') {
    if (Number(leave.reporting_manager_id) !== approverIdNum) {
      throw new Error('Not authorized to approve this leave');
    }
  } else {
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

  // Send email notifications based on approver role - ONE EMAIL with TO/CC
  if (leave.employee_email) {
    try {
      // Build CC list based on approver role
      const ccEmails: string[] = [];

      if (approverRole === 'hr') {
        // HR approves → Employee (TO), Manager (CC)
        if (leave.manager_email && leave.manager_email !== leave.employee_email) {
          ccEmails.push(leave.manager_email);
        }
        logger.info(`[EMAIL] HR approval - sending email to employee (TO) with manager (CC)`);
      } else if (approverRole === 'super_admin') {
        // Super Admin approves → Employee (TO), Manager and HR (CC)
        if (leave.manager_email && leave.manager_email !== leave.employee_email) {
          ccEmails.push(leave.manager_email);
        }
        if (leave.hr_email && leave.hr_email !== leave.employee_email && leave.hr_email !== leave.manager_email) {
          ccEmails.push(leave.hr_email);
        }
        logger.info(`[EMAIL] Super Admin approval - sending email to employee (TO) with manager and HR (CC)`);
      } else {
        // Manager approves → Employee (TO) only
        logger.info(`[EMAIL] Manager approval - sending email to employee (TO)`);
      }

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
        approverEmpId: leave.approver_emp_id || '',
        approverRole: approverRole,
        comment: comment || null,
        status: 'approved' as const
      }, ccEmails.length > 0 ? ccEmails : undefined);

      logger.info(`[EMAIL] ✅ Approval email sent to employee: ${leave.employee_email}${ccEmails.length > 0 ? ` with CC: ${ccEmails.join(', ')}` : ''}`);
    } catch (err: any) {
      logger.error(`[EMAIL] ❌ Error sending approval email:`, err);
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
      approver.emp_id as approver_emp_id,
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

  // Check authorization (same as approve) - STRICT HIERARCHY
  // CRITICAL: Prevent self-rejection for HR and super_admin
  // Use Number() for consistent type comparison (PostgreSQL may return integers as strings in some cases)
  const employeeId = Number(leave.employee_id);
  const approverIdNum = Number(approverId);

  if (employeeId === approverIdNum) {
    throw new Error('Cannot reject your own leave request');
  }

  // Check authorization
  // Super Admin: Global
  if (approverRole === 'super_admin') {
    // Allowed
  }
  // HR: Strict L1/L2 + Role Filter
  else if (approverRole === 'hr') {
    const permissionCheck = await pool.query(
      `SELECT 1 
       FROM users u
       LEFT JOIN users l1 ON u.reporting_manager_id = l1.id
       WHERE u.id = $1 
       AND (
         u.reporting_manager_id = $2    -- I am Direct Manager (L1)
         OR l1.reporting_manager_id = $2   -- I am Manager's Manager (L2)
       ) 
       AND LOWER(u.role) IN ('intern', 'employee', 'manager')`,
      [leave.employee_id, approverId]
    );
    if (permissionCheck.rows.length === 0) {
      throw new Error('Not authorized to reject this leave');
    }
  }
  // Manager: L1
  else if (approverRole === 'manager') {
    if (Number(leave.reporting_manager_id) !== approverIdNum) {
      throw new Error('Not authorized to reject this leave');
    }
  } else {
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
  } catch (recalcError: any) {
    logger.error(`[EMAIL] Error recalculating status for leave request ${leaveRequestId}:`, recalcError);
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

  // Send email notifications based on approver role - ONE EMAIL with TO/CC
  if (leave.employee_email) {
    try {
      // Build CC list based on approver role
      const ccEmails: string[] = [];

      if (approverRole === 'hr') {
        // HR rejects → Employee (TO), Manager (CC)
        if (leave.manager_email && leave.manager_email !== leave.employee_email) {
          ccEmails.push(leave.manager_email);
        }
        logger.info(`[EMAIL] HR rejection - sending email to employee (TO) with manager (CC)`);
      } else if (approverRole === 'super_admin') {
        // Super Admin rejects → Employee (TO), Manager and HR (CC)
        if (leave.manager_email && leave.manager_email !== leave.employee_email) {
          ccEmails.push(leave.manager_email);
        }
        if (leave.hr_email && leave.hr_email !== leave.employee_email && leave.hr_email !== leave.manager_email) {
          ccEmails.push(leave.hr_email);
        }
        logger.info(`[EMAIL] Super Admin rejection - sending email to employee (TO) with manager and HR (CC)`);
      } else {
        // Manager rejects → Employee (TO) only
        logger.info(`[EMAIL] Manager rejection - sending email to employee (TO)`);
      }

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
        approverEmpId: leave.approver_emp_id || '',
        approverRole: approverRole,
        comment: comment || null,
        status: 'rejected' as const
      }, ccEmails.length > 0 ? ccEmails : undefined);

      logger.info(`[EMAIL] ✅ Rejection email sent to employee: ${leave.employee_email}${ccEmails.length > 0 ? ` with CC: ${ccEmails.join(', ')}` : ''}`);
    } catch (err: any) {
      logger.error(`[EMAIL] ❌ Error sending rejection email:`, err);
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
      approver.emp_id as approver_emp_id,
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
  // CRITICAL: Prevent self-approval for HR and super_admin
  // Use Number() for consistent type comparison (PostgreSQL may return integers as strings in some cases)
  const employeeId = Number(leave.employee_id);
  const approverIdNum = Number(approverId);

  if (approverRole === 'manager') {
    if (Number(leave.reporting_manager_id) !== approverIdNum) {
      throw new Error('Not authorized to approve this leave');
    }
  } else if (approverRole === 'hr') {
    // HR cannot approve their own leave requests
    if (employeeId === approverIdNum) {
      throw new Error('Cannot approve your own leave request');
    }
    if (leave.employee_role !== 'employee' && leave.employee_role !== 'manager' && leave.employee_role !== 'intern') {
      throw new Error('Not authorized to approve this leave');
    }
  } else if (approverRole === 'super_admin') {
    // Super Admin cannot approve their own leave requests
    if (employeeId === approverIdNum) {
      throw new Error('Cannot approve your own leave request');
    }
  } else {
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

  // Send email notifications based on approver role - ONE EMAIL with TO/CC
  if (leave.employee_email) {
    try {
      // Build CC list based on approver role
      const ccEmails: string[] = [];

      if (approverRole === 'hr') {
        // HR approves → Employee (TO), Manager (CC)
        if (leave.manager_email && leave.manager_email !== leave.employee_email) {
          ccEmails.push(leave.manager_email);
        }
        logger.info(`[EMAIL] HR day approval - sending email to employee (TO) with manager (CC)`);
      } else if (approverRole === 'super_admin') {
        // Super Admin approves → Employee (TO), Manager and HR (CC)
        if (leave.manager_email && leave.manager_email !== leave.employee_email) {
          ccEmails.push(leave.manager_email);
        }
        if (leave.hr_email && leave.hr_email !== leave.employee_email && leave.hr_email !== leave.manager_email) {
          ccEmails.push(leave.hr_email);
        }
        logger.info(`[EMAIL] Super Admin day approval - sending email to employee (TO) with manager and HR (CC)`);
      } else {
        // Manager approves → Employee (TO) only
        logger.info(`[EMAIL] Manager day approval - sending email to employee (TO)`);
      }

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
        approverEmpId: leave.approver_emp_id || '',
        approverRole: approverRole,
        comment: comment || null,
        status: 'approved' as const
      }, ccEmails.length > 0 ? ccEmails : undefined);

      logger.info(`[EMAIL] ✅ Day approval email sent to employee: ${leave.employee_email}${ccEmails.length > 0 ? ` with CC: ${ccEmails.join(', ')}` : ''}`);
    } catch (err: any) {
      logger.error(`[EMAIL] ❌ Error sending day approval email:`, err);
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
      approver.emp_id as approver_emp_id,
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
  // CRITICAL: Prevent self-approval for HR and super_admin
  // Use Number() for consistent type comparison (PostgreSQL may return integers as strings in some cases)
  const employeeId = Number(leave.employee_id);
  const approverIdNum = Number(approverId);

  if (approverRole === 'manager') {
    if (Number(leave.reporting_manager_id) !== approverIdNum) {
      throw new Error('Not authorized to approve this leave');
    }
  } else if (approverRole === 'hr') {
    // HR cannot approve their own leave requests
    if (employeeId === approverIdNum) {
      throw new Error('Cannot approve your own leave request');
    }
    if (leave.employee_role !== 'employee' && leave.employee_role !== 'manager' && leave.employee_role !== 'intern') {
      throw new Error('Not authorized to approve this leave');
    }
  } else if (approverRole === 'super_admin') {
    // Super Admin cannot approve their own leave requests
    if (employeeId === approverIdNum) {
      throw new Error('Cannot approve your own leave request');
    }
  } else {
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
  logger.info(`[APPROVE LEAVE DAYS] All Pending Day IDs in DB for request ${leaveRequestId}: ${allPendingDayIds.join(', ')}`);
  logger.info(`[APPROVE LEAVE DAYS] Day IDs received from frontend: ${dayIds.join(', ')}`);

  const daysToApprove = dayIds.filter(id => allPendingDayIds.includes(id));
  logger.info(`[APPROVE LEAVE DAYS] Intersection (daysToApprove): ${daysToApprove.join(', ')}`);

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

  // Auto-reject remaining pending days AND Refund Balance
  if (daysToReject.length > 0) {
    await pool.query(
      `UPDATE leave_days
       SET day_status = 'rejected'
       WHERE id = ANY($1::int[])
       AND leave_request_id = $2
       AND (day_status IS NULL OR day_status = 'pending')`,
      [daysToReject, leaveRequestId]
    );

    // Refund balance for these auto-rejected days (except permission)
    if (leave.leave_type !== 'permission') {
      // Fetch details of rejected days to calculate exact refund amount
      const rejectedDaysDetails = await pool.query(
        'SELECT day_type FROM leave_days WHERE id = ANY($1::int[])',
        [daysToReject]
      );

      const refundAmount = rejectedDaysDetails.rows.reduce(
        (acc, row) => acc + (row.day_type === 'half' ? 0.5 : 1),
        0
      );

      if (refundAmount > 0) {
        const balanceColumn =
          leave.leave_type === 'casual'
            ? 'casual_balance'
            : leave.leave_type === 'sick'
              ? 'sick_balance'
              : 'lop_balance';

        if (leave.leave_type === 'lop') {
          const currentBalanceResult = await pool.query(
            'SELECT lop_balance FROM leave_balances WHERE employee_id = $1',
            [leave.employee_id]
          );
          const currentLop = parseFloat(currentBalanceResult.rows[0]?.lop_balance || '0') || 0;
          let newLopBalance = currentLop + refundAmount;

          if (newLopBalance > 10) {
            const cappedRefund = 10 - currentLop;
            if (cappedRefund > 0) {
              await pool.query(
                `UPDATE leave_balances SET lop_balance = 10 WHERE employee_id = $1`,
                [leave.employee_id]
              );
              logger.warn(
                `[APPROVE LEAVE DAYS] Auto-reject LOP balance capped at 10. Refunded ${cappedRefund} instead of ${refundAmount}.`
              );
            }
          } else {
            await pool.query(
              `UPDATE leave_balances SET lop_balance = lop_balance + $1 WHERE employee_id = $2`,
              [refundAmount, leave.employee_id]
            );
          }
        } else {
          await pool.query(
            `UPDATE leave_balances SET ${balanceColumn} = ${balanceColumn} + $1 WHERE employee_id = $2`,
            [refundAmount, leave.employee_id]
          );
          logger.info(`[APPROVE LEAVE DAYS] Refunded ${refundAmount} ${leave.leave_type} days to employee ${leave.employee_id}`);
        }
      }
    }
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

  // Get the actual status after recalculation
  const statusResult = await pool.query(
    'SELECT current_status FROM leave_requests WHERE id = $1',
    [leaveRequestId]
  );
  const actualStatus = statusResult.rows[0]?.current_status || 'pending';
  const emailStatus: 'approved' | 'partially_approved' | 'rejected' =
    actualStatus === 'partially_approved' ? 'partially_approved' :
      actualStatus === 'approved' ? 'approved' : 'rejected';

  logger.info(`[APPROVE LEAVE DAYS] Actual status after recalculation: ${actualStatus}, Email status: ${emailStatus}`);

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

  // Send email notifications based on approver role - ONE EMAIL with TO/CC
  if (leave.employee_email) {
    try {
      // Build CC list based on approver role
      const ccEmails: string[] = [];

      if (approverRole === 'hr') {
        // HR approves → Employee (TO), Manager (CC)
        if (leave.manager_email && leave.manager_email !== leave.employee_email) {
          ccEmails.push(leave.manager_email);
        }
        logger.info(`[EMAIL] HR days approval - sending email to employee (TO) with manager (CC)`);
      } else if (approverRole === 'super_admin') {
        // Super Admin approves → Employee (TO), Manager and HR (CC)
        if (leave.manager_email && leave.manager_email !== leave.employee_email) {
          ccEmails.push(leave.manager_email);
        }
        if (leave.hr_email && leave.hr_email !== leave.employee_email && leave.hr_email !== leave.manager_email) {
          ccEmails.push(leave.hr_email);
        }
        logger.info(`[EMAIL] Super Admin days approval - sending email to employee (TO) with manager and HR (CC)`);
      } else {
        // Manager approves → Employee (TO) only
        logger.info(`[EMAIL] Manager days approval - sending email to employee (TO)`);
      }

      let approvedStartDate: string | undefined;
      let approvedEndDate: string | undefined;

      if (emailStatus === 'partially_approved') {
        const approvedDaysResult = await pool.query(
          `SELECT leave_date FROM leave_days 
           WHERE leave_request_id = $1 AND day_status = 'approved' 
           ORDER BY leave_date ASC`,
          [leaveRequestId]
        );

        if (approvedDaysResult.rows.length > 0) {
          approvedStartDate = formatDate(approvedDaysResult.rows[0].leave_date);
          approvedEndDate = formatDate(approvedDaysResult.rows[approvedDaysResult.rows.length - 1].leave_date);
        }
      }

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
        approverEmpId: leave.approver_emp_id || '',
        approverRole: approverRole,
        comment: comment || null,
        status: emailStatus,
        approvedStartDate,
        approvedEndDate
      }, ccEmails.length > 0 ? ccEmails : undefined);

      logger.info(`[EMAIL] ✅ Days approval email sent to employee: ${leave.employee_email}${ccEmails.length > 0 ? ` with CC: ${ccEmails.join(', ')}` : ''}`);
    } catch (err: any) {
      logger.error(`[EMAIL] ❌ Error sending days approval email:`, err);
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
      approver.emp_id as approver_emp_id,
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
  // CRITICAL: Prevent self-rejection for HR and super_admin
  // Use Number() for consistent type comparison (PostgreSQL may return integers as strings in some cases)
  const employeeId = Number(leave.employee_id);
  const approverIdNum = Number(approverId);

  if (approverRole === 'manager') {
    if (Number(leave.reporting_manager_id) !== approverIdNum) {
      throw new Error('Not authorized to reject this leave');
    }
  } else if (approverRole === 'hr') {
    // HR cannot reject their own leave requests
    if (employeeId === approverIdNum) {
      throw new Error('Cannot reject your own leave request');
    }
    if (leave.employee_role !== 'employee' && leave.employee_role !== 'manager' && leave.employee_role !== 'intern') {
      throw new Error('Not authorized to reject this leave');
    }
  } else if (approverRole === 'super_admin') {
    // Super Admin cannot reject their own leave requests
    if (employeeId === approverIdNum) {
      throw new Error('Cannot reject your own leave request');
    }
  } else {
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
  logger.info(`[EMAIL] ========== STARTING EMAIL NOTIFICATION FOR DAY REJECTION ==========`);
  logger.info(`[EMAIL] Request ID: ${leaveRequestId}, Day ID: ${dayId}, Approver ID: ${approverId}, Approver Role: ${approverRole}`);

  // Send email notifications based on approver role - ONE EMAIL with TO/CC
  if (leave.employee_email) {
    try {
      // Build CC list based on approver role
      const ccEmails: string[] = [];

      if (approverRole === 'hr') {
        // HR rejects → Employee (TO), Manager (CC)
        if (leave.manager_email && leave.manager_email !== leave.employee_email) {
          ccEmails.push(leave.manager_email);
        }
        logger.info(`[EMAIL] HR day rejection - sending email to employee (TO) with manager (CC)`);
      } else if (approverRole === 'super_admin') {
        // Super Admin rejects → Employee (TO), Manager and HR (CC)
        if (leave.manager_email && leave.manager_email !== leave.employee_email) {
          ccEmails.push(leave.manager_email);
        }
        if (leave.hr_email && leave.hr_email !== leave.employee_email && leave.hr_email !== leave.manager_email) {
          ccEmails.push(leave.hr_email);
        }
        logger.info(`[EMAIL] Super Admin day rejection - sending email to employee (TO) with manager and HR (CC)`);
      } else {
        // Manager rejects → Employee (TO) only
        logger.info(`[EMAIL] Manager day rejection - sending email to employee (TO)`);
      }

      await sendLeaveStatusEmail(leave.employee_email, {
        employeeName: leave.employee_name || 'Employee',
        employeeEmpId: leave.employee_emp_id || '',
        recipientName: leave.employee_name || 'Employee',
        recipientRole: 'employee' as const,
        leaveType: leave.leave_type,
        startDate: leave.start_date, // Should ideally be day.leave_date but using request dates for context
        startType: leave.start_type,
        endDate: leave.end_date,
        endType: leave.end_type,
        noOfDays: 1, // Single day rejected
        reason: leave.reason,
        approverName: leave.approver_name || 'Approver',
        approverEmpId: leave.approver_emp_id || '',
        approverRole: approverRole,
        comment: comment || null,
        status: 'rejected' as const
      }, ccEmails.length > 0 ? ccEmails : undefined);

      logger.info(`[EMAIL] ✅ Day rejection email sent to employee: ${leave.employee_email}${ccEmails.length > 0 ? ` with CC: ${ccEmails.join(', ')}` : ''}`);
    } catch (err: any) {
      logger.error(`[EMAIL] ❌ Error sending day rejection email:`, err);
    }
  }
  logger.info(`[EMAIL] ========== EMAIL NOTIFICATION COMPLETED FOR DAY REJECTION ==========`);
  logger.info(`[REJECT LEAVE DAY] ========== FUNCTION COMPLETING ==========`);

  return { message: 'Leave day rejected successfully' };
};

export const rejectLeaveDays = async (
  leaveRequestId: number,
  dayIds: number[],
  approverId: number,
  approverRole: string,
  comment: string
) => {
  logger.info(`[REJECT LEAVE DAYS] ========== FUNCTION CALLED ==========`);
  logger.info(`[REJECT LEAVE DAYS] Request ID: ${leaveRequestId}, Day IDs: ${dayIds.join(', ')}, Approver ID: ${approverId}, Role: ${approverRole}`);

  // Get leave request details
  const leaveResult = await pool.query(
    `SELECT 
      lr.*, 
      u.reporting_manager_id, 
      u.role as employee_role,
      u.email as employee_email,
      u.first_name || ' ' || COALESCE(u.last_name, '') as employee_name,
      u.emp_id as employee_emp_id,
      approver.first_name || ' ' || COALESCE(approver.last_name, '') as approver_name,
      approver.emp_id as approver_emp_id,
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
  const employeeId = Number(leave.employee_id);
  const approverIdNum = Number(approverId);

  // Authorization Checks
  if (approverRole === 'manager') {
    if (Number(leave.reporting_manager_id) !== approverIdNum) {
      throw new Error('Not authorized to reject this leave');
    }
  } else if (approverRole === 'hr') {
    if (employeeId === approverIdNum) {
      throw new Error('Cannot reject your own leave request');
    }
    if (leave.employee_role !== 'employee' && leave.employee_role !== 'manager' && leave.employee_role !== 'intern') {
      throw new Error('Not authorized to reject this leave');
    }
  } else if (approverRole === 'super_admin') {
    if (employeeId === approverIdNum) {
      throw new Error('Cannot reject your own leave request');
    }
  } else {
    throw new Error('Not authorized to reject leaves');
  }

  // Verify all days belong to the request
  const daysCheck = await pool.query(
    'SELECT id, day_type, day_status FROM leave_days WHERE id = ANY($1) AND leave_request_id = $2',
    [dayIds, leaveRequestId]
  );

  if (daysCheck.rows.length !== dayIds.length) {
    throw new Error('One or more invalid day IDs provided');
  }

  // Filter only days that are NOT already rejected
  const daysToReject = daysCheck.rows.filter(d => d.day_status !== 'rejected');

  if (daysToReject.length === 0) {
    logger.info('[REJECT LEAVE DAYS] All selected days are already rejected. No changes needed.');
    return { message: 'Selected days are already rejected' };
  }

  const dayIdsToReject = daysToReject.map(d => d.id);

  // Batch Update Status
  await pool.query(
    `UPDATE leave_days
     SET day_status = 'rejected'
     WHERE id = ANY($1)`,
    [dayIdsToReject]
  );

  // Calculate Refund
  let totalRefund = 0;
  if (leave.leave_type !== 'permission') {
    totalRefund = daysToReject.reduce((acc, d) => acc + (d.day_type === 'half' ? 0.5 : 1), 0);

    if (totalRefund > 0) {
      const balanceColumn =
        leave.leave_type === 'casual'
          ? 'casual_balance'
          : leave.leave_type === 'sick'
            ? 'sick_balance'
            : 'lop_balance';

      if (leave.leave_type === 'lop') {
        const currentBalanceResult = await pool.query(
          'SELECT lop_balance FROM leave_balances WHERE employee_id = $1',
          [leave.employee_id]
        );
        const currentLop = parseFloat(currentBalanceResult.rows[0]?.lop_balance || '0') || 0;
        let newLopBalance = currentLop + totalRefund;

        if (newLopBalance > 10) {
          const cappedRefund = 10 - currentLop;
          if (cappedRefund > 0) {
            await pool.query(
              `UPDATE leave_balances SET lop_balance = 10 WHERE employee_id = $1`,
              [leave.employee_id]
            );
            logger.warn(
              `[REJECT LEAVE DAYS] LOP balance capped at 10. Refunded ${cappedRefund} instead of ${totalRefund}.`
            );
          }
        } else {
          await pool.query(
            `UPDATE leave_balances SET lop_balance = lop_balance + $1 WHERE employee_id = $2`,
            [totalRefund, leave.employee_id]
          );
        }
      } else {
        await pool.query(
          `UPDATE leave_balances SET ${balanceColumn} = ${balanceColumn} + $1 WHERE employee_id = $2`,
          [totalRefund, leave.employee_id]
        );
      }
    }
  }

  // Update Request Header
  const updateQuery = `
    UPDATE leave_requests 
    SET ${approverRole === 'manager' ? 'manager_approval_status' : approverRole === 'hr' ? 'hr_approval_status' : 'super_admin_approval_status'} = 'rejected',
        ${approverRole === 'manager' ? 'manager_approval_date' : approverRole === 'hr' ? 'hr_approval_date' : 'super_admin_approval_date'} = CURRENT_TIMESTAMP,
        ${approverRole === 'manager' ? 'manager_approval_comment' : approverRole === 'hr' ? 'hr_approval_comment' : 'super_admin_approval_comment'} = $1,
        ${approverRole === 'manager' ? 'manager_approved_by' : approverRole === 'hr' ? 'hr_approved_by' : 'super_admin_approved_by'} = $2,
        last_updated_by = $2,
        last_updated_by_role = $3
    WHERE id = $4
  `;
  await pool.query(updateQuery, [comment, approverId, approverRole, leaveRequestId]);

  // Recalculate Status
  try {
    await recalcLeaveRequestStatus(leaveRequestId);
  } catch (recalcError) {
    logger.error(`[REJECT LEAVE DAYS] Error recalculating status:`, recalcError);
  }

  // Send ONE Email
  logger.info(`[EMAIL] ========== SENDING BATCH REJECTION EMAIL ==========`);
  if (leave.employee_email) {
    try {
      const ccEmails: string[] = [];
      if (approverRole === 'hr' && leave.manager_email && leave.manager_email !== leave.employee_email) {
        ccEmails.push(leave.manager_email);
      } else if (approverRole === 'super_admin') {
        if (leave.manager_email && leave.manager_email !== leave.employee_email) ccEmails.push(leave.manager_email);
        if (leave.hr_email && leave.hr_email !== leave.employee_email && leave.hr_email !== leave.manager_email) ccEmails.push(leave.hr_email);
      }

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
        noOfDays: totalRefund, // Days rejected in this batch
        reason: leave.reason,
        approverName: leave.approver_name || 'Approver',
        approverEmpId: leave.approver_emp_id || '',
        approverRole: approverRole,
        comment: comment,
        status: 'rejected' as const
      }, ccEmails.length > 0 ? ccEmails : undefined);

      logger.info(`[EMAIL] ✅ Batch rejection email sent to ${leave.employee_email}`);
    } catch (err) {
      logger.error(`[EMAIL] ❌ Error sending batch rejection email:`, err);
    }
  }

  return { message: 'Leave days rejected successfully' };
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

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const leaveResult = await client.query(
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
    }

    // Get all leave days before update
    const leaveDaysResult = await client.query(
      'SELECT id, leave_date, day_status, day_type FROM leave_days WHERE leave_request_id = $1 ORDER BY leave_date',
      [leaveRequestId]
    );
    const allLeaveDays = leaveDaysResult.rows || [];

    // 1. Identify new status for each day and calculate balance refund/deduction
    let refundAmount = 0;
    const dayUpdates: { id: number, status: string }[] = [];

    for (const day of allLeaveDays) {
      let nextDayStatus = day.day_status;
      if (newStatus === 'approved') {
        nextDayStatus = 'approved';
      } else if (newStatus === 'rejected') {
        nextDayStatus = 'rejected';
      } else if (newStatus === 'partially_approved') {
        if (!selectedDayIds) throw new Error('Selected day IDs must be provided for partial approval');
        nextDayStatus = selectedDayIds.includes(Number(day.id)) ? 'approved' : 'rejected';
      } else {
        throw new Error('Invalid status update requested');
      }

      // Logic: Refund if changing from non-rejected to rejected. Deduct if changing from rejected to non-rejected.
      const wasRejected = day.day_status === 'rejected';
      const isNowRejected = nextDayStatus === 'rejected';
      const dayWeight = day.day_type === 'half' ? 0.5 : 1;

      if (!wasRejected && isNowRejected) {
        refundAmount += dayWeight;
      } else if (wasRejected && !isNowRejected) {
        refundAmount -= dayWeight;
      }

      dayUpdates.push({ id: day.id, status: nextDayStatus });
    }

    // 2. Perform updates to leave_days
    for (const update of dayUpdates) {
      await client.query(
        'UPDATE leave_days SET day_status = $1 WHERE id = $2',
        [update.status, update.id]
      );
    }

    // 3. Perform updates to leave_balances (except for permission)
    if (refundAmount !== 0 && leave.leave_type !== 'permission') {
      const balanceColumn =
        leave.leave_type === 'casual'
          ? 'casual_balance'
          : leave.leave_type === 'sick'
            ? 'sick_balance'
            : 'lop_balance';

      if (leave.leave_type === 'lop') {
        const currentBalanceResult = await client.query(
          'SELECT lop_balance FROM leave_balances WHERE employee_id = $1',
          [leave.employee_id]
        );
        const currentLop = parseFloat(currentBalanceResult.rows[0]?.lop_balance || '0') || 0;
        let newLopBalance = currentLop + refundAmount;

        // Cap LOP balance at 10
        if (newLopBalance > 10) newLopBalance = 10;
        // Don't allow LOP balance to go below 0 (shouldn't happen with valid requests, but safe)
        if (newLopBalance < 0) newLopBalance = 0;

        await client.query(
          `UPDATE leave_balances SET lop_balance = $1 WHERE employee_id = $2`,
          [newLopBalance, leave.employee_id]
        );
      } else {
        // For Casual/Sick, we just apply the adjustment
        await client.query(
          `UPDATE leave_balances SET ${balanceColumn} = ${balanceColumn} + $1 WHERE employee_id = $2`,
          [refundAmount, leave.employee_id]
        );
      }
      logger.info(`[LEAVE] [UPDATE LEAVE STATUS] Adjusted ${balanceColumn} by ${refundAmount} for employee ${leave.employee_id}`);
    }

    // 4. Update leave_requests header status
    // Determine the header status based on the final state of all days
    const finalApprovedDays = dayUpdates.filter(d => d.status === 'approved').length;
    let finalRequestStatus = newStatus;

    if (newStatus === 'partially_approved') {
      if (finalApprovedDays === 0) {
        finalRequestStatus = 'rejected';
      } else if (finalApprovedDays === dayUpdates.length) {
        finalRequestStatus = 'approved';
      } else {
        finalRequestStatus = 'partially_approved';
      }
    }

    if (approverRole === 'super_admin') {
      await client.query(
        `UPDATE leave_requests 
         SET current_status = $1,
             super_admin_approval_status = $2,
             super_admin_approval_date = CURRENT_TIMESTAMP,
             super_admin_approval_comment = $3,
             super_admin_approved_by = $4,
             manager_approval_comment = NULL,
             hr_approval_comment = NULL,
             last_updated_by = $4,
             last_updated_by_role = 'super_admin'
         WHERE id = $5`,
        [finalRequestStatus,
          finalRequestStatus === 'rejected' ? 'rejected' : 'approved',
          newStatus === 'rejected' ? (rejectReason || 'Status updated by Super Admin') : `Status updated by Super Admin`,
          approverId, leaveRequestId]
      );
    } else if (approverRole === 'hr') {
      await client.query(
        `UPDATE leave_requests 
         SET current_status = $1,
             hr_approval_status = $2,
             hr_approval_date = CURRENT_TIMESTAMP,
             hr_approval_comment = $3,
             hr_approved_by = $4,
             manager_approval_comment = NULL,
             last_updated_by = $4,
             last_updated_by_role = 'hr'
         WHERE id = $5`,
        [finalRequestStatus,
          finalRequestStatus === 'rejected' ? 'rejected' : 'approved',
          newStatus === 'rejected' ? (rejectReason || 'Status updated by HR') : `Status updated by HR`,
          approverId, leaveRequestId]
      );
    }

    await client.query('COMMIT');
    logger.info(`[LEAVE] [UPDATE LEAVE STATUS] Transaction committed successfully for Request ID: ${leaveRequestId}`);

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error(`[LEAVE] [UPDATE LEAVE STATUS] Transaction rolled back for Request ID: ${leaveRequestId}. Error:`, error);
    throw error;
  } finally {
    client.release();
  }

  // Send email notifications for status updates (approved/partially_approved/rejected)
  if (newStatus === 'approved' || newStatus === 'partially_approved' || newStatus === 'rejected') {
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
          approver.first_name || ' ' || COALESCE(approver.last_name, '') as approver_name,
          approver.emp_id as approver_emp_id
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
        // Determine recipients based on approver role - ONE EMAIL with TO/CC
        // Note: updateLeaveStatus only allows 'hr' and 'super_admin', so manager case is not needed here
        if (emailLeave.employee_email) {
          // Build CC list based on approver role
          const ccEmails: string[] = [];

          if (approverRole === 'hr') {
            // HR updates → Employee (TO), Manager (CC)
            if (emailLeave.manager_email && emailLeave.manager_email !== emailLeave.employee_email) {
              ccEmails.push(emailLeave.manager_email);
            }
            logger.info(`[EMAIL] HR update - sending email to employee (TO) with manager (CC)`);
          } else if (approverRole === 'super_admin') {
            // Super Admin updates → Employee (TO), Manager and HR (CC)
            if (emailLeave.manager_email && emailLeave.manager_email !== emailLeave.employee_email) {
              ccEmails.push(emailLeave.manager_email);
            }
            if (emailLeave.hr_email && emailLeave.hr_email !== emailLeave.employee_email && emailLeave.hr_email !== emailLeave.manager_email) {
              ccEmails.push(emailLeave.hr_email);
            }
            logger.info(`[EMAIL] Super Admin update - sending email to employee (TO) with manager and HR (CC)`);
          }

          let approvedStartDate: string | undefined;
          let approvedEndDate: string | undefined;

          if (newStatus === 'partially_approved') {
            const approvedDaysResult = await pool.query(
              `SELECT leave_date FROM leave_days 
               WHERE leave_request_id = $1 AND day_status = 'approved' 
               ORDER BY leave_date ASC`,
              [leaveRequestId]
            );

            if (approvedDaysResult.rows.length > 0) {
              approvedStartDate = formatDate(approvedDaysResult.rows[0].leave_date);
              approvedEndDate = formatDate(approvedDaysResult.rows[approvedDaysResult.rows.length - 1].leave_date);
            }
          }

          const emailData = {
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
            approverEmpId: emailLeave.approver_emp_id || '',
            approverRole: approverRole,
            comment: newStatus === 'rejected' ? (rejectReason || null) : null,
            status: newStatus as 'approved' | 'partially_approved' | 'rejected',
            approvedStartDate,
            approvedEndDate
          };

          const emailSent = await sendLeaveStatusEmail(emailLeave.employee_email, emailData, ccEmails.length > 0 ? ccEmails : undefined);
          if (emailSent) {
            logger.info(`✅ Leave ${newStatus} email sent to employee: ${emailLeave.employee_email}${ccEmails.length > 0 ? ` with CC: ${ccEmails.join(', ')}` : ''}`);
          } else {
            logger.warn(`⚠️ Failed to send leave ${newStatus} email to employee: ${emailLeave.employee_email}`);
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
  approverId: number,
  approverRole: string,
  page: number = 1,
  limit: number = 10
) => {
  const normalizedRole = approverRole?.toLowerCase().trim();
  logger.info(`[LEAVE] [GET APPROVED LEAVES] ========== FUNCTION CALLED ==========`);
  logger.info(`[LEAVE] [GET APPROVED LEAVES] Approver ID: ${approverId}, Role: ${normalizedRole}, Page: ${page}, Limit: ${limit}`);

  const offset = (page - 1) * limit;
  const params: any[] = [];

  let query = `SELECT
        lr.id,
        u.emp_id,
        u.first_name || ' ' || COALESCE(u.last_name, '') AS emp_name,
        u.status AS emp_status,
        u.role AS emp_role,
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
     LEFT JOIN users l1 ON u.reporting_manager_id = l1.id
     WHERE lr.current_status != 'pending'
        AND NOT EXISTS (
          SELECT 1 FROM leave_days ld2
          WHERE ld2.leave_request_id = lr.id 
            AND COALESCE(ld2.day_status, 'pending') = 'pending'
        )
  `;

  // SUPER ADMIN: Global (except own)
  if (normalizedRole === 'super_admin') {
    query += ` AND lr.employee_id != $${params.length + 1}`;
    params.push(approverId);
  }
  // HR: Strict Hierarchy (L1/L2) + Role Exclusion
  else if (normalizedRole === 'hr') {
    query += ` AND lr.employee_id != $${params.length + 1} AND (
       u.reporting_manager_id = $${params.length + 1}
       OR l1.reporting_manager_id = $${params.length + 1}
     ) AND LOWER(u.role) IN ('intern', 'employee', 'manager')`;
    params.push(approverId);
  }
  // MANAGER: Direct Reports
  else if (normalizedRole === 'manager') {
    query += ` AND u.reporting_manager_id = $${params.length + 1} AND lr.employee_id != $${params.length + 1}`;
    params.push(approverId);
  }

  query += ` GROUP BY lr.id, u.emp_id, u.first_name, u.last_name, lr.applied_date, lr.start_date, lr.end_date, lr.leave_type, lr.no_of_days, lr.current_status,
              lr.manager_approval_comment, lr.hr_approval_comment, lr.super_admin_approval_comment,
              lr.last_updated_by, lr.last_updated_by_role,
              last_updater.first_name, last_updater.last_name, u.status, u.role
     ORDER BY lr.applied_date DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;

  params.push(limit, offset);

  const result = await pool.query(query, params);

  let countQuery = `SELECT COUNT(DISTINCT lr.id)
     FROM leave_requests lr
     JOIN users u ON lr.employee_id = u.id
     LEFT JOIN users l1 ON u.reporting_manager_id = l1.id
     WHERE lr.current_status != 'pending'
        AND NOT EXISTS (
          SELECT 1 FROM leave_days ld2
          WHERE ld2.leave_request_id = lr.id 
            AND COALESCE(ld2.day_status, 'pending') = 'pending'
        )`;

  const countParams: any[] = [];

  // SUPER ADMIN: Global (except own)
  if (normalizedRole === 'super_admin') {
    countQuery += ` AND lr.employee_id != $${countParams.length + 1}`;
    countParams.push(approverId);
  }
  // HR: Strict Hierarchy (L1/L2) + Role Exclusion
  else if (normalizedRole === 'hr') {
    countQuery += ` AND lr.employee_id != $${countParams.length + 1} AND (
       u.reporting_manager_id = $${countParams.length + 1}
       OR l1.reporting_manager_id = $${countParams.length + 1}
     ) AND LOWER(u.role) IN ('intern', 'employee', 'manager')`;
    countParams.push(approverId);
  }
  // MANAGER: Direct Reports
  else if (normalizedRole === 'manager') {
    countQuery += ` AND u.reporting_manager_id = $${countParams.length + 1} AND lr.employee_id != $${countParams.length + 1}`;
    countParams.push(approverId);
  }

  const countResult = await pool.query(countQuery, countParams);

  // Batch fetch leave days for all request IDs to avoid N+1 query problem
  const requestIds = result.rows.map(r => r.id);
  const daysMap = new Map<number, any[]>();

  if (requestIds.length > 0) {
    const allDaysResult = await pool.query(
      'SELECT id, leave_request_id, leave_date, day_type, day_status FROM leave_days WHERE leave_request_id = ANY($1) ORDER BY leave_date',
      [requestIds]
    );

    allDaysResult.rows.forEach(day => {
      if (!daysMap.has(day.leave_request_id)) {
        daysMap.set(day.leave_request_id, []);
      }
      daysMap.get(day.leave_request_id)?.push(day);
    });
  }

  // Get leave days for each request
  const requestsWithDays = result.rows.map((row) => {
    const days = daysMap.get(row.id) || [];

    const approvedDates = Array.isArray(row.approved_dates) ? row.approved_dates.filter((d: any) => d) : [];
    const rejectedDates = Array.isArray(row.rejected_dates) ? row.rejected_dates.filter((d: any) => d) : [];
    const approvedDays = parseFloat(row.approved_days) || 0;
    const rejectedDays = parseFloat(row.rejected_days) || 0;
    const pendingDays = parseFloat(row.pending_days) || 0;

    let displayStatus = row.leave_status;
    // Since we're filtering out requests with pending days, we should never have pendingDays > 0 here
    // But we'll still calculate it correctly
    if (pendingDays > 0) {
      // This shouldn't happen due to the WHERE clause, but handle it just in case
      displayStatus = 'pending';
    } else if (approvedDays > 0 && rejectedDays > 0) {
      displayStatus = 'partially_approved';
    } else if (approvedDays > 0 && rejectedDays === 0) {
      displayStatus = 'approved';
    } else if (rejectedDays > 0 && approvedDays === 0) {
      displayStatus = 'rejected';
    } else {
      // Fallback to the database status
      displayStatus = row.leave_status;
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
    const canEdit = normalizedRole === 'hr' || normalizedRole === 'super_admin';
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
      empStatus: row.emp_status,
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
      leaveDays: days.map(d => ({
        id: d.id,
        date: formatDate(d.leave_date),
        type: d.day_type,
        status: d.day_status || 'pending'
      }))
    };
  });

  return {
    requests: requestsWithDays,
    pagination: {
      page,
      limit,
      total: parseInt(countResult.rows[0].count)
    }
  };
};

