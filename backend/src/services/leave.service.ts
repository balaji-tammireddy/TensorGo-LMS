import { pool } from '../database/db';
import { calculateLeaveDays } from '../utils/dateCalculator';
import { AuthRequest } from '../middleware/auth.middleware';
import { logger } from '../utils/logger';
import { deleteFromOVH } from '../utils/storage';
import { sendLeaveApplicationEmail, sendLeaveStatusEmail, sendUrgentLeaveApplicationEmail } from '../utils/emailTemplates';
import { TimesheetService } from './timesheet.service';

// Local date formatter to avoid timezone shifts
const formatDate = (date: Date | string): string => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) {
    return typeof date === 'string' ? date : '';
  }
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

export const getLeaveBalances = async (userId: number): Promise<any> => {
  logger.info(`[LEAVE] [GET LEAVE BALANCES] ========== FUNCTION CALLED ==========`);
  logger.info(`[LEAVE] [GET LEAVE BALANCES] User ID: ${userId}`);

  // Get user role
  const userResult = await pool.query('SELECT user_role as role FROM users WHERE id = $1', [userId]);
  const role = userResult.rows[0]?.role || 'employee';

  if (role === 'super_admin') {
    logger.info(`[LEAVE] [GET LEAVE BALANCES] User is super_admin, returning zero balances`);
    return {
      casual: 0,
      sick: 0,
      lop: 0,
      policies: {}
    };
  }

  const result = await pool.query(
    'SELECT casual_balance, sick_balance, lop_balance FROM leave_balances WHERE employee_id = $1',
    [userId]
  );

  let balancesRaw = { casual: 0, sick: 0, lop: 0 };

  if (result.rows.length === 0) {
    logger.info(`[LEAVE] [GET LEAVE BALANCES] No balance record found, initializing with defaults`);
    await pool.query(
      'INSERT INTO leave_balances (employee_id, casual_balance, sick_balance, lop_balance, created_by, updated_by) VALUES ($1, 0, 0, 10, $2, $2)',
      [userId, userId]
    );
    balancesRaw = { casual: 0, sick: 0, lop: 10 };
  } else {
    const balance = result.rows[0];
    balancesRaw = {
      casual: parseFloat(balance.casual_balance) || 0,
      sick: parseFloat(balance.sick_balance) || 0,
      lop: parseFloat(balance.lop_balance) || 0
    };
  }

  // Get policy configurations for the user's role
  const policyResult = await pool.query(`
    SELECT 
      lt.code as leave_type,
      lt.name as leave_type_name,
      lpc.carry_forward_limit,
      lpc.max_leave_per_month,
      lpc.anniversary_3_year_bonus,
      lpc.anniversary_5_year_bonus
    FROM leave_policy_configurations lpc
    JOIN leave_types lt ON lpc.leave_type_id = lt.id
    WHERE lpc.role = $1 AND lt.is_active = true
  `, [role]);

  const policies: any = {};
  policyResult.rows.forEach((row: any) => {
    policies[row.leave_type] = {
      name: row.leave_type_name,
      carryForwardLimit: parseFloat(row.carry_forward_limit) || 0,
      maxLeavePerMonth: parseFloat(row.max_leave_per_month) || 0,
      anniversary3YearBonus: parseFloat(row.anniversary_3_year_bonus) || 0,
      anniversary5YearBonus: parseFloat(row.anniversary_5_year_bonus) || 0
    };
  });

  return {
    ...balancesRaw,
    policies
  };
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

export const createHoliday = async (holidayDate: string, holidayName: string, requesterId: number) => {
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
      `INSERT INTO holidays (holiday_date, holiday_name, is_active, created_at, updated_at, created_by, updated_by)
       VALUES ($1, $2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $3, $3)
       RETURNING id, holiday_date, holiday_name, is_active, created_at`,
      [holidayDate, trimmedName, requesterId]
    );

    logger.info(`[LEAVE] [CREATE HOLIDAY] Holiday created successfully - ID: ${result.rows[0].id}`);

    // Hook: Log Holiday Immediately - WAIT for completion
    // This ensures DB entries are created BEFORE responding to client
    // so the frontend sees holiday logs immediately without needing to reload
    try {
      await TimesheetService.logHolidayForEveryone(holidayDate, trimmedName);
      logger.info(`[LEAVE] [CREATE HOLIDAY] Holiday logs created successfully for all users`);
    } catch (e) {
      logger.error(`[LEAVE] Failed to log holiday to timesheets`, e);
      // Don't fail the holiday creation if timesheet logging fails
    }

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

    // Hook: Remove Holiday Logs
    TimesheetService.removeHolidayLog(formatDate(result.rows[0].holiday_date)).catch((e: any) => {
      logger.error(`[LEAVE] Failed to remove holiday logs for date ${result.rows[0].holiday_date}`, e);
    });

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
      `SELECT u.user_role as employee_role, u.status as status,
              COALESCE(rm.id, sa.sa_id) as reporting_manager_id, 
              u.first_name || ' ' || COALESCE(u.last_name, '') as employee_name,
              u.emp_id as employee_emp_id, 
              COALESCE(rm.email, sa.sa_email) as manager_email, 
              COALESCE(rm.first_name || ' ' || COALESCE(rm.last_name, ''), sa.sa_full_name) as manager_name,
              COALESCE(rm.user_role, 'super_admin') as manager_role, 
              rm.reporting_manager_id as hr_id, 
              hr.email as hr_email,
              hr.first_name || ' ' || COALESCE(hr.last_name, '') as hr_name, 
              hr.user_role as hr_role
      FROM users u
      LEFT JOIN users rm ON u.reporting_manager_id = rm.id
      LEFT JOIN users hr ON rm.reporting_manager_id = hr.id
      LEFT JOIN LATERAL (
        SELECT id as sa_id, email as sa_email, first_name || ' ' || COALESCE(last_name, '') as sa_full_name
        FROM users 
        WHERE user_role = 'super_admin'
        ORDER BY id ASC
        LIMIT 1
      ) sa ON u.reporting_manager_id IS NULL AND u.user_role != 'super_admin'
      WHERE u.id = $1`,
      [userId]
    );

    const userData = userResult.rows[0];
    const userRole = userData.employee_role;

    // Validation: Super Admins cannot apply for leaves
    if (userRole === 'super_admin') {
      throw new Error('Super Admins do not apply for leaves and are excluded from the leave system.');
    }

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

      if (days < 3) {
        if (daysUntilStart < 3) {
          throw new Error('Casual leaves of 0.5 to 2 days must be applied at least 3 days in advance.');
        }
      } else if (days <= 5) {
        if (daysUntilStart < 7) {
          throw new Error('Casual leaves of 3 to 5 days must be applied at least 7 days in advance.');
        }
      } else {
        if (daysUntilStart < 30) {
          throw new Error('Casual leaves of More Than 5 days must be applied at least 1 Month in advance.');
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

    // Validation: Check monthly limits dynamically based on policy
    if (leaveData.leaveType === 'lop' || leaveData.leaveType === 'casual') {
      // Fetch the policy configuration for this user's role and leave type
      const policyResult = await pool.query(`
        SELECT lpc.max_leave_per_month
        FROM leave_policy_configurations lpc
        JOIN leave_types lt ON lpc.leave_type_id = lt.id
        WHERE lpc.role = $1 AND lt.code = $2
      `, [userRole, leaveData.leaveType]);

      const maxLeavePerMonth = policyResult.rows.length > 0
        ? parseFloat(policyResult.rows[0].max_leave_per_month)
        : (leaveData.leaveType === 'casual' ? 10 : 5); // Fallback if no policy found

      // Only proceed with check if maxLeavePerMonth is defined and > 0
      if (maxLeavePerMonth > 0) {
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

          // Count existing days for this leave type for this month (excluding rejected ones)
          const existingResult = await pool.query(
            `SELECT COALESCE(SUM(CASE WHEN day_type = 'half' THEN 0.5 ELSE 1 END), 0) as total_days
             FROM leave_days ld
             JOIN leave_requests lr ON ld.leave_request_id = lr.id
             WHERE ld.employee_id = $1 
               AND ld.leave_type = $2
               AND EXTRACT(YEAR FROM ld.leave_date) = $3
               AND EXTRACT(MONTH FROM ld.leave_date) = $4
               AND ld.day_status != 'rejected'
               AND lr.current_status != 'rejected'`,
            [userId, leaveData.leaveType, parseInt(year), parseInt(month)]
          );

          const existingCount = parseFloat(existingResult.rows[0].total_days) || 0;
          const totalDays = existingCount + newCount;

          if (totalDays > maxLeavePerMonth) {
            const [year, month] = monthKey.split('-');
            const displayMonth = `${month}/${year.slice(-2)}`;
            throw new Error(`${leaveData.leaveType.toUpperCase()} leave request exceeds monthly limit of ${maxLeavePerMonth} days. You have already used/requested ${existingCount} days in ${displayMonth}, and this request adds ${newCount} days.`);
          }
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

    // Removed 'On Notice' status restrictions as per request
    /*
    if (userData.status === 'on_notice') {
      if (leaveData.leaveType !== 'lop' && leaveData.leaveType !== 'permission' && leaveData.leaveType !== 'sick') {
        throw new Error('Employees on notice period can only apply for Sick, LOP or Permission.');
      }
    }
    */

    const client = await pool.connect();
    let leaveRequestId: number;

    try {
      await client.query('BEGIN');
      // Store RAW types in DB to preserve UI state (first_half vs second_half)
      // Constraint has been updated to allow these values.
      const leaveRequestResult = await client.query(
        `INSERT INTO leave_requests (employee_id, leave_type, start_date, start_type, end_date, end_type, reason, no_of_days, time_for_permission_start, time_for_permission_end, doctor_note, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
        [userId, leaveData.leaveType, checkStartDateStr, leaveData.startType, checkEndDateStr, leaveData.endType, leaveData.reason, days, leaveData.timeForPermission?.start || null, leaveData.timeForPermission?.end || null, leaveData.doctorNote || null, userId, userId]
      );
      leaveRequestId = leaveRequestResult.rows[0].id;

      for (const leaveDay of leaveDays) {
        const leaveDayDateStr = `${leaveDay.date.getFullYear()}-${String(leaveDay.date.getMonth() + 1).padStart(2, '0')}-${String(leaveDay.date.getDate()).padStart(2, '0')}`;
        await client.query(
          `INSERT INTO leave_days (leave_request_id, leave_date, day_type, leave_type, employee_id, created_by, updated_by) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [leaveRequestId, leaveDayDateStr, leaveDay.type, leaveData.leaveType, userId, userId, userId]
        );
      }

      if (leaveData.leaveType !== 'permission') {
        const balanceColumn = leaveData.leaveType === 'casual' ? 'casual_balance' : leaveData.leaveType === 'sick' ? 'sick_balance' : 'lop_balance';
        try {
          await client.query(`UPDATE leave_balances SET ${balanceColumn} = ${balanceColumn} - $1 WHERE employee_id = $2`, [days, userId]);
        } catch (err: any) {
          if (err.code === '23514' || (err.message && err.message.includes('check_'))) {
            if (err.constraint === 'check_casual_non_negative' || (err.message && err.message.includes('check_casual_non_negative'))) {
              throw new Error('No casual leave balance to update');
            }
            throw new Error(`Insufficient ${leaveData.leaveType} leave balance`);
          }
          throw err;
        }
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

        if (toEmail) {
          const emailData = { ...baseEmailData, managerName: toName };
          if (isUrgent) {
            await sendUrgentLeaveApplicationEmail(toEmail, emailData, undefined);
          } else {
            await sendLeaveApplicationEmail(toEmail, emailData, undefined);
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
           lr.leave_type, lr.time_for_permission_start, lr.time_for_permission_end, lr.current_status, lr.doctor_note,
           lr.manager_approval_comment, lr.hr_approval_comment, lr.super_admin_approval_comment,
           lr.manager_approval_date, lr.hr_approval_date, lr.super_admin_approval_date,
           manager.first_name || ' ' || COALESCE(manager.last_name, '') as manager_name,
           hr.first_name || ' ' || COALESCE(hr.last_name, '') as hr_name,
           sa.first_name || ' ' || COALESCE(sa.last_name, '') as sa_name
    FROM leave_requests lr
    LEFT JOIN users manager ON lr.manager_approved_by = manager.id
    LEFT JOIN users hr ON lr.hr_approved_by = hr.id
    LEFT JOIN users sa ON lr.super_admin_approved_by = sa.id
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
      if (!date) return '';
      const d = new Date(date);
      if (isNaN(d.getTime())) {
        return typeof date === 'string' ? date : '';
      }
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
      const totalDays = days.reduce((acc: number, d: any) => acc + (d.day_type === 'half' ? 0.5 : 1), 0);
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

      // Determine approver name and role based on latest approval date
      let approverName: string | null = null;
      let approverRole: string | null = null;

      const dates = [
        { role: 'Super Admin', date: row.super_admin_approval_date ? new Date(row.super_admin_approval_date).getTime() : 0, name: row.sa_name },
        { role: 'HR', date: row.hr_approval_date ? new Date(row.hr_approval_date).getTime() : 0, name: row.hr_name },
        { role: 'Manager', date: row.manager_approval_date ? new Date(row.manager_approval_date).getTime() : 0, name: row.manager_name }
      ];

      // Sort descending
      dates.sort((a, b) => b.date - a.date);

      if (dates[0].date > 0) {
        if (row.super_admin_approval_comment?.startsWith('Auto-approved')) {
          approverName = 'Auto Approved';
          approverRole = 'System';
        } else {
          approverName = dates[0].name;
          approverRole = dates[0].role;
        }
      }

      requests.push({
        id: row.id,
        appliedDate: formatDate(row.applied_date),
        leaveReason: row.leave_reason,
        startDate: formatDate(row.start_date),
        startType: row.start_type || 'full',
        endDate: formatDate(row.end_date),
        endType: row.end_type || 'full',
        noOfDays: approvedDays > 0 ? approvedDays : totalDays,
        leaveType: row.leave_type,
        currentStatus: displayStatus,
        rejectionReason,
        approverName,
        approverRole,
        doctorNote: row.doctor_note || null,
        // HR and Super Admin can edit/delete any leave, regular users can only edit/delete pending leaves
        canEdit: row.current_status === 'pending' || userRole === 'hr' || userRole === 'super_admin',

        timeForPermission: row.time_for_permission_start && row.time_for_permission_end ? {
          start: row.time_for_permission_start.toString().substring(0, 5),
          end: row.time_for_permission_end.toString().substring(0, 5)
        } : undefined,
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
            lr.applied_date,
             lr.current_status, lr.employee_id, lr.doctor_note,
             lr.manager_approval_comment, lr.hr_approval_comment, lr.super_admin_approval_comment,
             lr.manager_approval_date, lr.hr_approval_date, lr.super_admin_approval_date,
             u.emp_id, u.first_name || ' ' || COALESCE(u.last_name, '') as emp_name,
             u.status AS emp_status, u.user_role AS emp_role,
             manager.first_name || ' ' || COALESCE(manager.last_name, '') as manager_name,
             hr.first_name || ' ' || COALESCE(hr.last_name, '') as hr_name,
             sa.first_name || ' ' || COALESCE(sa.last_name, '') as sa_name
      FROM leave_requests lr
      JOIN users u ON u.id = lr.employee_id
      LEFT JOIN users l1 ON u.reporting_manager_id = l1.id
      LEFT JOIN users l2 ON l1.reporting_manager_id = l2.id
      LEFT JOIN users l3 ON l2.reporting_manager_id = l3.id
      LEFT JOIN users manager ON lr.manager_approved_by = manager.id
      LEFT JOIN users hr ON lr.hr_approved_by = hr.id
      LEFT JOIN users sa ON lr.super_admin_approved_by = sa.id
      WHERE lr.id = $1 
      AND (
           $3 = 'super_admin'             -- Super Admin sees all
        OR lr.employee_id = $2            -- It's my own request
        OR u.reporting_manager_id = $2    -- I am Direct Manager (L1)
        OR l1.reporting_manager_id = $2   -- I am Manager's Manager (L2/HR)
        OR l2.reporting_manager_id = $2   -- I am HR's Manager (L3/Super Admin)
      )
    `;
    params = [requestId, userId, userRole];
  } else {
    // Regular employees can only view their own
    query = `SELECT lr.id, lr.leave_type, lr.start_date, lr.start_type, lr.end_date, lr.end_type, 
            lr.reason, lr.time_for_permission_start, lr.time_for_permission_end,
            lr.applied_date,
            lr.current_status, lr.employee_id, lr.doctor_note,
            lr.manager_approval_comment, lr.hr_approval_comment, lr.super_admin_approval_comment,
            lr.manager_approval_date, lr.hr_approval_date, lr.super_admin_approval_date,
            u.emp_id, u.first_name || ' ' || COALESCE(u.last_name, '') as emp_name,
            u.status AS emp_status, u.user_role AS emp_role,
            manager.first_name || ' ' || COALESCE(manager.last_name, '') as manager_name,
            hr.first_name || ' ' || COALESCE(hr.last_name, '') as hr_name,
            sa.first_name || ' ' || COALESCE(sa.last_name, '') as sa_name
     FROM leave_requests lr
     JOIN users u ON u.id = lr.employee_id
     LEFT JOIN users manager ON lr.manager_approved_by = manager.id
     LEFT JOIN users hr ON lr.hr_approved_by = hr.id
     LEFT JOIN users sa ON lr.super_admin_approved_by = sa.id
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
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) {
      return typeof date === 'string' ? date : '';
    }
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Get rejection reason only if status is rejected (priority: super_admin > hr > manager)
  const rejectionReason = (row.current_status === 'rejected')
    ? (row.super_admin_approval_comment || row.hr_approval_comment || row.manager_approval_comment || null)
    : null;

  // Determine approver name and role based on latest approval date
  let approverName: string | null = null;
  let approverRole: string | null = null;

  const dates = [
    { role: 'Super Admin', date: row.super_admin_approval_date ? new Date(row.super_admin_approval_date).getTime() : 0, name: row.sa_name },
    { role: 'HR', date: row.hr_approval_date ? new Date(row.hr_approval_date).getTime() : 0, name: row.hr_name },
    { role: 'Manager', date: row.manager_approval_date ? new Date(row.manager_approval_date).getTime() : 0, name: row.manager_name }
  ];

  // Sort descending
  dates.sort((a, b) => b.date - a.date);

  if (dates[0].date > 0) {
    if (row.super_admin_approval_comment?.startsWith('Auto-approved')) {
      approverName = 'Auto Approved';
      approverRole = 'System';
    } else {
      approverName = dates[0].name;
      approverRole = dates[0].role;
    }
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
    noOfDays: daysResult.rows.reduce((acc: number, d: any) => acc + (d.day_type === 'half' ? 0.5 : 1), 0),
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
  // Verify the request and authorization
  const checkResult = await pool.query(
    'SELECT lr.current_status, lr.employee_id, lr.leave_type, u.user_role as employee_role FROM leave_requests lr JOIN users u ON lr.employee_id = u.id WHERE lr.id = $1',
    [requestId]
  );

  if (checkResult.rows.length === 0) {
    throw new Error('Leave request not found');
  }

  const employeeId = checkResult.rows[0].employee_id;
  const belongsToUser = employeeId === userId;
  const currentStatus = checkResult.rows[0].current_status;
  const oldLeaveType = checkResult.rows[0].leave_type;

  // Calculate oldDays from leave_days table
  const oldDaysResult = await pool.query(
    `SELECT COALESCE(SUM(CASE WHEN day_type = 'half' THEN 0.5 ELSE 1 END), 0) as total_days
     FROM leave_days WHERE leave_request_id = $1`,
    [requestId]
  );
  const oldDays = parseFloat(oldDaysResult.rows[0].total_days) || 0;

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
       AND LOWER(u.user_role) IN ('intern', 'employee', 'manager')`,
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
    const balances = await getLeaveBalances(employeeId);
    let requestedDays = days; // Default to calculated days
    let availableBalance = 0;

    // Fetch the original request to handle "balance refund" logic during edit
    const originalRequestResult = await pool.query(
      'SELECT leave_type FROM leave_requests WHERE id = $1',
      [requestId]
    );
    const originalRequest = originalRequestResult.rows[0];

    // Determine the relevant balance
    if (leaveData.leaveType === 'casual') availableBalance = Number(balances.casual);
    else if (leaveData.leaveType === 'sick') availableBalance = Number(balances.sick);
    else if (leaveData.leaveType === 'lop') availableBalance = Number(balances.lop);

    // If we are updating the SAME leave type, valid available balance = current + old days
    // (Because the old days will be refunded when this update succeeds)
    if (originalRequest && originalRequest.leave_type === leaveData.leaveType) {
      availableBalance += oldDays;
    }

    if (leaveData.leaveType !== 'lop' && availableBalance < requestedDays) {
      // Special check: if balance is 0 but we have enough "effective" balance, it should pass.
      // But we already added it to availableBalance above.

      // Formatting for error message
      const balanceName = leaveData.leaveType.charAt(0).toUpperCase() + leaveData.leaveType.slice(1);
      if (availableBalance <= 0) {
        throw new Error(`${balanceName} leave balance is zero. You cannot apply ${leaveData.leaveType} leave.`);
      }
      throw new Error(`Insufficient ${leaveData.leaveType} leave balance. Available: ${originalRequest && originalRequest.leave_type === leaveData.leaveType ? (availableBalance - oldDays) : availableBalance}, Requested: ${requestedDays}.`);
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
      await client.query(`UPDATE leave_balances SET ${oldBalanceColumn} = ${oldBalanceColumn} + $1 WHERE employee_id = $2`, [oldDays, employeeId]);
    }

    // 2. Deduct new balance (if not permission)
    if (leaveData.leaveType !== 'permission') {
      const newBalanceColumn = leaveData.leaveType === 'casual' ? 'casual_balance' : leaveData.leaveType === 'sick' ? 'sick_balance' : 'lop_balance';
      try {
        await client.query(`UPDATE leave_balances SET ${newBalanceColumn} = ${newBalanceColumn} - $1 WHERE employee_id = $2`, [days, employeeId]);
      } catch (err: any) {
        if (err.code === '23514' || (err.message && err.message.includes('check_'))) {
          if (err.constraint === 'check_casual_non_negative' || (err.message && err.message.includes('check_casual_non_negative'))) {
            throw new Error('No casual leave balance to update');
          }
          throw new Error(`Insufficient ${leaveData.leaveType} leave balance`);
        }
        throw err;
      }
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
           manager_approval_status = 'pending', hr_approval_status = 'pending', super_admin_approval_status = 'pending',
           updated_by = $11
       WHERE id = $12`,
      [
        leaveData.leaveType,
        startDateStr,
        leaveData.startType, // Pass RAW type to DB
        endDateStr,
        leaveData.endType,   // Pass RAW type to DB
        leaveData.reason,
        days,                // New days count
        leaveData.timeForPermission?.start || null,
        leaveData.timeForPermission?.end || null,
        leaveData.doctorNote || null,
        userId,              // updated_by
        requestId            // WHERE condition
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
        'INSERT INTO leave_days (leave_request_id, leave_date, day_type, leave_type, employee_id, created_by, updated_by) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [requestId, leaveDayDateStr, day.type, leaveData.leaveType, userId, userId, userId]
      );
    }

    await client.query('COMMIT');

    // Special Async Block for Email - Send confirmation after update
    (async () => {
      try {
        const userDataResult = await pool.query(
          "SELECT first_name || ' ' || COALESCE(last_name, '') as name, emp_id, email FROM users WHERE id = $1",
          [employeeId]
        );
        const userData = userDataResult.rows[0];

        const hierarchyResult = await pool.query(`
          SELECT 
            l1.email as l1_email, l1.first_name || ' ' || COALESCE(l1.last_name, '') as l1_name,
            l2.email as l2_email, l2.first_name || ' ' || COALESCE(l2.last_name, '') as l2_name
          FROM users u
          LEFT JOIN users l1 ON u.reporting_manager_id = l1.id
          LEFT JOIN users l2 ON l1.reporting_manager_id = l2.id
          WHERE u.id = $1
        `, [employeeId]);

        const chain = hierarchyResult.rows[0];
        const appliedDate = new Date().toISOString().split('T')[0];

        const emailData = {
          employeeName: userData.name,
          employeeEmpId: userData.emp_id,
          managerName: chain.l1_name || 'Reporting Manager',
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

        const toEmail = chain.l1_email;
        if (toEmail) {
          await sendLeaveApplicationEmail(toEmail, emailData, undefined);
        }
      } catch (e) {
        logger.error('Async email error in updateLeaveRequest:', e);
      }
    })();

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



export const deleteLeaveRequest = async (requestId: number, userId: number, userRole?: string) => {
  logger.info(`[LEAVE] [DELETE LEAVE REQUEST] ========== FUNCTION CALLED ==========`);
  logger.info(`[LEAVE] [DELETE LEAVE REQUEST] Request ID: ${requestId}, User ID: ${userId}, Role: ${userRole || 'none'}`);

  // Verify the request
  logger.info(`[LEAVE] [DELETE LEAVE REQUEST] Verifying leave request exists`);
  const checkResult = await pool.query(
    'SELECT current_status, employee_id, leave_type, doctor_note FROM leave_requests WHERE id = $1',
    [requestId]
  );

  if (checkResult.rows.length === 0) {
    logger.warn(`[LEAVE] [DELETE LEAVE REQUEST] Leave request not found - Request ID: ${requestId}`);
    throw new Error('Leave request not found');
  }
  logger.info(`[LEAVE] [DELETE LEAVE REQUEST] Leave request found - Status: ${checkResult.rows[0].current_status}, Employee ID: ${checkResult.rows[0].employee_id}`);

  const employeeId = checkResult.rows[0].employee_id;
  const belongsToUser = employeeId === userId;
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

  const { leave_type } = checkResult.rows[0];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Restore balance on delete (except permission)
    // Since balance was deducted when leave was applied, we need to refund all non-rejected days
    // For pending leaves: refund all days (they were deducted but never approved)
    // For partially approved leaves: refund all non-rejected days (pending + approved)
    if (leave_type !== 'permission') {
      const daysResult = await client.query(
        "SELECT COALESCE(SUM(CASE WHEN day_type = 'half' THEN 0.5 ELSE 1.0 END), 0) as total_days FROM leave_days WHERE leave_request_id = $1",
        [requestId]
      );
      let daysToRefund = parseFloat(daysResult.rows[0].total_days || '0');

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
            [employeeId]
          );
          const currentLop = parseFloat(currentBalanceResult.rows[0]?.lop_balance || '0') || 0;
          const newLopBalance = currentLop + daysToRefund;

          if (newLopBalance > 10) {
            const cappedRefund = 10 - currentLop;
            if (cappedRefund > 0) {
              await client.query(
                `UPDATE leave_balances SET lop_balance = 10 WHERE employee_id = $1`,
                [employeeId]
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
              [daysToRefund, employeeId]
            );
          }
        } else {
          await client.query(
            `UPDATE leave_balances 
           SET ${balanceColumn} = ${balanceColumn} + $1
           WHERE employee_id = $2`,
            [daysToRefund, employeeId]
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
    SELECT lr.id, lr.employee_id, u.emp_id, u.first_name || ' ' || COALESCE(u.last_name, '') as emp_name, u.status as emp_status, u.user_role as emp_role,
           lr.applied_date, lr.start_date, lr.end_date, lr.start_type, lr.end_type,
           lr.leave_type, lr.time_for_permission_start, lr.time_for_permission_end, lr.reason as leave_reason, lr.current_status,
           lr.doctor_note, u.reporting_manager_id,
           lr.manager_approval_status, lr.hr_approval_status, lr.super_admin_approval_status,
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
  // HR & MANAGER: Strict Hierarchy (L1 only) - Can only approve their direct reports
  else if (normalizedRole === 'hr' || normalizedRole === 'manager') {
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

  // Handle Ordering preference for search
  if (search) {
    const prefixParamIdx = params.length + 1;
    params.push(`${search}%`);
    query += ` ORDER BY 
      CASE 
        WHEN u.first_name ILIKE $${prefixParamIdx} THEN 0 
        WHEN u.emp_id ILIKE $${prefixParamIdx} THEN 1
        ELSE 2 
      END, 
      lr.applied_date DESC`;
  } else {
    query += ' ORDER BY lr.applied_date DESC';
  }

  query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
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
  // Additional safeguard: Filter out approver's own requests to prevent self-approval
  // (SQL already handles this, but keeping as safety net)
  const filteredRows = result.rows.filter(row => Number(row.employee_id) !== Number(approverId));

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

      // Determine approver name and role based on status
      if (row.super_admin_approval_status === 'approved' || row.super_admin_approval_status === 'rejected') {
        approverRole = 'Super Admin';
        approverName = row.super_admin_approver_name;
      } else if (row.hr_approval_status === 'approved' || row.hr_approval_status === 'rejected') {
        approverRole = 'HR';
        approverName = row.hr_approver_name;
      } else if (row.manager_approval_status === 'approved' || row.manager_approval_status === 'rejected') {
        approverRole = 'Manager';
        approverName = row.manager_approver_name;
      }

      // Note: We need approval dates from the row, which means we need to SELECT them in the query above first.
      // Wait, I missed adding them to the SELECT query in the previous thought.
      // I will add them now in this ReplacementContent AND update the logic.
      // But wait, I can't update the SELECT query *here* easily because it's far above.
      // I should update the SELECT query first in a separate step or just assume they are available if I update the query?
      // No, I must update the query.

      // Actually, for PENDING requests, usually there is NO approver yet, unless it's partially approved or rejected.
      // If rejected, we have rejection comments.
      // Let's check if I can get standard approval columns.
      // The SELECT query (lines 1607+) selects `manager_approved_by`, `hr_approved_by`, `super_admin_approved_by` 
      // AND `manager_approval_comment` etc. BUT NOT DATES.
      // I need to add dates to the SELECT query first.

      // Let's abort this specific replacement and update the SELECT query first.
      // I will return the original content for now to not break it, but wait, I can't return "no change".
      // I will just use the comment logic for now which is what was there, but removing the last_updated_by_role check.

      // Actually, better plan: Update the SELECT query first in a separate tool call.
      // I'll do that next.

      // For now, I'll remove the `last_updated_by_role` block and put a placeholder or simple logic based on status.
      if (row.super_admin_approval_status === 'approved' || row.super_admin_approval_status === 'rejected') {
        approverRole = 'Super Admin';
        approverName = row.super_admin_approver_name;
      } else if (row.hr_approval_status === 'approved' || row.hr_approval_status === 'rejected') {
        approverRole = 'HR';
        approverName = row.hr_approver_name;
      } else if (row.manager_approval_status === 'approved' || row.manager_approval_status === 'rejected') {
        approverRole = 'Manager';
        approverName = row.manager_approver_name;
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
        timeForPermission: row.time_for_permission_start && row.time_for_permission_end ? {
          start: row.time_for_permission_start.toString().substring(0, 5),
          end: row.time_for_permission_end.toString().substring(0, 5)
        } : undefined,
        noOfDays: days.reduce((acc: number, d: any) => acc + (d.day_type === 'half' ? 0.5 : 1), 0),
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
  // HR & MANAGER: Strict Hierarchy (L1 only) - Match Main Query
  else if (normalizedRole === 'hr' || normalizedRole === 'manager') {
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
      u.user_role as employee_role,
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

  // Block if previously updated by Super Admin (unless Super Admin is updating)
  if (leave.last_updated_by_role === 'super_admin' && approverRole !== 'super_admin') {
    throw new Error('Action blocked: Cannot modify a request handled by Super Admin');
  }

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
  // HR & Manager: L1 Only (Direct Reports)
  else if (approverRole === 'hr' || approverRole === 'manager') {
    if (Number(leave.reporting_manager_id) !== approverIdNum) {
      throw new Error('Not authorized to approve this leave');
    }
  } else {
    throw new Error('Not authorized to approve leaves');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Update approval status header based on role
    if (approverRole === 'manager' || approverRole === 'hr') {
      await client.query(
        `UPDATE leave_requests 
         SET manager_approval_status = 'approved',
             manager_approval_date = CURRENT_TIMESTAMP,
             manager_approval_comment = $1,
             manager_approved_by = $2,
             hr_approval_status = 'approved',
             hr_approval_date = CURRENT_TIMESTAMP,
             hr_approved_by = $2,
             current_status = 'approved'
         WHERE id = $3`,
        [comment || null, approverId, leaveRequestId]
      );
    } else if (approverRole === 'super_admin') {
      await client.query(
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

    // 2. CRITICAL: Also update all associated leave days to 'approved'
    await client.query(
      `UPDATE leave_days SET day_status = 'approved' WHERE leave_request_id = $1 AND (day_status IS NULL OR day_status = 'pending')`,
      [leaveRequestId]
    );

    // 3. Recalculate status within the same transaction
    const daysResult = await client.query(
      'SELECT day_status, day_type FROM leave_days WHERE leave_request_id = $1',
      [leaveRequestId]
    );

    if (daysResult.rows.length > 0) {
      const approvedDaysCount = daysResult.rows
        .filter((d) => d.day_status === 'approved')
        .reduce((acc, d) => acc + (d.day_type === 'half' ? 0.5 : 1), 0);
      const rejectedDaysCount = daysResult.rows
        .filter((d) => d.day_status === 'rejected')
        .reduce((acc, d) => acc + (d.day_type === 'half' ? 0.5 : 1), 0);
      const remainingPendingCount = daysResult.rows
        .filter((d) => d.day_status !== 'approved' && d.day_status !== 'rejected')
        .reduce((acc, d) => acc + (d.day_type === 'half' ? 0.5 : 1), 0);

      const hasPending = remainingPendingCount > 0;
      const allApproved = remainingPendingCount === 0 && rejectedDaysCount === 0 && approvedDaysCount > 0;
      const allRejected = remainingPendingCount === 0 && approvedDaysCount === 0 && rejectedDaysCount > 0;

      let newStatus: string = 'approved'; // Default for bulk approve
      if (allApproved) {
        newStatus = 'approved';
      } else if (allRejected && !hasPending) {
        newStatus = 'rejected';
      } else if (approvedDaysCount > 0 && (rejectedDaysCount > 0 || hasPending)) {
        newStatus = 'partially_approved';
      }

      await client.query(
        `UPDATE leave_requests SET current_status = $1 WHERE id = $2`,
        [newStatus, leaveRequestId]
      );
    }

    await client.query('COMMIT');
    logger.info(`[APPROVE LEAVE] Transaction committed successfully for request ${leaveRequestId}`);

    // Hook: Sync Timesheet immediately after approval (Restored from HEAD)
    TimesheetService.syncApprovedLeave(Number(leave.employee_id), leaveRequestId).catch((e: any) => {
      logger.error(`[LEAVE] Failed to sync timesheet for leave request ${leaveRequestId}`, e);
    });

  } catch (error: any) {
    await client.query('ROLLBACK');
    logger.error(`[APPROVE LEAVE] Transaction failed:`, error);
    throw error;
  } finally {
    client.release();
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

      // Calculate days for email
      const daysResult = await pool.query(
        `SELECT COALESCE(SUM(CASE WHEN day_type = 'half' THEN 0.5 ELSE 1 END), 0) as total_days
         FROM leave_days WHERE leave_request_id = $1`,
        [leaveRequestId]
      );
      const noOfDays = parseFloat(daysResult.rows[0].total_days) || 0;

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
        noOfDays: noOfDays,
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
      u.user_role as employee_role,
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

  // Block if previously updated by Super Admin (unless Super Admin is updating)
  if (leave.last_updated_by_role === 'super_admin' && approverRole !== 'super_admin') {
    throw new Error('Action blocked: Cannot modify a request handled by Super Admin');
  }

  // Check authorization (same as approve) - STRICT HIERARCHY
  const employeeId = Number(leave.employee_id);
  const approverIdNum = Number(approverId);

  if (employeeId === approverIdNum) {
    throw new Error('Cannot reject your own leave request');
  }

  // Check authorization based on role
  if (approverRole === 'super_admin') {
    // Allowed
  } else if (approverRole === 'hr' || approverRole === 'manager') {
    if (Number(leave.reporting_manager_id) !== approverIdNum) {
      throw new Error('Not authorized to reject this leave');
    }
  } else {
    throw new Error('Not authorized to reject leaves');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Mark all associated leave days as rejected
    await client.query(
      `UPDATE leave_days SET day_status = 'rejected' WHERE leave_request_id = $1`,
      [leaveRequestId]
    );

    // 2. Update rejection status in header based on role
    if (approverRole === 'manager' || approverRole === 'hr') {
      await client.query(
        `UPDATE leave_requests 
         SET manager_approval_status = 'rejected',
             manager_approval_date = CURRENT_TIMESTAMP,
             manager_approval_comment = $1,
             manager_approved_by = $2,
             hr_approval_status = 'rejected',
             hr_approval_date = CURRENT_TIMESTAMP,
             hr_approved_by = $2,
             current_status = 'rejected',
             last_updated_by = $2,
             last_updated_by_role = $3
         WHERE id = $4`,
        [comment, approverId, approverRole, leaveRequestId]
      );
    } else if (approverRole === 'super_admin') {
      await client.query(
        `UPDATE leave_requests 
         SET super_admin_approval_status = 'rejected',
             super_admin_approval_date = CURRENT_TIMESTAMP,
             super_admin_approval_comment = $1,
             super_admin_approved_by = $2,
             current_status = 'rejected',
             last_updated_by = $2,
             last_updated_by_role = 'super_admin'
         WHERE id = $3`,
        [comment, approverId, leaveRequestId]
      );
    }

    // 3. Process refunds (only for days not already rejected)
    if (leave.leave_type !== 'permission' && refundDays > 0) {
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
        let newLopBalance = currentLop + refundDays;

        if (newLopBalance > 10) {
          const cappedRefund = 10 - currentLop;
          if (cappedRefund > 0) {
            await client.query(
              `UPDATE leave_balances SET lop_balance = 10 WHERE employee_id = $1`,
              [leave.employee_id]
            );
          }
        } else {
          await client.query(
            `UPDATE leave_balances SET lop_balance = lop_balance + $1 WHERE employee_id = $2`,
            [refundDays, leave.employee_id]
          );
        }
      } else {
        await client.query(
          `UPDATE leave_balances SET ${balanceColumn} = ${balanceColumn} + $1 WHERE employee_id = $2`,
          [refundDays, leave.employee_id]
        );
      }
      logger.info(`[REJECT LEAVE] Refunded ${refundDays} days to employee ${leave.employee_id}`);
    }

    await client.query('COMMIT');
    logger.info(`[REJECT LEAVE] Transaction committed successfully for request ${leaveRequestId}`);
  } catch (error: any) {
    await client.query('ROLLBACK');
    logger.error(`[REJECT LEAVE] Transaction failed:`, error);
    throw error;
  } finally {
    client.release();
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

      const daysQuery = await pool.query(
        "SELECT COALESCE(SUM(CASE WHEN day_type = 'half' THEN 0.5 ELSE 1.0 END), 0) as total_days FROM leave_days WHERE leave_request_id = $1",
        [leave.id]
      );
      const calculatedNoOfDays = parseFloat(daysQuery.rows[0].total_days || '0');

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
        noOfDays: calculatedNoOfDays,
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
    'SELECT employee_id, leave_type, current_status FROM leave_requests WHERE id = $1',
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

  // Update header status only; keep original leave_days for balance refunds
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
      u.user_role as employee_role,
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

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Update the individual day status if not already approved
    if (currentDayStatus !== 'approved') {
      await client.query(
        `UPDATE leave_days SET day_status = 'approved', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [dayId]
      );
    }

    // 2. Mark role-specific approval fields in header
    if (approverRole === 'manager') {
      const updateResult = await client.query(
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
      if (updateResult.rowCount === 0) throw new Error('Not authorized to approve this leave');
    } else if (approverRole === 'hr') {
      await client.query(
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
      await client.query(
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

    // 3. Recalculate status within the transaction
    const daysResult = await client.query(
      'SELECT day_status, day_type FROM leave_days WHERE leave_request_id = $1',
      [leaveRequestId]
    );

    if (daysResult.rows.length > 0) {
      const approvedDaysCount = daysResult.rows
        .filter((d) => d.day_status === 'approved')
        .reduce((acc, d) => acc + (d.day_type === 'half' ? 0.5 : 1), 0);
      const rejectedDaysCount = daysResult.rows
        .filter((d) => d.day_status === 'rejected')
        .reduce((acc, d) => acc + (d.day_type === 'half' ? 0.5 : 1), 0);
      const remainingPendingCount = daysResult.rows
        .filter((d) => d.day_status !== 'approved' && d.day_status !== 'rejected')
        .reduce((acc, d) => acc + (d.day_type === 'half' ? 0.5 : 1), 0);

      const hasPending = remainingPendingCount > 0;
      const allApproved = remainingPendingCount === 0 && rejectedDaysCount === 0 && approvedDaysCount > 0;
      const allRejected = remainingPendingCount === 0 && approvedDaysCount === 0 && rejectedDaysCount > 0;

      let nextStatus: string = leave.current_status;
      if (allApproved) {
        nextStatus = 'approved';
      } else if (allRejected && !hasPending) {
        nextStatus = 'rejected';
      } else if (approvedDaysCount > 0 && (rejectedDaysCount > 0 || hasPending)) {
        nextStatus = 'partially_approved';
      }

      await client.query(
        `UPDATE leave_requests SET current_status = $1 WHERE id = $2`,
        [nextStatus, leaveRequestId]
      );
    }

    await client.query('COMMIT');
    logger.info(`[APPROVE LEAVE DAY] Transaction committed successfully for request ${leaveRequestId}`);
  } catch (error: any) {
    await client.query('ROLLBACK');
    logger.error(`[APPROVE LEAVE DAY] Transaction failed:`, error);
    throw error;
  } finally {
    client.release();
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

      const daysQuery = await pool.query(
        "SELECT COALESCE(SUM(CASE WHEN day_type = 'half' THEN 0.5 ELSE 1.0 END), 0) as total_days FROM leave_days WHERE leave_request_id = $1",
        [leaveRequestId]
      );
      const calculatedNoOfDays = parseFloat(daysQuery.rows[0].total_days || '0');

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
        noOfDays: calculatedNoOfDays,
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

  if (!dayIds || !Array.isArray(dayIds) || dayIds.length === 0) {
    throw new Error('No days specified for approval');
  }

  // Normalize dayIds to numbers locally to avoid type comparison issues
  const normalizedDayIds = dayIds.map(id => Number(id));

  // Get leave request details with employee, approver, manager, and HR information
  const leaveResult = await pool.query(
    `SELECT 
      lr.*, 
      u.reporting_manager_id, 
      u.user_role as employee_role,
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

  const daysToApprove = normalizedDayIds.filter(id => allPendingDayIds.includes(id));
  logger.info(`[APPROVE LEAVE DAYS] Intersection (daysToApprove): ${daysToApprove.join(', ')}`);

  const daysToReject = allPendingDayIds.filter(id => !daysToApprove.includes(id));

  // If no new days to approve, check if the request is already in a state that needs header update
  if (daysToApprove.length === 0) {
    logger.warn(`[APPROVE LEAVE DAYS] No NEW pending days to approve for request ${leaveRequestId}. Checking consistency.`);
    // Verify if all requested dayIds are already approved or rejected
    const existingDaysResult = await pool.query(
      'SELECT id, day_status FROM leave_days WHERE id = ANY($1::int[])',
      [normalizedDayIds]
    );
    const allRequestedAlreadyProcessed = existingDaysResult.rows.every(d => d.day_status === 'approved' || d.day_status === 'rejected');

    if (!allRequestedAlreadyProcessed) {
      throw new Error('No valid pending days to approve and some requested days are in an invalid state');
    }
    // If all are already processed, we proceed to update the header anyway to ensure consistency
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Approve selected days
    if (daysToApprove.length > 0) {
      await client.query(
        `UPDATE leave_days
         SET day_status = 'approved'
         WHERE id = ANY($1::int[])
         AND leave_request_id = $2
         AND (day_status IS NULL OR day_status = 'pending')`,
        [daysToApprove, leaveRequestId]
      );
    }

    // 2. Auto-reject remaining pending days AND Refund Balance
    if (daysToReject.length > 0) {
      await client.query(
        `UPDATE leave_days
         SET day_status = 'rejected'
         WHERE id = ANY($1::int[])
         AND leave_request_id = $2
         AND (day_status IS NULL OR day_status = 'pending')`,
        [daysToReject, leaveRequestId]
      );

      // Refund balance for these auto-rejected days (except permission)
      if (leave.leave_type !== 'permission') {
        const rejectedDaysDetails = await client.query(
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
            const currentBalanceResult = await client.query(
              'SELECT lop_balance FROM leave_balances WHERE employee_id = $1',
              [leave.employee_id]
            );
            const currentLop = parseFloat(currentBalanceResult.rows[0]?.lop_balance || '0') || 0;
            let newLopBalance = currentLop + refundAmount;

            if (newLopBalance > 10) {
              const cappedRefund = 10 - currentLop;
              if (cappedRefund > 0) {
                await client.query(
                  `UPDATE leave_balances SET lop_balance = 10 WHERE employee_id = $1`,
                  [leave.employee_id]
                );
                logger.warn(
                  `[APPROVE LEAVE DAYS] Auto-reject LOP balance capped at 10. Refunded ${cappedRefund} instead of ${refundAmount}.`
                );
              }
            } else {
              await client.query(
                `UPDATE leave_balances SET lop_balance = lop_balance + $1 WHERE employee_id = $2`,
                [refundAmount, leave.employee_id]
              );
            }
          } else {
            await client.query(
              `UPDATE leave_balances SET ${balanceColumn} = ${balanceColumn} + $1 WHERE employee_id = $2`,
              [refundAmount, leave.employee_id]
            );
          }
        }
      }
    }

    // 3. Mark role-specific approval fields in header
    if (approverRole === 'manager') {
      const updateResult = await client.query(
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
      if (updateResult.rowCount === 0) throw new Error('Not authorized to approve this leave');
    } else if (approverRole === 'hr') {
      await client.query(
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
      await client.query(
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

    // 4. Recalculate status within the same transaction
    const daysResult = await client.query(
      'SELECT day_status, day_type FROM leave_days WHERE leave_request_id = $1',
      [leaveRequestId]
    );

    if (daysResult.rows.length > 0) {
      const approvedDaysCount = daysResult.rows
        .filter((d) => d.day_status === 'approved')
        .reduce((acc, d) => acc + (d.day_type === 'half' ? 0.5 : 1), 0);
      const rejectedDaysCount = daysResult.rows
        .filter((d) => d.day_status === 'rejected')
        .reduce((acc, d) => acc + (d.day_type === 'half' ? 0.5 : 1), 0);
      const remainingPendingCount = daysResult.rows
        .filter((d) => d.day_status !== 'approved' && d.day_status !== 'rejected')
        .reduce((acc, d) => acc + (d.day_type === 'half' ? 0.5 : 1), 0);

      const hasPending = remainingPendingCount > 0;
      const allApproved = remainingPendingCount === 0 && rejectedDaysCount === 0 && approvedDaysCount > 0;
      const allRejected = remainingPendingCount === 0 && approvedDaysCount === 0 && rejectedDaysCount > 0;

      let nextStatus: string = leave.current_status;
      if (allApproved) {
        nextStatus = 'approved';
      } else if (allRejected && !hasPending) {
        nextStatus = 'rejected';
      } else if (approvedDaysCount > 0 && (rejectedDaysCount > 0 || hasPending)) {
        nextStatus = 'partially_approved';
      } else {
        nextStatus = 'pending';
      }

      await client.query(
        `UPDATE leave_requests SET current_status = $1 WHERE id = $2`,
        [nextStatus, leaveRequestId]
      );
      logger.info(`[APPROVE LEAVE DAYS] Header status synchronized to ${nextStatus} for request ${leaveRequestId}`);
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error(`[APPROVE LEAVE DAYS] Transaction failed:`, error);
    throw error;
  } finally {
    client.release();
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

    const daysQuery = await pool.query(
      "SELECT COALESCE(SUM(CASE WHEN day_type = 'half' THEN 0.5 ELSE 1.0 END), 0) as total_days FROM leave_days WHERE leave_request_id = $1",
      [leaveRequestId]
    );
    const calculatedNoOfDays = parseFloat(daysQuery.rows[0].total_days || '0');

    sendLeaveStatusEmail(leave.employee_email, {
      employeeName: leave.employee_name || 'Employee',
      employeeEmpId: leave.employee_emp_id || '',
      recipientName: leave.employee_name || 'Employee',
      recipientRole: 'employee' as const,
      leaveType: leave.leave_type,
      startDate: leave.start_date,
      startType: leave.start_type,
      endDate: leave.end_date,
      endType: leave.end_type,
      noOfDays: calculatedNoOfDays,
      reason: leave.reason,
      approverName: leave.approver_name || 'Approver',
      approverEmpId: leave.approver_emp_id || '',
      approverRole: approverRole,
      comment: comment || null,
      status: emailStatus,
      approvedStartDate,
      approvedEndDate
    }, ccEmails.length > 0 ? ccEmails : undefined).catch((err: any) => {
      logger.error(`[EMAIL] ❌ Error sending days approval email:`, err);
    });

    logger.info(`[EMAIL] ✅ Days approval email queued for employee: ${leave.employee_email}${ccEmails.length > 0 ? ` with CC: ${ccEmails.join(', ')}` : ''}`);
  }

  logger.info(`[EMAIL] ========== EMAIL NOTIFICATION COMPLETED FOR LEAVE DAYS APPROVAL ==========`);

  // Hook: Sync Timesheet if Approved/Partially Approved
  if (emailStatus === 'approved' || emailStatus === 'partially_approved') {
    TimesheetService.syncApprovedLeave(Number(leave.employee_id), leaveRequestId).catch((e: any) => {
      logger.error(`[LEAVE] Failed to sync timesheet for leave request ${leaveRequestId}`, e);
    });
  }

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
      u.user_role as employee_role,
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

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Update individual day status if not already rejected
    if (existingStatus !== 'rejected') {
      await client.query(
        `UPDATE leave_days SET day_status = 'rejected', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [dayId]
      );

      // 2. Refund balance for this rejected day (except permission)
      if (leave.leave_type !== 'permission') {
        const refund = dayType === 'half' ? 0.5 : 1;
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
          let newLopBalance = currentLop + refund;

          if (newLopBalance > 10) {
            const cappedRefund = 10 - currentLop;
            if (cappedRefund > 0) {
              await client.query(
                `UPDATE leave_balances SET lop_balance = 10 WHERE employee_id = $1`,
                [leave.employee_id]
              );
            }
          } else {
            await client.query(
              `UPDATE leave_balances SET lop_balance = lop_balance + $1 WHERE employee_id = $2`,
              [refund, leave.employee_id]
            );
          }
        } else {
          await client.query(
            `UPDATE leave_balances SET ${balanceColumn} = ${balanceColumn} + $1 WHERE employee_id = $2`,
            [refund, leave.employee_id]
          );
        }
      }
    }

    // 3. Mark role-specific rejection fields in header
    if (approverRole === 'manager') {
      const updateResult = await client.query(
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
      if (updateResult.rowCount === 0) throw new Error('Not authorized to reject this leave');
    } else if (approverRole === 'hr') {
      await client.query(
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
      await client.query(
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

    // 4. Recalculate status within the transaction
    const daysResult = await client.query(
      'SELECT day_status, day_type FROM leave_days WHERE leave_request_id = $1',
      [leaveRequestId]
    );

    if (daysResult.rows.length > 0) {
      const approvedDaysCount = daysResult.rows
        .filter((d) => d.day_status === 'approved')
        .reduce((acc, d) => acc + (d.day_type === 'half' ? 0.5 : 1), 0);
      const rejectedDaysCount = daysResult.rows
        .filter((d) => d.day_status === 'rejected')
        .reduce((acc, d) => acc + (d.day_type === 'half' ? 0.5 : 1), 0);
      const remainingPendingCount = daysResult.rows
        .filter((d) => d.day_status !== 'approved' && d.day_status !== 'rejected')
        .reduce((acc, d) => acc + (d.day_type === 'half' ? 0.5 : 1), 0);

      const hasPending = remainingPendingCount > 0;
      const allApproved = remainingPendingCount === 0 && rejectedDaysCount === 0 && approvedDaysCount > 0;
      const allRejected = remainingPendingCount === 0 && approvedDaysCount === 0 && rejectedDaysCount > 0;

      let nextStatus: string = leave.current_status; // Default to current status if no change
      if (allApproved) {
        nextStatus = 'approved';
      } else if (allRejected && !hasPending) { // Ensure no pending days are left
        nextStatus = 'rejected';
      } else if (approvedDaysCount > 0 && (rejectedDaysCount > 0 || hasPending)) {
        nextStatus = 'partially_approved';
      } else if (approvedDaysCount === 0 && rejectedDaysCount === 0 && hasPending) {
        nextStatus = 'pending'; // All days are still pending
      }

      await client.query(
        `UPDATE leave_requests SET current_status = $1 WHERE id = $2`,
        [nextStatus, leaveRequestId]
      );
      logger.info(`[REJECT LEAVE DAY] Header status synchronized to ${nextStatus} for request ${leaveRequestId}`);
    }

    await client.query('COMMIT');
    logger.info(`[REJECT LEAVE DAY] Transaction committed successfully for request ${leaveRequestId}`);
  } catch (error: any) {
    await client.query('ROLLBACK');
    logger.error(`[REJECT LEAVE DAY] Transaction failed:`, error);
    throw error;
  } finally {
    client.release();
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
  if (!dayIds || !Array.isArray(dayIds) || dayIds.length === 0) {
    throw new Error('No days specified for rejection');
  }

  // Normalize dayIds to numbers
  const normalizedDayIds = dayIds.map(id => Number(id));

  logger.info(`[REJECT LEAVE DAYS] ========== FUNCTION CALLED ==========`);
  logger.info(`[REJECT LEAVE DAYS] Request ID: ${leaveRequestId}, Day IDs: ${normalizedDayIds.join(', ')}, Approver ID: ${approverId}, Role: ${approverRole}`);

  // Get leave request details
  const leaveResult = await pool.query(
    `SELECT 
      lr.*, 
      u.reporting_manager_id, 
      u.user_role as employee_role,
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
    'SELECT id, day_type, day_status FROM leave_days WHERE id = ANY($1::int[]) AND leave_request_id = $2',
    [normalizedDayIds, leaveRequestId]
  );

  if (daysCheck.rows.length !== normalizedDayIds.length) {
    throw new Error('One or more invalid day IDs provided');
  }

  // Filter only days that are NOT already rejected
  const daysToReject = daysCheck.rows.filter(d => d.day_status !== 'rejected');

  if (daysToReject.length === 0) {
    logger.info('[REJECT LEAVE DAYS] All selected days are already rejected. No changes needed.');
    return { message: 'Selected days are already rejected' };
  }

  const dayIdsToReject = daysToReject.map(d => d.id);
  const totalRefund = daysToReject.reduce((acc, d) => acc + (d.day_type === 'half' ? 0.5 : 1), 0);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Batch Update Status for individual days
    if (dayIdsToReject.length > 0) {
      await client.query(
        `UPDATE leave_days
         SET day_status = 'rejected'
         WHERE id = ANY($1)`,
        [dayIdsToReject]
      );

      // 2. Adjust Balance (Refund)
      if (leave.leave_type !== 'permission' && totalRefund > 0) {
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
          let newLopBalance = currentLop + totalRefund;

          if (newLopBalance > 10) {
            const cappedRefund = 10 - currentLop;
            if (cappedRefund > 0) {
              await client.query(
                `UPDATE leave_balances SET lop_balance = 10 WHERE employee_id = $1`,
                [leave.employee_id]
              );
            }
          } else {
            await client.query(
              `UPDATE leave_balances SET lop_balance = lop_balance + $1 WHERE employee_id = $2`,
              [totalRefund, leave.employee_id]
            );
          }
        } else {
          await client.query(
            `UPDATE leave_balances SET ${balanceColumn} = ${balanceColumn} + $1 WHERE employee_id = $2`,
            [totalRefund, leave.employee_id]
          );
        }
      }
    }

    // 3. Update Request Header
    const updateHeaderQuery = `
      UPDATE leave_requests 
      SET ${approverRole === 'manager' ? 'manager_approval_status' : approverRole === 'hr' ? 'hr_approval_status' : 'super_admin_approval_status'} = 'rejected',
          ${approverRole === 'manager' ? 'manager_approval_date' : approverRole === 'hr' ? 'hr_approval_date' : 'super_admin_approval_date'} = CURRENT_TIMESTAMP,
          ${approverRole === 'manager' ? 'manager_approval_comment' : approverRole === 'hr' ? 'hr_approval_comment' : 'super_admin_approval_comment'} = $1,
          ${approverRole === 'manager' ? 'manager_approved_by' : approverRole === 'hr' ? 'hr_approved_by' : 'super_admin_approved_by'} = $2,
          last_updated_by = $2,
          last_updated_by_role = $3
      WHERE id = $4
    `;
    await client.query(updateHeaderQuery, [comment, approverId, approverRole, leaveRequestId]);

    // 4. Recalculate Status within transaction
    const daysResult = await client.query(
      'SELECT day_status, day_type FROM leave_days WHERE leave_request_id = $1',
      [leaveRequestId]
    );

    if (daysResult.rows.length > 0) {
      const approvedDaysCount = daysResult.rows
        .filter((d) => d.day_status === 'approved')
        .reduce((acc, d) => acc + (d.day_type === 'half' ? 0.5 : 1), 0);
      const rejectedDaysCount = daysResult.rows
        .filter((d) => d.day_status === 'rejected')
        .reduce((acc, d) => acc + (d.day_type === 'half' ? 0.5 : 1), 0);
      const remainingPendingCount = daysResult.rows
        .filter((d) => d.day_status !== 'approved' && d.day_status !== 'rejected')
        .reduce((acc, d) => acc + (d.day_type === 'half' ? 0.5 : 1), 0);

      const hasPending = remainingPendingCount > 0;
      const allApproved = remainingPendingCount === 0 && rejectedDaysCount === 0 && approvedDaysCount > 0;
      const allRejected = remainingPendingCount === 0 && approvedDaysCount === 0 && rejectedDaysCount > 0;

      let nextStatus: string = leave.current_status;
      if (allApproved) {
        nextStatus = 'approved';
      } else if (allRejected && !hasPending) {
        nextStatus = 'rejected';
      } else if (approvedDaysCount > 0 && (rejectedDaysCount > 0 || hasPending)) {
        nextStatus = 'partially_approved';
      } else if (hasPending) {
        nextStatus = 'pending';
      }

      await client.query(
        `UPDATE leave_requests SET current_status = $1 WHERE id = $2`,
        [nextStatus, leaveRequestId]
      );
      logger.info(`[REJECT LEAVE DAYS] Header status synchronized to ${nextStatus} for request ${leaveRequestId}`);
    }

    await client.query('COMMIT');
    logger.info(`[REJECT LEAVE DAYS] Transaction committed successfully for request ${leaveRequestId}`);
  } catch (error: any) {
    await client.query('ROLLBACK');
    logger.error(`[REJECT LEAVE DAYS] Transaction failed:`, error);
    throw error;
  } finally {
    client.release();
  }

  // Get final state for email
  const finalStateResult = await pool.query(
    'SELECT current_status FROM leave_requests WHERE id = $1',
    [leaveRequestId]
  );
  const actualFinalStatus = finalStateResult.rows[0]?.current_status || 'pending';
  const emailStatus: 'approved' | 'partially_approved' | 'rejected' =
    actualFinalStatus === 'partially_approved' ? 'partially_approved' :
      actualFinalStatus === 'approved' ? 'approved' : 'rejected';

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

      const totalRequestDaysQuery = await pool.query(
        "SELECT COALESCE(SUM(CASE WHEN day_type = 'half' THEN 0.5 ELSE 1.0 END), 0) as total_days FROM leave_days WHERE leave_request_id = $1",
        [leaveRequestId]
      );
      const totalRequestDays = parseFloat(totalRequestDaysQuery.rows[0].total_days || '0');

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
        noOfDays: totalRequestDays,
        reason: leave.reason,
        approverName: leave.approver_name || 'Approver',
        approverEmpId: leave.approver_emp_id || '',
        approverRole: approverRole,
        comment: comment,
        status: emailStatus
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
      `SELECT lr.*, u.user_role as employee_role, u.email as employee_email,
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

    // Normalize selectedDayIds if provided
    const normalizedSelectedDayIds = selectedDayIds ? selectedDayIds.map(id => Number(id)) : [];

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
        nextDayStatus = normalizedSelectedDayIds.includes(Number(day.id)) ? 'approved' : 'rejected';
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
        'UPDATE leave_days SET day_status = $1, updated_at = CURRENT_TIMESTAMP, updated_by = $3 WHERE id = $2',
        [update.status, update.id, approverId]
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

      try {
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
      } catch (err: any) {
        if (err.code === '23514' || (err.message && err.message.includes('check_'))) {
          if (err.constraint === 'check_casual_non_negative' || (err.message && err.message.includes('check_casual_non_negative'))) {
            throw new Error('No casual leave balance to update');
          }
          throw new Error(`Insufficient ${leave.leave_type} leave balance to update status`);
        }
        throw err;
      }
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
             updated_at = CURRENT_TIMESTAMP,
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
             updated_at = CURRENT_TIMESTAMP,
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

    // Hook: Sync Timesheet if Approved/Partially Approved (Post-Commit)
    if (finalRequestStatus === 'approved' || finalRequestStatus === 'partially_approved') {
      TimesheetService.syncApprovedLeave(leave.employee_id, leaveRequestId).catch((e: any) => {
        logger.error(`[LEAVE] Failed to sync timesheet for leave request ${leaveRequestId}`, e);
      });
    }

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
            noOfDays: 0, // Placeholder, calculated properly below
            reason: emailLeave.reason,
            approverName: emailLeave.approver_name || 'Approver',
            approverEmpId: emailLeave.approver_emp_id || '',
            approverRole: approverRole,
            comment: newStatus === 'rejected' ? (rejectReason || null) : null,
            status: newStatus as 'approved' | 'partially_approved' | 'rejected',
            approvedStartDate,
            approvedEndDate
          };

          // Calculate days for email
          const daysResult = await pool.query(
            `SELECT COALESCE(SUM(CASE WHEN day_type = 'half' THEN 0.5 ELSE 1 END), 0) as total_days
             FROM leave_days WHERE leave_request_id = $1`,
            [leaveRequestId]
          );
          emailData.noOfDays = parseFloat(daysResult.rows[0].total_days) || 0;

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
        u.user_role AS emp_role,
        lr.applied_date,
        lr.start_date,
        lr.end_date,
        lr.leave_type,
        lr.time_for_permission_start,
        lr.time_for_permission_end,
        lr.current_status AS leave_status,
        lr.manager_approval_comment,
        lr.hr_approval_comment,
        lr.super_admin_approval_comment,
        lr.updated_at,
        manager.first_name || ' ' || COALESCE(manager.last_name, '') as manager_name,
        hr.first_name || ' ' || COALESCE(hr.last_name, '') as hr_name,
        sa.first_name || ' ' || COALESCE(sa.last_name, '') as sa_name,
        lr.manager_approval_date,
        lr.hr_approval_date,
        lr.super_admin_approval_date,
        COALESCE(SUM(CASE WHEN ld.day_status = 'approved' THEN CASE WHEN ld.day_type = 'half' THEN 0.5 ELSE 1 END ELSE 0 END), 0) AS approved_days,
        COALESCE(SUM(CASE WHEN ld.day_status = 'rejected' THEN CASE WHEN ld.day_type = 'half' THEN 0.5 ELSE 1 END ELSE 0 END), 0) AS rejected_days,
        COALESCE(SUM(CASE WHEN ld.day_status = 'pending' THEN CASE WHEN ld.day_type = 'half' THEN 0.5 ELSE 1 END ELSE 0 END), 0) AS pending_days,
        ARRAY_REMOVE(ARRAY_AGG(CASE WHEN ld.day_status = 'approved' THEN ld.leave_date END ORDER BY ld.leave_date), NULL) AS approved_dates,
        ARRAY_REMOVE(ARRAY_AGG(CASE WHEN ld.day_status = 'rejected' THEN ld.leave_date END ORDER BY ld.leave_date), NULL) AS rejected_dates
     FROM leave_requests lr
     JOIN users u ON lr.employee_id = u.id
     LEFT JOIN leave_days ld ON ld.leave_request_id = lr.id
     LEFT JOIN users manager ON lr.manager_approved_by = manager.id
     LEFT JOIN users hr ON lr.hr_approved_by = hr.id
     LEFT JOIN users sa ON lr.super_admin_approved_by = sa.id
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
     ) AND LOWER(u.user_role) IN ('intern', 'employee', 'manager')`;
    params.push(approverId);
  }
  // MANAGER: Direct Reports
  else if (normalizedRole === 'manager') {
    query += ` AND u.reporting_manager_id = $${params.length + 1} AND lr.employee_id != $${params.length + 1}`;
    params.push(approverId);
  }

  query += ` GROUP BY lr.id, u.emp_id, u.first_name, u.last_name, lr.applied_date, lr.start_date, lr.end_date, lr.leave_type, lr.time_for_permission_start, lr.time_for_permission_end, lr.current_status,
              lr.manager_approval_comment, lr.hr_approval_comment, lr.super_admin_approval_comment,
              lr.updated_at, manager.first_name, manager.last_name, hr.first_name, hr.last_name, sa.first_name, sa.last_name,
              lr.manager_approval_date, lr.hr_approval_date, lr.super_admin_approval_date, u.status, u.user_role
     ORDER BY lr.applied_date DESC, lr.updated_at DESC
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
     ) AND LOWER(u.user_role) IN ('intern', 'employee', 'manager')`;
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
      noOfDays = approvedDays > 0 ? approvedDays : (approvedDays + rejectedDays + pendingDays);
    } else if (displayStatus === 'rejected') {
      noOfDays = rejectedDays > 0 ? rejectedDays : (approvedDays + rejectedDays + pendingDays);
    } else {
      noOfDays = (approvedDays + rejectedDays + pendingDays);
    }

    // Manager can only view, HR and Super Admin can view and edit
    // No one can delete approved/rejected leaves
    const canEdit = normalizedRole === 'hr' || normalizedRole === 'super_admin';
    const canDelete = false; // Approved/rejected leaves cannot be deleted

    // Get rejection reason only if status is rejected (priority: super_admin > hr > manager)
    const rejectionReason = (displayStatus === 'rejected')
      ? (row.super_admin_approval_comment || row.hr_approval_comment || row.manager_approval_comment || null)
      : null;

    // Determine approver name and role based on latest approval date
    let approverName: string | null = null;
    let approverRole: string | null = null;

    const dates = [
      { role: 'Super Admin', date: row.super_admin_approval_date ? new Date(row.super_admin_approval_date).getTime() : 0, name: row.sa_name },
      { role: 'HR', date: row.hr_approval_date ? new Date(row.hr_approval_date).getTime() : 0, name: row.hr_name },
      { role: 'Manager', date: row.manager_approval_date ? new Date(row.manager_approval_date).getTime() : 0, name: row.manager_name }
    ];

    // Sort descending
    dates.sort((a, b) => b.date - a.date);

    if (dates[0].date > 0) {
      if (row.super_admin_approval_comment?.startsWith('Auto-approved')) {
        approverName = 'Auto Approved';
        approverRole = 'System';
      } else {
        approverName = dates[0].name;
        approverRole = dates[0].role;
      }
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
      timeForPermission: row.time_for_permission_start && row.time_for_permission_end ? {
        start: row.time_for_permission_start.toString().substring(0, 5),
        end: row.time_for_permission_end.toString().substring(0, 5)
      } : undefined,
      noOfDays,
      leaveStatus: displayStatus,
      updatedAt: row.updated_at,
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


export const updateHoliday = async (id: number, holidayDate: string, holidayName: string) => {
  logger.info(`[LEAVE SERVICE] [UPDATE HOLIDAY] ========== FUNCTION CALLED ==========`);
  logger.info(`[LEAVE SERVICE] [UPDATE HOLIDAY] ID: ${id}, Date: ${holidayDate}, Name: ${holidayName}`);

  const checkResult = await pool.query(
    'SELECT id, holiday_date FROM holidays WHERE id = $1',
    [id]
  );

  if (checkResult.rows.length === 0) {
    throw new Error('Holiday not found');
  }

  // Check if another holiday exists on the new date
  const duplicateCheck = await pool.query(
    'SELECT id FROM holidays WHERE holiday_date = $1::date AND id != $2 AND is_active = true',
    [holidayDate, id]
  );

  if (duplicateCheck.rows.length > 0) {
    throw new Error('A holiday already exists for this date');
  }

  const result = await pool.query(
    'UPDATE holidays SET holiday_date = $1, holiday_name = $2 WHERE id = $3 RETURNING id, holiday_date, holiday_name',
    [holidayDate, holidayName, id]
  );

  logger.info(`[LEAVE SERVICE] [UPDATE HOLIDAY] Holiday updated successfully - ID: ${id}`);

  // Hook: Update Holiday Logs
  TimesheetService.updateHolidayLog(
    formatDate(checkResult.rows[0].holiday_date),
    formatDate(result.rows[0].holiday_date),
    result.rows[0].holiday_name
  ).catch((e: any) => {
    logger.error(`[LEAVE] Failed to update holiday logs`, e);
  });

  return result.rows[0];
};

/**
 * Convert a leave request from LOP to Casual
 * Only for Super Admin and requires proof (doctor_note)
 */
export const convertLeaveRequestLopToCasual = async (requestId: number, adminUserId: number) => {
  logger.info(`[SERVICE] [LEAVE] [CONVERT LOP TO CASUAL] ========== FUNCTION CALLED ==========`);
  logger.info(`[SERVICE] [LEAVE] [CONVERT LOP TO CASUAL] Request ID: ${requestId}, Admin User ID: ${adminUserId}`);

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Fetch the leave request with employee details
    const requestResult = await client.query(
      `SELECT lr.*, u.id as employee_id, u.first_name, u.last_name, u.emp_id, u.email, u.reporting_manager_id
       FROM leave_requests lr
       JOIN users u ON lr.employee_id = u.id
       WHERE lr.id = $1`,
      [requestId]
    );

    if (requestResult.rows.length === 0) {
      throw new Error('Leave request not found');
    }

    const request = requestResult.rows[0];

    // 2. Validate it's an LOP request
    if (request.leave_type !== 'lop') {
      throw new Error('Only LOP leave requests can be converted to Casual leave');
    }

    // 3. Validate proof exists (doctor_note is not null)
    if (!request.doctor_note) {
      throw new Error('No proof attached. Conversion from LOP to Casual requires an uploaded document.');
    }

    const employeeId = request.employee_id;

    // Calculate days from leave_days table
    const daysResult = await client.query(
      `SELECT COALESCE(SUM(CASE WHEN day_type = 'half' THEN 0.5 ELSE 1 END), 0) as total_days
         FROM leave_days WHERE leave_request_id = $1`,
      [requestId]
    );
    const noOfDays = parseFloat(daysResult.rows[0].total_days) || 0;

    // 4. Check Casual balance
    const balanceResult = await client.query(
      'SELECT casual_balance, lop_balance FROM leave_balances WHERE employee_id = $1',
      [employeeId]
    );

    if (balanceResult.rows.length === 0) {
      throw new Error('Leave balance record not found for employee');
    }

    const previousCasualBalance = parseFloat(balanceResult.rows[0].casual_balance) || 0;
    const previousLopBalance = parseFloat(balanceResult.rows[0].lop_balance) || 0;

    if (previousCasualBalance < noOfDays) {
      throw new Error(`Insufficient Casual leave balance. Available: ${previousCasualBalance}, Required: ${noOfDays}`);
    }

    // 5. Perform balance adjustment
    const newCasualBalance = previousCasualBalance - noOfDays;
    const newLopBalance = previousLopBalance + noOfDays; // Refund LOP

    await client.query(
      'UPDATE leave_balances SET casual_balance = $1, lop_balance = $2 WHERE employee_id = $3',
      [newCasualBalance, newLopBalance, employeeId]
    );

    // 6. Update leave request type
    await client.query(
      'UPDATE leave_requests SET leave_type = $1 WHERE id = $2',
      ['casual', requestId]
    );

    // 7. Update leave days type
    await client.query(
      'UPDATE leave_days SET leave_type = $1 WHERE leave_request_id = $2',
      ['casual', requestId]
    );

    // 8. Log the conversion in an audit log (optional but good practice)
    logger.info(`[SERVICE] [LEAVE] [CONVERT LOP TO CASUAL] Successfully converted request ${requestId} for employee ${employeeId}`);

    await client.query('COMMIT');

    // 9. Send notification email - Fire and forget
    // 9. Send notification email - Fire and forget
    // (async () => {
    //   try {
    //     logger.info(`[SERVICE] [LEAVE] [CONVERT LOP TO CASUAL] Notification email skipped as per requirement`);
    //   } catch (emailError: any) {
    //     logger.error(`[SERVICE] [LEAVE] [CONVERT LOP TO CASUAL] Failed to send notification email: ${emailError.message}`);
    //   }
    // })();

    return {
      leaveRequestId: requestId,
      previousCasualBalance,
      newCasualBalance,
      previousLopBalance,
      newLopBalance
    };

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error(`[SERVICE] [LEAVE] [CONVERT LOP TO CASUAL] Error:`, error);
    throw error;
  } finally {
    client.release();
  }
};
