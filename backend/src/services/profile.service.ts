import { pool } from '../database/db';
import { logger } from '../utils/logger';
import { getSignedUrlFromOVH } from '../utils/storage';

export const getProfile = async (userId: number) => {
  logger.info(`[PROFILE] [GET PROFILE] ========== FUNCTION CALLED ==========`);
  logger.info(`[PROFILE] [GET PROFILE] User ID: ${userId}`);
  const result = await pool.query(
    `SELECT u.*, 
            rm.id as reporting_manager_id, 
            rm.first_name || ' ' || COALESCE(rm.last_name, '') as reporting_manager_full_name,
            rm.emp_id as reporting_manager_emp_id
     FROM users u
     LEFT JOIN users rm ON u.reporting_manager_id = rm.id
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
      dateOfBirth: user.date_of_birth ? user.date_of_birth.toISOString().split('T')[0] : null,
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
      dateOfJoining: user.date_of_joining ? user.date_of_joining.toISOString().split('T')[0] : null
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

export const updateProfile = async (userId: number, profileData: any) => {
  logger.info(`[PROFILE] [UPDATE PROFILE] ========== FUNCTION CALLED ==========`);
  logger.info(`[PROFILE] [UPDATE PROFILE] User ID: ${userId}`);
  logger.info(`[PROFILE] [UPDATE PROFILE] Sections to update: ${Object.keys(profileData).join(', ')}`);
  
  // Validate date of birth - employee must be at least 18 years old
  if (profileData.personalInfo?.dateOfBirth) {
    logger.info(`[PROFILE] [UPDATE PROFILE] Validating date of birth`);
    const dob = new Date(profileData.personalInfo.dateOfBirth);
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

  // Update personal info
  if (profileData.personalInfo) {
    for (const [key, value] of Object.entries(profileData.personalInfo)) {
      const dbKey = fieldMap[key] || key;
      if (value !== undefined && value !== null) {
        updates.push(`${dbKey} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    }
  }

  // Update employment info (only for HR/Super Admin)
  if (profileData.employmentInfo) {
    for (const [key, value] of Object.entries(profileData.employmentInfo)) {
      const dbKey = fieldMap[key] || key;
      if (value !== undefined && value !== null) {
        updates.push(`${dbKey} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    }
  }

  // Update documents
  if (profileData.documents) {
    for (const [key, value] of Object.entries(profileData.documents)) {
      const dbKey = fieldMap[key] || key;
      if (value !== undefined && value !== null) {
        updates.push(`${dbKey} = $${paramCount}`);
        if (dbKey === 'pan_number' && typeof value === 'string') {
          const pan = value.trim().toUpperCase();
          // Validate PAN format: 5 letters, 4 digits, 1 letter
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
          values.push(value);
        }
        paramCount++;
      }
    }
  }

  // Update address
  if (profileData.address) {
    for (const [key, value] of Object.entries(profileData.address)) {
      const dbKey = fieldMap[key] || key;
      if (value !== undefined && value !== null) {
        updates.push(`${dbKey} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    }
  }

  // Update reporting manager
  if (profileData.reportingManagerId !== undefined) {
    updates.push(`reporting_manager_id = $${paramCount}`);
    values.push(profileData.reportingManagerId || null);
    paramCount++;
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
    for (const edu of profileData.education) {
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
  logger.info(`[PROFILE] [GET REPORTING MANAGERS] ========== FUNCTION CALLED ==========`);
  logger.info(`[PROFILE] [GET REPORTING MANAGERS] Search: ${search || 'none'}, Employee Role: ${employeeRole || 'none'}, Exclude Employee ID: ${excludeEmployeeId || 'none'}`);
  
  // Reporting manager rules:
  // - For managers, their reporting manager should be HR
  // - For HR, their reporting manager should be super admin
  // - For employees, their reporting manager should be a manager
  let targetRole: string;
  if (employeeRole === 'manager') {
    targetRole = 'hr';
  } else if (employeeRole === 'hr') {
    targetRole = 'super_admin';
  } else {
    targetRole = 'manager';
  }
  
  let query = `
    SELECT id, emp_id, first_name || ' ' || COALESCE(last_name, '') as name
    FROM users
    WHERE role = $1 AND status = 'active'
  `;
  const params: any[] = [targetRole];
  let paramIndex = 2;

  // Exclude the current employee if editing
  if (excludeEmployeeId) {
    query += ` AND id != $${paramIndex}`;
    params.push(excludeEmployeeId);
    paramIndex++;
  }

  if (search) {
    query += ` AND (first_name ILIKE $${paramIndex} OR last_name ILIKE $${paramIndex} OR emp_id ILIKE $${paramIndex})`;
    params.push(`%${search}%`);
  }

  query += ' ORDER BY first_name LIMIT 20';

  logger.info(`[PROFILE] [GET REPORTING MANAGERS] Querying database for target role: ${targetRole}`);
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

