/**
 * Utility functions for leave credit calculations
 */

/**
 * Get the last working day (Monday-Friday) of a given month
 * @param year - Year (e.g., 2025)
 * @param month - Month (1-indexed: 1 = January, 12 = December)
 */
export function getLastWorkingDayOfMonth(year: number, month: number): Date {
  // Get last day of the month (month is 1-indexed, so month gives us the last day of previous month)
  const lastDay = new Date(year, month, 0); // This gives us the last day of the month
  const dayOfWeek = lastDay.getDay(); // 0 = Sunday, 1 = Monday, ..., 5 = Friday, 6 = Saturday

  let daysToSubtract = 0;
  if (dayOfWeek === 0) {
    // Last day is Sunday, go back 2 days to get Friday
    daysToSubtract = 2;
  } else if (dayOfWeek === 6) {
    // Last day is Saturday, go back 1 day to get Friday
    daysToSubtract = 1;
  } else {
    // Last day is Monday (1) through Friday (5), it's already a working day
    daysToSubtract = 0;
  }

  const lastWorkingDay = new Date(year, month - 1, lastDay.getDate() - daysToSubtract);
  return lastWorkingDay;
}

/**
 * Check if today is the last working day (Monday-Friday) of the current month
 */
export function isLastWorkingDayOfMonth(): boolean {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1; // Convert to 1-indexed

  const lastWorkingDay = getLastWorkingDayOfMonth(year, month);

  // Compare dates (year, month, day) ignoring time
  return (
    today.getFullYear() === lastWorkingDay.getFullYear() &&
    today.getMonth() === lastWorkingDay.getMonth() &&
    today.getDate() === lastWorkingDay.getDate()
  );
}

/**
 * Calculate initial leave credits based on join date
 * @param joinDate - Employee's date of joining (YYYY-MM-DD format or Date object)
 * @returns Object with casual and sick leave credits
 */
export function calculateInitialLeaveCredits(joinDate: string | Date): { casual: number; sick: number } {
  const date = typeof joinDate === 'string' ? new Date(joinDate) : joinDate;
  const dayOfMonth = date.getDate();

  // As per requirement, disable auto-add on joining. 
  // All employees start with 0 casual and 0 sick leaves.
  return { casual: 0, sick: 0 };
}

/**
 * Calculate all leave credits for an employee based on their join date
 * This includes initial credits, monthly credits, anniversary credits, and year-end adjustments
 * Year-end adjustments are applied: casual capped at 8, sick reset to 0
 * @param joinDate - Employee's date of joining (YYYY-MM-DD format or Date object)
 * @param checkDate - Date to check against (defaults to today)
 * @returns Object with total casual and sick leave credits
 */
export function calculateAllLeaveCredits(joinDate: string | Date, checkDate: Date = new Date()): { casual: number; sick: number } {
  const join = typeof joinDate === 'string' ? new Date(joinDate) : joinDate;
  const today = checkDate;

  // System start date: January 1, 2020
  // All leave credits are calculated from this date onwards, regardless of join date
  const systemStartDate = new Date(2020, 0, 1); // January 1, 2020

  // Original join date (for anniversary calculations)
  const originalJoinYear = join.getFullYear();
  const originalJoinMonth = join.getMonth() + 1; // 1-indexed
  const originalJoinDay = join.getDate();

  // Effective join date for credit calculations (start from 2020 if joined before)
  const effectiveJoinDate = join < systemStartDate ? systemStartDate : join;
  const joinYear = effectiveJoinDate.getFullYear();
  const joinMonth = effectiveJoinDate.getMonth() + 1; // 1-indexed
  const joinDay = effectiveJoinDate.getDate();

  // Start with 0 - we'll calculate everything year by year from 2020 onwards
  let casual = 0;
  let sick = 0;

  // Process year by year to apply year-end adjustments correctly
  // Start from 2020 (system start year) or join year, whichever is later
  const startYear = Math.max(2020, joinYear);
  for (let year = startYear; year <= today.getFullYear(); year++) {
    const isJoinYear = year === joinYear;
    const isCurrentYear = year === today.getFullYear();

    // Calculate credits for this year
    let yearCasual = 0;
    let yearSick = 0;

    // Add initial credits only in join year (use effective join date)
    // Initial credits are given immediately when employee joins
    if (isJoinYear) {
      const initialCredits = calculateInitialLeaveCredits(effectiveJoinDate);
      yearCasual += initialCredits.casual;
      yearSick += initialCredits.sick;
    }

    // Determine which months to process for this year
    // Monthly credits start from the month AFTER join month (next month logic applies)
    const startMonth = isJoinYear ? joinMonth + 1 : 1;

    // Calculate end month: include next month if today is on or after the last working day of current month
    let endMonth = isCurrentYear ? today.getMonth() + 1 : 12;
    if (isCurrentYear) {
      const currentMonth = today.getMonth() + 1;
      const lastWorkingDayOfCurrentMonth = getLastWorkingDayOfMonth(year, currentMonth);
      // Compare dates (year, month, day) ignoring time
      const lastWorkingDayDate = new Date(lastWorkingDayOfCurrentMonth.getFullYear(), lastWorkingDayOfCurrentMonth.getMonth(), lastWorkingDayOfCurrentMonth.getDate());
      const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      // If today is on or after the last working day of current month, include next month's credits
      if (lastWorkingDayDate <= todayDate) {
        endMonth = currentMonth + 1;
      }
    }

    // Calculate monthly credits for this year
    // Note: Leaves for month M are credited on the last working day of month M-1
    // So if last working day of month M-1 has passed, month M's leaves have been credited
    // This logic applies from the month AFTER join month
    for (let month = startMonth; month <= endMonth; month++) {
      // For month M, check if last working day of month M-1 has passed
      let previousMonth = month - 1;
      let previousYear = year;

      if (previousMonth === 0) {
        // If checking January, previous month is December of previous year
        previousMonth = 12;
        previousYear = year - 1;
      }

      const lastWorkingDayOfPreviousMonth = getLastWorkingDayOfMonth(previousYear, previousMonth);

      // For current year and current month, check if last working day of previous month has passed
      // If today is the last working day of previous month, next month's leaves are credited today
      if (isCurrentYear && month === today.getMonth() + 1) {
        // Check if last working day of previous month has passed
        // Compare dates by comparing date strings (YYYY-MM-DD format)
        const lastWorkingDayStr = lastWorkingDayOfPreviousMonth.toISOString().split('T')[0];
        const todayStr = today.toISOString().split('T')[0];

        // Include if last working day has passed or is today
        // The credits are given on the last working day, so if today IS the last working day, include it
        if (lastWorkingDayStr <= todayStr) {
          yearCasual += 1;
          yearSick += 0.5;
        }
      } else if (isCurrentYear && month > today.getMonth() + 1) {
        // For future months (next month), check if the last working day of current month has passed
        // Credits are given on the last working day, so include them if last working day has passed
        const currentMonth = today.getMonth() + 1;
        const lastWorkingDayOfCurrentMonth = getLastWorkingDayOfMonth(year, currentMonth);
        const lastWorkingDayStr = lastWorkingDayOfCurrentMonth.toISOString().split('T')[0];
        const todayStr = today.toISOString().split('T')[0];

        // Include next month's credits if last working day of current month has passed or is today
        // But for calculation purposes, only include if it has passed (not if today IS the last working day)
        // This ensures that on the last working day itself, we don't include next month's credits yet
        if (lastWorkingDayStr < todayStr) {
          yearCasual += 1;
          yearSick += 0.5;
        }
      } else {
        // Regular monthly credit (last working day of previous month has already passed)
        yearCasual += 1;
        yearSick += 0.5;
      }
    }

    // -- Anniversary Bonus Logic (New Recurring Policy) --
    // Quarterly: Mar(3), Jun(6), Sep(9), Dec(12)
    // Half-yearly: Jun(6), Dec(12)

    // Process month by month to apply bonuses in specific months
    for (let month = 1; month <= 12; month++) {
      // Skip if this month hasn't been processed in the monthly credit loop above 
      // OR if it's the current year and the month is in the future.
      // However, the loop above (lines 135-182) handles monthly credits.
      // Anniversary bonuses are added ON TOP of those credits in specific months.

      // We need to know if the month 'month' in year 'year' has passed.
      const isPastMonth = !isCurrentYear || (month < today.getMonth() + 1);
      const isCurrentMonth = isCurrentYear && (month === today.getMonth() + 1);

      if (isPastMonth || isCurrentMonth) {
        // Special case for current month: check if it's the last working day
        if (isCurrentMonth) {
          const lastWorkingDay = getLastWorkingDayOfMonth(year, month);
          if (today < lastWorkingDay) continue; // Not yet credited
        }

        // Calculate years of service at that point in time
        // For simplicity, we check if they have completed X years by the end of that month
        const endOfMonth = new Date(year, month, 0);
        let yearsAtMonthEnd = endOfMonth.getFullYear() - originalJoinYear;
        const mDiff = endOfMonth.getMonth() - (originalJoinMonth - 1);
        const dDiff = endOfMonth.getDate() - originalJoinDay;
        if (mDiff < 0 || (mDiff === 0 && dDiff < 0)) {
          yearsAtMonthEnd--;
        }

        const isBonus3Month = [4, 8, 12].includes(month);
        const isHalfYearEnd = [6, 12].includes(month);

        // We need the bonus values from policy, but this utility (calculateAllLeaveCredits) 
        // currently uses hardcoded defaults (3 and 5). 
        // I will keep these defaults but use the new logic.
        const bonus3 = 3;
        const bonus5 = 5;

        if (yearsAtMonthEnd >= 5) {
          if (isHalfYearEnd) {
            yearCasual += bonus5;
          }
        } else if (yearsAtMonthEnd >= 3) {
          if (isBonus3Month) {
            yearCasual += bonus3;
          }
        }
      }
    }

    // Add this year's credits to running total
    casual += yearCasual;
    sick += yearSick;

    // Apply year-end adjustment if this year has ended (not current year)
    // Year-end adjustment: cap casual at 8 for carry forward, reset sick to 0
    if (!isCurrentYear) {
      casual = Math.min(casual, 8);
      sick = 0;
    }
  }

  // For current year, no year-end adjustment yet (will be applied at end of year)
  // But we still need to cap at 99 limit
  casual = Math.min(casual, 99);
  sick = Math.min(sick, 99);

  return { casual, sick };
}

