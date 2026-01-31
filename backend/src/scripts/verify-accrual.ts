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
// 2026 (years >= 3): Mar, Jun, Sep, Dec.
// If check date is Feb 1, 2026: No bonus yet.
test("2023-01-01", "2026-02-01", "3 Years Completed in Jan, Check Feb 1 (No Bonus Yet)");

// If check date is April 1, 2026:
// Monthly: 8 (from 2025) + 3 (Jan, Feb, Mar) = 11.
// Bonus: March (1 time) = 3 bonus.
// Total: 11 + 3 = 14.
test("2023-01-01", "2026-04-01", "3 Years Completed in Jan, Check Apr 1 (1 Quarterly Bonus)");

// Scenario 2: Joined May 5, 2023. Completes 3 years May 5, 2026.
// Check date: June 1, 2026. (May completed, Jun 1 is not last working day of Jun yet).
// Monthly: 8 (from 2025) + 5 (Jan-May) = 13.
// Bonus: Missed March (not 3 years yet). 
// Total: 13.
test("2023-05-05", "2026-06-01", "3 Years Completed in May, Check Jun 1 (0 Bonuses)");

// Check date: July 1, 2026. 
// Monthly: 8 + 6 (Jan-Jun) = 14.
// Bonus: June (1 time) = 3.
// Total: 17.
test("2023-05-05", "2026-07-01", "3 Years Completed in May, Check Jul 1 (1 Quarterly Bonus)");

// Scenario 3: Joined Jan 1, 2021. Completes 5 years Jan 1, 2026.
// Check date: Feb 1, 2026.
// Monthly: 8 (from 2025) + 1 (Jan) = 9.
// Bonus logic: 
// In 2024: 3-year quarterly (Mar, Jun, Sep, Dec) = 4 * 3 = 12.
// In 2025: 3-year quarterly (Mar, Jun, Sep, Dec) = 4 * 3 = 12.
// Total 2025: 8 (from 2024) + 12 (monthly) + 12 (bonus) = 32. -> Carry forward 8.
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
