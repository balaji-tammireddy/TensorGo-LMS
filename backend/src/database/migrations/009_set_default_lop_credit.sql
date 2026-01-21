-- Set annual_credit for LOP to 10 by default for all roles that have a LOP policy
UPDATE leave_policy_configurations 
SET annual_credit = 10 
WHERE leave_type_id = (SELECT id FROM leave_types WHERE code = 'lop');
