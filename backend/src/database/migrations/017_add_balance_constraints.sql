-- Fix existing negative balances
UPDATE leave_balances SET casual_balance = 0 WHERE casual_balance < 0;
UPDATE leave_balances SET sick_balance = 0 WHERE sick_balance < 0;
UPDATE leave_balances SET lop_balance = 0 WHERE lop_balance < 0;

-- Add constraints
ALTER TABLE leave_balances ADD CONSTRAINT check_casual_non_negative CHECK (casual_balance >= 0);
ALTER TABLE leave_balances ADD CONSTRAINT check_sick_non_negative CHECK (sick_balance >= 0);
ALTER TABLE leave_balances ADD CONSTRAINT check_lop_non_negative CHECK (lop_balance >= 0);
