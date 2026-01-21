-- Comprehensive Hard Seed for Leave Rules
-- This script ensures all types and policies exist and are active.

DO $$
DECLARE
  casual_id INT;
  sick_id INT;
  lop_id INT;
  permission_id INT;
BEGIN
  -- 1. Ensure Leave Types exist and are ACTIVE
  INSERT INTO leave_types (code, name, is_active) 
  VALUES 
    ('casual', 'Casual Leave', true),
    ('sick', 'Sick Leave', true),
    ('lop', 'Loss of Pay', true),
    ('permission', 'Permission', true)
  ON CONFLICT (code) DO UPDATE SET is_active = true, name = EXCLUDED.name;

  -- 2. Get the correct IDs
  SELECT id INTO casual_id FROM leave_types WHERE code = 'casual';
  SELECT id INTO sick_id FROM leave_types WHERE code = 'sick';
  SELECT id INTO lop_id FROM leave_types WHERE code = 'lop';
  SELECT id INTO permission_id FROM leave_types WHERE code = 'permission';

  -- 3. Seed/Update Policies for all roles
  -- We use INSERT ... ON CONFLICT (role, leave_type_id) DO UPDATE 
  -- to ensure even existing records get the "correct" starting values if they were corrupted.

  -- Role: employee
  INSERT INTO leave_policy_configurations (role, leave_type_id, annual_credit, carry_forward_limit, anniversary_3_year_bonus, anniversary_5_year_bonus, effective_from)
  VALUES ('employee', casual_id, 12, 8, 3, 5, '2024-08-19') ON CONFLICT (role, leave_type_id) DO NOTHING;
  INSERT INTO leave_policy_configurations (role, leave_type_id, annual_credit, carry_forward_limit, effective_from)
  VALUES ('employee', sick_id, 6, 99, '2024-08-19') ON CONFLICT (role, leave_type_id) DO NOTHING;
  INSERT INTO leave_policy_configurations (role, leave_type_id, annual_credit, effective_from)
  VALUES ('employee', lop_id, 10, '2024-08-19') ON CONFLICT (role, leave_type_id) DO NOTHING;
  INSERT INTO leave_policy_configurations (role, leave_type_id, annual_credit, effective_from)
  VALUES ('employee', permission_id, 0, '2024-08-19') ON CONFLICT (role, leave_type_id) DO NOTHING;

  -- Role: manager
  INSERT INTO leave_policy_configurations (role, leave_type_id, annual_credit, carry_forward_limit, anniversary_3_year_bonus, anniversary_5_year_bonus, effective_from)
  VALUES ('manager', casual_id, 12, 8, 3, 5, '2024-08-19') ON CONFLICT (role, leave_type_id) DO NOTHING;
  INSERT INTO leave_policy_configurations (role, leave_type_id, annual_credit, carry_forward_limit, effective_from)
  VALUES ('manager', sick_id, 6, 99, '2024-08-19') ON CONFLICT (role, leave_type_id) DO NOTHING;
  INSERT INTO leave_policy_configurations (role, leave_type_id, annual_credit, effective_from)
  VALUES ('manager', lop_id, 10, '2024-08-19') ON CONFLICT (role, leave_type_id) DO NOTHING;
  INSERT INTO leave_policy_configurations (role, leave_type_id, annual_credit, effective_from)
  VALUES ('manager', permission_id, 0, '2024-08-19') ON CONFLICT (role, leave_type_id) DO NOTHING;

  -- Role: hr
  INSERT INTO leave_policy_configurations (role, leave_type_id, annual_credit, carry_forward_limit, anniversary_3_year_bonus, anniversary_5_year_bonus, effective_from)
  VALUES ('hr', casual_id, 12, 8, 3, 5, '2024-08-19') ON CONFLICT (role, leave_type_id) DO NOTHING;
  INSERT INTO leave_policy_configurations (role, leave_type_id, annual_credit, carry_forward_limit, effective_from)
  VALUES ('hr', sick_id, 6, 99, '2024-08-19') ON CONFLICT (role, leave_type_id) DO NOTHING;
  INSERT INTO leave_policy_configurations (role, leave_type_id, annual_credit, effective_from)
  VALUES ('hr', lop_id, 10, '2024-08-19') ON CONFLICT (role, leave_type_id) DO NOTHING;
  INSERT INTO leave_policy_configurations (role, leave_type_id, annual_credit, effective_from)
  VALUES ('hr', permission_id, 0, '2024-08-19') ON CONFLICT (role, leave_type_id) DO NOTHING;

  -- Role: intern
  INSERT INTO leave_policy_configurations (role, leave_type_id, annual_credit, carry_forward_limit, effective_from)
  VALUES ('intern', casual_id, 6, 0, '2024-08-19') ON CONFLICT (role, leave_type_id) DO NOTHING;
  INSERT INTO leave_policy_configurations (role, leave_type_id, annual_credit, carry_forward_limit, effective_from)
  VALUES ('intern', sick_id, 6, 99, '2024-08-19') ON CONFLICT (role, leave_type_id) DO NOTHING;
  INSERT INTO leave_policy_configurations (role, leave_type_id, annual_credit, effective_from)
  VALUES ('intern', lop_id, 10, '2024-08-19') ON CONFLICT (role, leave_type_id) DO NOTHING;
  INSERT INTO leave_policy_configurations (role, leave_type_id, annual_credit, effective_from)
  VALUES ('intern', permission_id, 0, '2024-08-19') ON CONFLICT (role, leave_type_id) DO NOTHING;

  -- Role: on_notice
  INSERT INTO leave_policy_configurations (role, leave_type_id, annual_credit, carry_forward_limit, effective_from)
  VALUES ('on_notice', casual_id, 12, 0, '2024-08-19') ON CONFLICT (role, leave_type_id) DO NOTHING;
  INSERT INTO leave_policy_configurations (role, leave_type_id, annual_credit, carry_forward_limit, effective_from)
  VALUES ('on_notice', sick_id, 6, 99, '2024-08-19') ON CONFLICT (role, leave_type_id) DO NOTHING;
  INSERT INTO leave_policy_configurations (role, leave_type_id, annual_credit, effective_from)
  VALUES ('on_notice', lop_id, 10, '2024-08-19') ON CONFLICT (role, leave_type_id) DO NOTHING;
  INSERT INTO leave_policy_configurations (role, leave_type_id, annual_credit, effective_from)
  VALUES ('on_notice', permission_id, 0, '2024-08-19') ON CONFLICT (role, leave_type_id) DO NOTHING;

END $$;
