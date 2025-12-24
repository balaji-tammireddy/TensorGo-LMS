import { pool } from '../database/db';
import { hashPassword } from './auth.service';

export const getEmployees = async (
  page: number = 1,
  limit: number = 20,
  search?: string,
  joiningDate?: string,
  status?: string
) => {
  const offset = (page - 1) * limit;
  let query = `
    SELECT id, emp_id, first_name || ' ' || COALESCE(last_name, '') as name,
           designation as position, date_of_joining as joining_date, status, role
    FROM users
    WHERE 1=1
  `;
  const params: any[] = [];

  if (search) {
    // Search by employee ID or name (first or last name)
    query += ` AND (emp_id ILIKE $${params.length + 1} OR first_name ILIKE $${params.length + 1} OR last_name ILIKE $${params.length + 1})`;
    params.push(`%${search}%`);
  }

  if (status) {
    if (status === 'inactive') {
      // Treat "inactive" as any non-active status
      query += ` AND status <> 'active'`;
    } else {
      query += ` AND status = $${params.length + 1}`;
      params.push(status);
    }
  }

  if (joiningDate) {
    // Filter by exact date of joining (YYYY-MM-DD)
    query += ` AND date_of_joining::date = $${params.length + 1}`;
    params.push(joiningDate);
  }

  query += ` ORDER BY CAST(emp_id AS INTEGER) ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limit, offset);

  const result = await pool.query(query, params);

  // Count total
  let countQuery = 'SELECT COUNT(*) FROM users WHERE 1=1';
  const countParams: any[] = [];

  if (search) {
    // Match count query with main query: search by emp_id or name
    countQuery += ` AND (emp_id ILIKE $${countParams.length + 1} OR first_name ILIKE $${countParams.length + 1} OR last_name ILIKE $${countParams.length + 1})`;
    countParams.push(`%${search}%`);
  }

  if (status) {
    if (status === 'inactive') {
      countQuery += ` AND status <> 'active'`;
    } else {
      countQuery += ` AND status = $${countParams.length + 1}`;
      countParams.push(status);
    }
  }

  if (joiningDate) {
    countQuery += ` AND date_of_joining::date = $${countParams.length + 1}`;
    countParams.push(joiningDate);
  }

  const countResult = await pool.query(countQuery, countParams);

  return {
    employees: result.rows.map(row => ({
      id: row.id,
      empId: row.emp_id,
      name: row.name,
      position: row.position,
      joiningDate: row.joining_date.toISOString().split('T')[0],
      status: row.status,
      role: row.role
    })),
    pagination: {
      page,
      limit,
      total: parseInt(countResult.rows[0].count)
    }
  };
};

export const getNextEmployeeId = async (): Promise<string> => {
  // Get all employee IDs that are numeric and find the maximum
  const result = await pool.query(
    `SELECT emp_id FROM users 
     WHERE emp_id ~ '^[0-9]+$' 
     ORDER BY CAST(emp_id AS INTEGER) DESC 
     LIMIT 1`
  );

  if (result.rows.length === 0) {
    // No existing numeric employee IDs, start with 001
    return '001';
  }

  const maxId = parseInt(result.rows[0].emp_id, 10);
  const nextId = maxId + 1;
  
  // Format as 3-digit string (001, 002, etc.)
  return String(nextId).padStart(3, '0');
};

export const getEmployeeById = async (employeeId: number) => {
  const result = await pool.query(
    `SELECT u.*, 
            rm.id as reporting_manager_id, 
            rm.first_name || ' ' || COALESCE(rm.last_name, '') as reporting_manager_full_name
     FROM users u
     LEFT JOIN users rm ON u.reporting_manager_id = rm.id
     WHERE u.id = $1`,
    [employeeId]
  );

  if (result.rows.length === 0) {
    throw new Error('Employee not found');
  }

  const user = result.rows[0];

  // Get education
  const educationResult = await pool.query(
    'SELECT * FROM education WHERE employee_id = $1',
    [employeeId]
  );

  return {
    ...user,
    education: educationResult.rows
  };
};

export const createEmployee = async (employeeData: any) => {
  // Always auto-generate employee ID (ignore any provided value)
  const empId = await getNextEmployeeId();

  // Check if emp_id or email already exists
  const existingResult = await pool.query(
    'SELECT id FROM users WHERE emp_id = $1 OR email = $2',
    [empId, employeeData.email]
  );

  if (existingResult.rows.length > 0) {
    throw new Error('Employee ID or email already exists');
  }

  // Validate date of birth - employee must be at least 18 years old
  if (employeeData.dateOfBirth) {
    const dob = new Date(employeeData.dateOfBirth);
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
      age--;
    }
    if (age < 18) {
      throw new Error('Employee must be at least 18 years old');
    }
  }

  // Default password for newly created employees (if none explicitly provided)
  const passwordHash = await hashPassword(employeeData.password || 'tensorgo@2023');

  // Super admin should not have a reporting manager
  const role = employeeData.role || 'employee';
  const reportingManagerId = role === 'super_admin' ? null : (employeeData.reportingManagerId || null);
  const reportingManagerName = role === 'super_admin' ? null : (employeeData.reportingManagerName || null);

  const result = await pool.query(
    `INSERT INTO users (
      emp_id, email, password_hash, role, first_name, middle_name, last_name,
      contact_number, alt_contact, date_of_birth, gender, blood_group,
      marital_status, emergency_contact_name, emergency_contact_no, emergency_contact_relation,
      designation, department, date_of_joining, aadhar_number, pan_number,
      current_address, permanent_address, reporting_manager_id, reporting_manager_name, status
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26
    ) RETURNING id`,
    [
      empId,
      employeeData.email,
      passwordHash,
      role,
      employeeData.firstName,
      employeeData.middleName || null,
      employeeData.lastName || null,
      employeeData.contactNumber || null,
      employeeData.altContact || null,
      employeeData.dateOfBirth || null,
      employeeData.gender || null,
      employeeData.bloodGroup || null,
      employeeData.maritalStatus || null,
      employeeData.emergencyContactName || null,
      employeeData.emergencyContactNo || null,
      employeeData.emergencyContactRelation || null,
      employeeData.designation || null,
      employeeData.department || null,
      employeeData.dateOfJoining,
      employeeData.aadharNumber || null,
      employeeData.panNumber ? String(employeeData.panNumber).slice(0, 10) : null,
      employeeData.currentAddress || null,
      employeeData.permanentAddress || null,
      reportingManagerId,
      reportingManagerName,
      employeeData.status || 'active'
    ]
  );

  const userId = result.rows[0].id;

  // Initialize leave balance (casual = 12 for all roles)
  const initialCasual = 12;
  await pool.query(
    'INSERT INTO leave_balances (employee_id, casual_balance, sick_balance, lop_balance) VALUES ($1, $2, 6, 10)',
    [userId, initialCasual]
  );

  // Insert education if provided
  if (employeeData.education) {
    for (const edu of employeeData.education) {
      if (edu.level) {
        // Validate year if provided (must be between 1950 and 5 years from current year)
        if (edu.year) {
          const year = parseInt(edu.year, 10);
          const currentYear = new Date().getFullYear();
          const maxYear = currentYear + 5;
          if (isNaN(year) || year < 1950 || year > maxYear) {
            throw new Error(`Graduation Year must be between 1950 and ${maxYear}`);
          }
        }
        
        await pool.query(
          `INSERT INTO education (employee_id, level, group_stream, college_university, year, score_percentage)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (employee_id, level) DO UPDATE
           SET group_stream = EXCLUDED.group_stream,
               college_university = EXCLUDED.college_university,
               year = EXCLUDED.year,
               score_percentage = EXCLUDED.score_percentage`,
          [
            userId,
            edu.level,
            edu.groupStream || null,
            edu.collegeUniversity || null,
            edu.year || null,
            edu.scorePercentage || null
          ]
        );
      }
    }
  }


  return { employeeId: userId, message: 'Employee created successfully' };
};

export const updateEmployee = async (employeeId: number, employeeData: any, requesterRole?: string, requesterId?: number) => {
  // Check if employee exists and get their role
  const employeeCheck = await pool.query('SELECT id, role FROM users WHERE id = $1', [employeeId]);
  if (employeeCheck.rows.length === 0) {
    throw new Error('Employee not found');
  }

  const employeeRole = employeeCheck.rows[0].role;
  
  // Check what fields are being updated
  const fieldsBeingUpdated = Object.keys(employeeData).map(key => 
    key.replace(/([A-Z])/g, '_$1').toLowerCase()
  );
  const isOnlyRoleUpdate = fieldsBeingUpdated.length === 1 && fieldsBeingUpdated[0] === 'role';
  const isRoleBeingUpdated = fieldsBeingUpdated.includes('role');
  
  // Super admin should not have a reporting manager
  // If role is being changed to super_admin, clear reporting manager
  // If role is already super_admin, prevent setting reporting manager
  if (isRoleBeingUpdated && employeeData.role === 'super_admin') {
    employeeData.reportingManagerId = null;
    employeeData.reportingManagerName = null;
  } else if (employeeRole === 'super_admin' && (employeeData.reportingManagerId !== undefined || employeeData.reportingManagerName !== undefined)) {
    // If already super_admin and trying to set reporting manager, clear it
    employeeData.reportingManagerId = null;
    employeeData.reportingManagerName = null;
  }

  // Prevent HR from editing super_admin users (except role updates)
  if (requesterRole === 'hr' && employeeRole === 'super_admin' && !isOnlyRoleUpdate) {
    // If role is being updated along with other fields, remove role from the update
    // HR can only update role for super_admin, not other fields
    if (isRoleBeingUpdated) {
      // Remove all fields except role
      Object.keys(employeeData).forEach(key => {
        const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
        if (dbKey !== 'role') {
          delete employeeData[key];
        }
      });
    } else {
      throw new Error('HR cannot edit super admin users');
    }
  }

  // Prevent HR from editing their own details (except role updates)
  if (requesterRole === 'hr' && requesterId && requesterId === employeeId && !isOnlyRoleUpdate) {
    // If role is being updated along with other fields, remove role from the update
    // HR can only update role for themselves, not other fields
    if (isRoleBeingUpdated) {
      // Remove all fields except role
      Object.keys(employeeData).forEach(key => {
        const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
        if (dbKey !== 'role') {
          delete employeeData[key];
        }
      });
    } else {
      throw new Error('HR cannot edit their own details');
    }
  }

  // Build update query dynamically
  const updates: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  const allowedFields = [
    'first_name', 'middle_name', 'last_name', 'contact_number', 'alt_contact',
    'date_of_birth', 'gender', 'blood_group', 'marital_status',
    'emergency_contact_name', 'emergency_contact_no', 'emergency_contact_relation',
    'designation', 'department',
    'aadhar_number', 'pan_number', 'current_address', 'permanent_address',
    'reporting_manager_id', 'reporting_manager_name', 'status'
  ];

  // HR and Super Admin can update role
  if (requesterRole === 'hr' || requesterRole === 'super_admin') {
    allowedFields.push('role');
  }

  // Only super_admin can update email
  if (requesterRole === 'super_admin') {
    allowedFields.push('email');
  }

  // Check if email is being updated and validate uniqueness
  if (employeeData.email && requesterRole === 'super_admin') {
    const emailCheck = await pool.query(
      'SELECT id FROM users WHERE email = $1 AND id != $2',
      [employeeData.email, employeeId]
    );
    if (emailCheck.rows.length > 0) {
      throw new Error('Email already exists');
    }
  }

  // Validate date of birth - employee must be at least 18 years old
  if (employeeData.dateOfBirth) {
    const dob = new Date(employeeData.dateOfBirth);
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
      age--;
    }
    if (age < 18) {
      throw new Error('Employee must be at least 18 years old');
    }
  }

  for (const [key, value] of Object.entries(employeeData)) {
    const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
    if (allowedFields.includes(dbKey) && value !== undefined) {
      updates.push(`${dbKey} = $${paramCount}`);
      if (dbKey === 'pan_number' && typeof value === 'string') {
        values.push(value.slice(0, 10));
      } else {
        values.push(value);
      }
      paramCount++;
    }
  }

  if (updates.length === 0) {
    throw new Error('No valid fields to update');
  }

  values.push(employeeId);
  const query = `UPDATE users SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${paramCount}`;

  await pool.query(query, values);

  // Update education if provided
  if (employeeData.education) {
    for (const edu of employeeData.education) {
      if (edu.level) {
        // Validate year if provided (must be between 1950 and 5 years from current year)
        if (edu.year) {
          const year = parseInt(edu.year, 10);
          const currentYear = new Date().getFullYear();
          const maxYear = currentYear + 5;
          if (isNaN(year) || year < 1950 || year > maxYear) {
            throw new Error(`Graduation Year must be between 1950 and ${maxYear}`);
          }
        }
        
        await pool.query(
          `INSERT INTO education (employee_id, level, group_stream, college_university, year, score_percentage)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (employee_id, level) DO UPDATE
           SET group_stream = EXCLUDED.group_stream,
               college_university = EXCLUDED.college_university,
               year = EXCLUDED.year,
               score_percentage = EXCLUDED.score_percentage`,
          [
            employeeId,
            edu.level,
            edu.groupStream || null,
            edu.collegeUniversity || null,
            edu.year || null,
            edu.scorePercentage || null
          ]
        );
      }
    }
  }

  return { message: 'Employee updated successfully' };
};

export const deleteEmployee = async (employeeId: number) => {
  // Check if employee exists
  const result = await pool.query('SELECT id, role FROM users WHERE id = $1', [employeeId]);
  if (result.rows.length === 0) {
    throw new Error('Employee not found');
  }

  const employee = result.rows[0];
  
  // Prevent deletion of super_admin users
  if (employee.role === 'super_admin') {
    throw new Error('Cannot delete super admin users');
  }

  // Start transaction to delete all related data
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Delete all related data in order (respecting foreign key constraints)
    // 1. Delete notifications
    await client.query('DELETE FROM notifications WHERE user_id = $1', [employeeId]);

    // 2. Delete audit logs
    await client.query('DELETE FROM audit_logs WHERE user_id = $1', [employeeId]);

    // 3. Delete leave days (these are linked to leave requests)
    await client.query('DELETE FROM leave_days WHERE leave_request_id IN (SELECT id FROM leave_requests WHERE employee_id = $1)', [employeeId]);

    // 4. Delete leave requests
    await client.query('DELETE FROM leave_requests WHERE employee_id = $1', [employeeId]);

    // 5. Delete leave balances
    await client.query('DELETE FROM leave_balances WHERE employee_id = $1', [employeeId]);

    // 6. Delete education records (has ON DELETE CASCADE, but explicit for clarity)
    await client.query('DELETE FROM education WHERE employee_id = $1', [employeeId]);

    // 7. Update reporting_manager_id in users table to NULL for employees reporting to this user
    await client.query('UPDATE users SET reporting_manager_id = NULL WHERE reporting_manager_id = $1', [employeeId]);

    // 8. Update created_by and updated_by references to NULL
    await client.query('UPDATE users SET created_by = NULL WHERE created_by = $1', [employeeId]);
    await client.query('UPDATE users SET updated_by = NULL WHERE updated_by = $1', [employeeId]);

    // 9. Finally, delete the user
    await client.query('DELETE FROM users WHERE id = $1', [employeeId]);

    await client.query('COMMIT');
    return { message: 'Employee and all related data deleted successfully' };
  } catch (error: any) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const addLeavesToEmployee = async (
  employeeId: number,
  leaveType: 'casual' | 'sick' | 'lop',
  count: number,
  updatedBy: number
) => {
  // Validate leave type
  if (!['casual', 'sick', 'lop'].includes(leaveType)) {
    throw new Error('Invalid leave type');
  }

  // Validate count
  if (count <= 0) {
    throw new Error('Leave count must be greater than 0');
  }

  // Check if employee exists
  const employeeCheck = await pool.query('SELECT id FROM users WHERE id = $1', [employeeId]);
  if (employeeCheck.rows.length === 0) {
    throw new Error('Employee not found');
  }

  // Get or create leave balance
  const balanceCheck = await pool.query(
    'SELECT id, casual_balance, sick_balance, lop_balance FROM leave_balances WHERE employee_id = $1',
    [employeeId]
  );

  const balanceColumn = `${leaveType}_balance`;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    if (balanceCheck.rows.length === 0) {
      // Create leave balance if it doesn't exist
      // Check if count exceeds maximum limit
      if (count > 99) {
        throw new Error(`Cannot add ${count} leaves. Maximum limit is 99 leaves per employee.`);
      }
      
      const initialBalances: any = { casual_balance: 0, sick_balance: 0, lop_balance: 0 };
      initialBalances[balanceColumn] = count;
      
      await client.query(
        `INSERT INTO leave_balances (employee_id, casual_balance, sick_balance, lop_balance, updated_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          employeeId,
          initialBalances.casual_balance,
          initialBalances.sick_balance,
          initialBalances.lop_balance,
          updatedBy
        ]
      );
    } else {
      // Get current balance for the leave type
      const currentBalance = parseFloat(balanceCheck.rows[0][balanceColumn] || '0');
      const newTotal = currentBalance + count;
      
      // Check if total would exceed maximum limit
      if (newTotal > 99) {
        throw new Error(`Cannot add ${count} leaves. Current balance: ${currentBalance}, Maximum limit: 99. Total would be: ${newTotal}`);
      }
      
      // Update existing balance
      await client.query(
        `UPDATE leave_balances 
         SET ${balanceColumn} = ${balanceColumn} + $1,
             last_updated = CURRENT_TIMESTAMP,
             updated_by = $2
         WHERE employee_id = $3`,
        [count, updatedBy, employeeId]
      );
    }

    await client.query('COMMIT');
    return { message: `${count} ${leaveType} leave(s) added successfully` };
  } catch (error: any) {
    await client.query('ROLLBACK');
    throw new Error(error.message || 'Failed to add leaves');
  } finally {
    client.release();
  }
};

export const getEmployeeLeaveBalances = async (employeeId: number) => {
  const result = await pool.query(
    'SELECT casual_balance, sick_balance, lop_balance FROM leave_balances WHERE employee_id = $1',
    [employeeId]
  );

  if (result.rows.length === 0) {
    // Return zero balances if not found
    return { casual: 0, sick: 0, lop: 0 };
  }

  const balance = result.rows[0];
  return {
    casual: parseFloat(balance.casual_balance) || 0,
    sick: parseFloat(balance.sick_balance) || 0,
    lop: parseFloat(balance.lop_balance) || 0
  };
};

