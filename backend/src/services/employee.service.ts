import { pool } from '../database/db';
import { hashPassword } from './auth.service';
import { logger } from '../utils/logger';
import { formatDateLocal } from '../utils/dateCalculator';
import * as emailTemplates from '../utils/emailTemplates';
import { calculateAllLeaveCredits } from '../utils/leaveCredit';
import { toTitleCase } from '../utils/stringUtils';


export const getEmployees = async (
  page: number = 1,
  limit: number = 20,
  search?: string,
  joiningDate?: string,
  status?: string,
  role?: string
) => {
  logger.info(`[EMPLOYEE] [GET EMPLOYEES] ========== FUNCTION CALLED ==========`);
  logger.info(`[EMPLOYEE] [GET EMPLOYEES] Page: ${page}, Limit: ${limit}, Search: ${search || 'none'}, JoiningDate: ${joiningDate || 'none'}, Status: ${status || 'none'}, Role: ${role || 'none'}`);

  const offset = (page - 1) * limit;
  let query = `
    SELECT id, emp_id, first_name || ' ' || COALESCE(last_name, '') as name,
           designation as position, date_of_joining as joining_date, status, user_role as role,
           profile_photo_url as profile_photo_key
    FROM users
    WHERE 1=1
  `;
  const params: any[] = [];

  if (search) {
    // Check for special characters and emojis (allow only alphanumeric and spaces)
    const isValid = /^[a-zA-Z0-9\s]*$/.test(search);
    if (!isValid) {
      logger.warn(`[EMPLOYEE] [GET EMPLOYEES] Invalid search term detected: ${search}`);
      throw new Error('Search term contains invalid characters. Emojis and special characters are not allowed.');
    }

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

  if (role) {
    query += ` AND user_role = $${params.length + 1}`;
    params.push(role);
  }

  if (joiningDate) {
    // Filter by exact date of joining (YYYY-MM-DD)
    query += ` AND date_of_joining::date = $${params.length + 1}`;
    params.push(joiningDate);
  }

  if (search) {
    logger.info(`[EMPLOYEE] [GET EMPLOYEES] Applying search sort preference for: ${search}`);
    // Prioritize results starting with the search term
    const prefixParamIdx = params.length + 1;
    params.push(`${search}%`);

    query += ` ORDER BY 
      CASE 
        WHEN first_name ILIKE $${prefixParamIdx} THEN 0 
        WHEN emp_id ILIKE $${prefixParamIdx} THEN 1
        ELSE 2 
      END, 
      emp_id ASC`;
  } else {
    query += ` ORDER BY emp_id ASC`;
  }

  query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
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

  if (role) {
    countQuery += ` AND user_role = $${countParams.length + 1}`;
    countParams.push(role);
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
    `SELECT u.*, u.user_role as role,
            COALESCE(rm.id, sa.sa_id) as reporting_manager_id, 
            COALESCE(u.reporting_manager_name, rm.first_name || ' ' || COALESCE(rm.last_name, ''), sa.sa_full_name) as reporting_manager_full_name,
            COALESCE(sc.subordinate_count, 0) as subordinate_count
     FROM users u
     LEFT JOIN users rm ON u.reporting_manager_id = rm.id
     LEFT JOIN LATERAL (
       SELECT id as sa_id, first_name || ' ' || COALESCE(last_name, '') as sa_full_name
       FROM users 
       WHERE user_role = 'super_admin'
       ORDER BY id ASC
       LIMIT 1
     ) sa ON u.reporting_manager_id IS NULL AND u.user_role != 'super_admin'
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::integer as subordinate_count 
       FROM users sub 
       WHERE sub.reporting_manager_id = u.id
       AND sub.status IN ('active', 'on_leave', 'on_notice')
     ) sc ON true
     WHERE u.id = $1`,
    [employeeId]
  );

  if (result.rows.length === 0) {
    throw new Error('Employee not found');
  }

  const user = result.rows[0];

  const education = [];
  if (user.pg_stream || user.pg_college || user.pg_year || user.pg_percentage) {
    education.push({
      level: 'PG',
      groupStream: user.pg_stream,
      collegeUniversity: user.pg_college,
      year: user.pg_year,
      scorePercentage: user.pg_percentage
    });
  }
  if (user.ug_stream || user.ug_college || user.ug_year || user.ug_percentage) {
    education.push({
      level: 'UG',
      groupStream: user.ug_stream,
      collegeUniversity: user.ug_college,
      year: user.ug_year,
      scorePercentage: user.ug_percentage
    });
  }
  if (user.twelveth_stream || user.twelveth_college || user.twelveth_year || user.twelveth_percentage) {
    education.push({
      level: '12th',
      groupStream: user.twelveth_stream,
      collegeUniversity: user.twelveth_college,
      year: user.twelveth_year,
      scorePercentage: user.twelveth_percentage
    });
  }

  return {
    ...user,
    date_of_birth: formatDateLocal(user.date_of_birth),
    date_of_joining: formatDateLocal(user.date_of_joining),
    education: education
  };
};

export const createEmployee = async (employeeData: any, requesterRole?: string, requesterId?: number) => {
  logger.info(`[EMPLOYEE] [CREATE EMPLOYEE] ========== FUNCTION CALLED ==========`);

  // Remove leading zeros from empId if it's a numeric ID
  if (employeeData.empId) {
    const empIdStr = employeeData.empId.toString().trim();
    // If it's purely numeric, convert to integer and back to remove leading zeros
    if (/^\d+$/.test(empIdStr)) {
      employeeData.empId = parseInt(empIdStr, 10).toString();
    }
    // Otherwise keep the original value (for alphanumeric IDs like "SA 0001")
  }

  logger.info(`[EMPLOYEE] [CREATE EMPLOYEE] Employee ID: ${employeeData.empId}, Email: ${employeeData.email}, Name: ${employeeData.firstName} ${employeeData.lastName || ''}, Requester: ${requesterRole || 'none'}`);

  // Only super_admin can create another super_admin
  if (employeeData.role === 'super_admin' && requesterRole !== 'super_admin') {
    logger.warn(`[EMPLOYEE] [CREATE EMPLOYEE] Unauthorized attempt by ${requesterRole} to create super_admin`);
    throw new Error('Only Super Admin can create Super Admin users');
  }

  // Mandatory fields check
  const mandatoryFields = [
    { key: 'role', label: 'Role' },
    { key: 'firstName', label: 'First Name' },
    { key: 'lastName', label: 'Last Name' },
    { key: 'email', label: 'Official Email' },
    { key: 'contactNumber', label: 'Contact Number' },
    { key: 'altContact', label: 'Alternate Contact Number' },
    { key: 'dateOfBirth', label: 'Date of Birth' },
    { key: 'gender', label: 'Gender' },
    { key: 'bloodGroup', label: 'Blood Group' },
    { key: 'maritalStatus', label: 'Marital Status' },
    { key: 'emergencyContactName', label: 'Emergency Contact Name' },
    { key: 'emergencyContactNo', label: 'Emergency Contact Number' },
    { key: 'emergencyContactRelation', label: 'Emergency Contact Relation' },
    { key: 'designation', label: 'Designation' },
    { key: 'department', label: 'Department' },
    { key: 'dateOfJoining', label: 'Date of Joining' },
    { key: 'aadharNumber', label: 'Aadhar Number' },
    { key: 'panNumber', label: 'PAN Number' },
    { key: 'currentAddress', label: 'Current Address' },
    { key: 'permanentAddress', label: 'Permanent Address' }
  ];

  for (const field of mandatoryFields) {
    if (employeeData[field.key] === undefined || employeeData[field.key] === null || (typeof employeeData[field.key] === 'string' && employeeData[field.key].trim() === '')) {
      throw new Error(`${field.label} is required`);
    }
  }

  // Date of Joining must not be in the future
  if (employeeData.dateOfJoining) {
    const doj = new Date(employeeData.dateOfJoining);
    const today = new Date();
    today.setHours(23, 59, 59, 999); // Allow joining on current day
    if (doj > today) {
      throw new Error('Date of Joining cannot be in the future');
    }

    // Validate gap between Date of Birth and Date of Joining (min 18 years)
    if (employeeData.dateOfBirth) {
      const dob = new Date(employeeData.dateOfBirth);
      let workAge = doj.getFullYear() - dob.getFullYear();
      const monthDiff = doj.getMonth() - dob.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && doj.getDate() < dob.getDate())) {
        workAge--;
      }

      if (workAge < 18) {
        throw new Error('Joining Date must be at least 18 years after Date of Birth');
      }
    }
  }

  // Reporting manager required if role != 'super_admin'
  if (employeeData.role !== 'super_admin' && !employeeData.reportingManagerId) {
    throw new Error('Reporting Manager is required');
  }

  // Validate phone numbers length and format
  const phoneFields = [
    { key: 'contactNumber', label: 'Contact Number' },
    { key: 'altContact', label: 'Alternate Contact Number' },
    { key: 'emergencyContactNo', label: 'Emergency Contact Number' }
  ];

  for (const field of phoneFields) {
    const val = String(employeeData[field.key] || '').trim();
    if (val.length !== 10 || !/^\d+$/.test(val)) {
      throw new Error(`${field.label} must be exactly 10 digits`);
    }
  }

  // Validate text-only fields (no special characters, numbers or emojis)
  const textFields = [
    { key: 'firstName', label: 'First Name' },
    { key: 'middleName', label: 'Middle Name' },
    { key: 'lastName', label: 'Last Name' },
    { key: 'emergencyContactName', label: 'Emergency Contact Name' },
    { key: 'emergencyContactRelation', label: 'Emergency Contact Relation' },
    { key: 'designation', label: 'Designation' },
    { key: 'department', label: 'Department' }
  ];

  for (const field of textFields) {
    const val = employeeData[field.key];
    if (val && typeof val === 'string' && val.trim() !== '') {
      if (!/^[a-zA-Z\s]+$/.test(val)) {
        throw new Error(`${field.label} should only contain letters and spaces`);
      }
    }
  }

  // Validate Aadhar number length and format
  if (employeeData.aadharNumber) {
    const aadhar = String(employeeData.aadharNumber).trim();
    if (aadhar.length !== 12 || !/^\d+$/.test(aadhar)) {
      throw new Error('Aadhar must be exactly 12 digits');
    }
  }

  // Education validation
  if (!employeeData.education || !Array.isArray(employeeData.education)) {
    throw new Error('Education details are required');
  }

  const eduLevels = employeeData.education.map((e: any) => e.level);
  if (!eduLevels.includes('UG') || !eduLevels.includes('12th')) {
    throw new Error('UG and 12th education details are mandatory');
  }

  const birthDate = new Date(employeeData.dateOfBirth);
  const birthYear = birthDate.getFullYear();

  const educationYears: Record<string, number> = {};
  for (const edu of employeeData.education) {
    const isMandatory = ['UG', '12th'].includes(edu.level);
    const hasAnyField = edu.groupStream || edu.collegeUniversity || edu.year || edu.scorePercentage;

    if (isMandatory || hasAnyField) {
      if (!edu.groupStream || !edu.collegeUniversity || !edu.year || !edu.scorePercentage) {
        throw new Error(`Please fill complete details for ${edu.level} education`);
      }

      // Validate for special characters and emojis
      const nameRegex = /^[a-zA-Z0-9\s.,&()-]+$/;
      if (!nameRegex.test(edu.groupStream)) {
        throw new Error(`Group/Stream for ${edu.level} contains invalid characters or emojis`);
      }
      if (!nameRegex.test(edu.collegeUniversity)) {
        throw new Error(`College/University for ${edu.level} contains invalid characters or emojis`);
      }
      if (!/^[0-9]{4}$/.test(edu.year)) {
        throw new Error(`Graduation Year for ${edu.level} must be a valid 4-digit year`);
      }
      if (!/^[0-9.]+%?$/.test(edu.scorePercentage)) {
        throw new Error(`Score/Percentage for ${edu.level} must be a valid number or percentage`);
      }

      const gradYear = parseInt(edu.year, 10);

      // Basic logic check for year
      const currentYear = new Date().getFullYear();
      if (gradYear < 1950 || gradYear > currentYear + 10) {
        throw new Error(`Graduation Year for ${edu.level} appears illogical (${gradYear})`);
      }

      // Minimum 15 years gap between Date of Birth and any graduation year
      const birthYear = new Date(employeeData.dateOfBirth).getFullYear();
      if (gradYear - birthYear < 15) {
        throw new Error(`Minimum 15 years gap required between Date of Birth and ${edu.level} Graduation Year`);
      }

      educationYears[edu.level] = gradYear;
    }
  }

  // Enforce logical graduation year gaps
  if (educationYears['12th'] && educationYears['UG'] && educationYears['UG'] - educationYears['12th'] < 3) {
    throw new Error('Minimum 3 years gap required between 12th and UG Graduation Year');
  }

  if (educationYears['UG'] && educationYears['PG'] && educationYears['PG'] - educationYears['UG'] < 2) {
    throw new Error('Minimum 2 years gap required between UG and PG Graduation Year');
  }

  // Basic order validation as fallback
  if (educationYears['12th'] && educationYears['UG'] && educationYears['12th'] >= educationYears['UG']) {
    throw new Error('12th Graduation Year must be before UG Graduation Year');
  }
  if (educationYears['UG'] && educationYears['PG'] && educationYears['UG'] >= educationYears['PG']) {
    throw new Error('UG Graduation Year must be before PG Graduation Year');
  }

  // Enum validations
  const allowedStatuses = ['active', 'on_leave', 'on_notice', 'resigned', 'terminated', 'inactive'];
  if (employeeData.status && !allowedStatuses.includes(employeeData.status)) {
    throw new Error('Invalid status');
  }

  const allowedGenders = ['Male', 'Female', 'Other'];
  if (employeeData.gender && !allowedGenders.includes(employeeData.gender)) {
    throw new Error('Invalid gender. Must be Male, Female, or Other');
  }

  const allowedBloodGroups = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];
  if (employeeData.bloodGroup && !allowedBloodGroups.includes(employeeData.bloodGroup)) {
    throw new Error('Invalid blood group');
  }

  const allowedMaritalStatuses = ['Single', 'Married', 'Divorced', 'Widowed'];
  if (employeeData.maritalStatus && !allowedMaritalStatuses.includes(employeeData.maritalStatus)) {
    throw new Error('Invalid marital status');
  }

  // Employee ID must be provided by HR/Super Admin
  if (!employeeData.empId || !employeeData.empId.trim()) {
    logger.warn(`[EMPLOYEE] [CREATE EMPLOYEE] Employee ID is required`);
    throw new Error('Employee ID is required');
  }

  // employeeData.empId has already been cleaned of leading zeros at the top of this function
  // Now just apply trim and uppercase normalization
  const empId = employeeData.empId.toString().trim().toUpperCase();
  logger.info(`[EMPLOYEE] [CREATE EMPLOYEE] Normalized Employee ID: ${empId}`);

  // Validate employee ID length (max 20 characters)
  if (empId.length > 20) {
    throw new Error('Employee ID must be maximum 20 characters');
  }

  // Validate employee ID format (alphanumeric and hyphens only)
  if (!/^[A-Z0-9-]+$/.test(empId)) {
    throw new Error('Employee ID must contain only letters, numbers, and hyphens');
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

  // Determine default password based on joining year (e.g. tensorgo@2026)
  let defaultPassword = 'tensorgo@2023';
  if (employeeData.dateOfJoining) {
    const startYear = new Date(employeeData.dateOfJoining).getFullYear();
    if (!isNaN(startYear)) {
      defaultPassword = `tensorgo@${startYear}`;
    }
  }
  const finalPassword = employeeData.password || defaultPassword;

  // Default password for newly created employees (if none explicitly provided)
  logger.info(`[EMPLOYEE] [CREATE EMPLOYEE] Hashing password`);
  const passwordHash = await hashPassword(finalPassword);
  logger.info(`[EMPLOYEE] [CREATE EMPLOYEE] Password hashed successfully`);

  // Super admin should not have a reporting manager
  const role = employeeData.role || 'employee';
  const reportingManagerId = role === 'super_admin' ? null : (employeeData.reportingManagerId || null);
  const reportingManagerName = role === 'super_admin' ? null : (employeeData.reportingManagerName || null);

  // Validate reporting manager status and hierarchy
  if (reportingManagerId) {
    const managerResult = await pool.query('SELECT user_role as role, status FROM users WHERE id = $1', [reportingManagerId]);
    if (managerResult.rows.length > 0) {
      const { status: managerStatus, role: managerRole } = managerResult.rows[0];

      // Status check
      if (managerStatus === 'on_notice') {
        throw new Error('Employees in notice period cannot be reporting managers');
      }
      if (managerStatus !== 'active' && managerStatus !== 'on_leave') {
        throw new Error('Selected reporting manager must be active or on leave');
      }

      // Hierarchy check
      // Any user can report to Manager, HR, or Super Admin
      if (!['manager', 'hr', 'super_admin'].includes(managerRole)) {
        throw new Error('Reporting manager must have Manager, HR, or Super Admin role');
      }
    } else {
      throw new Error('Selected reporting manager does not exist');
    }
  } else if (role !== 'super_admin') {
    throw new Error('Reporting Manager is required');
  }

  logger.info(`[EMPLOYEE] [CREATE EMPLOYEE] Inserting employee into database`);
  const result = await pool.query(
    `INSERT INTO users (
      emp_id, email, password_hash, user_role, first_name, middle_name, last_name,
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
      toTitleCase(employeeData.firstName),
      toTitleCase(employeeData.middleName),
      toTitleCase(employeeData.lastName),
      employeeData.contactNumber || null,
      employeeData.altContact || null,
      employeeData.dateOfBirth || null,
      employeeData.gender || null,
      employeeData.bloodGroup || null,
      employeeData.maritalStatus || null,
      toTitleCase(employeeData.emergencyContactName),
      employeeData.emergencyContactNo || null,
      toTitleCase(employeeData.emergencyContactRelation),
      toTitleCase(employeeData.designation),
      toTitleCase(employeeData.department),
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
      toTitleCase(employeeData.currentAddress),
      toTitleCase(employeeData.permanentAddress),
      reportingManagerId,
      toTitleCase(reportingManagerName),
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

  // Update education columns if provided
  if (employeeData.education) {
    const fields: Record<string, string> = {
      'PG': 'pg',
      'UG': 'ug',
      '12th': 'twelveth'
    };

    const updates: string[] = [];
    const values: any[] = [];
    let p = 1;

    // Reset all education columns first
    for (const prefix of Object.values(fields)) {
      updates.push(`${prefix}_stream = NULL, ${prefix}_college = NULL, ${prefix}_year = NULL, ${prefix}_percentage = NULL`);
    }

    const setClauses: string[] = [];
    const eduValues: any[] = [];
    let eduParamIndex = 1;

    for (const edu of employeeData.education) {
      const prefix = fields[edu.level];
      if (prefix) {
        setClauses.push(`${prefix}_stream = $${eduParamIndex++}`);
        eduValues.push(toTitleCase(edu.groupStream));
        setClauses.push(`${prefix}_college = $${eduParamIndex++}`);
        eduValues.push(toTitleCase(edu.collegeUniversity));
        setClauses.push(`${prefix}_year = $${eduParamIndex++}`);
        eduValues.push(edu.year || null);
        setClauses.push(`${prefix}_percentage = $${eduParamIndex++}`);
        eduValues.push(edu.scorePercentage || null);
      }
    }

    if (setClauses.length > 0) {
      eduValues.push(userId);
      await pool.query(
        `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${eduParamIndex}`,
        eduValues
      );
    }
  }


  // Send welcome email with credentials
  try {
    logger.info(`[EMPLOYEE] [CREATE EMPLOYEE] Preparing to send welcome email`);
    const loginUrl = 'http://51.15.227.10:3000/login';
    const temporaryPassword = finalPassword;

    await emailTemplates.sendNewEmployeeCredentialsEmail(employeeData.email, {
      employeeName: `${employeeData.firstName} ${employeeData.middleName || ''} ${employeeData.lastName || ''}`.trim(),
      employeeEmpId: empId,
      email: employeeData.email,
      role: employeeData.role,
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

  // Remove leading zeros from empId if it's a numeric ID
  if (employeeData.empId) {
    const empIdStr = employeeData.empId.toString().trim();
    // If it's purely numeric, convert to integer and back to remove leading zeros
    if (/^\d+$/.test(empIdStr)) {
      employeeData.empId = parseInt(empIdStr, 10).toString();
    }
    // Otherwise keep the original value (for alphanumeric IDs like "SA 0001")
  }

  logger.info(`[EMPLOYEE] [UPDATE EMPLOYEE] Employee ID: ${employeeId}, Requester Role: ${requesterRole || 'none'}, Requester ID: ${requesterId || 'none'}`);
  logger.info(`[EMPLOYEE] [UPDATE EMPLOYEE] Fields to update: ${Object.keys(employeeData).join(', ')}`);

  // Basic format validations before DB calls
  // Validate phone numbers if updated
  const phoneFields = [
    { key: 'contactNumber', label: 'Contact Number' },
    { key: 'altContact', label: 'Alternate Contact Number' },
    { key: 'emergencyContactNo', label: 'Emergency Contact Number' }
  ];

  for (const field of phoneFields) {
    if (employeeData[field.key]) {
      const val = String(employeeData[field.key]).trim();
      if (val.length !== 10 || !/^\d+$/.test(val)) {
        throw new Error(`${field.label} must be exactly 10 digits`);
      }
    }
  }

  // Validate text-only fields if updated
  const textFields = [
    { key: 'firstName', label: 'First Name' },
    { key: 'middleName', label: 'Middle Name' },
    { key: 'lastName', label: 'Last Name' },
    { key: 'emergencyContactName', label: 'Emergency Contact Name' },
    { key: 'emergencyContactRelation', label: 'Emergency Contact Relation' },
    { key: 'designation', label: 'Designation' },
    { key: 'department', label: 'Department' }
  ];

  for (const field of textFields) {
    const val = employeeData[field.key];
    if (val && typeof val === 'string' && val.trim() !== '') {
      if (!/^[a-zA-Z\s]+$/.test(val)) {
        throw new Error(`${field.label} should only contain letters and spaces`);
      }
    }
  }

  // Validate Aadhar if updated
  if (employeeData.aadharNumber) {
    const aadhar = String(employeeData.aadharNumber).trim();
    if (aadhar.length !== 12 || !/^\d+$/.test(aadhar)) {
      throw new Error('Aadhar must be exactly 12 digits');
    }
  }

  // Date of Joining must not be in the future if updated
  if (employeeData.dateOfJoining) {
    logger.info(`[EMPLOYEE] [UPDATE EMPLOYEE] Validating Date of Joining: ${employeeData.dateOfJoining}`);
    const doj = new Date(employeeData.dateOfJoining);
    const today = new Date();
    today.setHours(23, 59, 59, 999); // Allow joining on current day
    if (doj > today) {
      throw new Error('Date of Joining cannot be in the future');
    }

    // Validate gap between Date of Birth and Date of Joining (min 18 years)
    // If DOB is also being updated, use new DOB, otherwise fetch current DOB
    let dob: Date | null = null;
    logger.info(`[EMPLOYEE] [UPDATE EMPLOYEE] Date of Birth in data: ${employeeData.dateOfBirth}`);
    if (employeeData.dateOfBirth) {
      dob = new Date(employeeData.dateOfBirth);
    } else {
      const currentEmployee = await pool.query('SELECT date_of_birth FROM users WHERE id = $1', [employeeId]);
      if (currentEmployee.rows.length > 0 && currentEmployee.rows[0].date_of_birth) {
        dob = new Date(currentEmployee.rows[0].date_of_birth);
      }
    }

    if (dob) {
      let workAge = doj.getFullYear() - dob.getFullYear();
      const monthDiff = doj.getMonth() - dob.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && doj.getDate() < dob.getDate())) {
        workAge--;
      }

      if (workAge < 18) {
        throw new Error('Joining Date must be at least 18 years after Date of Birth');
      }
    }
  } else if (employeeData.dateOfBirth) {
    // If only DOB is updated, check against existing DOJ
    const currentEmployee = await pool.query('SELECT date_of_joining FROM users WHERE id = $1', [employeeId]);
    if (currentEmployee.rows.length > 0 && currentEmployee.rows[0].date_of_joining) {
      const doj = new Date(currentEmployee.rows[0].date_of_joining);
      const dob = new Date(employeeData.dateOfBirth);

      let workAge = doj.getFullYear() - dob.getFullYear();
      const monthDiff = doj.getMonth() - dob.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && doj.getDate() < dob.getDate())) {
        workAge--;
      }

      if (workAge < 18) {
        throw new Error('Joining Date must be at least 18 years after Date of Birth');
      }
    }
  }


  // Enum validations
  const allowedStatuses = ['active', 'on_leave', 'on_notice', 'resigned', 'terminated', 'inactive'];
  if (employeeData.status && !allowedStatuses.includes(employeeData.status)) {
    throw new Error('Invalid status');
  }

  const allowedGenders = ['Male', 'Female', 'Other'];
  if (employeeData.gender && !allowedGenders.includes(employeeData.gender)) {
    throw new Error('Invalid gender. Must be Male, Female, or Other');
  }

  const allowedBloodGroups = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];
  if (employeeData.bloodGroup && !allowedBloodGroups.includes(employeeData.bloodGroup)) {
    throw new Error('Invalid blood group');
  }

  const allowedMaritalStatuses = ['Single', 'Married', 'Divorced', 'Widowed'];
  if (employeeData.maritalStatus && !allowedMaritalStatuses.includes(employeeData.maritalStatus)) {
    throw new Error('Invalid marital status');
  }

  // Check if employee exists and get their current state
  logger.info(`[EMPLOYEE] [UPDATE EMPLOYEE] Checking if employee exists`);
  const employeeCheck = await pool.query('SELECT id, role, status, first_name, last_name, date_of_birth, date_of_joining, reporting_manager_id, reporting_manager_name, email, emp_id, pg_year, ug_year, twelveth_year FROM users WHERE id = $1', [employeeId]);
  if (employeeCheck.rows.length === 0) {
    logger.warn(`[EMPLOYEE] [UPDATE EMPLOYEE] Employee not found - Employee ID: ${employeeId}`);
    throw new Error('Employee not found');
  }

  // Track important changes for notifications
  const oldRole = employeeCheck.rows[0].role;
  const newRole = employeeData.role;
  const isRoleChanged = newRole && newRole !== oldRole;

  const oldStatus = employeeCheck.rows[0].status;
  const newStatus = employeeData.status;
  const isStatusChanged = newStatus && newStatus !== oldStatus;

  const oldManagerId = employeeCheck.rows[0].reporting_manager_id;
  const newManagerId = employeeData.reportingManagerId;
  const isManagerChanged = newManagerId !== undefined && Number(newManagerId) !== Number(oldManagerId);

  // Education validation if updated
  if (employeeData.education && Array.isArray(employeeData.education)) {
    const dobValue = employeeData.dateOfBirth || employeeCheck.rows[0].date_of_birth;
    const birthYear = dobValue ? new Date(dobValue).getFullYear() : null;

    // Use existing education from users table for validation
    const educationYears: Record<string, number> = {};
    if (employeeCheck.rows[0].pg_year) educationYears['PG'] = parseInt(employeeCheck.rows[0].pg_year, 10);
    if (employeeCheck.rows[0].ug_year) educationYears['UG'] = parseInt(employeeCheck.rows[0].ug_year, 10);
    if (employeeCheck.rows[0].twelveth_year) educationYears['12th'] = parseInt(employeeCheck.rows[0].twelveth_year, 10);

    for (const edu of employeeData.education) {
      const isMandatory = ['UG', '12th'].includes(edu.level);
      const hasAnyField = edu.groupStream || edu.collegeUniversity || edu.year || edu.scorePercentage;

      if (isMandatory || hasAnyField) {
        if (!edu.groupStream || !edu.collegeUniversity || !edu.year || !edu.scorePercentage) {
          throw new Error(`Please fill complete details for ${edu.level} education`);
        }

        // Validate for special characters and emojis
        const nameRegex = /^[a-zA-Z0-9\s.,&()-]+$/;
        if (!nameRegex.test(edu.groupStream)) {
          throw new Error(`Group/Stream for ${edu.level} contains invalid characters or emojis`);
        }
        if (!nameRegex.test(edu.collegeUniversity)) {
          throw new Error(`College/University for ${edu.level} contains invalid characters or emojis`);
        }
        if (!/^[0-9]{4}$/.test(edu.year)) {
          throw new Error(`Graduation Year for ${edu.level} must be a valid 4-digit year`);
        }
        if (!/^[0-9.]+%?$/.test(edu.scorePercentage)) {
          throw new Error(`Score/Percentage for ${edu.level} must be a valid number or percentage`);
        }

        const gradYear = parseInt(edu.year, 10);

        // Basic logic check for year
        const currentYear = new Date().getFullYear();
        if (gradYear < 1950 || gradYear > currentYear + 10) {
          throw new Error(`Graduation Year for ${edu.level} appears illogical (${gradYear})`);
        }

        // Minimum 15 years gap between DOB and any graduation year
        if (birthYear && gradYear - birthYear < 15) {
          throw new Error(`Minimum 15 years gap required between Date of Birth and ${edu.level} Graduation Year`);
        }

        educationYears[edu.level] = gradYear;
      }
    }

    // Enforce logical graduation year gaps
    if (educationYears['12th'] && educationYears['UG'] && educationYears['UG'] - educationYears['12th'] < 3) {
      throw new Error(`Minimum 3 years gap required between 12th (${educationYears['12th']}) and UG (${educationYears['UG']}) Graduation Year`);
    }

    if (educationYears['UG'] && educationYears['PG'] && educationYears['PG'] - educationYears['UG'] < 2) {
      throw new Error(`Minimum 2 years gap required between UG (${educationYears['UG']}) and PG (${educationYears['PG']}) Graduation Year`);
    }

    // Basic order validation as fallback
    if (educationYears['12th'] && educationYears['UG'] && educationYears['12th'] >= educationYears['UG']) {
      throw new Error('12th Graduation Year must be before UG Graduation Year');
    }
    if (educationYears['UG'] && educationYears['PG'] && educationYears['UG'] >= educationYears['PG']) {
      throw new Error('UG Graduation Year must be before PG Graduation Year');
    }
  }

  const employeeRole = employeeCheck.rows[0].role;
  const dbStatus = employeeCheck.rows[0].status;
  const dbReportingManagerId = employeeCheck.rows[0].reporting_manager_id;
  const dbReportingManagerName = employeeCheck.rows[0].reporting_manager_name;

  // Check what fields are being updated
  const fieldsBeingUpdated = Object.keys(employeeData).map(key =>
    key.replace(/([A-Z])/g, '_$1').toLowerCase()
  );
  const isOnlyRoleUpdate = fieldsBeingUpdated.length === 1 && fieldsBeingUpdated[0] === 'role';
  const isRoleBeingUpdated = fieldsBeingUpdated.includes('role');

  // Reporting manager required if role is being set and is not 'super_admin'
  if (employeeData.role && employeeData.role !== 'super_admin' && !employeeData.reportingManagerId && !employeeData.reportingManagerName) {
    if (!dbReportingManagerId && !dbReportingManagerName) {
      throw new Error('Reporting Manager is required');
    }
  }

  // Super admin should not have a reporting manager
  const finalRole = employeeData.role || employeeRole;
  if (finalRole === 'super_admin') {
    employeeData.reportingManagerId = null;
    employeeData.reportingManagerName = null;
  }

  // Prevent role change (DOWNGRADE ONLY) OR transition to 'inactive' status if there are subordinates reporting to this user
  const formattedDbRole = String(employeeRole || '').trim().toLowerCase();
  const formattedDbStatus = String(dbStatus || '').trim().toLowerCase();
  const requestedRole = employeeData.role ? String(employeeData.role).trim().toLowerCase() : null;
  const requestedStatus = employeeData.status ? String(employeeData.status).trim().toLowerCase() : null;

  const isRoleTransition = requestedRole !== null && requestedRole !== formattedDbRole;
  const isInactiveTransition = requestedStatus === 'inactive' && formattedDbStatus !== 'inactive';

  // Define Hierarchy Levels
  const highHierarchy = ['super_admin', 'hr', 'manager'];
  const lowHierarchy = ['employee', 'intern'];

  // Check if this is a downgrade (High -> Low)
  const isDowngrade = isRoleTransition &&
    highHierarchy.includes(formattedDbRole) &&
    lowHierarchy.includes(requestedRole!);

  // Block if:
  // 1. It is a Downgrade (High -> Low) AND has subordinates
  // 2. OR Status changing to Inactive AND has subordinates
  if (isDowngrade || isInactiveTransition) {
    const activeSubordinates = await pool.query(
      'SELECT id FROM users WHERE reporting_manager_id = $1 AND status IN (\'active\', \'on_leave\', \'on_notice\') LIMIT 1',
      [employeeId]
    );

    if (activeSubordinates.rows.length > 0) {
      const name = `${employeeCheck.rows[0].first_name} ${employeeCheck.rows[0].last_name || ''}`.trim();
      const reason = isDowngrade
        ? 'downgrading to a role that cannot approve leaves'
        : 'deactivating the user';

      logger.warn(`[EMPLOYEE] [UPDATE EMPLOYEE] Action BLOCKED for user ${employeeId} due to existing active subordinates. Reason: ${reason}`);
      throw new Error(`Remove subordinates of ${name} to ${isDowngrade ? 'downgrade' : 'deactivate'}.`);
    }
  }

  // Validate reporting manager status and hierarchy if it's being updated
  if (employeeData.reportingManagerId) {
    const managerResult = await pool.query('SELECT user_role as role, status FROM users WHERE id = $1', [employeeData.reportingManagerId]);
    if (managerResult.rows.length > 0) {
      const { status: managerStatus, role: managerRole } = managerResult.rows[0];
      const targetRole = employeeData.role || employeeRole;

      // Status check
      if (managerStatus === 'on_notice') {
        throw new Error('Employees in notice period cannot be reporting managers');
      }
      if (managerStatus !== 'active' && managerStatus !== 'on_leave') {
        throw new Error('Selected reporting manager must be active or on leave');
      }

      // Hierarchy check
      // Any user can report to Manager, HR, or Super Admin
      if (!['manager', 'hr', 'super_admin'].includes(managerRole)) {
        throw new Error('Reporting manager must have Manager, HR, or Super Admin role');
      }
    } else {
      throw new Error('Selected reporting manager does not exist');
    }
  }

  // Prevent HR from editing super_admin or other HR users (except role updates)
  if (requesterRole === 'hr' && (employeeRole === 'super_admin' || employeeRole === 'hr') && !isOnlyRoleUpdate) {
    if (isRoleBeingUpdated) {
      Object.keys(employeeData).forEach(key => {
        const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
        if (dbKey !== 'role' && dbKey !== 'user_role') {
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
    allowedFields.push('user_role');
  }

  // Only super_admin can update email, date_of_joining and emp_id
  if (requesterRole === 'super_admin') {
    allowedFields.push('email');
    allowedFields.push('date_of_joining');
    allowedFields.push('emp_id');
  } else {
    // If not super_admin, forbid these fields ONLY if they are being changed
    // We compare with the existing database values

    if (employeeData.email && employeeData.email.trim().toLowerCase() !== employeeCheck.rows[0].email.toLowerCase()) {
      throw new Error('Only Super Admin can update Official Email');
    }

    // Normalize dates for comparison (ignoring time)
    // Normalize dates for comparison (ignoring time)
    let existingDOJ = null;
    if (employeeCheck.rows[0].date_of_joining) {
      const d = new Date(employeeCheck.rows[0].date_of_joining);
      // Create UTC date from local components to avoid timezone shift
      const utcDate = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
      existingDOJ = utcDate.toISOString().split('T')[0];
    }

    let newDOJ = null;
    if (employeeData.dateOfJoining) {
      // Assuming format is YYYY-MM-DD or compatible
      const d = new Date(employeeData.dateOfJoining);
      // If the input string is YYYY-MM-DD, parsing it creates a UTC date.
      // However, to be safe and consistent with the logic above (in case it parsed as local):
      // Actually, standard ISO date string "YYYY-MM-DD" parses as UTC.
      // But if we want to be absolutely sure we extract the intended date:

      // If we simply take the string representation "YYYY-MM-DD" if valid:
      if (typeof employeeData.dateOfJoining === 'string' && /^\d{4}-\d{2}-\d{2}/.test(employeeData.dateOfJoining)) {
        newDOJ = employeeData.dateOfJoining.substring(0, 10);
      } else {
        newDOJ = d.toISOString().split('T')[0];
      }
    }

    if (newDOJ && existingDOJ && newDOJ !== existingDOJ) {
      throw new Error(`Only Super Admin can update Date of Joining`);
    }

    if (employeeData.empId && employeeData.empId.trim().toUpperCase() !== employeeCheck.rows[0].emp_id) {
      throw new Error('Only Super Admin can update Employee ID');
    }
  }

  // Check if emp_id is being updated and validate uniqueness
  if (employeeData.empId && requesterRole === 'super_admin') {
    // employeeData.empId has already been cleaned of leading zeros earlier
    // Just apply uppercase normalization
    const empId = employeeData.empId.toString().trim().toUpperCase();
    const empIdCheck = await pool.query(
      'SELECT id FROM users WHERE emp_id = $1 AND id != $2',
      [empId, employeeId]
    );
    if (empIdCheck.rows.length > 0) {
      throw new Error('Employee ID already exists');
    }
    // Normalize it in the data
    employeeData.empId = empId;
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
    reportingManagerName: 'reporting_manager_name',
    empId: 'emp_id',
    role: 'user_role'
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

    // Employee ID cannot be changed once set, unless requester is super_admin
    if (dbKey === 'emp_id' && requesterRole !== 'super_admin') {
      continue;
    }

    // Only super_admin can set/change someone to super_admin role
    if (dbKey === 'user_role' && value === 'super_admin' && requesterRole !== 'super_admin') {
      logger.warn(`[EMPLOYEE] [UPDATE EMPLOYEE] Unauthorized attempt by ${requesterRole} to set super_admin role`);
      throw new Error('Only Super Admin can assign the Super Admin role');
    }

    updates.push(`${dbKey} = $${paramCount}`);
    processedKeys.add(dbKey);

    const textFields = ['first_name', 'middle_name', 'last_name', 'emergency_contact_name', 'emergency_contact_relation', 'designation', 'department', 'current_address', 'permanent_address', 'reporting_manager_name'];

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
    } else if (textFields.includes(dbKey) && typeof value === 'string') {
      // Apply title case to text fields
      values.push(toTitleCase(value));
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

  // Check if status changed to resigned, terminated, or inactive (Not reassigning for 'on_notice')
  const RESTRICTED_STATUSES = ['resigned', 'terminated', 'inactive'];

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
        'SELECT id, emp_id, first_name || \' \' || COALESCE(last_name, \'\') as name FROM users WHERE user_role = \'super_admin\' ORDER BY id ASC LIMIT 1'
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

  // Item 9: If an employee's reporting manager was manually changed, notify that employee
  if (isManagerChanged) {
    try {
      const empResult = await pool.query(
        `SELECT u.email, u.first_name || ' ' || COALESCE(u.last_name, '') as name, u.reporting_manager_name, m.emp_id as manager_emp_id 
         FROM users u 
         LEFT JOIN users m ON u.reporting_manager_id = m.id 
         WHERE u.id = $1`,
        [employeeId]
      );
      if (empResult.rows.length > 0 && empResult.rows[0].email) {
        const { sendReportingManagerChangeEmail } = await import('../utils/emailTemplates');
        await sendReportingManagerChangeEmail(empResult.rows[0].email, {
          employeeName: empResult.rows[0].name,
          previousManagerName: employeeCheck.rows[0].reporting_manager_name || 'N/A',
          newManagerName: empResult.rows[0].reporting_manager_name || 'New Manager',
          newManagerEmpId: empResult.rows[0].manager_emp_id || ''
        });
        logger.info(`[EMPLOYEE] [UPDATE EMPLOYEE] Manager change notification sent to employee: ${empResult.rows[0].email}`);
      }
    } catch (e) {
      logger.error(`[EMPLOYEE] [UPDATE EMPLOYEE] Error sending manual manager change notification:`, e);
    }
  }

  // Item 15: Role changed notification
  if (isRoleChanged) {
    try {
      const empResult = await pool.query('SELECT email, first_name || \' \' || COALESCE(last_name, \'\') as name FROM users WHERE id = $1', [employeeId]);
      const requesterResult = await pool.query('SELECT first_name || \' \' || COALESCE(last_name, \'\') as name FROM users WHERE id = $1', [requesterId]);
      const requesterName = requesterResult.rows[0]?.name || (requesterRole === 'super_admin' ? 'Super Admin' : 'HR');

      if (empResult.rows.length > 0 && empResult.rows[0].email) {
        const { sendRoleChangeEmail } = await import('../utils/emailTemplates');
        await sendRoleChangeEmail(empResult.rows[0].email, {
          employeeName: empResult.rows[0].name,
          newRole,
          updatedBy: requesterName
        });
      }
    } catch (e) {
      logger.error('Error sending role change notification:', e);
    }
  }

  // Item 16: Status changed notification
  if (isStatusChanged) {
    try {
      const empResult = await pool.query('SELECT email, first_name || \' \' || COALESCE(last_name, \'\') as name FROM users WHERE id = $1', [employeeId]);
      const requesterResult = await pool.query('SELECT first_name || \' \' || COALESCE(last_name, \'\') as name FROM users WHERE id = $1', [requesterId]);
      const requesterName = requesterResult.rows[0]?.name || (requesterRole === 'super_admin' ? 'Super Admin' : 'HR');

      if (empResult.rows.length > 0 && empResult.rows[0].email) {
        const { sendStatusChangeEmail } = await import('../utils/emailTemplates');
        await sendStatusChangeEmail(empResult.rows[0].email, {
          employeeName: empResult.rows[0].name,
          newStatus,
          updatedBy: requesterName
        });
      }
    } catch (e) {
      logger.error('Error sending status change notification:', e);
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

  // Update education columns atomically
  if (employeeData.education) {
    const fields: Record<string, string> = {
      'PG': 'pg',
      'UG': 'ug',
      '12th': 'twelveth'
    };

    const eduUpdates: string[] = [];
    const eduValues: any[] = [];
    let eduParamIndex = 1;

    // Use a map for easy lookup of provided education levels
    const educationMap: Record<string, any> = {};
    for (const edu of employeeData.education) {
      if (edu.level) {
        educationMap[edu.level] = edu;
      }
    }

    for (const [level, prefix] of Object.entries(fields)) {
      const edu = educationMap[level];
      eduUpdates.push(`${prefix}_stream = $${eduParamIndex++}`);
      eduValues.push(toTitleCase(edu?.groupStream));
      eduUpdates.push(`${prefix}_college = $${eduParamIndex++}`);
      eduValues.push(toTitleCase(edu?.collegeUniversity));
      eduUpdates.push(`${prefix}_year = $${eduParamIndex++}`);
      eduValues.push(edu?.year || null);
      eduUpdates.push(`${prefix}_percentage = $${eduParamIndex++}`);
      eduValues.push(edu?.scorePercentage || null);
    }

    eduValues.push(employeeId);
    await pool.query(
      `UPDATE users SET ${eduUpdates.join(', ')} WHERE id = $${eduParamIndex}`,
      eduValues
    );
  }

  // Send email notification if HR or Super Admin updated employee details
  // Only send if it's NOT a role change, status change, or manager change (those have their own emails)
  if ((requesterRole === 'hr' || requesterRole === 'super_admin') && !isOnlyRoleUpdate && !isManagerChanged && !isRoleChanged && !isStatusChanged) {
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
  const result = await pool.query('SELECT id, user_role as role, first_name, last_name FROM users WHERE id = $1', [employeeId]);
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

  // Check for active subordinates
  const activeSubordinates = await pool.query(
    'SELECT count(*) as count FROM users WHERE reporting_manager_id = $1 AND status IN (\'active\', \'on_leave\', \'on_notice\')',
    [employeeId]
  );

  if (parseInt(activeSubordinates.rows[0].count) > 0) {
    const name = `${employee.first_name || ''} ${employee.last_name || ''}`.trim();
    logger.warn(`[EMPLOYEE] [DELETE EMPLOYEE] Deletion BLOCKED for user ${employeeId} due to existing active subordinates.`);
    throw new Error(`Please remove the users reporting to ${name} and try again.`);
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

    // 4. Update reporting_manager_id in users table to NULL for employees reporting to this user
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
  comment?: string,
  documentUrl?: string
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
    pool.query('SELECT user_role as role FROM users WHERE id = $1', [updatedBy]),
    pool.query('SELECT user_role as role FROM users WHERE id = $1', [employeeId])
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
                approver.first_name || ' ' || COALESCE(approver.last_name, '') as approver_name,
                approver.emp_id as approver_emp_id
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
          allocatedByEmpId: employee.approver_emp_id || '',
          allocationDate: formatDateLocal(new Date()) || '',
          comment: comment,
          documentUrl: documentUrl
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




