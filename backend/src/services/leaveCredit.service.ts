import { pool } from '../database/db';
import { isLastWorkingDayOfMonth } from '../utils/leaveCredit';
import { logger } from '../utils/logger';
import { sendLeaveCarryForwardEmail } from '../utils/emailTemplates';

import { getAllPolicies } from './leaveRule.service';

/**
 * Credit monthly leaves to all active employees
 * Credits leaves based on role configuration (annual_credit divided by 12)
 */
export const creditMonthlyLeaves = async (): Promise<{ credited: number; errors: number }> => {
  logger.info(`[LEAVE_CREDIT] [CREDIT MONTHLY LEAVES] ========== FUNCTION CALLED ==========`);

  const client = await pool.connect();
  let credited = 0;
  let errors = 0;

  try {
    // Fetch all policies first
    const allPolicies = await getAllPolicies();
    const policyMap: Record<string, Record<string, any>> = {};

    allPolicies.forEach(p => {
      if (!policyMap[p.role]) policyMap[p.role] = {};
      if (p.leave_type_code) {
        policyMap[p.role][p.leave_type_code] = p;
      }
    });

    logger.info(`[LEAVE_CREDIT] [CREDIT MONTHLY LEAVES] Starting database transaction`);
    await client.query('BEGIN');

    // Get all active employees with their leave balances
    // Excluding super_admin as they don't apply for leaves
    const employeesResult = await client.query(`
      SELECT u.id, u.emp_id, u.first_name || ' ' || COALESCE(u.last_name, '') as name, u.status, u.user_role as role,
             u.date_of_joining,
             COALESCE(lb.casual_balance, 0) as current_casual,
             COALESCE(lb.sick_balance, 0) as current_sick,
             lb.id as balance_id
      FROM users u
      LEFT JOIN leave_balances lb ON u.id = lb.employee_id
      WHERE u.status IN ('active', 'on_notice')
        AND u.user_role IN ('employee', 'manager', 'hr', 'intern')
    `);
    logger.info(`[LEAVE_CREDIT] [CREDIT MONTHLY LEAVES] Found ${employeesResult.rows.length} active employees`);

    for (const employee of employeesResult.rows) {
      try {
        // Get policies for this role
        const rolePolicies = policyMap[employee.role] || {};
        const casualPolicy = rolePolicies['casual'];
        const sickPolicy = rolePolicies['sick'];

        // Note: annual_credit is divided by 12 for monthly credit
        let casualCredit = casualPolicy ? (parseFloat(casualPolicy.annual_credit) / 12) : (employee.role === 'intern' ? 0.5 : 1);
        let sickCredit = sickPolicy ? (parseFloat(sickPolicy.annual_credit) / 12) : 0.5;

        // -- Anniversary Bonus Logic --
        const now = new Date();
        const currentMonth = now.getMonth() + 1; // 1-indexed (Jan=1, ..., Dec=12)

        if (casualPolicy && employee.date_of_joining) {
          const joinDate = new Date(employee.date_of_joining);

          // Calculate years of service
          let years = now.getFullYear() - joinDate.getFullYear();
          const mDiff = now.getMonth() - joinDate.getMonth();
          const dDiff = now.getDate() - joinDate.getDate();
          if (mDiff < 0 || (mDiff === 0 && dDiff < 0)) {
            years--;
          }

          const bonus3Val = parseFloat(casualPolicy.anniversary_3_year_bonus) || 0;
          const bonus5Val = parseFloat(casualPolicy.anniversary_5_year_bonus) || 0;

          const isBonus3Month = [4, 8, 12].includes(currentMonth);
          // half-yearly: Jun(6), Dec(12)
          const isHalfYearEnd = [6, 12].includes(currentMonth);

          if (years >= 5) {
            // Only 5-year bonus applies (twice a year)
            if (isHalfYearEnd) {
              casualCredit += bonus5Val;
              logger.info(`[LEAVE_CREDIT] [BONUS] Adding 5-year half-yearly bonus (+${bonus5Val}) for ${employee.emp_id}`);
            }
          } else if (years >= 3) {
            // Only 3-year bonus applies (three times a year)
            if (isBonus3Month) {
              casualCredit += bonus3Val;
              logger.info(`[LEAVE_CREDIT] [BONUS] Adding 3-year bonus (+${bonus3Val}) for ${employee.emp_id}`);
            }
          }
        }

        // All active and on_notice employees get standard accrual
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
          // LOP starts at 0 for new employees as it is only added at year end
          await client.query(
            `INSERT INTO leave_balances (employee_id, casual_balance, sick_balance, lop_balance)
             VALUES ($1, $2, $3, 0)`,
            [employee.id, casualCredit, sickCredit]
          );
        }

        credited++;
        logger.info(`[LEAVE_CREDIT] [CREDIT MONTHLY LEAVES] Credited leaves to ${employee.emp_id}: +${casualCredit.toFixed(2)} casual, +${sickCredit.toFixed(2)} sick`);
      } catch (error: any) {
        errors++;
        logger.error(`[LEAVE_CREDIT] [CREDIT MONTHLY LEAVES] Failed for ${employee.emp_id}:`, error);
      }
    }

    await client.query('COMMIT');
    logger.info(`[LEAVE_CREDIT] [CREDIT MONTHLY LEAVES] Completed. Credited: ${credited}, Errors: ${errors}`);

    return { credited, errors };
  } catch (error: any) {
    if (client) await client.query('ROLLBACK');
    logger.error(`[LEAVE_CREDIT] [CREDIT MONTHLY LEAVES] Failed:`, error);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Credit anniversary leaves to employees based on policy
 */


/**
 * Process year-end leave balance adjustments
 */
export const processYearEndLeaveAdjustments = async (): Promise<{ adjusted: number; errors: number }> => {
  logger.info(`[LEAVE_CREDIT] [PROCESS YEAR END ADJUSTMENTS] ========== FUNCTION CALLED ==========`);

  const client = await pool.connect();
  let adjusted = 0;
  let errors = 0;

  try {
    const allPolicies = await getAllPolicies();
    const policyMap: Record<string, Record<string, any>> = {};
    allPolicies.forEach(p => {
      if (!policyMap[p.role]) policyMap[p.role] = {};
      if (p.leave_type_code) policyMap[p.role][p.leave_type_code] = p;
    });

    const employeesResult = await client.query(`
      SELECT u.id, u.emp_id, u.email, u.first_name || ' ' || COALESCE(u.last_name, '') as name, u.user_role as role,
             u.date_of_joining,
             COALESCE(lb.casual_balance, 0) as current_casual,
             COALESCE(lb.sick_balance, 0) as current_sick,
             COALESCE(lb.lop_balance, 0) as current_lop,
             lb.id as balance_id
      FROM users u
      LEFT JOIN leave_balances lb ON u.id = lb.employee_id
      WHERE u.status IN ('active', 'on_notice')
        AND u.user_role IN ('employee', 'manager', 'hr', 'intern')
    `);

    for (const employee of employeesResult.rows) {
      try {
        // Start a sub-transaction for each employee
        await client.query('BEGIN');

        const currentCasual = parseFloat(employee.current_casual) || 0;
        const rolePolicies = policyMap[employee.role] || {};
        const casualPolicy = rolePolicies['casual'];
        const sickPolicy = rolePolicies['sick'];

        const maxCarryForward = casualPolicy ? parseFloat(casualPolicy.carry_forward_limit) : 8;
        const eligibleForCarryForward = Math.min(currentCasual, maxCarryForward);

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

        const afterCarryForwardSick = carryForwardSick;

        // LOP: Reset to annual credit value rather than adding to it to avoid constraint violations
        const lopPolicy = rolePolicies['lop'];
        const lopAnnualCredit = lopPolicy ? parseFloat(lopPolicy.annual_credit) : 10;
        const afterCarryForwardLop = lopAnnualCredit;

        // Note: annual_credit is divided by 12 for monthly credit
        let casualCredit = casualPolicy ? (parseFloat(casualPolicy.annual_credit) / 12) : 1;
        let sickCredit = sickPolicy ? (parseFloat(sickPolicy.annual_credit) / 12) : 0.5;

        // -- anniversary bonus logic (for Dec 31st) --
        if (casualPolicy && employee.date_of_joining) {
          const now = new Date();
          const joinDate = new Date(employee.date_of_joining);
          let years = now.getFullYear() - joinDate.getFullYear();
          const mDiff = now.getMonth() - joinDate.getMonth();
          const dDiff = now.getDate() - joinDate.getDate();
          if (mDiff < 0 || (mDiff === 0 && dDiff < 0)) years--;

          const bonus3Val = parseFloat(casualPolicy.anniversary_3_year_bonus) || 0;
          const bonus5Val = parseFloat(casualPolicy.anniversary_5_year_bonus) || 0;

          if (years >= 5) {
            casualCredit += bonus5Val;
            logger.info(`[LEAVE_CREDIT] [YEAR-END BONUS] Adding 5-year half-yearly bonus (+${bonus5Val}) for ${employee.emp_id}`);
          } else if (years >= 3) {
            casualCredit += bonus3Val;
            logger.info(`[LEAVE_CREDIT] [YEAR-END BONUS] Adding 3-year bonus (+${bonus3Val}) for ${employee.emp_id}`);
          }
        }

        // Fallback for interns if policy missing
        if (employee.role === 'intern' && !casualPolicy) casualCredit = 0.5;

        const finalCasual = carryForwardCasual + casualCredit;
        const finalSick = afterCarryForwardSick + sickCredit;
        const finalLop = afterCarryForwardLop;

        if (employee.balance_id) {
          await client.query(
            `UPDATE leave_balances 
             SET casual_balance = $1, sick_balance = $2, lop_balance = $3, last_updated = CURRENT_TIMESTAMP
             WHERE employee_id = $4`,
            [finalCasual, finalSick, finalLop, employee.id]
          );
        } else {
          await client.query(
            `INSERT INTO leave_balances (employee_id, casual_balance, sick_balance, lop_balance)
             VALUES ($1, $2, $3, $4)`,
            [employee.id, finalCasual, finalSick, finalLop]
          );
        }

        await client.query('COMMIT');

        try {
          const currentDate = new Date();
          const previousYear = currentDate.getFullYear();
          const newYear = previousYear + 1;
          const carriedForwardLeaves: { casual?: number; sick?: number; lop?: number } = {};
          if (carryForwardCasual > 0) carriedForwardLeaves.casual = carryForwardCasual;

          await sendLeaveCarryForwardEmail(employee.email, {
            employeeName: employee.name,
            employeeEmpId: employee.emp_id,
            previousYear,
            newYear,
            carriedForwardLeaves,
            newYearBalances: { casual: finalCasual, sick: finalSick, lop: finalLop }
          });
        } catch (emailError: any) {
          logger.error(`[LEAVE_CREDIT] Email failed for ${employee.email}:`, emailError);
        }

        adjusted++;
      } catch (error: any) {
        await client.query('ROLLBACK');
        errors++;
        logger.error(`[LEAVE_CREDIT] Year-end failed for employee ${employee.emp_id}:`, error);
      }
    }

    return { adjusted, errors };
  } catch (error: any) {
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Check if it's the last working day of December
 */
export const isYearEnd = (): boolean => {
  const today = new Date();
  const month = today.getMonth() + 1;
  return (month === 12 && isLastWorkingDayOfMonth());
};

/**
 * Send carryforward email notifications to all active employees
 */
export const sendCarryForwardEmailsToAll = async (
  previousYear?: number,
  newYear?: number
): Promise<{ sent: number; errors: number }> => {
  const client = await pool.connect();
  let sent = 0;
  let errors = 0;

  try {
    const allPolicies = await getAllPolicies();
    const policyMap: Record<string, Record<string, any>> = {};
    allPolicies.forEach(p => {
      if (!policyMap[p.role]) policyMap[p.role] = {};
      if (p.leave_type_code) policyMap[p.role][p.leave_type_code] = p;
    });

    const currentDate = new Date();
    const prevYear = previousYear || (currentDate.getMonth() === 0 ? currentDate.getFullYear() - 1 : currentDate.getFullYear());
    const nextYear = newYear || (currentDate.getMonth() === 0 ? currentDate.getFullYear() : currentDate.getFullYear() + 1);

    const employeesResult = await client.query(`
      SELECT u.id, u.emp_id, u.email, u.first_name || ' ' || COALESCE(u.last_name, '') as name, u.user_role as role,
             COALESCE(lb.casual_balance, 0) as current_casual,
             COALESCE(lb.sick_balance, 0) as current_sick,
             COALESCE(lb.lop_balance, 0) as current_lop
      FROM users u
      LEFT JOIN leave_balances lb ON u.id = lb.employee_id
      WHERE u.status IN ('active', 'on_notice')
        AND u.user_role IN ('employee', 'manager', 'hr', 'intern')
        AND u.email IS NOT NULL AND u.email != ''
    `);

    for (const employee of employeesResult.rows) {
      try {
        const currentCasual = parseFloat(employee.current_casual) || 0;
        const rolePolicies = policyMap[employee.role] || {};
        const casualPolicy = rolePolicies['casual'];

        const maxCarryForward = casualPolicy ? parseFloat(casualPolicy.carry_forward_limit) : 8;
        const eligibleForCarryForward = Math.min(currentCasual, maxCarryForward);

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

        const carriedForwardLeaves: { casual?: number; sick?: number; lop?: number } = {};
        if (carryForwardCasual > 0) carriedForwardLeaves.casual = carryForwardCasual;
        if (carryForwardSick > 0) carriedForwardLeaves.sick = carryForwardSick;

        const lopPolicy = rolePolicies['lop'];
        const lopAnnualCredit = lopPolicy ? parseFloat(lopPolicy.annual_credit) : 10;
        const emailLopBalance = (parseFloat(employee.current_lop) || 0) + lopAnnualCredit;

        await sendLeaveCarryForwardEmail(employee.email, {
          employeeName: employee.name,
          employeeEmpId: employee.emp_id,
          previousYear: prevYear,
          newYear: nextYear,
          carriedForwardLeaves,
          newYearBalances: {
            casual: carryForwardCasual,
            sick: carryForwardSick,
            lop: emailLopBalance
          }
        });
        sent++;
      } catch (emailError: any) {
        errors++;
      }
    }
    return { sent, errors };
  } finally {
    client.release();
  }
};

/**
 * Main function to check and credit leaves
 */
export const checkAndCreditMonthlyLeaves = async (): Promise<void> => {
  logger.info(`[LEAVE_CREDIT] [CHECK AND CREDIT MONTHLY LEAVES] ========== FUNCTION CALLED ==========`);
  try {
    const now = new Date();
    if (now.getHours() !== 20) {
      // Allow execution if we provide a force flag or for testing, 
      // but for automated check, we still stick to 8 PM hour unless specifically called.
      // However, the caller (server.ts) already does the hour check.
    }



    if (isYearEnd()) {
      const today = new Date().toISOString().split('T')[0];
      const checkResult = await pool.query(
        `SELECT COUNT(*) FROM leave_balances lb INNER JOIN users u ON lb.employee_id = u.id
         WHERE DATE(lb.last_updated) = $1 AND EXTRACT(HOUR FROM lb.last_updated) >= 19
           AND u.user_role IN ('employee', 'manager', 'hr', 'intern')`,
        [today]
      );

      if (parseInt(checkResult.rows[0].count) < 1) {
        await processYearEndLeaveAdjustments();
      }
    } else if (isLastWorkingDayOfMonth()) {
      const today = new Date().toISOString().split('T')[0];
      const checkResult = await pool.query(
        `SELECT COUNT(*) FROM leave_balances lb INNER JOIN users u ON lb.employee_id = u.id
         WHERE DATE(lb.last_updated) = $1 AND EXTRACT(HOUR FROM lb.last_updated) >= 19
           AND u.user_role IN ('employee', 'manager', 'hr', 'intern')`,
        [today]
      );

      if (parseInt(checkResult.rows[0].count) < 1) {
        await creditMonthlyLeaves();
      }
    }
  } catch (error: any) {
    logger.error(`[LEAVE_CREDIT] checkAndCreditMonthlyLeaves failed:`, error);
  }
};
