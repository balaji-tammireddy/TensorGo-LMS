-- Ensure LOP policies exist for all roles (manager, hr, intern, employee)
DO $$
DECLARE
  lop_id INT;
BEGIN
  -- Get the LOP leave type ID
  SELECT id INTO lop_id FROM leave_types WHERE code = 'lop';
  
  IF lop_id IS NOT NULL THEN
    -- Insert LOP policies for all roles if they don't exist
    INSERT INTO leave_policy_configurations (role, leave_type_id, annual_credit, annual_max, carry_forward_limit, anniversary_3_year_bonus, anniversary_5_year_bonus)
    VALUES 
      ('employee', lop_id, '10', '0', '0', '0', '0'),
      ('manager', lop_id, '10', '0', '0', '0', '0'),
      ('hr', lop_id, '10', '0', '0', '0', '0'),
      ('intern', lop_id, '10', '0', '0', '0', '0')
    ON CONFLICT (role, leave_type_id) DO UPDATE 
    SET annual_credit = CASE 
      WHEN leave_policy_configurations.annual_credit = '0' THEN '10' 
      ELSE leave_policy_configurations.annual_credit 
    END;
  END IF;
END $$;
