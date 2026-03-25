import { pool } from '../database/db';
import { logger } from '../utils/logger';
import { getSignedUrlFromOVH } from '../utils/storage';
import { formatDateLocal } from '../utils/dateCalculator';
import { toTitleCase } from '../utils/stringUtils';

export const getProfile = async (userId: number) => {
  logger.info(`[PROFILE] [GET PROFILE] ========== FUNCTION CALLED ==========`);
  logger.info(`[PROFILE] [GET PROFILE] User ID: ${userId}`);
  const result = await pool.query(
    `SELECT u.*,
COALESCE(rm.id, sa.sa_id) as reporting_manager_id,
COALESCE(rm.first_name || ' ' || COALESCE(rm.last_name, ''), sa.sa_full_name) as reporting_manager_full_name,
COALESCE(rm.emp_id, sa.sa_emp_id) as reporting_manager_emp_id,
u.personal_email,
c.emp_id as created_by_emp_id,
up.emp_id as updated_by_emp_id
FROM users u
LEFT JOIN users rm ON u.reporting_manager_id = rm.id
LEFT JOIN LATERAL (
SELECT id as sa_id, first_name || ' ' || COALESCE(last_name, '') as sa_full_name, emp_id as sa_emp_id
FROM users
WHERE user_role = 'super_admin'
ORDER BY id ASC
LIMIT 1
) sa ON u.reporting_manager_id IS NULL AND u.user_role != 'super_admin'
LEFT JOIN users c ON u.created_by = c.id
LEFT JOIN users up ON u.updated_by = up.id
WHERE u.id = $1`,
    [userId]
  );

  if (result.rows.length === 0) {
    logger.warn(`[PROFILE] [GET PROFILE] User not found - User ID: ${userId}`);
    throw new Error('User not found');
  }

  logger.info(`[PROFILE] [GET PROFILE] User found`);
  const user = result.rows[0];

  const education = [];
  if (user.pg_stream || user.pg_college || user.pg_year || user.pg_percentage) {
    education.push({ level: 'PG', group_stream: user.pg_stream, college_university: user.pg_college, year: user.pg_year, score_percentage: user.pg_percentage });
  }
  if (user.ug_stream || user.ug_college || user.ug_year || user.ug_percentage) {
    education.push({ level: 'UG', group_stream: user.ug_stream, college_university: user.ug_college, year: user.ug_year, score_percentage: user.ug_percentage });
  }
  if (user.twelveth_stream || user.twelveth_college || user.twelveth_year || user.twelveth_percentage) {
    education.push({ level: '12th', group_stream: user.twelveth_stream, college_university: user.twelveth_college, year: user.twelveth_year, score_percentage: user.twelveth_percentage });
  }

  return {
    personalInfo: {
      firstName: user.first_name,
      middleName: user.middle_name,
      lastName: user.last_name,
      empId: user.emp_id,
      email: user.email,
      personalEmail: user.personal_email,
      contactNumber: user.contact_number,
      altContact: user.alt_contact,
      dateOfBirth: formatDateLocal(user.date_of_birth),
      gender: user.gender,
      bloodGroup: user.blood_group,
      maritalStatus: user.marital_status,
      emergencyContactName: user.emergency_contact_name,
      emergencyContactNo: user.emergency_contact_no,
      emergencyContactRelation: user.emergency_contact_relation
    },
    employmentInfo: {
      designation: user.designation,
      department: user.department,
      dateOfJoining: formatDateLocal(user.date_of_joining),
      uanNumber: user.uan_number,
      totalExperience: user.total_experience
    },
    documents: {
      aadharNumber: user.aadhar_number,
      panNumber: user.pan_number
    },
    address: {
      currentAddress: user.current_address,
      permanentAddress: user.permanent_address
    },
    education: education.map((edu: any) => ({
      level: edu.level,
      groupStream: edu.group_stream,
      collegeUniversity: edu.college_university,
      year: edu.year,
      scorePercentage: edu.score_percentage || null
    })),
    reportingManager:
      user.reporting_manager_id
        ? {
          id: user.reporting_manager_id || null,
          name: user.reporting_manager_full_name,
          empId: user.reporting_manager_emp_id || null
        }
        : null,
    // Always use OVHcloud keys - no local URLs
    // If profile_photo_url is an OVHcloud key (starts with 'profile-photos/'), return it as profilePhotoKey
    // Otherwise, it's a legacy local path - return null (user needs to re-upload)
    profilePhotoUrl: null, // Always null - use profilePhotoKey and signed URLs
    profilePhotoKey: user.profile_photo_url && user.profile_photo_url.startsWith('profile-photos/')
      ? user.profile_photo_url
      : null,
    createdBy: user.created_by_emp_id || 'System',
    updatedBy: user.updated_by_emp_id || user.created_by_emp_id || 'System'
  };
};

export const updateProfile = async (userId: number, profileData: any, requesterRole: string, requesterId: number) => {
  logger.info(`[PROFILE] [UPDATE PROFILE] ========== FUNCTION CALLED ==========`);
  logger.info(`[PROFILE] [UPDATE PROFILE] User ID: ${userId}, Role: ${requesterRole}`);
  logger.info(`[PROFILE] [UPDATE PROFILE] Sections to update: ${Object.keys(profileData).join(', ')}`);
  if (profileData.personalInfo) {
    logger.info(`[PROFILE] [UPDATE PROFILE] PersonalInfo keys: ${Object.keys(profileData.personalInfo).join(', ')}`);
    logger.info(`[PROFILE] [UPDATE PROFILE] Payload empId: ${profileData.personalInfo.empId}, Email: ${profileData.personalInfo.email}`);
  }

  const userRole = String(requesterRole || ''); // Ensure string
  logger.info(`[PROFILE] [UPDATE PROFILE] Validating with User Role: '${userRole}'`);

  // Fetch current user data for validation and role-based restrictions
  const currentValues = await pool.query('SELECT user_role as role, status as status, date_of_birth, date_of_joining, emp_id, email, designation, department, pg_year, ug_year, twelveth_year FROM users WHERE id = $1', [userId]);
  if (currentValues.rows.length === 0) {
    throw new Error('User not found');
  }
  // We can trust requesterRole from the token, but we still need DB values for field comparison
  const currentDob = currentValues.rows[0].date_of_birth;
  const currentDoj = currentValues.rows[0].date_of_joining;

  // Validate date of birth and gap with joining date
  if (profileData.personalInfo?.dateOfBirth || profileData.employmentInfo?.dateOfJoining) {
    const dobStr = profileData.personalInfo?.dateOfBirth || currentDob;
    const dojStr = profileData.employmentInfo?.dateOfJoining || currentDoj;

    if (dobStr) {
      const dob = new Date(dobStr);

      // Age check (DOB vs Today)
      if (profileData.personalInfo?.dateOfBirth) {
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

      // Gap check (DOB vs DOJ)
      if (dojStr) {
        const doj = new Date(dojStr);
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
  }

  const updates: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  // Map frontend field names to database column names
  const fieldMap: Record<string, string> = {
    empId: 'emp_id',
    firstName: 'first_name',
    middleName: 'middle_name',
    lastName: 'last_name',
    contactNumber: 'contact_number',
    altContact: 'alt_contact',
    dateOfBirth: 'date_of_birth',
    gender: 'gender',
    bloodGroup: 'blood_group',
    maritalStatus: 'marital_status',
    emergencyContactName: 'emergency_contact_name',
    emergencyContactNo: 'emergency_contact_no',
    emergencyContactRelation: 'emergency_contact_relation',
    designation: 'designation',
    department: 'department',
    dateOfJoining: 'date_of_joining',
    aadharNumber: 'aadhar_number',
    panNumber: 'pan_number',
    currentAddress: 'current_address',
    permanentAddress: 'permanent_address',
    reportingManagerId: 'reporting_manager_id',
    uanNumber: 'uan_number',
    totalExperience: 'total_experience',
    personalEmail: 'personal_email'
  };

  const allowedPersonalFields = [
    'first_name', 'middle_name', 'last_name', 'contact_number', 'alt_contact',
    'date_of_birth', 'gender', 'blood_group', 'marital_status',
    'date_of_birth', 'gender', 'blood_group', 'marital_status',
    'emergency_contact_name', 'emergency_contact_no', 'emergency_contact_relation', 'personal_email'
  ];

  const allowedEmploymentFields = [
    'designation', 'department', 'date_of_joining', 'uan_number', 'total_experience'
  ];

  // Update personal info
  if (profileData.personalInfo) {
    const { contactNumber, altContact, emergencyContactNo } = profileData.personalInfo;
    if (contactNumber && altContact && contactNumber === altContact) {
      throw new Error('Contact Number and Alternate Contact Number cannot be the same');
    }
    if (altContact && emergencyContactNo && altContact === emergencyContactNo) {
      throw new Error('Alternate Contact Number and Emergency Contact Number cannot be the same');
    }
    if (contactNumber && emergencyContactNo && contactNumber === emergencyContactNo) {
      throw new Error('Contact Number and Emergency Contact Number cannot be the same');
    }

    const requiredPersonalInfo = ['firstName', 'lastName', 'email', 'contactNumber', 'dateOfBirth', 'gender', 'bloodGroup', 'maritalStatus'];
    for (const [key, value] of Object.entries(profileData.personalInfo)) {
      const dbKey = fieldMap[key];

      // Check if trying to update restricted fields
      if (key === 'empId') {
        // Only super_admin might theoretically be allowed
        if (userRole !== 'super_admin') {
          const storedEmpId = currentValues.rows[0].emp_id;
          const incoming = String(value || '').trim();
          const stored = String(storedEmpId || '').trim();

          logger.info(`[PROFILE] [UPDATE PROFILE] Checking empId update. Role: ${userRole}. Incoming: '${incoming}', Stored: '${stored}'`);

          if (incoming && incoming !== stored) {
            logger.warn(`[PROFILE] [UPDATE PROFILE] Blocked unauthorized empId update by ${userRole}`);
            throw new Error('Employee ID cannot be updated by employee');
          }
        }
        continue;
      }
      if (key === 'email') {
        if (userRole !== 'super_admin') {
          if (value && value !== currentValues.rows[0].email) {
            throw new Error('Official Email cannot be updated by employee');
          }
        }
        continue;
      }

      if (!dbKey || !allowedPersonalFields.includes(dbKey)) {
        continue;
      }

      if (value !== undefined) {
        // Treat empty strings as null
        let finalValue = (typeof value === 'string' && value.trim() === '') ? null : value;

        // Apply title case to text fields
        if (typeof finalValue === 'string' && allowedPersonalFields.includes(dbKey)) {
          finalValue = toTitleCase(finalValue);
        }

        // All fields in profile are now technically non-mandatory for saving progress.
        // We will check for completeness at the end of the function to set is_profile_updated.
        /*
        if (requiredPersonalInfo.includes(key) && finalValue === null) {
          throw new Error(`${key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1')} is required`);
        }
        */

        updates.push(`${dbKey} = $${paramCount}`);
        values.push(finalValue);
        paramCount++;
      }
    }
  }

  // Update employment info
  if (profileData.employmentInfo) {
    const requiredEmploymentInfo = ['designation', 'department', 'dateOfJoining'];
    for (const [key, value] of Object.entries(profileData.employmentInfo)) {
      const dbKey = fieldMap[key];
      if (!dbKey || !allowedEmploymentFields.includes(dbKey)) {
        continue;
      }

      // Fields disabled in ProfilePage.tsx
      // dateOfJoining is always disabled in profile update
      if (key === 'dateOfJoining') {
        const currentDojStr = currentDoj ? formatDateLocal(currentDoj) : null;
        if (value && value !== currentDojStr) {
          throw new Error('Date of Joining cannot be updated');
        }
        continue;
      }

      // designation and department can now be updated by all users
      // Role-based restrictions removed as per requirement

      if (value !== undefined) {
        let finalValue = (typeof value === 'string' && value.trim() === '') ? null : value;

        // Apply title case to text fields (designation, department) - REMOVED per requirement
        /*
        if (typeof finalValue === 'string') {
          finalValue = toTitleCase(finalValue);
        }
        */

        /*
        if (requiredEmploymentInfo.includes(key) && finalValue === null) {
          throw new Error(`${key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1')} is required`);
        }
        */

        updates.push(`${dbKey} = $${paramCount}`);
        values.push(finalValue);
        paramCount++;
      }
    }
  }

  // Update documents
  if (profileData.documents) {
    const requiredDocuments = ['aadharNumber', 'panNumber'];
    for (const [key, value] of Object.entries(profileData.documents)) {
      const dbKey = fieldMap[key] || key;
      if (value !== undefined) {
        let finalValue = (typeof value === 'string' && value.trim() === '') ? null : value;

        /*
        if (requiredDocuments.includes(key) && finalValue === null) {
          throw new Error(`${key === 'aadharNumber' ? 'Aadhar' : 'PAN'} number is required`);
        }
        */

        if (dbKey === 'pan_number' && typeof finalValue === 'string') {
          const panValue = finalValue.trim().toUpperCase();
          if (panValue.length !== 10) {
            throw new Error('PAN number must be exactly 10 characters long');
          }
          const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
          if (!panRegex.test(panValue)) {
            throw new Error('Invalid PAN format. Format: ABCDE1234F (5 letters, 4 digits, 1 letter)');
          }
          finalValue = panValue;
        }

        updates.push(`${dbKey} = $${paramCount}`);
        values.push(finalValue);
        paramCount++;
      }
    }
  }

  // Update address
  if (profileData.address) {
    const requiredAddress = ['currentAddress', 'permanentAddress'];
    for (const [key, value] of Object.entries(profileData.address)) {
      const dbKey = fieldMap[key] || key;
      if (value !== undefined) {
        let finalValue = (typeof value === 'string' && value.trim() === '') ? null : value;

        // Apply title case to address
        if (typeof finalValue === 'string') {
          finalValue = toTitleCase(finalValue);
        }

        /*
        if (requiredAddress.includes(key) && finalValue === null) {
          throw new Error(`${key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1')} is required`);
        }
        */

        updates.push(`${dbKey} = $${paramCount}`);
        values.push(finalValue);
        paramCount++;
      }
    }
  }

  // Update reporting manager (Disabled in ProfilePage.tsx)
  // Only Super Admin or HR should be able to update reporting manager (via /employees/:id API, not here)
  if (profileData.reportingManagerId !== undefined && (userRole === 'super_admin' || userRole === 'hr')) {
    if (profileData.reportingManagerId) {
      const managerResult = await pool.query('SELECT user_role as role, status as status FROM users WHERE id = $1', [profileData.reportingManagerId]);
      if (managerResult.rows.length > 0) {
        const { status: managerStatus, role: managerRole } = managerResult.rows[0];
        const targetRole = currentValues.rows[0].role;

        // Status check
        if (managerStatus === 'on_notice') {
          throw new Error('Employees in notice period cannot be reporting managers');
        }
        if (managerStatus !== 'active' && managerStatus !== 'on_leave') {
          throw new Error('Selected reporting manager must be active or on leave');
        }

        // Reporting Manager Role check
        // Any user can report to Manager, HR, or Super Admin
        if (!['manager', 'hr', 'super_admin'].includes(managerRole)) {
          throw new Error('Reporting manager must have Manager, HR, or Super Admin role');
        }
      } else {
        throw new Error('Selected reporting manager does not exist');
      }
    }
    updates.push(`reporting_manager_id = $${paramCount}`);
    values.push(profileData.reportingManagerId || null);
    paramCount++;
  }

  if (updates.length > 0) {
    logger.info(`[PROFILE] [UPDATE PROFILE] Updating ${updates.length} fields in database`);
    values.push(userId);
    // Don't set is_profile_updated = TRUE here yet. We'll do it after completeness check.
    const query = `UPDATE users SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP, updated_by = $${paramCount} WHERE id = $${paramCount + 1}`;
    values.splice(values.length - 1, 0, requesterId);
    await pool.query(query, values);
    logger.info(`[PROFILE] [UPDATE PROFILE] Database update completed successfully`);
  } else {
    logger.info(`[PROFILE] [UPDATE PROFILE] No fields to update in users table`);
  }

  // Update education
  if (profileData.education) {
    logger.info(`[PROFILE] [UPDATE PROFILE] Updating ${profileData.education.length} education records`);

    const dobValue = profileData.personalInfo?.dateOfBirth || currentValues.rows[0].date_of_birth;
    const birthYear = dobValue ? new Date(dobValue).getFullYear() : null;

    const educationYears: Record<string, number> = {};
    if (currentValues.rows[0].pg_year) educationYears['PG'] = parseInt(currentValues.rows[0].pg_year, 10);
    if (currentValues.rows[0].ug_year) educationYears['UG'] = parseInt(currentValues.rows[0].ug_year, 10);
    if (currentValues.rows[0].twelveth_year) educationYears['12th'] = parseInt(currentValues.rows[0].twelveth_year, 10);

    for (const edu of profileData.education) {
      if (edu.level) {
        const hasAnyField = edu.groupStream || edu.collegeUniversity || edu.year || edu.scorePercentage;
        if (hasAnyField) {
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

    // Update education columns atomically
    const fields: Record<string, string> = {
      'PG': 'pg',
      'UG': 'ug',
      '12th': 'twelveth'
    };

    const eduUpdates: string[] = [];
    const eduValues: any[] = [];
    let eduParamIndex = 1;

    // Initialize all columns with NULL in the query
    // Then override with values from profileData.education
    const educationMap: Record<string, any> = {};
    for (const edu of profileData.education) {
      if (edu.level) {
        educationMap[edu.level] = edu;
      }
    }

    for (const [level, prefix] of Object.entries(fields)) {
      const edu = educationMap[level];
      if (edu) {
        eduUpdates.push(`${prefix}_stream = $${eduParamIndex++}`);
        eduValues.push(edu.groupStream || null);
        eduUpdates.push(`${prefix}_college = $${eduParamIndex++}`);
        eduValues.push(edu.collegeUniversity || null);
        eduUpdates.push(`${prefix}_year = $${eduParamIndex++}`);
        eduValues.push(edu.year || null);
        eduUpdates.push(`${prefix}_percentage = $${eduParamIndex++}`);
        eduValues.push(edu.scorePercentage || null);
      }
    }

    if (eduUpdates.length > 0) {
      eduValues.push(userId);
      await pool.query(
        `UPDATE users SET ${eduUpdates.join(', ')} WHERE id = $${eduParamIndex}`,
        eduValues
      );
    }
  }

  // --- Profile Completeness Check ---
  // Fetch the current updated state of the user to check if all mandatory fields are filled.
  const checkResult = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
  const user = checkResult.rows[0];

  let mandatoryFields = [
    'first_name', 'last_name', 'contact_number', 'date_of_birth', 'gender', 'blood_group', 'marital_status',
    'emergency_contact_name', 'emergency_contact_no', 'emergency_contact_relation', 'personal_email',
    'designation', 'department', 'date_of_joining', 'total_experience',
    'aadhar_number', 'pan_number', 'current_address', 'permanent_address'
  ];

  // Only require education for non-HR/non-SA roles
  if (user.user_role !== 'hr' && user.user_role !== 'super_admin') {
    mandatoryFields = [
      ...mandatoryFields,
      'twelveth_stream', 'twelveth_college', 'twelveth_year', 'twelveth_percentage',
      'ug_stream', 'ug_college', 'ug_year', 'ug_percentage'
    ];
  }

  const isComplete = mandatoryFields.every(field => {
    const val = user[field];
    return val !== null && val !== undefined && String(val).trim() !== '';
  });

  // Update is_profile_updated flag based on completeness
  await pool.query('UPDATE users SET is_profile_updated = $1 WHERE id = $2', [isComplete, userId]);

  logger.info(`[PROFILE] [UPDATE PROFILE] Profile completeness check: ${isComplete ? 'COMPLETE' : 'INCOMPLETE'}. is_profile_updated set to ${isComplete}`);

  logger.info(`[PROFILE] [UPDATE PROFILE] Profile update completed successfully - User ID: ${userId}`);
  return { message: 'Profile updated successfully' };
};

export const updateProfilePhoto = async (userId: number, photoUrl: string, requesterId: number) => {
  logger.info(`[PROFILE] [UPDATE PROFILE PHOTO] ========== FUNCTION CALLED ==========`);
  logger.info(`[PROFILE] [UPDATE PROFILE PHOTO] User ID: ${userId}, Photo URL: ${photoUrl}`);

  await pool.query(
    'UPDATE users SET profile_photo_url = $1, updated_at = CURRENT_TIMESTAMP, updated_by = $2 WHERE id = $3',
    [photoUrl, requesterId, userId]
  );
  logger.info(`[PROFILE] [UPDATE PROFILE PHOTO] Profile photo updated successfully - User ID: ${userId}`);
  return { photoUrl, message: 'Profile photo updated successfully' };
};

export const deleteProfilePhoto = async (userId: number, requesterId: number) => {
  logger.info(`[PROFILE] [DELETE PROFILE PHOTO] ========== FUNCTION CALLED ==========`);
  logger.info(`[PROFILE] [DELETE PROFILE PHOTO] User ID: ${userId}`);

  await pool.query(
    'UPDATE users SET profile_photo_url = NULL, updated_at = CURRENT_TIMESTAMP, updated_by = $1 WHERE id = $2',
    [requesterId, userId]
  );
  logger.info(`[PROFILE] [DELETE PROFILE PHOTO] Profile photo deleted successfully - User ID: ${userId}`);
  return { message: 'Profile photo deleted successfully' };
};

export const getReportingManagers = async (search?: string, employeeRole?: string, excludeEmployeeId?: number) => {
  logger.info(`[PROFILE] [GET REPORTING MANAGERS] Search: ${search || 'none'}, Employee Role: ${employeeRole || 'none'}, Exclude Employee ID: ${excludeEmployeeId || 'none'}`);

  // Reporting manager rules:
  // - Any user can report to Manager, HR, or Super Admin
  // - Employee and Intern roles cannot be reporting managers
  const targetRoles: string[] = ['super_admin', 'hr', 'manager'];

  if (targetRoles.length === 0) {
    return { managers: [] };
  }

  let query = `
SELECT id, emp_id, first_name || ' ' || COALESCE(last_name, '') as name, user_role as role
FROM users
WHERE user_role = ANY($1) AND status IN ('active', 'on_leave')
`;
  const params: any[] = [targetRoles];
  let paramIndex = 2;

  // Exclude the current employee if editing
  if (excludeEmployeeId) {
    query += ` AND id != $${paramIndex}`;
    params.push(excludeEmployeeId);
    paramIndex++;
  }

  if (search) {
    // Check for special characters and emojis (allow only alphanumeric, spaces, and hyphens)
    const isValid = /^[a-zA-Z0-9\s-]*$/.test(search);
    if (!isValid) {
      logger.warn(`[PROFILE] [GET REPORTING MANAGERS] Invalid search term detected: ${search}`);
      throw new Error('Search term contains invalid characters. Emojis and special characters are not allowed.');
    }

    query += ` AND (first_name ILIKE $${paramIndex} OR last_name ILIKE $${paramIndex} OR emp_id ILIKE $${paramIndex})`;
    params.push(`%${search}%`);
  }

  query += ' ORDER BY emp_id LIMIT 20';

  logger.info(`[PROFILE] [GET REPORTING MANAGERS] Querying database for target roles: ${targetRoles.join(', ')}`);
  const result = await pool.query(query, params);
  logger.info(`[PROFILE] [GET REPORTING MANAGERS] Found ${result.rows.length} reporting managers`);

  return {
    managers: result.rows.map(row => ({
      id: row.id,
      name: row.name,
      empId: row.emp_id,
      role: row.role
    }))
  };
};
