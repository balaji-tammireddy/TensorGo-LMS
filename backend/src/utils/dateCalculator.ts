import { pool } from '../database/db';

export interface LeaveDay {
  date: Date;
  type: 'full' | 'half';
}

/**
 * Calculate leave days between start and end dates (inclusive, excluding weekends and holidays)
 * Saturday (6) and Sunday (0) are excluded from the count
 * Holidays from all years that the leave period spans are excluded
 */
export async function calculateLeaveDays(
  startDate: Date,
  endDate: Date,
  startType: 'full' | 'half',
  endType: 'full' | 'half',
  leaveType: string = 'casual'
): Promise<{ days: number; leaveDays: LeaveDay[] }> {
  try {
    const leaveDays: LeaveDay[] = [];
    let days = 0;

    const currentDate = new Date(startDate);
    const end = new Date(endDate);

    // Get the years that the leave period spans (could be same year or across two years)
    const startYear = startDate.getFullYear();
    const endYear = endDate.getFullYear();

    // Fetch holidays for all years that the leave spans
    // If leave spans Dec 22, 2025 to Jan 5, 2026, we need holidays for both 2025 and 2026
    let holidaysQuery: string;
    let holidaysParams: number[];

    if (startYear === endYear) {
      // Leave is within the same year
      holidaysQuery = `SELECT holiday_date FROM holidays 
                       WHERE is_active = true 
                       AND EXTRACT(YEAR FROM holiday_date) = $1
                       ORDER BY holiday_date`;
      holidaysParams = [startYear];
    } else {
      // Leave spans across two years (e.g., Dec 2025 to Jan 2026)
      holidaysQuery = `SELECT holiday_date FROM holidays 
                       WHERE is_active = true 
                       AND (EXTRACT(YEAR FROM holiday_date) = $1 OR EXTRACT(YEAR FROM holiday_date) = $2)
                       ORDER BY holiday_date`;
      holidaysParams = [startYear, endYear];
    }

    const holidaysResult = await pool.query(holidaysQuery, holidaysParams);

    // Create a Set of holiday dates for quick lookup (format: YYYY-MM-DD)
    const holidayDates = new Set<string>();
    holidaysResult.rows.forEach((row: any) => {
      const holidayDate = new Date(row.holiday_date);
      const holidayDateStr = `${holidayDate.getFullYear()}-${String(holidayDate.getMonth() + 1).padStart(2, '0')}-${String(holidayDate.getDate()).padStart(2, '0')}`;
      holidayDates.add(holidayDateStr);
    });

    // Format dates for database query and comparison (reuse same variables)
    const startDateStr = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`;
    const endDateStr = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;

    while (currentDate <= end) {
      const dayOfWeek = currentDate.getDay(); // 0 = Sunday, 6 = Saturday

      // Skip weekends (Saturday and Sunday) - UNLESS it's LOP
      if (leaveType !== 'lop' && (dayOfWeek === 0 || dayOfWeek === 6)) {
        currentDate.setDate(currentDate.getDate() + 1);
        continue;
      }

      const year = currentDate.getFullYear();
      const month = String(currentDate.getMonth() + 1).padStart(2, '0');
      const day = String(currentDate.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;

      // Skip holidays (check both current year and next year) - UNLESS it's LOP
      if (leaveType !== 'lop' && holidayDates.has(dateStr)) {
        currentDate.setDate(currentDate.getDate() + 1);
        continue;
      }

      // Compare using date strings to avoid time component issues
      if (dateStr === startDateStr && dateStr === endDateStr) {
        // Same day - start and end are the same
        if (startType === 'half' || endType === 'half') {
          leaveDays.push({ date: new Date(currentDate), type: 'half' });
          days += 0.5;
        } else {
          leaveDays.push({ date: new Date(currentDate), type: 'full' });
          days += 1;
        }
      } else if (dateStr === startDateStr) {
        // Start date
        if (startType === 'half') {
          leaveDays.push({ date: new Date(currentDate), type: 'half' });
          days += 0.5;
        } else {
          leaveDays.push({ date: new Date(currentDate), type: 'full' });
          days += 1;
        }
      } else if (dateStr === endDateStr) {
        // End date
        if (endType === 'half') {
          leaveDays.push({ date: new Date(currentDate), type: 'half' });
          days += 0.5;
        } else {
          leaveDays.push({ date: new Date(currentDate), type: 'full' });
          days += 1;
        }
      } else {
        // Middle days
        leaveDays.push({ date: new Date(currentDate), type: 'full' });
        days += 1;
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return { days, leaveDays };
  } catch (error: any) {
    console.error('Error in calculateLeaveDays:', error);
    throw new Error(`Failed to calculate leave days: ${error.message}`);
  }
}

