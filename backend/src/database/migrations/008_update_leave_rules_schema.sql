-- Add annual_credit, populate it, and remove obsolete columns
ALTER TABLE leave_policy_configurations ADD COLUMN annual_credit DECIMAL(5,2) DEFAULT 0;

UPDATE leave_policy_configurations SET annual_credit = monthly_credit * 12;

ALTER TABLE leave_policy_configurations DROP COLUMN monthly_credit;
ALTER TABLE leave_policy_configurations DROP COLUMN max_balance;

-- Remove Super Admin policies if they exist (cleanup)
DELETE FROM leave_policy_configurations WHERE role = 'super_admin';
