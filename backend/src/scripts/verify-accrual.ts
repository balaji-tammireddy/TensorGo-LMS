import { calculateAllLeaveCredits } from '../utils/leaveCredit';

function test(joinDate: string, checkDate: string, label: string) {
    const credits = calculateAllLeaveCredits(joinDate, new Date(checkDate));
    console.log(`[${label}] Join: ${joinDate}, Check: ${checkDate} => Casual: ${credits.casual}`);
}

console.log("--- Starting Leave Accrual Logic Verification ---");

// Scenario 1: Joined Jan 1, 2023. Completes 3 years Jan 1, 2026.
// Monthly credits: 2023 (11 months: Feb-Dec), 2024 (12), 2025 (12), 2026 (1: Jan)
// Total monthly: 11 (2023) -> Carry forward 8. 8+12(2024) -> Carry forward 8. 8+12(2025) -> Carry forward 8. 8 + 1 (Jan 2026) = 9.
// Anniversary Bonus: 
// 2026 (years >= 3): Apr, Aug, Dec.
// If check date is April 1, 2026 (Last working day of March 31): No bonus yet (March is not 4, 8, or 12).
// Calculation logic: bonus is added on the last working day of April, August, and December.
test("2023-01-01", "2026-04-01", "3 Years Completed in Jan, Check Apr 1 (No Bonus Yet - April 30 is the goal)");

// If check date is May 1, 2026:
// Monthly: 8 (from 2025) + 4 (Jan, Feb, Mar, Apr) = 12.
// Bonus: April (1 time) = 3 bonus.
// Total: 12 + 3 = 15.
test("2023-01-01", "2026-05-01", "3 Years Completed in Jan, Check May 1 (1 Bonus in April)");

// Scenario 2: Joined May 5, 2023. Completes 3 years May 5, 2026.
// Check date: June 1, 2026. (May completed, Jun 1 is not last working day of Jun yet).
// Monthly: 8 (from 2025) + 5 (Jan-May) = 13.
// Bonus: Missed March (not 3 years yet). 
// Total: 13.
test("2023-05-05", "2026-06-01", "3 Years Completed in May, Check Jun 1 (0 Bonuses)");

// Check date: Sept 1, 2026. 
// Monthly: 8 + 8 (Jan-Aug) = 16.
// Bonus: August (1 time) = 3.
// Total: 19.
test("2023-05-05", "2026-09-01", "3 Years Completed in May, Check Sept 1 (1 Bonus in August)");

// Scenario 3: Joined Jan 1, 2021. Completes 5 years Jan 1, 2026.
// Check date: Feb 1, 2026.
// Monthly: 8 (from 2025) + 1 (Jan) = 9.
// Bonus logic: 
// In 2024: 3-year schedule (Apr, Aug, Dec) = 3 * 3 = 9.
// In 2025: 3-year schedule (Apr, Aug, Dec) = 3 * 3 = 9.
// Total 2025: 8 (from 2024) + 12 (monthly) + 9 (bonus) = 29. -> Carry forward 8.
// In 2026 (Jan): Years >= 5. Half-yearly (Jun, Dec).
// If check date Feb 1, 2026: No bonus yet.
// Total: 9.
test("2021-01-01", "2026-02-01", "5 Years Completed in Jan, Check Feb 1 (No Bonus Yet)");

// If check date July 1, 2026:
// Monthly: 8 + 6 = 14.
// Bonus: June (5-year half-yearly bonus) = 5.
// Total: 19.
test("2021-01-01", "2026-07-01", "5 Years Completed in Jan, Check Jul 1 (1 Half-Yearly Bonus)");

console.log("--- End of Verification ---");
