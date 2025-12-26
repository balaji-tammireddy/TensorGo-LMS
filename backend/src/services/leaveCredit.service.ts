import { pool } from '../database/db';
import { isLastWorkingDayOfMonth, hasCompleted3Years } from '../utils/leaveCredit';
import { logger } from '../utils/logger';

/**
 * Credit monthly leaves to all active employees
 * Credits 1 casual leave and 0.5 sick leave to each active employee
 */
export const creditMonthlyLeaves = async (): Promise<{ credited: number; errors: number }> => {
  const client = await pool.connect();
  let credited = 0;
  let errors = 0;

  try {
    await client.query('BEGIN');

    // Get all active employees with their leave balances
    const employeesResult = await client.query(`
      SELECT u.id, u.emp_id, u.first_name || ' ' || COALESCE(u.last_name, '') as name,
             COALESCE(lb.casual_balance, 0) as current_casual,
             COALESCE(lb.sick_balance, 0) as current_sick,
             lb.id as balance_id
      FROM users u
      LEFT JOIN leave_balances lb ON u.id = lb.employee_id
      WHERE u.status = 'active'
        AND u.role IN ('employee', 'manager', 'hr')
    `);

    for (const employee of employeesResult.rows) {
      try {
        const currentCasual = parseFloat(employee.current_casual) || 0;
        const currentSick = parseFloat(employee.current_sick) || 0;
        const newCasual = currentCasual + 1;
        const newSick = currentSick + 0.5;

        // Check if total would exceed 99 limit
        if (newCasual > 99) {
          logger.warn(`Employee ${employee.emp_id} (${employee.name}) would exceed 99 casual leave limit. Current: ${currentCasual}, Skipping credit.`);
          continue;
        }
        if (newSick > 99) {
          logger.warn(`Employee ${employee.emp_id} (${employee.name}) would exceed 99 sick leave limit. Current: ${currentSick}, Skipping credit.`);
          continue;
        }

        if (employee.balance_id) {
          // Update existing balance
          await client.query(
            `UPDATE leave_balances 
             SET casual_balance = casual_balance + 1,
                 sick_balance = sick_balance + 0.5,
                 last_updated = CURRENT_TIMESTAMP
             WHERE employee_id = $1`,
            [employee.id]
          );
        } else {
          // Create new balance record
          await client.query(
            `INSERT INTO leave_balances (employee_id, casual_balance, sick_balance, lop_balance)
             VALUES ($1, 1, 0.5, 10)`,
            [employee.id]
          );
        }

        credited++;
        logger.info(`Credited monthly leaves to employee ${employee.emp_id} (${employee.name}): +1 casual, +0.5 sick`);
      } catch (error: any) {
        errors++;
        logger.error(`Failed to credit leaves for employee ${employee.emp_id}:`, error);
      }
    }

    await client.query('COMMIT');
    logger.info(`Monthly leave credit completed. Credited: ${credited}, Errors: ${errors}`);
    
    return { credited, errors };
  } catch (error: any) {
    await client.query('ROLLBACK');
    logger.error('Monthly leave credit transaction failed:', error);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Credit 3 casual leaves to employees who complete 3 years of service
 * This should be called daily to check for anniversaries
 */
export const creditAnniversaryLeaves = async (): Promise<{ credited: number; errors: number }> => {
  const client = await pool.connect();
  let credited = 0;
  let errors = 0;
  const today = new Date();

  try {
    await client.query('BEGIN');

    // Get all active employees with their join dates and leave balances
    const employeesResult = await client.query(`
      SELECT u.id, u.emp_id, u.first_name || ' ' || COALESCE(u.last_name, '') as name,
             u.date_of_joining,
             COALESCE(lb.casual_balance, 0) as current_casual,
             lb.id as balance_id
      FROM users u
      LEFT JOIN leave_balances lb ON u.id = lb.employee_id
      WHERE u.status = 'active'
        AND u.role IN ('employee', 'manager', 'hr')
    `);

    for (const employee of employeesResult.rows) {
      try {
        const joinDate = new Date(employee.date_of_joining);
        
        // Calculate years of service
        let years = today.getFullYear() - joinDate.getFullYear();
        const monthDiff = today.getMonth() - joinDate.getMonth();
        const dayDiff = today.getDate() - joinDate.getDate();
        
        // Adjust if anniversary hasn't occurred yet this year
        if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
          years--;
        }
        
        // Check for anniversary credits (one-time bonuses)
        // 3-year anniversary: +3 casual leaves
        // 5-year anniversary: +5 casual leaves
        
        let anniversaryCredit = 0;
        let anniversaryType = '';
        let anniversaryDate: Date | null = null;
        
        // Check if today is their 3-year anniversary date
        if (years === 3) {
          const threeYearAnniversary = new Date(joinDate.getFullYear() + 3, joinDate.getMonth(), joinDate.getDate());
          const anniversaryDateStr = threeYearAnniversary.toISOString().split('T')[0];
          const todayStr = today.toISOString().split('T')[0];
          
          if (todayStr === anniversaryDateStr) {
            anniversaryCredit = 3;
            anniversaryType = '3-year';
            anniversaryDate = threeYearAnniversary;
          }
        }
        
        // Check if today is their 5-year anniversary date
        if (years === 5) {
          const fiveYearAnniversary = new Date(joinDate.getFullYear() + 5, joinDate.getMonth(), joinDate.getDate());
          const anniversaryDateStr = fiveYearAnniversary.toISOString().split('T')[0];
          const todayStr = today.toISOString().split('T')[0];
          
          if (todayStr === anniversaryDateStr) {
            anniversaryCredit = 5;
            anniversaryType = '5-year';
            anniversaryDate = fiveYearAnniversary;
          }
        }
        
        // Skip if not an anniversary date
        if (anniversaryCredit === 0) {
          continue;
        }

        // Check if anniversary credit was already given (check if last_updated was on the anniversary date)
        if (employee.balance_id && anniversaryDate) {
          const balanceCheck = await client.query(
            `SELECT last_updated, casual_balance 
             FROM leave_balances 
             WHERE employee_id = $1`,
            [employee.id]
          );

          if (balanceCheck.rows.length > 0) {
            const lastUpdated = new Date(balanceCheck.rows[0].last_updated);
            const lastUpdatedDateStr = lastUpdated.toISOString().split('T')[0];
            const anniversaryDateStr = anniversaryDate.toISOString().split('T')[0];
            
            // Skip if already credited on the anniversary date
            if (lastUpdatedDateStr === anniversaryDateStr) {
              logger.debug(`Employee ${employee.emp_id} (${employee.name}) already received ${anniversaryType} anniversary credit on ${anniversaryDateStr}. Skipping.`);
              continue;
            }
          }
        }

        // Check if total would exceed 99 limit
        const currentCasual = parseFloat(employee.current_casual) || 0;
        const newCasual = currentCasual + anniversaryCredit;

        if (newCasual > 99) {
          logger.warn(`Employee ${employee.emp_id} (${employee.name}) would exceed 99 casual leave limit. Current: ${currentCasual}, Skipping ${anniversaryType} anniversary credit.`);
          continue;
        }

        // Credit anniversary leaves
        if (employee.balance_id) {
          await client.query(
            `UPDATE leave_balances 
             SET casual_balance = casual_balance + $1,
                 last_updated = CURRENT_TIMESTAMP
             WHERE employee_id = $2`,
            [anniversaryCredit, employee.id]
          );
        } else {
          // Create new balance record with anniversary credit
          await client.query(
            `INSERT INTO leave_balances (employee_id, casual_balance, sick_balance, lop_balance)
             VALUES ($1, $2, 0, 10)`,
            [employee.id, anniversaryCredit]
          );
        }

        credited++;
        logger.info(`Credited ${anniversaryType} anniversary leaves to employee ${employee.emp_id} (${employee.name}): +${anniversaryCredit} casual leaves`);
      } catch (error: any) {
        errors++;
        logger.error(`Failed to credit anniversary leaves for employee ${employee.emp_id}:`, error);
      }
    }

    await client.query('COMMIT');
    if (credited > 0) {
      logger.info(`Anniversary leave credit completed. Credited: ${credited}, Errors: ${errors}`);
    }
    
    return { credited, errors };
  } catch (error: any) {
    await client.query('ROLLBACK');
    logger.error('Anniversary leave credit transaction failed:', error);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Process year-end leave balance adjustments
 * - Delete all unused sick leaves (reset to 0)
 * - Cap casual leaves at maximum 8 for carry forward (excess deleted)
 * - Reset LOP leaves to 0 (no carry forward) and credit yearly LOP (10 leaves)
 * This runs at the end of each calendar year (last working day of December)
 */
export const processYearEndLeaveAdjustments = async (): Promise<{ adjusted: number; errors: number }> => {
  const client = await pool.connect();
  let adjusted = 0;
  let errors = 0;

  try {
    await client.query('BEGIN');

    // Get all active employees with their leave balances
    const employeesResult = await client.query(`
      SELECT u.id, u.emp_id, u.first_name || ' ' || COALESCE(u.last_name, '') as name,
             COALESCE(lb.casual_balance, 0) as current_casual,
             COALESCE(lb.sick_balance, 0) as current_sick,
             COALESCE(lb.lop_balance, 0) as current_lop,
             lb.id as balance_id
      FROM users u
      LEFT JOIN leave_balances lb ON u.id = lb.employee_id
      WHERE u.status = 'active'
        AND u.role IN ('employee', 'manager', 'hr')
    `);

    for (const employee of employeesResult.rows) {
      try {
        const currentCasual = parseFloat(employee.current_casual) || 0;
        const currentSick = parseFloat(employee.current_sick) || 0;
        const currentLop = parseFloat(employee.current_lop) || 0;
        
        // Cap casual leaves at 8 for carry forward (delete excess)
        const carryForwardCasual = Math.min(currentCasual, 8);
        
        // Reset sick leaves to 0 (all unused sick leaves are deleted)
        const newSick = 0;
        
        // Reset LOP leaves to 0 (no carry forward) and credit yearly LOP (10 leaves)
        const yearlyLopCredit = 10;
        const newLop = yearlyLopCredit;
        
        // Only update if there are changes
        if (currentCasual !== carryForwardCasual || currentSick !== newSick || currentLop !== newLop) {
          if (employee.balance_id) {
            await client.query(
              `UPDATE leave_balances 
               SET casual_balance = $1,
                   sick_balance = $2,
                   lop_balance = $3,
                   last_updated = CURRENT_TIMESTAMP
               WHERE employee_id = $4`,
              [carryForwardCasual, newSick, newLop, employee.id]
            );
            
            const casualDeleted = currentCasual > 8 ? currentCasual - 8 : 0;
            const lopReset = currentLop > 0 ? currentLop : 0;
            logger.info(
              `Year-end adjustment for employee ${employee.emp_id} (${employee.name}): ` +
              `Casual: ${currentCasual} → ${carryForwardCasual} (${casualDeleted > 0 ? `-${casualDeleted} deleted` : 'no change'}), ` +
              `Sick: ${currentSick} → 0 (all deleted), ` +
              `LOP: ${currentLop} → ${newLop} (reset to 0, credited ${yearlyLopCredit} for new year)`
            );
          } else {
            // Create balance record if it doesn't exist
            await client.query(
              `INSERT INTO leave_balances (employee_id, casual_balance, sick_balance, lop_balance)
               VALUES ($1, $2, $3, $4)`,
              [employee.id, carryForwardCasual, newSick, newLop]
            );
          }
          
          adjusted++;
        }
      } catch (error: any) {
        errors++;
        logger.error(`Failed to adjust year-end leaves for employee ${employee.emp_id}:`, error);
      }
    }

    await client.query('COMMIT');
    if (adjusted > 0) {
      logger.info(`Year-end leave adjustments completed. Adjusted: ${adjusted}, Errors: ${errors}`);
    }
    
    return { adjusted, errors };
  } catch (error: any) {
    await client.query('ROLLBACK');
    logger.error('Year-end leave adjustment transaction failed:', error);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Check if it's the last working day of December (year-end)
 */
export const isYearEnd = (): boolean => {
  const today = new Date();
  const month = today.getMonth() + 1; // 1-indexed (December = 12)
  
  // Check if it's December and today is the last working day
  if (month === 12 && isLastWorkingDayOfMonth()) {
    return true;
  }
  
  return false;
};

/**
 * Check if it's the last working day and credit leaves for the NEXT month if needed
 * Also check for 3-year anniversaries and credit anniversary leaves
 * Process year-end adjustments at the end of December
 * This should be called daily (e.g., via cron job or scheduled task)
 * 
 * Note: Leaves for next month are credited on the last working day of current month
 * Example: On last working day of January, credit leaves for February
 */
export const checkAndCreditMonthlyLeaves = async (): Promise<void> => {
  try {
    // Check for 3-year and 5-year anniversaries first (runs daily)
    await creditAnniversaryLeaves();

    // Check for monthly leave credit (only on last working day of current month)
    // On last working day of month N, credit leaves for month N+1
    // This should run BEFORE year-end adjustments so December credits are included
    if (isLastWorkingDayOfMonth()) {
      const today = new Date();
      const currentMonth = today.getMonth() + 1; // 1-indexed
      const currentYear = today.getFullYear();
      
      // Calculate next month
      let nextMonth = currentMonth + 1;
      let nextYear = currentYear;
      if (nextMonth > 12) {
        nextMonth = 1;
        nextYear = currentYear + 1;
      }
      
      logger.info(`Last working day of ${currentMonth}/${currentYear} detected. Crediting leaves for next month (${nextMonth}/${nextYear})...`);
      
      // Check if leaves were already credited today by checking last_updated timestamp
      // This prevents duplicate credits even if the function is called multiple times (e.g., hourly checks)
      const todayStr = today.toISOString().split('T')[0];
      const checkResult = await pool.query(
        `SELECT COUNT(*) as count 
         FROM leave_balances lb
         INNER JOIN users u ON lb.employee_id = u.id
         WHERE DATE(lb.last_updated) = $1 
           AND u.status = 'active'
           AND u.role IN ('employee', 'manager', 'hr')
           AND lb.casual_balance >= 1 
           AND lb.sick_balance >= 0.5`,
        [todayStr]
      );

      // If any active employees have updated balances today with typical monthly credit values,
      // assume already credited (threshold: 1 employee to be more strict)
      // This ensures we don't credit multiple times even with hourly checks
      if (parseInt(checkResult.rows[0].count) >= 1) {
        logger.info(`Leaves for ${nextMonth}/${nextYear} already credited today (${checkResult.rows[0].count} active employees updated). Skipping to avoid double credit.`);
        return;
      }

      logger.info(`Proceeding with monthly leave credit for ${nextMonth}/${nextYear}...`);
      const result = await creditMonthlyLeaves();
      logger.info(`Monthly leave credit for ${nextMonth}/${nextYear} completed: ${result.credited} employees credited, ${result.errors} errors`);
    } else {
      logger.debug('Not the last working day of the month. Skipping monthly leave credit.');
    }
  } catch (error: any) {
    logger.error('Error in checkAndCreditMonthlyLeaves:', error);
  }
};

