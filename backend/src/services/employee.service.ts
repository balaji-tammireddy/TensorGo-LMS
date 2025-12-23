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
           designation as position, date_of_joining as joining_date, status
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

  query += ` ORDER BY date_of_joining ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
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
      status: row.status
    })),
    pagination: {
      page,
      limit,
      total: parseInt(countResult.rows[0].count)
    }
  };
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
  // Enforce numeric-only employee ID pattern
  if (!/^\d+$/.test(employeeData.empId)) {
    throw new Error('Employee ID must contain digits only');
  }

  // Check if emp_id or email already exists
  const existingResult = await pool.query(
    'SELECT id FROM users WHERE emp_id = $1 OR email = $2',
    [employeeData.empId, employeeData.email]
  );

  if (existingResult.rows.length > 0) {
    throw new Error('Employee ID or email already exists');
  }

  // Default password for newly created employees (if none explicitly provided)
  const passwordHash = await hashPassword(employeeData.password || 'tensorgo@2023');

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
      employeeData.empId,
      employeeData.email,
      passwordHash,
      employeeData.role || 'employee',
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
      employeeData.reportingManagerId || null,
      employeeData.reportingManagerName || null,
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

export const updateEmployee = async (employeeId: number, employeeData: any, requesterRole?: string) => {
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
  const result = await pool.query('SELECT id FROM users WHERE id = $1', [employeeId]);
  if (result.rows.length === 0) {
    throw new Error('Employee not found');
  }

  // Soft delete by setting status to resigned
  await pool.query('UPDATE users SET status = $1 WHERE id = $2', ['resigned', employeeId]);

  return { message: 'Employee deleted successfully' };
};

