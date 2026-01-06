import { pool } from '../database/db';
import { hashPassword } from './auth.service';
import { logger } from '../utils/logger';
import { formatDateLocal } from '../utils/dateCalculator';
import * as emailTemplates from '../utils/emailTemplates';
import { calculateAllLeaveCredits } from '../utils/leaveCredit';

export const getEmployees = async (
  page: number = 1,
  limit: number = 20,
  search?: string,
  joiningDate?: string,
  status?: string
) => {
  logger.info(`[EMPLOYEE] [GET EMPLOYEES] ========== FUNCTION CALLED ==========`);
  logger.info(`[EMPLOYEE] [GET EMPLOYEES] Page: ${page}, Limit: ${limit}, Search: ${search || 'none'}, JoiningDate: ${joiningDate || 'none'}, Status: ${status || 'none'}`);

  const offset = (page - 1) * limit;
  let query = `
    SELECT id, emp_id, first_name || ' ' || COALESCE(last_name, '') as name,
           designation as position, date_of_joining as joining_date, status, role,
           profile_photo_url as profile_photo_key
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
      // Treat "inactive" as any non-active AND non-on-notice status
      query += ` AND status NOT IN ('active', 'on_notice')`;
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

  query += ` ORDER BY emp_id ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
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
      countQuery += ` AND status NOT IN ('active', 'on_notice')`;
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

  logger.info(`[EMPLOYEE] [GET EMPLOYEES] Found ${result.rows.length} employees, Total: ${countResult.rows[0].count}`);

  return {
    employees: result.rows.map(row => ({
      id: row.id,
      empId: row.emp_id,
      name: row.name,
      position: row.position,
      joiningDate: formatDateLocal(row.joining_date) || '',
      status: row.status,
      role: row.role,
      profilePhotoKey: row.profile_photo_key && row.profile_photo_key.startsWith('profile-photos/')
        ? row.profile_photo_key
        : null
    })),
    pagination: {
      page,
      limit,
      total: parseInt(countResult.rows[0].count)
    }
  };
};

export const getNextEmployeeId = async (): Promise<string> => {
  logger.info(`[EMPLOYEE] [GET NEXT EMPLOYEE ID] ========== FUNCTION CALLED ==========`);

  // Get all employee IDs that are numeric and find the maximum
  logger.info(`[EMPLOYEE] [GET NEXT EMPLOYEE ID] Querying database for maximum numeric employee ID`);
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
  logger.info(`[EMPLOYEE] [GET EMPLOYEE BY ID] ========== FUNCTION CALLED ==========`);
  logger.info(`[EMPLOYEE] [GET EMPLOYEE BY ID] Employee ID: ${employeeId}`);
  const result = await pool.query(
    `SELECT u.*, 
            COALESCE(rm.id, sa.sa_id) as reporting_manager_id, 
            COALESCE(u.reporting_manager_name, rm.first_name || ' ' || COALESCE(rm.last_name, ''), sa.sa_full_name) as reporting_manager_full_name
     FROM users u
     LEFT JOIN users rm ON u.reporting_manager_id = rm.id
     LEFT JOIN LATERAL (
       SELECT id as sa_id, first_name || ' ' || COALESCE(last_name, '') as sa_full_name
       FROM users 
       WHERE role = 'super_admin'
       ORDER BY id ASC
       LIMIT 1
     ) sa ON u.reporting_manager_id IS NULL AND u.role != 'super_admin'
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
    date_of_birth: formatDateLocal(user.date_of_birth),
    date_of_joining: formatDateLocal(user.date_of_joining),
    education: educationResult.rows
  };
};

export const createEmployee = async (employeeData: any) => {
  logger.info(`[EMPLOYEE] [CREATE EMPLOYEE] ========== FUNCTION CALLED ==========`);
  logger.info(`[EMPLOYEE] [CREATE EMPLOYEE] Employee ID: ${employeeData.empId}, Email: ${employeeData.email}, Name: ${employeeData.firstName} ${employeeData.lastName || ''}`);

  // Employee ID must be provided by HR/Super Admin
  if (!employeeData.empId || !employeeData.empId.trim()) {
    logger.warn(`[EMPLOYEE] [CREATE EMPLOYEE] Employee ID is required`);
    throw new Error('Employee ID is required');
  }

  const empId = employeeData.empId.trim().toUpperCase();
  logger.info(`[EMPLOYEE] [CREATE EMPLOYEE] Normalized Employee ID: ${empId}`);

  // Validate employee ID length (max 6 characters)
  if (empId.length > 6) {
    throw new Error('Employee ID must be maximum 6 characters');
  }

  // Validate employee ID format (alphanumeric only)
  if (!/^[A-Z0-9]+$/.test(empId)) {
    throw new Error('Employee ID must contain only letters and numbers');
  }

  // Check if emp_id or email already exists
  logger.info(`[EMPLOYEE] [CREATE EMPLOYEE] Checking if employee ID or email already exists`);
  const existingResult = await pool.query(
    'SELECT id FROM users WHERE emp_id = $1 OR email = $2',
    [empId, employeeData.email]
  );

  if (existingResult.rows.length > 0) {
    const existing = existingResult.rows[0];
    const existingCheck = await pool.query(
      'SELECT emp_id, email FROM users WHERE id = $1',
      [existing.id]
    );
    if (existingCheck.rows[0].emp_id === empId) {
      logger.warn(`[EMPLOYEE] [CREATE EMPLOYEE] Employee ID already exists: ${empId}`);
      throw new Error('Employee ID already exists');
    }
    if (existingCheck.rows[0].email === employeeData.email) {
      logger.warn(`[EMPLOYEE] [CREATE EMPLOYEE] Email already exists: ${employeeData.email}`);
      throw new Error('Email already exists');
    }
  }
  logger.info(`[EMPLOYEE] [CREATE EMPLOYEE] Employee ID and email are unique`);

  // Validate organization email domain
  const email = (employeeData.email || '').toLowerCase();
  if (!email.endsWith('@tensorgo.com') && !email.endsWith('@tensorgo.co.in')) {
    throw new Error('Only organization mail should be used');
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

  // Validate unique contact numbers
  const cNo = employeeData.contactNumber;
  const aNo = employeeData.altContact;
  const eNo = employeeData.emergencyContactNo;

  if (cNo && aNo && cNo === aNo) {
    throw new Error('Contact Number and Alternate Contact Number cannot be the same');
  }
  if (aNo && eNo && aNo === eNo) {
    throw new Error('Alternate Contact Number and Emergency Contact Number cannot be the same');
  }
  if (cNo && eNo && cNo === eNo) {
    throw new Error('Contact Number and Emergency Contact Number cannot be the same');
  }

  // Default password for newly created employees (if none explicitly provided)
  logger.info(`[EMPLOYEE] [CREATE EMPLOYEE] Hashing password`);
  const passwordHash = await hashPassword(employeeData.password || 'tensorgo@2023');
  logger.info(`[EMPLOYEE] [CREATE EMPLOYEE] Password hashed successfully`);

  // Super admin should not have a reporting manager
  const role = employeeData.role || 'employee';
  const reportingManagerId = role === 'super_admin' ? null : (employeeData.reportingManagerId || null);
  const reportingManagerName = role === 'super_admin' ? null : (employeeData.reportingManagerName || null);

  // Validate reporting manager status
  if (reportingManagerId) {
    const managerResult = await pool.query('SELECT status FROM users WHERE id = $1', [reportingManagerId]);
    if (managerResult.rows.length > 0) {
      const status = managerResult.rows[0].status;
      if (status === 'on_notice') {
        throw new Error('Employees in notice period cannot be reporting managers');
      }
      if (status !== 'active' && status !== 'on_leave') {
        throw new Error('Selected reporting manager must be active or on leave');
      }
    }
  }

  logger.info(`[EMPLOYEE] [CREATE EMPLOYEE] Inserting employee into database`);
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
      (() => {
        if (!employeeData.panNumber) return null;
        const pan = String(employeeData.panNumber).trim().toUpperCase();
        // Validate PAN format: 5 letters, 4 digits, 1 letter
        if (pan.length !== 10) {
          throw new Error('PAN number must be exactly 10 characters long');
        }
        const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
        if (!panRegex.test(pan)) {
          throw new Error('Invalid PAN format. Format: ABCDE1234F (5 letters, 4 digits, 1 letter)');
        }
        return pan;
      })(),
      employeeData.currentAddress || null,
      employeeData.permanentAddress || null,
      reportingManagerId,
      reportingManagerName,
      employeeData.status || 'active'
    ]
  );

  const userId = result.rows[0].id;
  logger.info(`[EMPLOYEE] [CREATE EMPLOYEE] Employee created successfully with User ID: ${userId}`);

  // Initialize leave balances (set to 0 by default as per requirement to disable auto-add on joining)
  // LOP balance defaults to 10
  const casualBalance = 0;
  const sickBalance = 0;

  logger.info(`[EMPLOYEE] [CREATE EMPLOYEE] Initializing leave balances - Casual: ${casualBalance}, Sick: ${sickBalance}, LOP: 10`);
  await pool.query(
    'INSERT INTO leave_balances (employee_id, casual_balance, sick_balance, lop_balance) VALUES ($1, $2, $3, 10)',
    [userId, casualBalance, sickBalance]
  );
  logger.info(`[EMPLOYEE] [CREATE EMPLOYEE] Leave balances initialized successfully`);

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


  // Send welcome email with credentials
  try {
    logger.info(`[EMPLOYEE] [CREATE EMPLOYEE] Preparing to send welcome email`);
    const loginUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const temporaryPassword = employeeData.password || 'tensorgo@2023';

    await emailTemplates.sendNewEmployeeCredentialsEmail(employeeData.email, {
      employeeName: `${employeeData.firstName} ${employeeData.middleName || ''} ${employeeData.lastName || ''}`.trim(),
      employeeEmpId: empId,
      email: employeeData.email,
      temporaryPassword: temporaryPassword,
      loginUrl: loginUrl
    });
    logger.info(`[EMPLOYEE] [CREATE EMPLOYEE] New employee credentials email sent successfully to: ${employeeData.email}`);
  } catch (emailError: any) {
    // Log error but don't fail employee creation
    logger.error(`[EMPLOYEE] [CREATE EMPLOYEE] Error sending new employee credentials email:`, emailError);
  }

  logger.info(`[EMPLOYEE] [CREATE EMPLOYEE] Employee creation completed successfully - User ID: ${userId}, Emp ID: ${empId}`);
  return { employeeId: userId, message: 'Employee created successfully' };
};

export const updateEmployee = async (employeeId: number, employeeData: any, requesterRole?: string, requesterId?: number) => {
  logger.info(`[EMPLOYEE] [UPDATE EMPLOYEE] ========== FUNCTION CALLED ==========`);
  logger.info(`[EMPLOYEE] [UPDATE EMPLOYEE] Employee ID: ${employeeId}, Requester Role: ${requesterRole || 'none'}, Requester ID: ${requesterId || 'none'}`);
  logger.info(`[EMPLOYEE] [UPDATE EMPLOYEE] Fields to update: ${Object.keys(employeeData).join(', ')}`);

  // Check if employee exists and get their role
  logger.info(`[EMPLOYEE] [UPDATE EMPLOYEE] Checking if employee exists`);
  const employeeCheck = await pool.query('SELECT id, role, status, first_name, last_name, date_of_joining FROM users WHERE id = $1', [employeeId]);
  if (employeeCheck.rows.length === 0) {
    logger.warn(`[EMPLOYEE] [UPDATE EMPLOYEE] Employee not found - Employee ID: ${employeeId}`);
    throw new Error('Employee not found');
  }
  logger.info(`[EMPLOYEE] [UPDATE EMPLOYEE] Employee found - Role: ${employeeCheck.rows[0].role}`);

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

  // Prevent role change if there are subordinates reporting to this user
  const dbRole = String(employeeCheck.rows[0].role || '').trim().toLowerCase();
  const requestedRole = employeeData.role ? String(employeeData.role).trim().toLowerCase() : null;
  const isRoleTransition = requestedRole !== null && requestedRole !== dbRole;

  if (isRoleTransition) {
    // Check for subordinates
    const subordinatesResult = await pool.query(
      'SELECT id, first_name || \' \' || COALESCE(last_name, \'\') as name FROM users WHERE reporting_manager_id = $1 LIMIT 5',
      [employeeId]
    );

    if (subordinatesResult.rows.length > 0) {
      logger.warn(`[EMPLOYEE] [UPDATE EMPLOYEE] Role change BLOCKED for user ${employeeId} due to existing subordinates.`);
      throw new Error('Please remove the users reporting to that user and try again.');
    }
  }

  // Validate reporting manager status if it's being updated
  if (employeeData.reportingManagerId) {
    const managerResult = await pool.query('SELECT status FROM users WHERE id = $1', [employeeData.reportingManagerId]);
    if (managerResult.rows.length > 0) {
      const status = managerResult.rows[0].status;
      if (status === 'on_notice') {
        throw new Error('Employees in notice period cannot be reporting managers');
      }
      if (status !== 'active' && status !== 'on_leave') {
        throw new Error('Selected reporting manager must be active or on leave');
      }
    }
  }

  // Prevent HR from editing super_admin or other HR users (except role updates)
  if (requesterRole === 'hr' && (employeeRole === 'super_admin' || employeeRole === 'hr') && !isOnlyRoleUpdate) {
    if (isRoleBeingUpdated) {
      // Remove all fields except role
      Object.keys(employeeData).forEach(key => {
        const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
        if (dbKey !== 'role') {
          delete employeeData[key];
        }
      });
    } else {
      const targetName = employeeRole === 'super_admin' ? 'super admin' : (requesterId === employeeId ? 'their own' : 'other HR');
      throw new Error(`HR cannot edit ${targetName} details`);
    }
  }

  // Validate organization email domain if email is being updated
  if (employeeData.email) {
    const email = employeeData.email.toLowerCase();
    if (!email.endsWith('@tensorgo.com') && !email.endsWith('@tensorgo.co.in')) {
      throw new Error('Only organization mail should be used');
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

  // Only super_admin can update email and date_of_joining
  if (requesterRole === 'super_admin') {
    allowedFields.push('email');
    allowedFields.push('date_of_joining');
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

  // Validate unique contact numbers
  const cNo = employeeData.contactNumber;
  const aNo = employeeData.altContact || employeeData.alternateContactNumber;
  const eNo = employeeData.emergencyContactNo || employeeData.emergencyContactNumber;

  if (cNo && aNo && cNo === aNo) {
    throw new Error('Contact Number and Alternate Contact Number cannot be the same');
  }
  if (aNo && eNo && aNo === eNo) {
    throw new Error('Alternate Contact Number and Emergency Contact Number cannot be the same');
  }
  if (cNo && eNo && cNo === eNo) {
    throw new Error('Contact Number and Emergency Contact Number cannot be the same');
  }

  const fieldMap: Record<string, string> = {
    firstName: 'first_name',
    middleName: 'middle_name',
    lastName: 'last_name',
    contactNumber: 'contact_number',
    altContact: 'alt_contact',
    alternateContactNumber: 'alt_contact', // Legacy support
    dateOfBirth: 'date_of_birth',
    gender: 'gender',
    bloodGroup: 'blood_group',
    maritalStatus: 'marital_status',
    emergencyContactName: 'emergency_contact_name',
    emergencyContactNo: 'emergency_contact_no',
    emergencyContactNumber: 'emergency_contact_no', // Legacy support
    emergencyContactRelation: 'emergency_contact_relation',
    designation: 'designation',
    department: 'department',
    aadharNumber: 'aadhar_number',
    panNumber: 'pan_number',
    currentAddress: 'current_address',
    permanentAddress: 'permanent_address',
    status: 'status',
    reportingManagerId: 'reporting_manager_id',
    reportingManagerName: 'reporting_manager_name'
  };

  const processedKeys = new Set();

  for (const [key, value] of Object.entries(employeeData)) {
    // Determine dbKey
    let dbKey = fieldMap[key];
    if (!dbKey) {
      // Fallback to regex mapping if not in map
      dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
    }

    // Skip if already processed this column or not allowed
    if (processedKeys.has(dbKey) || !allowedFields.includes(dbKey) || value === undefined) {
      continue;
    }

    // Employee ID cannot be changed once set
    if (dbKey === 'emp_id') {
      continue;
    }

    updates.push(`${dbKey} = $${paramCount}`);
    processedKeys.add(dbKey);

    if (dbKey === 'pan_number' && typeof value === 'string') {
      const pan = value.trim().toUpperCase();
      if (pan && pan.length !== 10) {
        throw new Error('PAN number must be exactly 10 characters long');
      }
      if (pan && pan.length === 10) {
        const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
        if (!panRegex.test(pan)) {
          throw new Error('Invalid PAN format. Format: ABCDE1234F (5 letters, 4 digits, 1 letter)');
        }
      }
      values.push(pan || null);
    } else {
      // Treat empty strings as null for optional fields (except required ones)
      const finalValue = (typeof value === 'string' && value.trim() === '') ? null : value;
      values.push(finalValue);
    }
    paramCount++;
  }

  if (updates.length === 0) {
    throw new Error('No valid fields to update');
  }

  values.push(employeeId);
  const query = `UPDATE users SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${paramCount}`;

  logger.info(`[EMPLOYEE] [UPDATE EMPLOYEE] Executing update query: ${query}`);
  logger.info(`[EMPLOYEE] [UPDATE EMPLOYEE] Query values: ${JSON.stringify(values)}`);

  await pool.query(query, values);
  logger.info(`[EMPLOYEE] [UPDATE EMPLOYEE] Database update completed successfully`);

  // Check if status changed to on_notice, resigned, terminated, or inactive
  const RESTRICTED_STATUSES = ['on_notice', 'resigned', 'terminated', 'inactive'];
  const oldStatus = employeeCheck.rows[0].status;
  const newStatus = employeeData.status;

  if (newStatus && RESTRICTED_STATUSES.includes(newStatus) && oldStatus !== newStatus) {
    logger.info(`[EMPLOYEE] [UPDATE EMPLOYEE] Manager status changed from ${oldStatus} to ${newStatus}. Checking for subordinates to reassign.`);

    // Find all subordinates
    const subordinatesResult = await pool.query(
      'SELECT id, email, first_name || \' \' || COALESCE(last_name, \'\') as name FROM users WHERE reporting_manager_id = $1',
      [employeeId]
    );

    if (subordinatesResult.rows.length > 0) {
      logger.info(`[EMPLOYEE] [UPDATE EMPLOYEE] Found ${subordinatesResult.rows.length} subordinates. Finding Super Admin for reassignment.`);
      // Find Super Admin
      const superAdminResult = await pool.query(
        'SELECT id, emp_id, first_name || \' \' || COALESCE(last_name, \'\') as name FROM users WHERE role = \'super_admin\' ORDER BY id ASC LIMIT 1'
      );

      if (superAdminResult.rows.length > 0) {
        const superAdmin = superAdminResult.rows[0];
        const managerName = superAdmin.name;
        const managerId = superAdmin.id;
        const managerEmpId = superAdmin.emp_id;

        // Update subordinates
        await pool.query(
          'UPDATE users SET reporting_manager_id = $1, reporting_manager_name = $2 WHERE reporting_manager_id = $3',
          [managerId, managerName, employeeId]
        );
        logger.info(`[EMPLOYEE] [UPDATE EMPLOYEE] Reassigned ${subordinatesResult.rows.length} subordinates to ${managerName} (${managerEmpId})`);

        // Send emails
        try {
          const { sendReportingManagerChangeEmail } = await import('../utils/emailTemplates');
          const previousManagerName = `${employeeCheck.rows[0].first_name} ${employeeCheck.rows[0].last_name || ''}`.trim();

          for (const sub of subordinatesResult.rows) {
            try {
              await sendReportingManagerChangeEmail(sub.email, {
                employeeName: sub.name,
                previousManagerName,
                newManagerName: managerName,
                newManagerEmpId: managerEmpId
              });
              logger.info(`[EMPLOYEE] [UPDATE EMPLOYEE] Reassignment email sent to subordinate: ${sub.email}`);
            } catch (emailError) {
              logger.error(`[EMPLOYEE] [UPDATE EMPLOYEE] Error sending reassignment email to ${sub.email}:`, emailError);
            }
          }
        } catch (importError) {
          logger.error(`[EMPLOYEE] [UPDATE EMPLOYEE] Error importing email templates for reassignment:`, importError);
        }
      } else {
        logger.warn(`[EMPLOYEE] [UPDATE EMPLOYEE] No Super Admin found to reassign subordinates to.`);
      }
    } else {
      logger.info(`[EMPLOYEE] [UPDATE EMPLOYEE] No subordinates found for the updated employee.`);
    }
  }

  // If joining date was updated, recalculate leave balances
  const oldJoiningDate = employeeCheck.rows[0].date_of_joining ? new Date(employeeCheck.rows[0].date_of_joining).toISOString().split('T')[0] : null;
  const newJoiningDate = employeeData.dateOfJoining ? new Date(employeeData.dateOfJoining).toISOString().split('T')[0] : null;

  if (newJoiningDate && newJoiningDate !== oldJoiningDate && requesterRole === 'super_admin') {
    const allCredits = calculateAllLeaveCredits(employeeData.dateOfJoining);

    // Update leave balances with recalculated credits
    // Ensure casual balance doesn't exceed 99 limit
    const casualBalance = Math.min(allCredits.casual, 99);
    const sickBalance = Math.min(allCredits.sick, 99);

    // Check if leave balance record exists
    const balanceCheck = await pool.query(
      'SELECT employee_id FROM leave_balances WHERE employee_id = $1',
      [employeeId]
    );

    if (balanceCheck.rows.length > 0) {
      // Update existing balance
      await pool.query(
        `UPDATE leave_balances 
         SET casual_balance = $1,
             sick_balance = $2,
             last_updated = CURRENT_TIMESTAMP,
             updated_by = $3
         WHERE employee_id = $4`,
        [casualBalance, sickBalance, requesterId, employeeId]
      );
    } else {
      // Create new balance record if it doesn't exist
      await pool.query(
        `INSERT INTO leave_balances (employee_id, casual_balance, sick_balance, lop_balance, updated_by)
         VALUES ($1, $2, $3, 10, $4)`,
        [employeeId, casualBalance, sickBalance, requesterId]
      );
    }
  }

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

  // Send email notification if HR or Super Admin updated employee details
  if ((requesterRole === 'hr' || requesterRole === 'super_admin') && !isOnlyRoleUpdate) {
    try {
      // Get employee details and requester details for email
      const [employeeResult, requesterResult] = await Promise.all([
        pool.query(
          `SELECT email, first_name || ' ' || COALESCE(last_name, '') as employee_name, emp_id 
           FROM users WHERE id = $1`,
          [employeeId]
        ),
        pool.query(
          `SELECT first_name || ' ' || COALESCE(last_name, '') as name FROM users WHERE id = $1`,
          [requesterId]
        )
      ]);

      if (employeeResult.rows.length > 0 && employeeResult.rows[0].email) {
        const requesterName = requesterResult.rows.length > 0 ? requesterResult.rows[0].name : (requesterRole === 'super_admin' ? 'Super Admin' : 'HR');

        await emailTemplates.sendEmployeeDetailsUpdateEmail(employeeResult.rows[0].email, {
          employeeName: employeeResult.rows[0].employee_name || 'Employee',
          employeeEmpId: employeeResult.rows[0].emp_id || '',
          updatedFields: employeeData,
          updatedBy: requesterName
        });
        logger.info(`[EMPLOYEE] [UPDATE EMPLOYEE] Employee details update email sent successfully to: ${employeeResult.rows[0].email}`);
      }
    } catch (emailError: any) {
      // Log error but don't fail employee update
      logger.error(`[EMPLOYEE] [UPDATE EMPLOYEE] Error sending employee details update email:`, emailError);
    }
  }

  logger.info(`[EMPLOYEE] [UPDATE EMPLOYEE] Employee update completed successfully - Employee ID: ${employeeId}`);
  return { message: 'Employee updated successfully' };
};

export const deleteEmployee = async (employeeId: number) => {
  logger.info(`[EMPLOYEE] [DELETE EMPLOYEE] ========== FUNCTION CALLED ==========`);
  logger.info(`[EMPLOYEE] [DELETE EMPLOYEE] Employee ID: ${employeeId}`);

  // Check if employee exists
  logger.info(`[EMPLOYEE] [DELETE EMPLOYEE] Checking if employee exists`);
  const result = await pool.query('SELECT id, role FROM users WHERE id = $1', [employeeId]);
  if (result.rows.length === 0) {
    logger.warn(`[EMPLOYEE] [DELETE EMPLOYEE] Employee not found - Employee ID: ${employeeId}`);
    throw new Error('Employee not found');
  }

  const employee = result.rows[0];
  logger.info(`[EMPLOYEE] [DELETE EMPLOYEE] Employee found - Role: ${employee.role}`);

  // Prevent deletion of super_admin users
  if (employee.role === 'super_admin') {
    logger.warn(`[EMPLOYEE] [DELETE EMPLOYEE] Attempt to delete super admin user - Employee ID: ${employeeId}`);
    throw new Error('Cannot delete super admin users');
  }

  // Start transaction to delete all related data
  logger.info(`[EMPLOYEE] [DELETE EMPLOYEE] Starting database transaction`);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    logger.info(`[EMPLOYEE] [DELETE EMPLOYEE] Transaction started`);

    // Delete all related data in order (respecting foreign key constraints)
    // 1. Delete leave days (these are linked to leave requests)
    await client.query('DELETE FROM leave_days WHERE leave_request_id IN (SELECT id FROM leave_requests WHERE employee_id = $1)', [employeeId]);

    // 2. Delete leave requests
    await client.query('DELETE FROM leave_requests WHERE employee_id = $1', [employeeId]);

    // 3. Delete leave balances
    await client.query('DELETE FROM leave_balances WHERE employee_id = $1', [employeeId]);

    // 4. Delete education records (has ON DELETE CASCADE, but explicit for clarity)
    await client.query('DELETE FROM education WHERE employee_id = $1', [employeeId]);

    // 5. Update reporting_manager_id in users table to NULL for employees reporting to this user
    await client.query('UPDATE users SET reporting_manager_id = NULL WHERE reporting_manager_id = $1', [employeeId]);

    // 6. Update created_by and updated_by references to NULL
    await client.query('UPDATE users SET created_by = NULL WHERE created_by = $1', [employeeId]);
    await client.query('UPDATE users SET updated_by = NULL WHERE updated_by = $1', [employeeId]);

    // 7. Finally, delete the user
    logger.info(`[EMPLOYEE] [DELETE EMPLOYEE] Deleting user record`);
    await client.query('DELETE FROM users WHERE id = $1', [employeeId]);

    await client.query('COMMIT');
    logger.info(`[EMPLOYEE] [DELETE EMPLOYEE] Transaction committed successfully`);
    logger.info(`[EMPLOYEE] [DELETE EMPLOYEE] Employee and all related data deleted successfully - Employee ID: ${employeeId}`);
    return { message: 'Employee and all related data deleted successfully' };
  } catch (error: any) {
    await client.query('ROLLBACK');
    logger.error(`[EMPLOYEE] [DELETE EMPLOYEE] Transaction rolled back - Error deleting employee:`, error);
    throw error;
  } finally {
    client.release();
  }
};

export const addLeavesToEmployee = async (
  employeeId: number,
  leaveType: 'casual' | 'sick' | 'lop',
  count: number,
  updatedBy: number,
  comment?: string
) => {
  logger.info(`[EMPLOYEE] [ADD LEAVES] ========== FUNCTION CALLED ==========`);
  logger.info(`[EMPLOYEE] [ADD LEAVES] Employee ID: ${employeeId}, Leave Type: ${leaveType}, Count: ${count}, Updated By: ${updatedBy}`);

  // Validate leave type
  if (!['casual', 'sick', 'lop'].includes(leaveType)) {
    logger.warn(`[EMPLOYEE] [ADD LEAVES] Invalid leave type: ${leaveType}`);
    throw new Error('Invalid leave type');
  }

  // Validate count
  if (count <= 0) {
    throw new Error('Leave count must be greater than 0');
  }

  // Check roles for permission
  const [requesterResult, targetResult] = await Promise.all([
    pool.query('SELECT role FROM users WHERE id = $1', [updatedBy]),
    pool.query('SELECT role FROM users WHERE id = $1', [employeeId])
  ]);

  if (requesterResult.rows.length === 0) {
    throw new Error('Requester not found');
  }
  if (targetResult.rows.length === 0) {
    throw new Error('Employee not found');
  }

  const requesterRole = requesterResult.rows[0].role;
  const targetRole = targetResult.rows[0].role;

  // HR cannot add leaves for themselves, other HRs, or Super Admins
  if (requesterRole === 'hr' && (targetRole === 'hr' || targetRole === 'super_admin')) {
    throw new Error('HR cannot add leaves for themselves, other HR users, or Super Admins');
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

      // For LOP, check if it would exceed 10 (strict limit)
      if (balanceColumn === 'lop_balance' && newTotal > 10) {
        throw new Error(`Cannot add ${count} LOP leaves. Current LOP balance: ${currentBalance}, Maximum limit: 10. Total would be: ${newTotal}`);
      }

      // Check if total would exceed maximum limit (99 for casual/sick)
      if (balanceColumn !== 'lop_balance' && newTotal > 99) {
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

    // Send email notification to employee
    try {
      const employeeResult = await pool.query(
        `SELECT u.email, u.first_name || ' ' || COALESCE(u.last_name, '') as employee_name, u.emp_id,
                approver.first_name || ' ' || COALESCE(approver.last_name, '') as approver_name
         FROM users u
         LEFT JOIN users approver ON approver.id = $1
         WHERE u.id = $2`,
        [updatedBy, employeeId]
      );

      if (employeeResult.rows.length > 0) {
        const employee = employeeResult.rows[0];
        const previousBalance = balanceCheck.rows.length > 0
          ? parseFloat(balanceCheck.rows[0][balanceColumn] || '0')
          : 0;
        const newBalance = previousBalance + count;

        await emailTemplates.sendLeaveAllocationEmail(employee.email, {
          employeeName: employee.employee_name || 'Employee',
          employeeEmpId: employee.emp_id || '',
          leaveType: leaveType,
          allocatedDays: count,
          previousBalance: previousBalance,
          newBalance: newBalance,
          allocatedBy: employee.approver_name || 'HR/Admin',
          allocationDate: formatDateLocal(new Date()) || '',
          comment: comment
        });
        logger.info(`✅ Leave allocation email sent to employee: ${employee.email}`);
      }
    } catch (emailError: any) {
      // Log error but don't fail leave allocation
      logger.error(`❌ Error sending leave allocation email:`, emailError);
    }

    return { message: `${count} ${leaveType} leave(s) added successfully` };
  } catch (error: any) {
    await client.query('ROLLBACK');
    throw new Error(error.message || 'Failed to add leaves');
  } finally {
    client.release();
  }
};

export const getEmployeeLeaveBalances = async (employeeId: number) => {
  logger.info(`[EMPLOYEE] [GET LEAVE BALANCES] ========== FUNCTION CALLED ==========`);
  logger.info(`[EMPLOYEE] [GET LEAVE BALANCES] Employee ID: ${employeeId}`);

  const result = await pool.query(
    'SELECT casual_balance, sick_balance, lop_balance FROM leave_balances WHERE employee_id = $1',
    [employeeId]
  );

  if (result.rows.length === 0) {
    logger.info(`[EMPLOYEE] [GET LEAVE BALANCES] No balance record found, returning zero balances`);
    // Return zero balances if not found
    return { casual: 0, sick: 0, lop: 0 };
  }

  const balance = result.rows[0];
  const balances = {
    casual: parseFloat(balance.casual_balance) || 0,
    sick: parseFloat(balance.sick_balance) || 0,
    lop: parseFloat(balance.lop_balance) || 0
  };
  logger.info(`[EMPLOYEE] [GET LEAVE BALANCES] Balances retrieved - Casual: ${balances.casual}, Sick: ${balances.sick}, LOP: ${balances.lop}`);
  return balances;
};

/**
 * Convert LOP leaves to casual leaves
 * Only allowed if employee has LOP balance
 * @param employeeId Employee ID
 * @param count Number of LOP leaves to convert
 * @param updatedBy User ID who is performing the conversion
 * @returns Success message
 */
export const convertLopToCasual = async (
  employeeId: number,
  count: number,
  updatedBy: number
) => {
  logger.info(`[EMPLOYEE] [CONVERT LOP TO CASUAL] ========== FUNCTION CALLED ==========`);
  logger.info(`[EMPLOYEE] [CONVERT LOP TO CASUAL] Employee ID: ${employeeId}, Count: ${count}, Updated By: ${updatedBy}`);

  // Validate count
  if (count <= 0) {
    logger.warn(`[EMPLOYEE] [CONVERT LOP TO CASUAL] Invalid count: ${count}`);
    throw new Error('Conversion count must be greater than 0');
  }

  // Check if employee exists
  logger.info(`[EMPLOYEE] [CONVERT LOP TO CASUAL] Checking if employee exists`);
  const employeeCheck = await pool.query('SELECT id FROM users WHERE id = $1', [employeeId]);
  if (employeeCheck.rows.length === 0) {
    logger.warn(`[EMPLOYEE] [CONVERT LOP TO CASUAL] Employee not found - Employee ID: ${employeeId}`);
    throw new Error('Employee not found');
  }

  // Get current leave balances
  logger.info(`[EMPLOYEE] [CONVERT LOP TO CASUAL] Fetching current leave balances`);
  const balanceCheck = await pool.query(
    'SELECT id, casual_balance, sick_balance, lop_balance FROM leave_balances WHERE employee_id = $1',
    [employeeId]
  );

  const client = await pool.connect();

  try {
    logger.info(`[EMPLOYEE] [CONVERT LOP TO CASUAL] Starting database transaction`);
    await client.query('BEGIN');
    logger.info(`[EMPLOYEE] [CONVERT LOP TO CASUAL] Transaction started`);

    // Get or create balance record
    let currentLop = 0;
    let currentCasual = 0;

    if (balanceCheck.rows.length === 0) {
      // No balance record exists, create one with default values
      await client.query(
        `INSERT INTO leave_balances (employee_id, casual_balance, sick_balance, lop_balance, updated_by)
         VALUES ($1, 0, 0, 0, $2)`,
        [employeeId, updatedBy]
      );
      currentLop = 0;
      currentCasual = 0;
    } else {
      currentLop = parseFloat(balanceCheck.rows[0].lop_balance || '0') || 0;
      currentCasual = parseFloat(balanceCheck.rows[0].casual_balance || '0') || 0;
    }

    // Validate parsed values
    if (isNaN(currentLop) || isNaN(currentCasual)) {
      throw new Error('Invalid leave balance data. Please contact administrator.');
    }

    // Allow conversion even if LOP balance is 0 or negative
    // If LOP balance is insufficient, it will go negative (allowed)
    // Calculate new balances (allow negative LOP)
    const newLop = currentLop - count;
    const newCasual = currentCasual + count;

    // Check if casual balance would exceed maximum limit
    if (newCasual > 99) {
      throw new Error(`Cannot convert ${count} LOP leaves. Current casual balance: ${currentCasual}, Maximum limit: 99. Total would be: ${newCasual}`);
    }

    // Update balances
    await client.query(
      `UPDATE leave_balances 
       SET casual_balance = $1,
           lop_balance = $2,
           last_updated = CURRENT_TIMESTAMP,
           updated_by = $3
       WHERE employee_id = $4`,
      [newCasual, newLop, updatedBy, employeeId]
    );

    await client.query('COMMIT');

    // Send email notification to employee
    try {
      const { sendLeaveAllocationEmail } = await import('../utils/emailTemplates');
      const employeeResult = await pool.query(
        `SELECT u.email, u.first_name || ' ' || COALESCE(u.last_name, '') as employee_name, u.emp_id,
                approver.first_name || ' ' || COALESCE(approver.last_name, '') as approver_name
         FROM users u
         LEFT JOIN users approver ON approver.id = $1
         WHERE u.id = $2`,
        [updatedBy, employeeId]
      );

      if (employeeResult.rows.length > 0) {
        const employee = employeeResult.rows[0];

        await sendLeaveAllocationEmail(employee.email, {
          employeeName: employee.employee_name || 'Employee',
          employeeEmpId: employee.emp_id || '',
          leaveType: 'casual',
          allocatedDays: count,
          previousBalance: currentCasual,
          newBalance: newCasual,
          allocatedBy: employee.approver_name || 'HR/Admin',
          allocationDate: formatDateLocal(new Date()) || '',
          conversionNote: `${count} LOP leave(s) converted to casual leave(s). LOP balance: ${currentLop} → ${newLop}`
        });
        logger.info(`✅ LOP to casual conversion email sent to employee: ${employee.email}`);
      }
    } catch (emailError: any) {
      // Log error but don't fail conversion
      logger.error(`❌ Error sending conversion email:`, emailError);
    }

    return {
      message: `${count} LOP leave(s) converted to casual leave(s) successfully`,
      previousLop: currentLop,
      newLop: newLop,
      previousCasual: currentCasual,
      newCasual: newCasual
    };
  } catch (error: any) {
    await client.query('ROLLBACK');
    throw new Error(error.message || 'Failed to convert LOP to casual');
  } finally {
    client.release();
  }
};

