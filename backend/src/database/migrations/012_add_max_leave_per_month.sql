ALTER TABLE leave_policy_configurations ADD COLUMN IF NOT EXISTS max_leave_per_month DECIMAL(4,2) DEFAULT 0;

-- Set default values as requested
-- Casual: 10 per month
-- LOP: 5 per month
UPDATE leave_policy_configurations 
SET max_leave_per_month = 10 
WHERE leave_type_id = (SELECT id FROM leave_types WHERE code = 'casual');

UPDATE leave_policy_configurations 
SET max_leave_per_month = 5 
WHERE leave_type_id = (SELECT id FROM leave_types WHERE code = 'lop');
