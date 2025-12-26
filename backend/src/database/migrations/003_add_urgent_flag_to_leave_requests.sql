-- Add urgent flag to leave_requests table
ALTER TABLE leave_requests 
ADD COLUMN IF NOT EXISTS is_urgent BOOLEAN DEFAULT FALSE;

-- Add index for urgent requests
CREATE INDEX IF NOT EXISTS idx_leave_requests_is_urgent ON leave_requests(is_urgent) WHERE is_urgent = TRUE;

