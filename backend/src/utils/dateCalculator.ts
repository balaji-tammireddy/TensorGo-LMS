import { pool } from '../database/db';

export interface LeaveDay {
  date: Date;
  type: 'full' | 'half';
}

/**
 * Calculate business days between start and end dates, excluding weekends and holidays
 */
export async function calculateLeaveDays(
  startDate: Date,
  endDate: Date,
  startType: 'full' | 'half',
  endType: 'full' | 'half'
): Promise<{ days: number; leaveDays: LeaveDay[] }> {
  try {
    const leaveDays: LeaveDay[] = [];
    let days = 0;
    
    const currentDate = new Date(startDate);
    const end = new Date(endDate);
    
    // Format dates for database query and comparison (reuse same variables)
    const startDateStr = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`;
    const endDateStr = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;
    
    // Get all holidays
    const holidaysResult = await pool.query(
      'SELECT holiday_date FROM holidays WHERE is_active = true AND holiday_date >= $1::date AND holiday_date <= $2::date',
      [startDateStr, endDateStr]
    );
    const holidays = new Set(
      holidaysResult.rows.map(row => {
        const holidayDate = new Date(row.holiday_date);
        const year = holidayDate.getFullYear();
        const month = String(holidayDate.getMonth() + 1).padStart(2, '0');
        const day = String(holidayDate.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      })
    );
    
    while (currentDate <= end) {
      const dayOfWeek = currentDate.getDay();
      const year = currentDate.getFullYear();
      const month = String(currentDate.getMonth() + 1).padStart(2, '0');
      const day = String(currentDate.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      
      // Skip weekends
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        // Skip holidays
        if (!holidays.has(dateStr)) {
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
        }
      }
      
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return { days, leaveDays };
  } catch (error: any) {
    console.error('Error in calculateLeaveDays:', error);
    throw new Error(`Failed to calculate leave days: ${error.message}`);
  }
}

/**
 * Check if prior information rules are met
 * Rule: Can apply leave from 3 days after the current date (minimum 3 days notice)
 */
export function checkPriorInformation(
  startDate: Date,
  noOfDays: number
): { valid: boolean; requiredDays: number; actualDays: number } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  
  const daysUntilStart = Math.ceil((start.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  
  // Minimum 3 days notice required for all leave requests
  const requiredDays = 3;
  
  return {
    valid: daysUntilStart >= requiredDays,
    requiredDays,
    actualDays: daysUntilStart
  };
}

