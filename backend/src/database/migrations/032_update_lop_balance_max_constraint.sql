-- Drop the old constraint that limited LOP to 10
ALTER TABLE leave_balances DROP CONSTRAINT IF EXISTS leave_balances_lop_balance_max_check;

-- Add the new constraint with the limit of 40
ALTER TABLE leave_balances ADD CONSTRAINT leave_balances_lop_balance_max_check CHECK (lop_balance <= 40);
