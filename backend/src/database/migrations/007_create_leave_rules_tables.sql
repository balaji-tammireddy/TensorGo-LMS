CREATE TABLE IF NOT EXISTS leave_types (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO leave_types (code, name) VALUES 
('casual', 'Casual Leave'), 
('sick', 'Sick Leave'), 
('lop', 'Loss of Pay'),
('permission', 'Permission')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS leave_policy_configurations (
  id SERIAL PRIMARY KEY,
  role VARCHAR(50) NOT NULL,
  leave_type_id INTEGER REFERENCES leave_types(id),
  monthly_credit DECIMAL(4,2) DEFAULT 0,
  annual_max DECIMAL(5,2) DEFAULT 0,
  carry_forward_limit DECIMAL(5,2) DEFAULT 0,
  max_balance DECIMAL(5,2) DEFAULT 99,
  anniversary_3_year_bonus DECIMAL(4,2) DEFAULT 0,
  anniversary_5_year_bonus DECIMAL(4,2) DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(role, leave_type_id)
);

-- Seed Default Values
DO $$
DECLARE
  casual_id INT;
  sick_id INT;
  lop_id INT;
BEGIN
  SELECT id INTO casual_id FROM leave_types WHERE code = 'casual';
  SELECT id INTO sick_id FROM leave_types WHERE code = 'sick';
  SELECT id INTO lop_id FROM leave_types WHERE code = 'lop';

  -- Employee
  INSERT INTO leave_policy_configurations (role, leave_type_id, monthly_credit, carry_forward_limit, anniversary_3_year_bonus, anniversary_5_year_bonus)
  VALUES ('employee', casual_id, 1.0, 8, 3, 5) ON CONFLICT DO NOTHING;
  
  INSERT INTO leave_policy_configurations (role, leave_type_id, monthly_credit, max_balance)
  VALUES ('employee', sick_id, 0.5, 99) ON CONFLICT DO NOTHING;
  
  INSERT INTO leave_policy_configurations (role, leave_type_id, monthly_credit)
  VALUES ('employee', lop_id, 0) ON CONFLICT DO NOTHING;

  -- Manager
  INSERT INTO leave_policy_configurations (role, leave_type_id, monthly_credit, carry_forward_limit, anniversary_3_year_bonus, anniversary_5_year_bonus)
  VALUES ('manager', casual_id, 1.0, 8, 3, 5) ON CONFLICT DO NOTHING;
  INSERT INTO leave_policy_configurations (role, leave_type_id, monthly_credit, max_balance)
  VALUES ('manager', sick_id, 0.5, 99) ON CONFLICT DO NOTHING;

  -- HR
  INSERT INTO leave_policy_configurations (role, leave_type_id, monthly_credit, carry_forward_limit, anniversary_3_year_bonus, anniversary_5_year_bonus)
  VALUES ('hr', casual_id, 1.0, 8, 3, 5) ON CONFLICT DO NOTHING;
  INSERT INTO leave_policy_configurations (role, leave_type_id, monthly_credit, max_balance)
  VALUES ('hr', sick_id, 0.5, 99) ON CONFLICT DO NOTHING;

  -- Intern
  INSERT INTO leave_policy_configurations (role, leave_type_id, monthly_credit, carry_forward_limit, max_balance)
  VALUES ('intern', casual_id, 0.5, 0, 99) ON CONFLICT DO NOTHING;
  INSERT INTO leave_policy_configurations (role, leave_type_id, monthly_credit, max_balance)
  VALUES ('intern', sick_id, 0.5, 99) ON CONFLICT DO NOTHING;
  
   -- Super Admin (Default zero or same as employee just in case)
  INSERT INTO leave_policy_configurations (role, leave_type_id, monthly_credit, carry_forward_limit)
  VALUES ('super_admin', casual_id, 1.0, 8) ON CONFLICT DO NOTHING;
  INSERT INTO leave_policy_configurations (role, leave_type_id, monthly_credit, max_balance)
  VALUES ('super_admin', sick_id, 0.5, 99) ON CONFLICT DO NOTHING;

END $$;
