import { pool } from '../database/db';
import { logger } from '../utils/logger';
import { getSignedUrlFromOVH } from '../utils/storage';
import { formatDateLocal } from '../utils/dateCalculator';

export const getProfile = async (userId: number) => {
  logger.info(`[PROFILE] [GET PROFILE] ========== FUNCTION CALLED ==========`);
  logger.info(`[PROFILE] [GET PROFILE] User ID: ${userId}`);
  const result = await pool.query(
    `SELECT u.*, 
            COALESCE(rm.id, sa.sa_id) as reporting_manager_id, 
            COALESCE(u.reporting_manager_name, rm.first_name || ' ' || COALESCE(rm.last_name, ''), sa.sa_full_name) as reporting_manager_full_name,
            COALESCE(rm.emp_id, sa.sa_emp_id) as reporting_manager_emp_id
     FROM users u
     LEFT JOIN users rm ON u.reporting_manager_id = rm.id
     LEFT JOIN LATERAL (
       SELECT id as sa_id, first_name || ' ' || COALESCE(last_name, '') as sa_full_name, emp_id as sa_emp_id
       FROM users 
       WHERE role = 'super_admin'
       ORDER BY id ASC
       LIMIT 1
     ) sa ON u.reporting_manager_id IS NULL AND u.role != 'super_admin'
     WHERE u.id = $1`,
    [userId]
  );

  if (result.rows.length === 0) {
    logger.warn(`[PROFILE] [GET PROFILE] User not found - User ID: ${userId}`);
    throw new Error('User not found');
  }

  logger.info(`[PROFILE] [GET PROFILE] User found, fetching education records`);
  const user = result.rows[0];

  // Get education
  const educationResult = await pool.query(
    'SELECT * FROM education WHERE employee_id = $1',
    [userId]
  );
  logger.info(`[PROFILE] [GET PROFILE] Found ${educationResult.rows.length} education records`);

  return {
    personalInfo: {
      firstName: user.first_name,
      middleName: user.middle_name,
      lastName: user.last_name,
      empId: user.emp_id,
      email: user.email,
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
      dateOfJoining: formatDateLocal(user.date_of_joining)
    },
    documents: {
      aadharNumber: user.aadhar_number,
      panNumber: user.pan_number
    },
    address: {
      currentAddress: user.current_address,
      permanentAddress: user.permanent_address
    },
    education: educationResult.rows.map(edu => ({
      level: edu.level,
      groupStream: edu.group_stream,
      collegeUniversity: edu.college_university,
      year: edu.year,
      scorePercentage: edu.score_percentage ? parseFloat(edu.score_percentage) : null
    })),
    reportingManager:
      user.reporting_manager_name || user.reporting_manager_id
        ? {
          id: user.reporting_manager_id || null,
          name: user.reporting_manager_name || user.reporting_manager_full_name,
          empId: user.reporting_manager_emp_id || null
        }
        : null,
    // Always use OVHcloud keys - no local URLs
    // If profile_photo_url is an OVHcloud key (starts with 'profile-photos/'), return it as profilePhotoKey
    // Otherwise, it's a legacy local path - return null (user needs to re-upload)
    profilePhotoUrl: null, // Always null - use profilePhotoKey and signed URLs
    profilePhotoKey: user.profile_photo_url && user.profile_photo_url.startsWith('profile-photos/')
      ? user.profile_photo_url
      : null
  };
};

export const updateProfile = async (userId: number, profileData: any, requesterRole: string) => {
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
  const currentValues = await pool.query('SELECT role, status, date_of_birth, date_of_joining, emp_id, email, designation, department FROM users WHERE id = $1', [userId]);
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
    reportingManagerId: 'reporting_manager_id'
  };

  const allowedPersonalFields = [
    'first_name', 'middle_name', 'last_name', 'contact_number', 'alt_contact',
    'date_of_birth', 'gender', 'blood_group', 'marital_status',
    'emergency_contact_name', 'emergency_contact_no', 'emergency_contact_relation'
  ];

  const allowedEmploymentFields = [
    'designation', 'department', 'date_of_joining'
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
        const finalValue = (typeof value === 'string' && value.trim() === '') ? null : value;

        // Check for required fields
        if (requiredPersonalInfo.includes(key) && finalValue === null) {
          throw new Error(`${key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1')} is required`);
        }

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

      // designation and department are disabled for non-super_admin users in self-update
      if (key === 'designation') {
        if (userRole !== 'super_admin' && value && value !== currentValues.rows[0].designation) {
          throw new Error('Designation cannot be updated by employee');
        }
        if (userRole !== 'super_admin') continue;
      }
      if (key === 'department') {
        if (userRole !== 'super_admin' && value && value !== currentValues.rows[0].department) {
          throw new Error('Department cannot be updated by employee');
        }
        if (userRole !== 'super_admin') continue;
      }

      if (value !== undefined) {
        const finalValue = (typeof value === 'string' && value.trim() === '') ? null : value;

        if (requiredEmploymentInfo.includes(key) && finalValue === null) {
          throw new Error(`${key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1')} is required`);
        }

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

        if (requiredDocuments.includes(key) && finalValue === null) {
          throw new Error(`${key === 'aadharNumber' ? 'Aadhar' : 'PAN'} number is required`);
        }

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
        const finalValue = (typeof value === 'string' && value.trim() === '') ? null : value;

        if (requiredAddress.includes(key) && finalValue === null) {
          throw new Error(`${key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1')} is required`);
        }

        updates.push(`${dbKey} = $${paramCount}`);
        values.push(finalValue);
        paramCount++;
      }
    }
  }

  // Update reporting manager - DISALLOWED in Profile Update API
  // Reporting manager should only be updated by Admin/HR via Employee Management (Employee Service)
  if (profileData.reportingManagerId !== undefined) {
    throw new Error('Reporting Manager cannot be updated through Profile settings');
  }

  if (updates.length > 0) {
    logger.info(`[PROFILE] [UPDATE PROFILE] Updating ${updates.length} fields in database`);
    values.push(userId);
    const query = `UPDATE users SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${paramCount}`;
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

    // Fetch existing education to merge with updates for validation
    const existingEducationResult = await pool.query('SELECT level, year FROM education WHERE employee_id = $1', [userId]);
    const educationYears: Record<string, number> = {};

    // Populate with existing data first
    for (const edu of existingEducationResult.rows) {
      if (edu.year && /^[0-9]{4}$/.test(edu.year)) {
        educationYears[edu.level] = parseInt(edu.year, 10);
      }
    }

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

          // Update/Override with new year
          educationYears[edu.level] = gradYear;
        }
      }
    }

    // Enforce logical graduation year gaps
    if (educationYears['10th']) {
      if (educationYears['12th'] && educationYears['12th'] - educationYears['10th'] < 2) {
        throw new Error(`Minimum 2 years gap required between 10th (${educationYears['10th']}) and 12th (${educationYears['12th']}) Graduation Year`);
      }
      if (educationYears['UG'] && educationYears['UG'] - educationYears['10th'] < 5) {
        throw new Error(`Minimum 5 years gap required between 10th (${educationYears['10th']}) and UG (${educationYears['UG']}) Graduation Year`);
      }
    }

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

    // Perform database updates after all validations pass
    for (const edu of profileData.education) {
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

  logger.info(`[PROFILE] [UPDATE PROFILE] Profile update completed successfully - User ID: ${userId}`);
  return { message: 'Profile updated successfully' };
};

export const updateProfilePhoto = async (userId: number, photoUrl: string) => {
  logger.info(`[PROFILE] [UPDATE PROFILE PHOTO] ========== FUNCTION CALLED ==========`);
  logger.info(`[PROFILE] [UPDATE PROFILE PHOTO] User ID: ${userId}, Photo URL: ${photoUrl}`);

  await pool.query(
    'UPDATE users SET profile_photo_url = $1 WHERE id = $2',
    [photoUrl, userId]
  );
  logger.info(`[PROFILE] [UPDATE PROFILE PHOTO] Profile photo updated successfully - User ID: ${userId}`);
  return { photoUrl, message: 'Profile photo updated successfully' };
};

export const deleteProfilePhoto = async (userId: number) => {
  logger.info(`[PROFILE] [DELETE PROFILE PHOTO] ========== FUNCTION CALLED ==========`);
  logger.info(`[PROFILE] [DELETE PROFILE PHOTO] User ID: ${userId}`);

  await pool.query(
    'UPDATE users SET profile_photo_url = NULL WHERE id = $1',
    [userId]
  );
  logger.info(`[PROFILE] [DELETE PROFILE PHOTO] Profile photo deleted successfully - User ID: ${userId}`);
  return { message: 'Profile photo deleted successfully' };
};

export const getReportingManagers = async (search?: string, employeeRole?: string, excludeEmployeeId?: number) => {
  logger.info(`[PROFILE] [GET REPORTING MANAGERS] Search: ${search || 'none'}, Employee Role: ${employeeRole || 'none'}, Exclude Employee ID: ${excludeEmployeeId || 'none'}`);

  // Reporting manager rules:
  // - Super Admin is always an option for every role
  // - Interns and Employees also see Managers
  // - Managers also see HRs
  // - HRs and Super Admins see only Super Admins
  let targetRoles: string[] = ['super_admin'];

  if (employeeRole === 'intern' || employeeRole === 'employee') {
    targetRoles.push('manager');
  } else if (employeeRole === 'manager') {
    targetRoles.push('hr');
  }

  if (targetRoles.length === 0) {
    return { managers: [] };
  }

  let query = `
    SELECT id, emp_id, first_name || ' ' || COALESCE(last_name, '') as name
    FROM users
    WHERE role = ANY($1) AND status IN ('active', 'on_leave')
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
      empId: row.emp_id
    }))
  };
};

