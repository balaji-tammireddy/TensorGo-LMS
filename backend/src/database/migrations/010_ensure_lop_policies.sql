-- Ensure LOP policies exist for all roles
DO $$
DECLARE
  lop_id INT;
  role_name TEXT;
BEGIN
  SELECT id INTO lop_id FROM leave_types WHERE code = 'lop';
  
  IF lop_id IS NOT NULL THEN
    FOR role_name IN SELECT UNNEST(ARRAY['employee', 'manager', 'hr', 'intern']) LOOP
      INSERT INTO leave_policy_configurations (role, leave_type_id, annual_credit)
      VALUES (role_name, lop_id, 10)
      ON CONFLICT (role, leave_type_id) DO UPDATE SET annual_credit = 10 WHERE leave_policy_configurations.annual_credit = 0;
    END LOOP;
  END IF;
END $$;
