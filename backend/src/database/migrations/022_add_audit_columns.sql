-- Migration to add missing audit columns to all tables

-- leave_balances
ALTER TABLE leave_balances ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE leave_balances ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE leave_balances ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id);
-- updated_by exists but let's ensure it's there correctly
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leave_balances' AND column_name='updated_by') THEN
        ALTER TABLE leave_balances ADD COLUMN updated_by INTEGER REFERENCES users(id);
    END IF;
END $$;

-- leave_days
ALTER TABLE leave_days ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE leave_days ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE leave_days ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id);
ALTER TABLE leave_days ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id);

-- leave_requests
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id);
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id);
-- ensure created_at and updated_at exist
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- holidays
ALTER TABLE holidays ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE holidays ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id);
ALTER TABLE holidays ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id);
-- ensure created_at exists
ALTER TABLE holidays ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- password_reset_otps
ALTER TABLE password_reset_otps ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE password_reset_otps ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id);
ALTER TABLE password_reset_otps ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id);

-- leave_rules
ALTER TABLE leave_rules ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE leave_rules ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE leave_rules ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id);
ALTER TABLE leave_rules ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id);

-- policies
ALTER TABLE policies ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id);
ALTER TABLE policies ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id);
-- ensure created_at and updated_at exist
ALTER TABLE policies ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE policies ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- leave_policy_configurations
ALTER TABLE leave_policy_configurations ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE leave_policy_configurations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE leave_policy_configurations ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id);
ALTER TABLE leave_policy_configurations ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id);

-- leave_types
ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id);
ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id);
-- ensure created_at exists
ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
