import { pool } from '../database/db';

export interface LeaveDay {
  date: Date;
  type: 'full' | 'half';
}

/**
 * Calculate leave days between start and end dates (inclusive, no weekend skip)
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
    
    while (currentDate <= end) {
      const year = currentDate.getFullYear();
      const month = String(currentDate.getMonth() + 1).padStart(2, '0');
      const day = String(currentDate.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      
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

