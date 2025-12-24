-- Users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  emp_id VARCHAR(20) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  must_change_password BOOLEAN DEFAULT true,
  role VARCHAR(20) NOT NULL CHECK (role IN ('employee', 'manager', 'hr', 'super_admin')),
  first_name VARCHAR(100) NOT NULL,
  middle_name VARCHAR(100),
  last_name VARCHAR(100),
  contact_number VARCHAR(15),
  alt_contact VARCHAR(15),
  date_of_birth DATE,
  gender VARCHAR(10) CHECK (gender IN ('Male', 'Female', 'Other')),
  blood_group VARCHAR(5),
  marital_status VARCHAR(20),
  emergency_contact_name VARCHAR(100),
  emergency_contact_no VARCHAR(15),
  emergency_contact_relation VARCHAR(50),
  profile_photo_url VARCHAR(500),
  reporting_manager_id INTEGER REFERENCES users(id),
  designation VARCHAR(100),
  department VARCHAR(100),
  date_of_joining DATE NOT NULL,
  aadhar_number VARCHAR(12),
  pan_number VARCHAR(10),
  current_address TEXT,
  permanent_address TEXT,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'on_leave', 'resigned')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER REFERENCES users(id),
  updated_by INTEGER REFERENCES users(id)
);

-- Ensure column exists for existing databases
ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact_relation VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reporting_manager_name VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_users_emp_id ON users(emp_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_reporting_manager ON users(reporting_manager_id);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- Leave requests table
CREATE TABLE IF NOT EXISTS leave_requests (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES users(id),
  leave_type VARCHAR(20) NOT NULL CHECK (leave_type IN ('casual', 'sick', 'lop', 'permission')),
  start_date DATE NOT NULL,
  start_type VARCHAR(10) NOT NULL CHECK (start_type IN ('full', 'half')),
  end_date DATE NOT NULL,
  end_type VARCHAR(10) NOT NULL CHECK (end_type IN ('full', 'half')),
  reason TEXT NOT NULL,
  no_of_days DECIMAL(3,1) NOT NULL,
  time_for_permission_start TIME,
  time_for_permission_end TIME,
  applied_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  current_status VARCHAR(20) DEFAULT 'pending' CHECK (current_status IN ('pending', 'approved', 'rejected', 'cancelled')),
  manager_approval_status VARCHAR(20),
  manager_approval_date TIMESTAMP,
  manager_approval_comment TEXT,
  manager_approved_by INTEGER REFERENCES users(id),
  hr_approval_status VARCHAR(20),
  hr_approval_date TIMESTAMP,
  hr_approval_comment TEXT,
  hr_approved_by INTEGER REFERENCES users(id),
  super_admin_approval_status VARCHAR(20),
  super_admin_approval_date TIMESTAMP,
  super_admin_approval_comment TEXT,
  super_admin_approved_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_leave_requests_employee ON leave_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON leave_requests(current_status);
CREATE INDEX IF NOT EXISTS idx_leave_requests_dates ON leave_requests(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_leave_requests_applied_date ON leave_requests(applied_date);

-- Leave days table (for day-wise breakdown)
CREATE TABLE IF NOT EXISTS leave_days (
  id SERIAL PRIMARY KEY,
  leave_request_id INTEGER NOT NULL REFERENCES leave_requests(id) ON DELETE CASCADE,
  leave_date DATE NOT NULL,
  day_type VARCHAR(10) NOT NULL CHECK (day_type IN ('full', 'half')),
  leave_type VARCHAR(20) NOT NULL,
  employee_id INTEGER NOT NULL REFERENCES users(id),
  UNIQUE(leave_request_id, leave_date)
);

CREATE INDEX IF NOT EXISTS idx_leave_days_request ON leave_days(leave_request_id);
CREATE INDEX IF NOT EXISTS idx_leave_days_date ON leave_days(leave_date);
CREATE INDEX IF NOT EXISTS idx_leave_days_employee ON leave_days(employee_id);

-- Leave balances table
CREATE TABLE IF NOT EXISTS leave_balances (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
  casual_balance DECIMAL(4,1) DEFAULT 0,
  sick_balance DECIMAL(4,1) DEFAULT 0,
  lop_balance DECIMAL(4,1) DEFAULT 0,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_by INTEGER REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_leave_balances_employee ON leave_balances(employee_id);

-- Holidays table
CREATE TABLE IF NOT EXISTS holidays (
  id SERIAL PRIMARY KEY,
  holiday_date DATE NOT NULL UNIQUE,
  holiday_name VARCHAR(100) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_holidays_date ON holidays(holiday_date);

-- Leave rules table
CREATE TABLE IF NOT EXISTS leave_rules (
  id SERIAL PRIMARY KEY,
  leave_required_min DECIMAL(4,1) NOT NULL,
  leave_required_max DECIMAL(4,1),
  prior_information_days INTEGER NOT NULL,
  is_active BOOLEAN DEFAULT true
);

-- Education table
CREATE TABLE IF NOT EXISTS education (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  level VARCHAR(10) NOT NULL CHECK (level IN ('PG', 'UG', '12th')),
  group_stream VARCHAR(100),
  college_university VARCHAR(200),
  year INTEGER,
  score_percentage DECIMAL(5,2),
  UNIQUE(employee_id, level)
);

CREATE INDEX IF NOT EXISTS idx_education_employee ON education(employee_id);

-- Audit logs table (removed - not used)
-- CREATE TABLE IF NOT EXISTS audit_logs (
--   id SERIAL PRIMARY KEY,
--   user_id INTEGER REFERENCES users(id),
--   action VARCHAR(50) NOT NULL,
--   entity_type VARCHAR(50),
--   entity_id INTEGER,
--   old_values JSONB,
--   new_values JSONB,
--   ip_address VARCHAR(45),
--   user_agent TEXT,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
-- );
--
-- CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
-- CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
-- CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);

-- Notifications table (removed - not used)
-- CREATE TABLE IF NOT EXISTS notifications (
--   id SERIAL PRIMARY KEY,
--   user_id INTEGER NOT NULL REFERENCES users(id),
--   title VARCHAR(200) NOT NULL,
--   message TEXT NOT NULL,
--   type VARCHAR(50),
--   is_read BOOLEAN DEFAULT false,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
-- );
--
-- CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
-- CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(user_id, is_read);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Make trigger creation idempotent
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
DROP TRIGGER IF EXISTS update_leave_requests_updated_at ON leave_requests;

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_leave_requests_updated_at
    BEFORE UPDATE ON leave_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

