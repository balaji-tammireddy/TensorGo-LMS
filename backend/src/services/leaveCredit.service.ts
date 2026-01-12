import { pool } from '../database/db';
import { isLastWorkingDayOfMonth, hasCompleted3Years } from '../utils/leaveCredit';
import { logger } from '../utils/logger';
import { sendLeaveCarryForwardEmail } from '../utils/emailTemplates';

/**
 * Credit monthly leaves to all active employees
 * Credits 1 casual leave and 0.5 sick leave to each active employee
 */
export const creditMonthlyLeaves = async (): Promise<{ credited: number; errors: number }> => {
  logger.info(`[LEAVE_CREDIT] [CREDIT MONTHLY LEAVES] ========== FUNCTION CALLED ==========`);

  const client = await pool.connect();
  let credited = 0;
  let errors = 0;

  try {
    logger.info(`[LEAVE_CREDIT] [CREDIT MONTHLY LEAVES] Starting database transaction`);
    await client.query('BEGIN');
    logger.info(`[LEAVE_CREDIT] [CREDIT MONTHLY LEAVES] Transaction started`);

    // Get all active employees with their leave balances
    logger.info(`[LEAVE_CREDIT] [CREDIT MONTHLY LEAVES] Fetching all active employees`);
    const employeesResult = await client.query(`
      SELECT u.id, u.emp_id, u.first_name || ' ' || COALESCE(u.last_name, '') as name, u.status, u.role,
             COALESCE(lb.casual_balance, 0) as current_casual,
             COALESCE(lb.sick_balance, 0) as current_sick,
             lb.id as balance_id
      FROM users u
      LEFT JOIN leave_balances lb ON u.id = lb.employee_id
      WHERE u.status IN ('active', 'on_notice')
        AND u.role IN ('employee', 'manager', 'hr', 'intern')
    `);
    logger.info(`[LEAVE_CREDIT] [CREDIT MONTHLY LEAVES] Found ${employeesResult.rows.length} active employees`);

    for (const employee of employeesResult.rows) {
      try {
        const currentCasual = parseFloat(employee.current_casual) || 0;
        const currentSick = parseFloat(employee.current_sick) || 0;

        // Define credit amounts based on status and role
        // Active employees: +1 casual, +0.5 sick
        // Interns: +0.5 casual, +0.5 sick
        // On Notice employees: 0 casual, +0.5 sick

        let casualCredit = 1;
        if (employee.status === 'on_notice') {
          casualCredit = 0;
        } else if (employee.role === 'intern') {
          casualCredit = 0.5;
        }

        const sickCredit = 0.5;

        const newCasual = currentCasual + casualCredit;
        const newSick = currentSick + sickCredit;

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
             SET casual_balance = casual_balance + $1,
                 sick_balance = sick_balance + $2,
                 last_updated = CURRENT_TIMESTAMP
             WHERE employee_id = $3`,
            [casualCredit, sickCredit, employee.id]
          );
        } else {
          // Create new balance record
          await client.query(
            `INSERT INTO leave_balances (employee_id, casual_balance, sick_balance, lop_balance)
             VALUES ($1, $2, $3, 10)`,
            [employee.id, casualCredit, sickCredit]
          );
        }

        credited++;
        logger.info(`[LEAVE_CREDIT] [CREDIT MONTHLY LEAVES] Credited monthly leaves to employee ${employee.emp_id} (${employee.name}) Role: ${employee.role}, Status: ${employee.status}: +${casualCredit} casual, +${sickCredit} sick`);
      } catch (error: any) {
        errors++;
        logger.error(`[LEAVE_CREDIT] [CREDIT MONTHLY LEAVES] Failed to credit leaves for employee ${employee.emp_id}:`, error);
      }
    }

    logger.info(`[LEAVE_CREDIT] [CREDIT MONTHLY LEAVES] Committing transaction`);
    await client.query('COMMIT');
    logger.info(`[LEAVE_CREDIT] [CREDIT MONTHLY LEAVES] Transaction committed successfully`);
    logger.info(`[LEAVE_CREDIT] [CREDIT MONTHLY LEAVES] Monthly leave credit completed. Credited: ${credited}, Errors: ${errors}`);

    return { credited, errors };
  } catch (error: any) {
    await client.query('ROLLBACK');
    logger.error(`[LEAVE_CREDIT] [CREDIT MONTHLY LEAVES] Transaction rolled back - Monthly leave credit transaction failed:`, error);
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
  logger.info(`[LEAVE_CREDIT] [CREDIT ANNIVERSARY LEAVES] ========== FUNCTION CALLED ==========`);

  const client = await pool.connect();
  let credited = 0;
  let errors = 0;
  const today = new Date();
  logger.info(`[LEAVE_CREDIT] [CREDIT ANNIVERSARY LEAVES] Today's date: ${today.toISOString().split('T')[0]}`);

  try {
    logger.info(`[LEAVE_CREDIT] [CREDIT ANNIVERSARY LEAVES] Starting database transaction`);
    await client.query('BEGIN');
    logger.info(`[LEAVE_CREDIT] [CREDIT ANNIVERSARY LEAVES] Transaction started`);

    // Get all active employees with their join dates and leave balances
    logger.info(`[LEAVE_CREDIT] [CREDIT ANNIVERSARY LEAVES] Fetching all active employees with join dates`);
    const employeesResult = await client.query(`
      SELECT u.id, u.emp_id, u.first_name || ' ' || COALESCE(u.last_name, '') as name,
             u.date_of_joining,
             COALESCE(lb.casual_balance, 0) as current_casual,
             lb.id as balance_id
      FROM users u
      LEFT JOIN leave_balances lb ON u.id = lb.employee_id
      WHERE u.status IN ('active', 'on_notice')
        AND u.role IN ('employee', 'manager', 'hr', 'intern')
    `);
    logger.info(`[LEAVE_CREDIT] [CREDIT ANNIVERSARY LEAVES] Found ${employeesResult.rows.length} active employees`);

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
        logger.info(`[LEAVE_CREDIT] [CREDIT ANNIVERSARY LEAVES] Credited ${anniversaryType} anniversary leaves to employee ${employee.emp_id} (${employee.name}): +${anniversaryCredit} casual leaves`);
      } catch (error: any) {
        errors++;
        logger.error(`[LEAVE_CREDIT] [CREDIT ANNIVERSARY LEAVES] Failed to credit anniversary leaves for employee ${employee.emp_id}:`, error);
      }
    }

    logger.info(`[LEAVE_CREDIT] [CREDIT ANNIVERSARY LEAVES] Committing transaction`);
    await client.query('COMMIT');
    logger.info(`[LEAVE_CREDIT] [CREDIT ANNIVERSARY LEAVES] Transaction committed successfully`);
    if (credited > 0) {
      logger.info(`[LEAVE_CREDIT] [CREDIT ANNIVERSARY LEAVES] Anniversary leave credit completed. Credited: ${credited}, Errors: ${errors}`);
    } else {
      logger.info(`[LEAVE_CREDIT] [CREDIT ANNIVERSARY LEAVES] No anniversary credits to process today`);
    }

    return { credited, errors };
  } catch (error: any) {
    await client.query('ROLLBACK');
    logger.error(`[LEAVE_CREDIT] [CREDIT ANNIVERSARY LEAVES] Transaction rolled back - Anniversary leave credit transaction failed:`, error);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Process year-end leave balance adjustments and add January leaves
 * Step 1: Carry forward leaves
 *   - Cap casual leaves at maximum 8 for carry forward (excess deleted)
 *   - Delete all unused sick leaves (reset to 0)
 *   - Update LOP leaves to 10 at year-end (no carry forward, set to yearly credit of 10)
 * Step 2: Add January leaves
 *   - Add 1 casual leave
 *   - Add 0.5 sick leave
 * Step 3: Update total in database
 * This runs at the end of each calendar year (last working day of December at 8 PM)
 */
export const processYearEndLeaveAdjustments = async (): Promise<{ adjusted: number; errors: number }> => {
  logger.info(`[LEAVE_CREDIT] [PROCESS YEAR END ADJUSTMENTS] ========== FUNCTION CALLED ==========`);

  const client = await pool.connect();
  let adjusted = 0;
  let errors = 0;

  try {
    logger.info(`[LEAVE_CREDIT] [PROCESS YEAR END ADJUSTMENTS] Starting database transaction`);
    await client.query('BEGIN');
    logger.info(`[LEAVE_CREDIT] [PROCESS YEAR END ADJUSTMENTS] Transaction started`);

    // Get all active employees with their leave balances and email
    logger.info(`[LEAVE_CREDIT] [PROCESS YEAR END ADJUSTMENTS] Fetching all active employees with leave balances`);
    const employeesResult = await client.query(`
      SELECT u.id, u.emp_id, u.email, u.first_name || ' ' || COALESCE(u.last_name, '') as name, u.role,
             COALESCE(lb.casual_balance, 0) as current_casual,
             COALESCE(lb.sick_balance, 0) as current_sick,
             COALESCE(lb.lop_balance, 0) as current_lop,
             lb.id as balance_id
      FROM users u
      LEFT JOIN leave_balances lb ON u.id = lb.employee_id
      WHERE u.status IN ('active', 'on_notice')
        AND u.role IN ('employee', 'manager', 'hr', 'intern')
    `);
    logger.info(`[LEAVE_CREDIT] [PROCESS YEAR END ADJUSTMENTS] Found ${employeesResult.rows.length} active employees`);

    for (const employee of employeesResult.rows) {
      try {
        const currentCasual = parseFloat(employee.current_casual) || 0;
        const currentSick = parseFloat(employee.current_sick) || 0;
        const currentLop = parseFloat(employee.current_lop) || 0;

        // ============================================
        // STEP 1: CARRY FORWARD LEAVES
        // ============================================
        // Cap casual leaves at 8 for carry forward logic (base pool for carry forward)
        const eligibleForCarryForward = Math.min(currentCasual, 8);

        // Define carry forward split:
        // 1. If 1 leave is being carry forwarded then add it to casual leave.
        // 2. If more than 1 leave is being carry forwarded then add 1 to sick leave and others to casual.

        let carryForwardCasual = 0;
        let carryForwardSick = 0;

        if (eligibleForCarryForward <= 0) {
          carryForwardCasual = 0;
          carryForwardSick = 0;
        } else if (eligibleForCarryForward <= 1) {
          // Exactly 1 or less (e.g. 0.5) -> All to Casual
          carryForwardCasual = eligibleForCarryForward;
          carryForwardSick = 0;
        } else {
          // More than 1 -> 1 to Sick, rest to Casual
          carryForwardSick = 1;
          carryForwardCasual = eligibleForCarryForward - 1;
        }

        // Sick leaves are reset to the carry forward value (previosuly 0, now potentially 1)
        const afterCarryForwardSick = carryForwardSick;

        // Set LOP leaves to 10 at year-end (no carry forward, reset to yearly credit of 10)
        const afterCarryForwardLop = 10;

        // ============================================
        // STEP 2: ADD JANUARY LEAVES
        // ============================================
        // Step 2: Add January monthly credits: 
        // Active: +1 casual, +0.5 sick
        // Intern: +0.5 casual, +0.5 sick
        // On Notice: 0 casual, +0.5 sick

        let casualCredit = 1;
        if (employee.status === 'on_notice') {
          casualCredit = 0;
        } else if (employee.role === 'intern') {
          casualCredit = 0.5;
        }
        const finalCasual = carryForwardCasual + casualCredit;
        const finalSick = afterCarryForwardSick + 0.5;
        const finalLop = afterCarryForwardLop; // LOP stays at 10

        // Check if total would exceed 99 limit
        if (finalCasual > 99) {
          logger.warn(`Employee ${employee.emp_id} (${employee.name}) would exceed 99 casual leave limit after year-end. Current: ${currentCasual}, After carry forward: ${carryForwardCasual}, Final: ${finalCasual}. Skipping January credit.`);
          // Still update with carry forward only
          const finalCasualLimited = carryForwardCasual;
          const finalSickLimited = afterCarryForwardSick;

          if (employee.balance_id) {
            await client.query(
              `UPDATE leave_balances 
               SET casual_balance = $1,
                   sick_balance = $2,
                   lop_balance = $3,
                   last_updated = CURRENT_TIMESTAMP
               WHERE employee_id = $4`,
              [finalCasualLimited, finalSickLimited, finalLop, employee.id]
            );
          } else {
            await client.query(
              `INSERT INTO leave_balances (employee_id, casual_balance, sick_balance, lop_balance)
               VALUES ($1, $2, $3, $4)`,
              [employee.id, finalCasualLimited, finalSickLimited, finalLop]
            );
          }

          const casualDeleted = currentCasual > 8 ? currentCasual - 8 : 0;
          logger.info(
            `Year-end for employee ${employee.emp_id} (${employee.name}): ` +
            `Carry forward: Casual ${currentCasual} → ${carryForwardCasual} (${casualDeleted > 0 ? `-${casualDeleted} deleted` : 'no change'}), ` +
            `Sick ${currentSick} → 0 (all deleted), LOP ${currentLop} → 10. ` +
            `January credit skipped (would exceed limit). Final: Casual ${finalCasualLimited}, Sick ${finalSickLimited}, LOP ${finalLop}`
          );
        } else if (finalSick > 99) {
          logger.warn(`Employee ${employee.emp_id} (${employee.name}) would exceed 99 sick leave limit after year-end. Skipping January credit.`);
          // Still update with carry forward only
          const finalCasualLimited = carryForwardCasual;
          const finalSickLimited = afterCarryForwardSick;

          if (employee.balance_id) {
            await client.query(
              `UPDATE leave_balances 
               SET casual_balance = $1,
                   sick_balance = $2,
                   lop_balance = $3,
                   last_updated = CURRENT_TIMESTAMP
               WHERE employee_id = $4`,
              [finalCasualLimited, finalSickLimited, finalLop, employee.id]
            );
          } else {
            await client.query(
              `INSERT INTO leave_balances (employee_id, casual_balance, sick_balance, lop_balance)
               VALUES ($1, $2, $3, $4)`,
              [employee.id, finalCasualLimited, finalSickLimited, finalLop]
            );
          }

          const casualDeleted = currentCasual > 8 ? currentCasual - 8 : 0;
          logger.info(
            `Year-end for employee ${employee.emp_id} (${employee.name}): ` +
            `Carry forward: Casual ${currentCasual} → ${carryForwardCasual} (${casualDeleted > 0 ? `-${casualDeleted} deleted` : 'no change'}), ` +
            `Sick ${currentSick} → 0 (all deleted), LOP ${currentLop} → 10. ` +
            `January credit skipped (would exceed limit). Final: Casual ${finalCasualLimited}, Sick ${finalSickLimited}, LOP ${finalLop}`
          );
        } else {
          // ============================================
          // STEP 3: UPDATE TOTAL IN DATABASE
          // ============================================
          if (employee.balance_id) {
            await client.query(
              `UPDATE leave_balances 
               SET casual_balance = $1,
                   sick_balance = $2,
                   lop_balance = $3,
                   last_updated = CURRENT_TIMESTAMP
               WHERE employee_id = $4`,
              [finalCasual, finalSick, finalLop, employee.id]
            );
          } else {
            // Create balance record if it doesn't exist
            await client.query(
              `INSERT INTO leave_balances (employee_id, casual_balance, sick_balance, lop_balance)
               VALUES ($1, $2, $3, $4)`,
              [employee.id, finalCasual, finalSick, finalLop]
            );
          }

          const casualDeleted = currentCasual > 8 ? currentCasual - 8 : 0;
          logger.info(
            `Year-end for employee ${employee.emp_id} (${employee.name}): ` +
            `Step 1 - Carry forward: Casual ${currentCasual} → ${carryForwardCasual} (${casualDeleted > 0 ? `-${casualDeleted} deleted` : 'no change'}), ` +
            `Sick ${currentSick} → 0 (all deleted), LOP ${currentLop} → 10. ` +
            `Step 2 - January credit: +${casualCredit} casual, +0.5 sick. ` +
            `Step 3 - Final total: Casual ${finalCasual}, Sick ${finalSick}, LOP ${finalLop}`
          );
        }

        // Send carry forward email notification to ALL employees (even if no changes)
        // This ensures everyone receives notification about their carryforward status
        try {
          // Year-end adjustment runs on last working day of December
          // So previousYear is the current year ending, newYear is the next year
          const currentDate = new Date();
          const previousYear = currentDate.getFullYear();
          const newYear = previousYear + 1;

          // Prepare carry forward data
          const carriedForwardLeaves: { casual?: number; sick?: number; lop?: number } = {};
          if (carryForwardCasual > 0) {
            carriedForwardLeaves.casual = carryForwardCasual;
          }
          // Sick leaves are not carried forward (reset to 0)
          // LOP is not carried forward (set to 10, not from previous year)

          // Use final balances (after carry forward + January credits) for email
          await sendLeaveCarryForwardEmail(employee.email, {
            employeeName: employee.name,
            employeeEmpId: employee.emp_id,
            previousYear,
            newYear,
            carriedForwardLeaves,
            newYearBalances: {
              casual: finalCasual > 99 ? carryForwardCasual : finalCasual,
              sick: finalSick > 99 ? afterCarryForwardSick : finalSick,
              lop: finalLop
            }
          });

          logger.info(`[LEAVE_CREDIT] [PROCESS YEAR END ADJUSTMENTS] Carry forward email sent successfully to ${employee.email} (${employee.name})`);
        } catch (emailError: any) {
          logger.error(`[LEAVE_CREDIT] [PROCESS YEAR END ADJUSTMENTS] Failed to send carry forward email to ${employee.email}:`, emailError);
          // Don't fail the entire process if email fails
        }

        adjusted++;
      } catch (error: any) {
        errors++;
        logger.error(`[LEAVE_CREDIT] [PROCESS YEAR END ADJUSTMENTS] Failed to adjust year-end leaves for employee ${employee.emp_id}:`, error);
      }
    }

    logger.info(`[LEAVE_CREDIT] [PROCESS YEAR END ADJUSTMENTS] Committing transaction`);
    await client.query('COMMIT');
    logger.info(`[LEAVE_CREDIT] [PROCESS YEAR END ADJUSTMENTS] Transaction committed successfully`);
    if (adjusted > 0) {
      logger.info(`[LEAVE_CREDIT] [PROCESS YEAR END ADJUSTMENTS] Year-end leave adjustments completed (carry forward + January credits). Adjusted: ${adjusted}, Errors: ${errors}`);
    }

    return { adjusted, errors };
  } catch (error: any) {
    await client.query('ROLLBACK');
    logger.error(`[LEAVE_CREDIT] [PROCESS YEAR END ADJUSTMENTS] Transaction rolled back - Year-end leave adjustment transaction failed:`, error);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Check if it's the last working day of December (year-end)
 */
export const isYearEnd = (): boolean => {
  logger.info(`[LEAVE_CREDIT] [IS YEAR END] ========== FUNCTION CALLED ==========`);
  const today = new Date();
  const month = today.getMonth() + 1; // 1-indexed (December = 12)

  logger.info(`[LEAVE_CREDIT] [IS YEAR END] Today: ${today.toISOString().split('T')[0]}, Month: ${month}`);

  // Check if it's December and today is the last working day
  if (month === 12 && isLastWorkingDayOfMonth()) {
    logger.info(`[LEAVE_CREDIT] [IS YEAR END] Year-end detected (December + last working day)`);
    return true;
  }

  logger.info(`[LEAVE_CREDIT] [IS YEAR END] Not year-end`);
  return false;
};

/**
 * Send carryforward email notifications to all active employees
 * This can be called manually by HR/Super Admin to send carryforward emails
 * @param previousYear Optional previous year (defaults to current year - 1)
 * @param newYear Optional new year (defaults to current year)
 * @returns Promise with count of emails sent and errors
 */
export const sendCarryForwardEmailsToAll = async (
  previousYear?: number,
  newYear?: number
): Promise<{ sent: number; errors: number }> => {
  logger.info(`[LEAVE_CREDIT] [SEND CARRY FORWARD EMAILS] ========== FUNCTION CALLED ==========`);
  logger.info(`[LEAVE_CREDIT] [SEND CARRY FORWARD EMAILS] Previous Year: ${previousYear || 'auto'}, New Year: ${newYear || 'auto'}`);

  const client = await pool.connect();
  let sent = 0;
  let errors = 0;

  try {
    const currentDate = new Date();
    const prevYear = previousYear || (currentDate.getMonth() === 0 ? currentDate.getFullYear() - 1 : currentDate.getFullYear());
    const nextYear = newYear || (currentDate.getMonth() === 0 ? currentDate.getFullYear() : currentDate.getFullYear() + 1);
    logger.info(`[LEAVE_CREDIT] [SEND CARRY FORWARD EMAILS] Using years - Previous: ${prevYear}, New: ${nextYear}`);

    // Get all active employees with their leave balances and email
    logger.info(`[LEAVE_CREDIT] [SEND CARRY FORWARD EMAILS] Fetching all active employees with email addresses`);
    const employeesResult = await client.query(`
      SELECT u.id, u.emp_id, u.email, u.first_name || ' ' || COALESCE(u.last_name, '') as name,
             COALESCE(lb.casual_balance, 0) as current_casual,
             COALESCE(lb.sick_balance, 0) as current_sick,
             COALESCE(lb.lop_balance, 0) as current_lop
      FROM users u
      LEFT JOIN leave_balances lb ON u.id = lb.employee_id
      WHERE u.status IN ('active', 'on_notice')
        AND u.role IN ('employee', 'manager', 'hr', 'intern')
        AND u.email IS NOT NULL
        AND u.email != ''
    `);
    logger.info(`[LEAVE_CREDIT] [SEND CARRY FORWARD EMAILS] Found ${employeesResult.rows.length} employees with email addresses`);

    for (const employee of employeesResult.rows) {
      try {
        const currentCasual = parseFloat(employee.current_casual) || 0;
        const currentSick = parseFloat(employee.current_sick) || 0;
        const currentLop = parseFloat(employee.current_lop) || 0;

        // Cap casual leaves at 8 for carry forward (base pool)
        const eligibleForCarryForward = Math.min(currentCasual, 8);

        // Define carry forward split:
        let carryForwardCasual = 0;
        let carryForwardSick = 0;

        if (eligibleForCarryForward <= 0) {
          carryForwardCasual = 0;
          carryForwardSick = 0;
        } else if (eligibleForCarryForward <= 1) {
          carryForwardCasual = eligibleForCarryForward;
          carryForwardSick = 0;
        } else {
          carryForwardSick = 1;
          carryForwardCasual = eligibleForCarryForward - 1;
        }

        // Prepare carry forward data
        const carriedForwardLeaves: { casual?: number; sick?: number; lop?: number } = {};
        if (carryForwardCasual > 0) {
          carriedForwardLeaves.casual = carryForwardCasual;
        }
        if (carryForwardSick > 0) {
          carriedForwardLeaves.sick = carryForwardSick;
        }
        // Sick leaves are reset to the carry forward value (so effectively sick leaves "carried forward" is just this 1, if applicable)
        // logic is simpler: we are just saying these amount were carried over.

        // LOP is not carried forward (set to 10)

        await sendLeaveCarryForwardEmail(employee.email, {
          employeeName: employee.name,
          employeeEmpId: employee.emp_id,
          previousYear: prevYear,
          newYear: nextYear,
          carriedForwardLeaves,
          newYearBalances: {
            casual: carryForwardCasual,
            sick: carryForwardSick, // Sick leaves reset to carryForwardSick (0 or 1)
            lop: 10  // LOP reset to 10
          }
        });

        logger.info(`[LEAVE_CREDIT] [SEND CARRY FORWARD EMAILS] Carry forward email sent successfully to ${employee.email} (${employee.name})`);
        sent++;
      } catch (emailError: any) {
        errors++;
        logger.error(`[LEAVE_CREDIT] [SEND CARRY FORWARD EMAILS] Failed to send carry forward email to ${employee.email}:`, emailError);
      }
    }

    logger.info(`[LEAVE_CREDIT] [SEND CARRY FORWARD EMAILS] Carry forward emails sent: ${sent} successful, ${errors} errors`);
    return { sent, errors };
  } catch (error: any) {
    logger.error(`[LEAVE_CREDIT] [SEND CARRY FORWARD EMAILS] Error sending carry forward emails:`, error);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Check if it's the last working day and credit leaves for the NEXT month if needed
 * Also check for 3-year anniversaries and credit anniversary leaves
 * Process year-end adjustments at the end of December
 * This should be called daily at 8 PM (e.g., via cron job or scheduled task)
 * 
 * IMPORTANT: This function verifies it's 8 PM before processing leave credits
 * 
 * Note: Leaves for next month are credited on the last working day of current month
 * Example: On last working day of January, credit leaves for February
 */
export const checkAndCreditMonthlyLeaves = async (): Promise<void> => {
  logger.info(`[LEAVE_CREDIT] [CHECK AND CREDIT MONTHLY LEAVES] ========== FUNCTION CALLED ==========`);

  try {
    // Verify it's 8 PM before processing leave credits
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    logger.info(`[LEAVE_CREDIT] [CHECK AND CREDIT MONTHLY LEAVES] Current time: ${currentHour}:${currentMinute.toString().padStart(2, '0')}`);

    // Only allow processing between 8:00 PM and 8:59 PM
    if (currentHour !== 20) {
      logger.warn(`[LEAVE_CREDIT] [CHECK AND CREDIT MONTHLY LEAVES] Leave credit check called at ${currentHour}:${currentMinute.toString().padStart(2, '0')}. Only runs at 8 PM. Skipping.`);
      return;
    }

    logger.info(`[LEAVE_CREDIT] [CHECK AND CREDIT MONTHLY LEAVES] 8 PM verified (${currentHour}:${currentMinute.toString().padStart(2, '0')}). Proceeding with leave credit checks...`);

    // Check for 3-year and 5-year anniversaries first (runs daily at 8 PM)
    logger.info(`[LEAVE_CREDIT] [CHECK AND CREDIT MONTHLY LEAVES] Checking for anniversary credits`);
    await creditAnniversaryLeaves();

    // Check for year-end adjustments (last working day of December)
    // This runs FIRST and includes: Step 1 - Carry forward, Step 2 - January credits, Step 3 - Update total
    if (isYearEnd()) {
      logger.info(`[LEAVE_CREDIT] [CHECK AND CREDIT MONTHLY LEAVES] Last working day of December detected. Processing year-end adjustments (carry forward + January credits)...`);

      // Check if adjustments were already processed today at 8 PM
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      const checkResult = await pool.query(
        `SELECT COUNT(*) as count 
         FROM leave_balances lb
         INNER JOIN users u ON lb.employee_id = u.id
         WHERE DATE(lb.last_updated) = $1 
           AND EXTRACT(HOUR FROM lb.last_updated) >= 19
           AND u.status IN ('active', 'on_notice')
           AND u.role IN ('employee', 'manager', 'hr', 'intern')
           AND lb.sick_balance >= 0.5`, // Check for January credit (sick should be 0.5 after year-end)
        [todayStr]
      );

      // If any active employees have been updated today after 7:30 PM with January credits, assume already processed
      if (parseInt(checkResult.rows[0].count) >= 1) {
        logger.info(`[LEAVE_CREDIT] [CHECK AND CREDIT MONTHLY LEAVES] Year-end adjustments (carry forward + January credits) appear to have been processed today at 8 PM (${checkResult.rows[0].count} active employees updated). Skipping to avoid double processing.`);
      } else {
        logger.info(`[LEAVE_CREDIT] [CHECK AND CREDIT MONTHLY LEAVES] Proceeding with year-end leave adjustments (carry forward + January credits)...`);
        const result = await processYearEndLeaveAdjustments();
        logger.info(`[LEAVE_CREDIT] [CHECK AND CREDIT MONTHLY LEAVES] Year-end adjustments completed: ${result.adjusted} employees adjusted (carry forward + January credits), ${result.errors} errors`);
      }
    } else if (isLastWorkingDayOfMonth()) {
      // Regular monthly credit (for months other than December)
      // On last working day of month N, credit leaves for month N+1
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

      logger.info(`[LEAVE_CREDIT] [CHECK AND CREDIT MONTHLY LEAVES] Last working day of ${currentMonth}/${currentYear} detected. Crediting leaves for next month (${nextMonth}/${nextYear})...`);

      // Check if leaves were already credited today at 8 PM by checking last_updated timestamp
      // This prevents duplicate credits even if the function is called multiple times
      // We check for updates after 7:30 PM today to ensure it was credited at 8 PM
      const todayStr = today.toISOString().split('T')[0];
      logger.info(`[LEAVE_CREDIT] [CHECK AND CREDIT MONTHLY LEAVES] Checking if leaves already credited today`);
      const checkResult = await pool.query(
        `SELECT COUNT(*) as count 
         FROM leave_balances lb
         INNER JOIN users u ON lb.employee_id = u.id
         WHERE DATE(lb.last_updated) = $1 
           AND EXTRACT(HOUR FROM lb.last_updated) >= 19
           AND u.status IN ('active', 'on_notice')
           AND u.role IN ('employee', 'manager', 'hr', 'intern')
           AND lb.casual_balance >= 1 
           AND lb.sick_balance >= 0.5`,
        [todayStr]
      );

      // If any active employees have updated balances today after 7:30 PM with typical monthly credit values,
      // assume already credited at 8 PM (threshold: 1 employee to be more strict)
      // This ensures we don't credit multiple times even if the function is called multiple times
      if (parseInt(checkResult.rows[0].count) >= 1) {
        logger.info(`[LEAVE_CREDIT] [CHECK AND CREDIT MONTHLY LEAVES] Leaves for ${nextMonth}/${nextYear} already credited today at 8 PM (${checkResult.rows[0].count} active employees updated). Skipping to avoid double credit.`);
      } else {
        logger.info(`[LEAVE_CREDIT] [CHECK AND CREDIT MONTHLY LEAVES] Proceeding with monthly leave credit for ${nextMonth}/${nextYear}...`);
        const result = await creditMonthlyLeaves();
        logger.info(`[LEAVE_CREDIT] [CHECK AND CREDIT MONTHLY LEAVES] Monthly leave credit for ${nextMonth}/${nextYear} completed: ${result.credited} employees credited, ${result.errors} errors`);
      }
    } else {
      logger.info(`[LEAVE_CREDIT] [CHECK AND CREDIT MONTHLY LEAVES] Not the last working day of the month. Skipping monthly leave credit.`);
    }
  } catch (error: any) {
    logger.error(`[LEAVE_CREDIT] [CHECK AND CREDIT MONTHLY LEAVES] Error in checkAndCreditMonthlyLeaves:`, error);
  }
};

