import { readFileSync } from 'fs';
import { join } from 'path';
import { pool } from './db';

async function migrate() {
  try {
    const migrationFile = readFileSync(
      join(__dirname, 'migrations', '001_initial_schema.sql'),
      'utf-8'
    );

    await pool.query(migrationFile);
    console.log('Migration completed successfully');

    // Ensure current_status supports partially_approved (idempotent)
    await pool.query(`
      ALTER TABLE leave_requests
      DROP CONSTRAINT IF EXISTS leave_requests_current_status_check;
      ALTER TABLE leave_requests
      ADD CONSTRAINT leave_requests_current_status_check
      CHECK (current_status IN ('pending','approved','rejected','cancelled','partially_approved'));
    `);

    // Add day_status to leave_days (idempotent)
    await pool.query(`
      ALTER TABLE leave_days
      ADD COLUMN IF NOT EXISTS day_status VARCHAR(20) DEFAULT 'pending' CHECK (day_status IN ('pending','approved','rejected'));
      UPDATE leave_days SET day_status = 'pending' WHERE day_status IS NULL;
    `);

    // Ensure leave_type supports permission (idempotent)
    await pool.query(`
      ALTER TABLE leave_requests 
      DROP CONSTRAINT IF EXISTS leave_requests_leave_type_check;
      ALTER TABLE leave_requests 
      ADD CONSTRAINT leave_requests_leave_type_check 
      CHECK (leave_type IN ('casual', 'sick', 'lop', 'permission'));
    `);

    // Add doctor_note column for sick leave prescriptions (idempotent)
    await pool.query(`
      ALTER TABLE leave_requests
      ADD COLUMN IF NOT EXISTS doctor_note TEXT;
    `);

    // Add last_updated_by and last_updated_by_role columns for tracking last approver (idempotent)
    await pool.query(`
      ALTER TABLE leave_requests
      ADD COLUMN IF NOT EXISTS last_updated_by INTEGER REFERENCES users(id);
      ALTER TABLE leave_requests
      ADD COLUMN IF NOT EXISTS last_updated_by_role VARCHAR(20) CHECK (last_updated_by_role IN ('manager', 'hr', 'super_admin'));
    `);

    // Ensure LOP balance never exceeds 10 (idempotent)
    await pool.query(`
      ALTER TABLE leave_balances
      DROP CONSTRAINT IF EXISTS leave_balances_lop_balance_max_check;
      ALTER TABLE leave_balances
      ADD CONSTRAINT leave_balances_lop_balance_max_check
      CHECK (lop_balance <= 10);
    `);

    // Allow 'on_notice' in users status check (idempotent)
    await pool.query(`
      ALTER TABLE users
      DROP CONSTRAINT IF EXISTS users_status_check;
      ALTER TABLE users
      ADD CONSTRAINT users_status_check
      CHECK (status IN ('active', 'inactive', 'on_leave', 'terminated', 'resigned', 'on_notice'));
    `);

    // Allow 'intern' in users role check (idempotent)
    await pool.query(`
      ALTER TABLE users
      DROP CONSTRAINT IF EXISTS users_role_check;
      ALTER TABLE users
      ADD CONSTRAINT users_role_check
      CHECK (role IN ('employee', 'manager', 'hr', 'super_admin', 'intern'));
    `);

    // Leave rules insertion disabled - rules cannot be changed until explicitly enabled
    // await pool.query(`
    //   INSERT INTO leave_rules (leave_required_min, leave_required_max, prior_information_days, is_active)
    //   VALUES 
    //     (0.5, 4, 3, true),
    //     (4, 10, 14, true),
    //     (10, NULL, 30, true)
    //   ON CONFLICT DO NOTHING
    // `);

    // Insert sample holidays (2025 calendar)
    await pool.query(`
      INSERT INTO holidays (holiday_date, holiday_name, is_active)
      VALUES 
        ('2025-01-01', 'New Year Day', true),
        ('2025-01-14', 'Sankranti', true),
        ('2025-02-26', 'Maha Shivaratri', true),
        ('2025-03-14', 'Holi', true),
        ('2025-08-15', 'Independence Day', true),
        ('2025-08-27', 'Ganesh Chaturthi', true),
        ('2025-10-02', 'Dussera', true),
        ('2025-10-20', 'Deepavali', true),
        ('2025-10-21', 'Govardhan Puja', true),
        ('2025-12-25', 'Christmas', true)
      ON CONFLICT (holiday_date) DO NOTHING
    `);

    // Update existing employees' casual and sick leave balances to 0 (remove defaults)
    const updateResult = await pool.query(`
      UPDATE leave_balances
      SET casual_balance = 0,
          sick_balance = 0,
          last_updated = CURRENT_TIMESTAMP
      WHERE casual_balance != 0 OR sick_balance != 0
    `);
    console.log(`Updated ${updateResult.rowCount} employee leave balance records (casual and sick set to 0)`);

    // Run password reset OTP migration
    try {
      const otpMigrationFile = readFileSync(
        join(__dirname, 'migrations', '002_add_password_reset_otp.sql'),
        'utf-8'
      );
      await pool.query(otpMigrationFile);
      console.log('Password reset OTP table migration completed');
    } catch (otpError: any) {
      // If table already exists, that's fine
      if (!otpError.message.includes('already exists')) {
        console.warn('OTP migration warning:', otpError.message);
      }
    }

    // Run urgent flag migration
    try {
      const urgentMigrationFile = readFileSync(
        join(__dirname, 'migrations', '003_add_urgent_flag_to_leave_requests.sql'),
        'utf-8'
      );
      await pool.query(urgentMigrationFile);
      console.log('Urgent flag migration completed');
    } catch (urgentError: any) {
      if (!urgentError.message.includes('already exists') && !urgentError.message.includes('duplicate')) {
        console.warn('Urgent flag migration warning:', urgentError.message);
      }
    }

    // Run policies table migration
    try {
      const policiesMigrationFile = readFileSync(
        join(__dirname, 'migrations', '004_create_policies_table.sql'),
        'utf-8'
      );
      await pool.query(policiesMigrationFile);
      console.log('Policies table migration completed');
    } catch (policiesError: any) {
      if (!policiesError.message.includes('already exists')) {
        console.warn('Policies migration warning:', policiesError.message);
      }
    }

    // Run performance indexes migration
    try {
      const perfIndexesFile = readFileSync(
        join(__dirname, 'migrations', '005_performance_indexes.sql'),
        'utf-8'
      );
      await pool.query(perfIndexesFile);
      console.log('Performance indexes migration completed');
    } catch (perfError: any) {
      if (!perfError.message.includes('already exists')) {
        console.warn('Performance indexes migration warning:', perfError.message);
      }
    }

    // Run token version migration (for session invalidation)
    try {
      const tokenVersionMigrationFile = readFileSync(
        join(__dirname, 'migrations', '006_add_token_version.sql'),
        'utf-8'
      );
      await pool.query(tokenVersionMigrationFile);
      console.log('Token version (session invalidation) migration completed');
    } catch (tokenError: any) {
      // If column already exists (code 42701) or other expected error, log warning
      if (!tokenError.message.includes('already exists') && !tokenError.message.includes('duplicate')) {
        console.warn('Token version migration warning:', tokenError.message);
      }
    }

    // Run leave rules tables migration
    try {
      const leaveRulesMigrationFile = readFileSync(
        join(__dirname, 'migrations', '007_create_leave_rules_tables.sql'),
        'utf-8'
      );
      await pool.query(leaveRulesMigrationFile);
      console.log('Leave rules (types & policies) migration completed');
    } catch (rulesError: any) {
      if (!rulesError.message.includes('already exists') && !rulesError.message.includes('duplicate')) {
        console.warn('Leave rules migration warning:', rulesError.message);
      }
    }


    // Run leave rules update migration (008)
    try {
      const updateRulesMigrationFile = readFileSync(
        join(__dirname, 'migrations', '008_update_leave_rules_schema.sql'),
        'utf-8'
      );
      await pool.query(updateRulesMigrationFile);
      console.log('Leave rules schema update (008) completed');
    } catch (updateError: any) {
      if (!updateError.message.includes('already exists') && !updateError.message.includes('does not exist') && !updateError.message.includes('duplicate')) {
        console.warn('Leave rules update migration warning:', updateError.message);
      }
    }

    // Run LOP credit migration (009)
    try {
      const lopCreditMigrationFile = readFileSync(
        join(__dirname, 'migrations', '009_set_default_lop_credit.sql'),
        'utf-8'
      );
      await pool.query(lopCreditMigrationFile);
      console.log('LOP credit update (009) completed');
    } catch (lopError: any) {
      if (!lopError.message.includes('already exists') && !lopError.message.includes('duplicate')) {
        console.warn('LOP credit migration warning:', lopError.message);
      }
    }

    // Run LOP policies migration (010)
    try {
      const lopPoliciesMigrationFile = readFileSync(
        join(__dirname, 'migrations', '010_ensure_lop_policies.sql'),
        'utf-8'
      );
      await pool.query(lopPoliciesMigrationFile);
      console.log('LOP policies update (010) completed');
    } catch (lopError: any) {
      if (!lopError.message.includes('already exists') && !lopError.message.includes('duplicate')) {
        console.warn('LOP policies migration warning:', lopError.message);
      }
    }

    // Run all LOP policies migration (011)
    try {
      const allLopPoliciesMigrationFile = readFileSync(
        join(__dirname, 'migrations', '011_ensure_all_lop_policies.sql'),
        'utf-8'
      );
      await pool.query(allLopPoliciesMigrationFile);
      console.log('All LOP policies update (011) completed');
    } catch (lopError: any) {
      if (!lopError.message.includes('already exists') && !lopError.message.includes('duplicate')) {
        console.warn('All LOP policies migration warning:', lopError.message);
      }
    }

    // Run max monthly limit migration (012)
    try {
      const maxLimitMigrationFile = readFileSync(
        join(__dirname, 'migrations', '012_add_max_leave_per_month.sql'),
        'utf-8'
      );
      await pool.query(maxLimitMigrationFile);
      console.log('Max monthly limit migration (012) completed');
    } catch (maxError: any) {
      if (!maxError.message.includes('already exists') && !maxError.message.includes('duplicate')) {
        console.warn('Max monthly limit migration warning:', maxError.message);
      }
    }

    // Run effective from migration (013)
    try {
      const effectiveFromMigrationFile = readFileSync(
        join(__dirname, 'migrations', '013_add_effective_from_to_policies.sql'),
        'utf-8'
      );
      await pool.query(effectiveFromMigrationFile);
      console.log('Effective mapping migration (013) completed');
    } catch (effectiveError: any) {
      if (!effectiveError.message.includes('already exists') && !effectiveError.message.includes('duplicate')) {
        console.warn('Effective mapping migration warning:', effectiveError.message);
      }
    }

    // Run initial effective date setup migration (015)
    try {
      const initialEffectiveMigrationFile = readFileSync(
        join(__dirname, 'migrations', '015_set_initial_effective_date.sql'),
        'utf-8'
      );
      await pool.query(initialEffectiveMigrationFile);
      console.log('Initial effective date setup (015) completed');
    } catch (initialError: any) {
      console.warn('Initial effective date setup warning:', initialError.message);
    }

    // Run leave rules seed data migration (016)
    try {
      const seedDataMigrationFile = readFileSync(
        join(__dirname, 'migrations', '016_ensure_seed_data.sql'),
        'utf-8'
      );
      await pool.query(seedDataMigrationFile);
    console.log('Leave rules seed data (016) completed');
    } catch (seedError: any) {
      console.warn('Seed data migration warning:', seedError.message);
    }

    // Run negative balance constraints migration (017)
    try {
      const balanceConstraintMigrationFile = readFileSync(
        join(__dirname, 'migrations', '017_add_balance_constraints.sql'),
        'utf-8'
      );
      await pool.query(balanceConstraintMigrationFile);
      console.log('Balance constraints migration (017) completed');
    } catch (constraintError: any) {
      if (!constraintError.message.includes('already exists') && !constraintError.message.includes('duplicate')) {
         console.warn('Balance constraint migration warning:', constraintError.message);
      }
    }

    // Run rename role column migration (018)
    try {
      // Check if user_role column already exists to avoid error
      const colCheck = await pool.query(
        "SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name='user_role'"
      );
      
      if (colCheck.rows.length === 0) {
        const renameRoleMigrationFile = readFileSync(
          join(__dirname, 'migrations', '018_rename_role_column.sql'),
          'utf-8'
        );
        await pool.query(renameRoleMigrationFile);
        console.log('Rename role column migration (018) completed');
      } else {
        console.log('Rename role column migration (018) skipped (user_role column already exists)');
      }
    } catch (renameError: any) {
       console.warn('Rename role column migration warning:', renameError.message);
    }

    console.log('Default data inserted');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();

