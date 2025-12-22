import { pool } from '../database/db';
import { hashPassword } from './auth.service';

export const getEmployees = async (
  page: number = 1,
  limit: number = 20,
  search?: string,
  filter?: string,
  status?: string
) => {
  const offset = (page - 1) * limit;
  let query = `
    SELECT id, emp_id, first_name || ' ' || COALESCE(last_name, '') as name,
           designation as position, date_of_joining as joining_date, status
    FROM users
    WHERE role != 'super_admin'
  `;
  const params: any[] = [];

  if (search) {
    query += ` AND (emp_id ILIKE $${params.length + 1} OR first_name ILIKE $${params.length + 1} OR last_name ILIKE $${params.length + 1} OR email ILIKE $${params.length + 1})`;
    params.push(`%${search}%`);
  }

  if (status) {
    query += ` AND status = $${params.length + 1}`;
    params.push(status);
  }

  if (filter) {
    // Filter by department or designation
    query += ` AND (department ILIKE $${params.length + 1} OR designation ILIKE $${params.length + 1})`;
    params.push(`%${filter}%`);
  }

  query += ` ORDER BY date_of_joining DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limit, offset);

  const result = await pool.query(query, params);

  // Count total
  let countQuery = 'SELECT COUNT(*) FROM users WHERE role != \'super_admin\'';
  const countParams: any[] = [];

  if (search) {
    countQuery += ` AND (emp_id ILIKE $${countParams.length + 1} OR first_name ILIKE $${countParams.length + 1})`;
    countParams.push(`%${search}%`);
  }

  if (status) {
    countQuery += ` AND status = $${countParams.length + 1}`;
    countParams.push(status);
  }

  if (filter) {
    countQuery += ` AND (department ILIKE $${countParams.length + 1} OR designation ILIKE $${countParams.length + 1})`;
    countParams.push(`%${filter}%`);
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
            rm.first_name || ' ' || COALESCE(rm.last_name, '') as reporting_manager_name
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
  // Check if emp_id or email already exists
  const existingResult = await pool.query(
    'SELECT id FROM users WHERE emp_id = $1 OR email = $2',
    [employeeData.empId, employeeData.email]
  );

  if (existingResult.rows.length > 0) {
    throw new Error('Employee ID or email already exists');
  }

  const passwordHash = await hashPassword(employeeData.password || 'Password123!');

  const result = await pool.query(
    `INSERT INTO users (
      emp_id, email, password_hash, role, first_name, middle_name, last_name,
      contact_number, alt_contact, date_of_birth, gender, blood_group,
      marital_status, emergency_contact_name, emergency_contact_no,
      designation, department, date_of_joining, aadhar_number, pan_number,
      current_address, permanent_address, reporting_manager_id, status
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24
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
      employeeData.designation || null,
      employeeData.department || null,
      employeeData.dateOfJoining,
      employeeData.aadharNumber || null,
      employeeData.panNumber || null,
      employeeData.currentAddress || null,
      employeeData.permanentAddress || null,
      employeeData.reportingManagerId || null,
      employeeData.status || 'active'
    ]
  );

  const userId = result.rows[0].id;

  // Initialize leave balance
  await pool.query(
    'INSERT INTO leave_balances (employee_id, casual_balance, sick_balance, lop_balance) VALUES ($1, 12, 6, 10)',
    [userId]
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

export const updateEmployee = async (employeeId: number, employeeData: any) => {
  // Build update query dynamically
  const updates: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  const allowedFields = [
    'first_name', 'middle_name', 'last_name', 'contact_number', 'alt_contact',
    'date_of_birth', 'gender', 'blood_group', 'marital_status',
    'emergency_contact_name', 'emergency_contact_no', 'designation', 'department',
    'aadhar_number', 'pan_number', 'current_address', 'permanent_address',
    'reporting_manager_id', 'status'
  ];

  for (const [key, value] of Object.entries(employeeData)) {
    const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
    if (allowedFields.includes(dbKey) && value !== undefined) {
      updates.push(`${dbKey} = $${paramCount}`);
      values.push(value);
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

