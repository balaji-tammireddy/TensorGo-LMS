-- Add performance indexes for faster name-based searches and filtering
CREATE INDEX IF NOT EXISTS idx_users_names ON users(first_name, last_name);
CREATE INDEX IF NOT EXISTS idx_users_emp_id_names ON users(emp_id, first_name, last_name);

-- Ensure leave_requests has indexes for status and dates (already verified in 001, but reinforced here)
CREATE INDEX IF NOT EXISTS idx_leave_requests_current_status ON leave_requests(current_status);
CREATE INDEX IF NOT EXISTS idx_leave_requests_applied_date_desc ON leave_requests(applied_date DESC);
