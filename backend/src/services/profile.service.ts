import { pool } from '../database/db';

export const getProfile = async (userId: number) => {
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
    throw new Error('User not found');
  }

  const user = result.rows[0];

  // Get education
  const educationResult = await pool.query(
    'SELECT * FROM education WHERE employee_id = $1',
    [userId]
  );

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
    profilePhotoUrl: user.profile_photo_url
  };
};

export const updateProfile = async (userId: number, profileData: any) => {
  // Validate date of birth - employee must be at least 18 years old
  if (profileData.personalInfo?.dateOfBirth) {
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
          values.push(value.slice(0, 10));
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
    values.push(userId);
    const query = `UPDATE users SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${paramCount}`;
    await pool.query(query, values);
  }

  // Update education
  if (profileData.education) {
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

  return { message: 'Profile updated successfully' };
};

export const updateProfilePhoto = async (userId: number, photoUrl: string) => {
  await pool.query(
    'UPDATE users SET profile_photo_url = $1 WHERE id = $2',
    [photoUrl, userId]
  );
  return { photoUrl, message: 'Profile photo updated successfully' };
};

export const deleteProfilePhoto = async (userId: number) => {
  await pool.query(
    'UPDATE users SET profile_photo_url = NULL WHERE id = $1',
    [userId]
  );
  return { message: 'Profile photo deleted successfully' };
};

export const getReportingManagers = async (search?: string, employeeRole?: string) => {
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

  if (search) {
    query += ` AND (first_name ILIKE $2 OR last_name ILIKE $2 OR emp_id ILIKE $2)`;
    params.push(`%${search}%`);
  }

  query += ' ORDER BY first_name LIMIT 20';

  const result = await pool.query(query, params);
  return {
    managers: result.rows.map(row => ({
      id: row.id,
      name: row.name,
      empId: row.emp_id
    }))
  };
};

