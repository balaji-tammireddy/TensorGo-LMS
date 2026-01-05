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

  if (dayOfMonth <= 15) {
    // Joined on or before 15th: 1 casual + 0.5 sick
    return { casual: 1, sick: 0.5 };
  } else {
    // Joined after 15th: 0.5 sick only
    return { casual: 0, sick: 0.5 };
  }
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

    // Add anniversary credits if they occurred this year
    // Use original join date for anniversary calculations
    const threeYearAnniversary = new Date(originalJoinYear + 3, originalJoinMonth - 1, originalJoinDay);
    if (year === originalJoinYear + 3 && threeYearAnniversary <= today && threeYearAnniversary >= systemStartDate) {
      // Check if anniversary date is within this year and after system start
      const yearStart = new Date(year, 0, 1);
      const yearEnd = new Date(year, 11, 31);
      if (threeYearAnniversary >= yearStart && threeYearAnniversary <= yearEnd) {
        yearCasual += 3; // 3-year anniversary bonus
      }
    }

    const fiveYearAnniversary = new Date(originalJoinYear + 5, originalJoinMonth - 1, originalJoinDay);
    if (year === originalJoinYear + 5 && fiveYearAnniversary <= today && fiveYearAnniversary >= systemStartDate) {
      // Check if anniversary date is within this year and after system start
      const yearStart = new Date(year, 0, 1);
      const yearEnd = new Date(year, 11, 31);
      if (fiveYearAnniversary >= yearStart && fiveYearAnniversary <= yearEnd) {
        yearCasual += 5; // 5-year anniversary bonus
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

/**
 * Check if an employee has completed 3 years of service (anniversary date)
 * @param joinDate - Employee's date of joining (YYYY-MM-DD format or Date object)
 * @param checkDate - Date to check against (defaults to today)
 * @returns true if employee has completed exactly 3 years on the check date
 */
export function hasCompleted3Years(joinDate: string | Date, checkDate: Date = new Date()): boolean {
  const join = typeof joinDate === 'string' ? new Date(joinDate) : joinDate;
  const check = checkDate;

  // Calculate years of service
  let years = check.getFullYear() - join.getFullYear();
  const monthDiff = check.getMonth() - join.getMonth();
  const dayDiff = check.getDate() - join.getDate();

  // Adjust if anniversary hasn't occurred yet this year
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    years--;
  }

  // Check if exactly 3 years completed and today is the anniversary date
  if (years === 3) {
    // Check if today is the anniversary date (same month and day)
    return check.getMonth() === join.getMonth() && check.getDate() === join.getDate();
  }

  return false;
}

/**
 * Check if an employee has completed 3 or more years of service
 * @param joinDate - Employee's date of joining (YYYY-MM-DD format or Date object)
 * @param checkDate - Date to check against (defaults to today)
 * @returns true if employee has completed 3 or more years
 */
export function hasCompleted3OrMoreYears(joinDate: string | Date, checkDate: Date = new Date()): boolean {
  const join = typeof joinDate === 'string' ? new Date(joinDate) : joinDate;
  const check = checkDate;

  // Calculate years of service
  let years = check.getFullYear() - join.getFullYear();
  const monthDiff = check.getMonth() - join.getMonth();
  const dayDiff = check.getDate() - join.getDate();

  // Adjust if anniversary hasn't occurred yet this year
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    years--;
  }

  return years >= 3;
}


/**
 * Check if an employee has completed 5 years of service (anniversary date)
 * @param joinDate - Employee's date of joining (YYYY-MM-DD format or Date object)
 * @param checkDate - Date to check against (defaults to today)
 * @returns true if employee has completed exactly 5 years on the check date
 */
export function hasCompleted5Years(joinDate: string | Date, checkDate: Date = new Date()): boolean {
  const join = typeof joinDate === 'string' ? new Date(joinDate) : joinDate;
  const check = checkDate;

  // Calculate years of service
  let years = check.getFullYear() - join.getFullYear();
  const monthDiff = check.getMonth() - join.getMonth();
  const dayDiff = check.getDate() - join.getDate();

  // Adjust if anniversary hasn't occurred yet this year
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    years--;
  }

  // Check if exactly 5 years completed and today is the anniversary date
  if (years === 5) {
    // Check if today is the anniversary date (same month and day)
    return check.getMonth() === join.getMonth() && check.getDate() === join.getDate();
  }

  return false;
}
