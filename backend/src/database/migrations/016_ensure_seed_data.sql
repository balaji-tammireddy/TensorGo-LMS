-- Ensure leave types and policies exist even if tables were already created
-- This is a separate file to ensure seeding happens regardless of table creation status

DO $$
DECLARE
  casual_id INT;
  sick_id INT;
  lop_id INT;
  permission_id INT;
BEGIN
  -- Insert Leave Types
  INSERT INTO leave_types (code, name) VALUES ('casual', 'Casual Leave') ON CONFLICT (code) DO NOTHING;
  INSERT INTO leave_types (code, name) VALUES ('sick', 'Sick Leave') ON CONFLICT (code) DO NOTHING;
  INSERT INTO leave_types (code, name) VALUES ('lop', 'Loss of Pay') ON CONFLICT (code) DO NOTHING;
  INSERT INTO leave_types (code, name) VALUES ('permission', 'Permission') ON CONFLICT (code) DO NOTHING;

  -- Get IDs
  SELECT id INTO casual_id FROM leave_types WHERE code = 'casual';
  SELECT id INTO sick_id FROM leave_types WHERE code = 'sick';
  SELECT id INTO lop_id FROM leave_types WHERE code = 'lop';
  SELECT id INTO permission_id FROM leave_types WHERE code = 'permission';

  -- Seed Default Policies for all major roles if they don't exist
  -- Role: employee, manager, hr, intern, on_notice
  
  -- Casual Leave (12 annual, 8 carry forward)
  INSERT INTO leave_policy_configurations (role, leave_type_id, annual_credit, carry_forward_limit, anniversary_3_year_bonus, anniversary_5_year_bonus)
  VALUES ('employee', casual_id, 12.0, 8, 3, 5) ON CONFLICT (role, leave_type_id) DO NOTHING;
  INSERT INTO leave_policy_configurations (role, leave_type_id, annual_credit, carry_forward_limit, anniversary_3_year_bonus, anniversary_5_year_bonus)
  VALUES ('manager', casual_id, 12.0, 8, 3, 5) ON CONFLICT (role, leave_type_id) DO NOTHING;
  INSERT INTO leave_policy_configurations (role, leave_type_id, annual_credit, carry_forward_limit, anniversary_3_year_bonus, anniversary_5_year_bonus)
  VALUES ('hr', casual_id, 12.0, 8, 3, 5) ON CONFLICT (role, leave_type_id) DO NOTHING;
  INSERT INTO leave_policy_configurations (role, leave_type_id, annual_credit, carry_forward_limit)
  VALUES ('intern', casual_id, 6.0, 0) ON CONFLICT (role, leave_type_id) DO NOTHING;
  INSERT INTO leave_policy_configurations (role, leave_type_id, annual_credit, carry_forward_limit)
  VALUES ('on_notice', casual_id, 12.0, 0) ON CONFLICT (role, leave_type_id) DO NOTHING;

  -- Sick Leave (6 annual)
  INSERT INTO leave_policy_configurations (role, leave_type_id, annual_credit, carry_forward_limit)
  VALUES ('employee', sick_id, 6.0, 99) ON CONFLICT (role, leave_type_id) DO NOTHING;
  INSERT INTO leave_policy_configurations (role, leave_type_id, annual_credit, carry_forward_limit)
  VALUES ('manager', sick_id, 6.0, 99) ON CONFLICT (role, leave_type_id) DO NOTHING;
  INSERT INTO leave_policy_configurations (role, leave_type_id, annual_credit, carry_forward_limit)
  VALUES ('hr', sick_id, 6.0, 99) ON CONFLICT (role, leave_type_id) DO NOTHING;
  INSERT INTO leave_policy_configurations (role, leave_type_id, annual_credit, carry_forward_limit)
  VALUES ('intern', sick_id, 6.0, 99) ON CONFLICT (role, leave_type_id) DO NOTHING;
  INSERT INTO leave_policy_configurations (role, leave_type_id, annual_credit, carry_forward_limit)
  VALUES ('on_notice', sick_id, 6.0, 99) ON CONFLICT (role, leave_type_id) DO NOTHING;

  -- Loss of Pay (10 annual default display)
  INSERT INTO leave_policy_configurations (role, leave_type_id, annual_credit)
  VALUES ('employee', lop_id, 10.0) ON CONFLICT (role, leave_type_id) DO NOTHING;
  INSERT INTO leave_policy_configurations (role, leave_type_id, annual_credit)
  VALUES ('manager', lop_id, 10.0) ON CONFLICT (role, leave_type_id) DO NOTHING;
  INSERT INTO leave_policy_configurations (role, leave_type_id, annual_credit)
  VALUES ('hr', lop_id, 10.0) ON CONFLICT (role, leave_type_id) DO NOTHING;
  INSERT INTO leave_policy_configurations (role, leave_type_id, annual_credit)
  VALUES ('intern', lop_id, 10.0) ON CONFLICT (role, leave_type_id) DO NOTHING;
  INSERT INTO leave_policy_configurations (role, leave_type_id, annual_credit)
  VALUES ('on_notice', lop_id, 10.0) ON CONFLICT (role, leave_type_id) DO NOTHING;

  -- Permission (0 credit)
  INSERT INTO leave_policy_configurations (role, leave_type_id, annual_credit)
  VALUES ('employee', permission_id, 0) ON CONFLICT (role, leave_type_id) DO NOTHING;
  INSERT INTO leave_policy_configurations (role, leave_type_id, annual_credit)
  VALUES ('manager', permission_id, 0) ON CONFLICT (role, leave_type_id) DO NOTHING;
  INSERT INTO leave_policy_configurations (role, leave_type_id, annual_credit)
  VALUES ('hr', permission_id, 0) ON CONFLICT (role, leave_type_id) DO NOTHING;
  INSERT INTO leave_policy_configurations (role, leave_type_id, annual_credit)
  VALUES ('intern', permission_id, 0) ON CONFLICT (role, leave_type_id) DO NOTHING;
  INSERT INTO leave_policy_configurations (role, leave_type_id, annual_credit)
  VALUES ('on_notice', permission_id, 0) ON CONFLICT (role, leave_type_id) DO NOTHING;

  -- Force initial effective date for everything
  UPDATE leave_policy_configurations SET effective_from = '2024-08-19' WHERE effective_from IS NULL;

END $$;
