import bcrypt from 'bcrypt';
import { pool } from '../database/db';
import { generateAccessToken, generateRefreshToken } from '../utils/jwt';
import { sendEmail } from '../utils/email';
import { logger } from '../utils/logger';

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: {
    id: number;
    empId: string;
    name: string;
    role: string;
    email: string;
    status: string;
    mustChangePassword: boolean;
  };
}

export const login = async (email: string, password: string): Promise<LoginResult> => {
  logger.info(`[AUTH] [LOGIN] ========== FUNCTION CALLED ==========`);
  logger.info(`[AUTH] [LOGIN] Email: ${email}`);

  // Normalize email: trim and convert to lowercase
  const normalizedEmail = email.trim().toLowerCase();
  logger.info(`[AUTH] [LOGIN] Normalized email: ${normalizedEmail}`);

  const result = await pool.query(
    'SELECT id, emp_id, email, password_hash, role, first_name, last_name, status, must_change_password, token_version FROM users WHERE LOWER(TRIM(email)) = $1',
    [normalizedEmail]
  );

  if (result.rows.length === 0) {
    logger.warn(`[AUTH] [LOGIN] Email not found: ${normalizedEmail}`);
    // Email does not exist
    throw new Error('Email not found');
  }

  const user = result.rows[0];
  logger.info(`[AUTH] [LOGIN] User found - ID: ${user.id}, Role: ${user.role}, Status: ${user.status}`);

  // Allow 'on_notice' users to login as well
  if (user.status !== 'active' && user.status !== 'on_notice') {
    logger.warn(`[AUTH] [LOGIN] Account is not active - User ID: ${user.id}, Status: ${user.status}`);
    throw new Error('Account is not active');
  }

  logger.info(`[AUTH] [LOGIN] Validating password for user ID: ${user.id}`);
  const isValidPassword = await bcrypt.compare(password, user.password_hash);
  if (!isValidPassword) {
    logger.warn(`[AUTH] [LOGIN] Invalid password for user ID: ${user.id}`);
    // Email exists but password is incorrect
    throw new Error('Wrong password');
  }

  logger.info(`[AUTH] [LOGIN] Password validated successfully for user ID: ${user.id}`);

  const tokenPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    tokenVersion: user.token_version || 0 // Default to 0 if null/undefined
  };

  logger.info(`[AUTH] [LOGIN] Generating tokens for user ID: ${user.id}`);
  const accessToken = generateAccessToken(tokenPayload);
  const refreshToken = generateRefreshToken(tokenPayload);
  logger.info(`[AUTH] [LOGIN] Tokens generated successfully for user ID: ${user.id}`);

  const loginResult = {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      empId: user.emp_id,
      name: `${user.first_name} ${user.last_name || ''}`.trim(),
      role: user.role,
      email: user.email,
      status: user.status,
      mustChangePassword: !!user.must_change_password
    }
  };

  logger.info(`[AUTH] [LOGIN] Login successful for user ID: ${user.id}, Role: ${user.role}`);
  return loginResult;
};

export const validateUser = async (userId: number) => {
  const result = await pool.query(
    'SELECT id, emp_id, email, role, first_name, last_name, status, must_change_password, token_version FROM users WHERE id = $1',
    [userId]
  );

  if (result.rows.length === 0) return null;

  const user = result.rows[0];

  // Allow 'on_notice' users to still have access
  if (user.status !== 'active' && user.status !== 'on_notice') return null;

  return {
    id: user.id,
    empId: user.emp_id,
    name: `${user.first_name} ${user.last_name || ''}`.trim(),
    role: user.role,
    email: user.email,
    status: user.status,
    mustChangePassword: !!user.must_change_password,
    tokenVersion: user.token_version || 0
  };
};

export const hashPassword = async (password: string): Promise<string> => {
  logger.info(`[AUTH] [HASH PASSWORD] Hashing password`);
  const hash = await bcrypt.hash(password, 12);
  logger.info(`[AUTH] [HASH PASSWORD] Password hashed successfully`);
  return hash;
};

export const changePassword = async (
  userId: number,
  oldPassword: string,
  newPassword: string
): Promise<void> => {
  logger.info(`[AUTH] [CHANGE PASSWORD] ========== FUNCTION CALLED ==========`);
  logger.info(`[AUTH] [CHANGE PASSWORD] User ID: ${userId}`);

  const result = await pool.query(
    'SELECT password_hash FROM users WHERE id = $1',
    [userId]
  );

  if (result.rows.length === 0) {
    logger.warn(`[AUTH] [CHANGE PASSWORD] User not found - User ID: ${userId}`);
    throw new Error('User not found');
  }

  logger.info(`[AUTH] [CHANGE PASSWORD] User found, validating old password`);
  const user = result.rows[0];
  const isValidOld = await bcrypt.compare(oldPassword, user.password_hash);

  if (!isValidOld) {
    logger.warn(`[AUTH] [CHANGE PASSWORD] Old password is incorrect - User ID: ${userId}`);
    throw new Error('Old password is incorrect');
  }

  logger.info(`[AUTH] [CHANGE PASSWORD] Old password validated, checking if new password is same as old`);
  // Check if new password is same as old password
  const isSamePassword = await bcrypt.compare(newPassword, user.password_hash);
  if (isSamePassword) {
    logger.warn(`[AUTH] [CHANGE PASSWORD] New password is same as old password - User ID: ${userId}`);
    throw new Error('New password cannot be the same as your current password');
  }

  logger.info(`[AUTH] [CHANGE PASSWORD] Hashing new password`);
  const newHash = await hashPassword(newPassword);

  logger.info(`[AUTH] [CHANGE PASSWORD] Updating password in database`);
  await pool.query(
    'UPDATE users SET password_hash = $1, must_change_password = false, token_version = COALESCE(token_version, 0) + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
    [newHash, userId]
  );
  logger.info(`[AUTH] [CHANGE PASSWORD] Password updated successfully in database`);

  // Send security notification email
  try {
    logger.info(`[AUTH] [CHANGE PASSWORD] Preparing to send security notification email`);
    const { sendPasswordChangeSecurityEmail } = await import('../utils/emailTemplates');
    const userResult = await pool.query(
      'SELECT email, first_name || \' \' || COALESCE(last_name, \'\') as user_name FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length > 0) {
      const user = userResult.rows[0];
      await sendPasswordChangeSecurityEmail(user.email, {
        userName: user.user_name || 'User',
        changeTimestamp: new Date().toISOString(),
        ipAddress: undefined // Can be added if IP is passed to the function
      });
      logger.info(`[AUTH] [CHANGE PASSWORD] Password change security email sent to: ${user.email}`);
    }
  } catch (emailError: any) {
    // Log error but don't fail password change
    logger.error(`[AUTH] [CHANGE PASSWORD] Error sending password change security email:`, emailError);
  }

  logger.info(`[AUTH] [CHANGE PASSWORD] Password change completed successfully for User ID: ${userId}`);
};

/**
 * Generate a 6-digit OTP
 */
const generateOTP = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Request password reset - generates OTP and sends email
 */
export const requestPasswordReset = async (email: string): Promise<void> => {
  logger.info(`[AUTH] [REQUEST PASSWORD RESET] ========== FUNCTION CALLED ==========`);
  logger.info(`[AUTH] [REQUEST PASSWORD RESET] Email: ${email}`);

  // Normalize email
  const normalizedEmail = email.trim().toLowerCase();
  logger.info(`[AUTH] [REQUEST PASSWORD RESET] Normalized email: ${normalizedEmail}`);

  // Check if user exists and is active
  const userResult = await pool.query(
    'SELECT id, email, first_name, last_name, status FROM users WHERE LOWER(TRIM(email)) = $1',
    [normalizedEmail]
  );

  if (userResult.rows.length === 0) {
    // Don't reveal if email exists or not for security
    logger.warn(`[AUTH] [REQUEST PASSWORD RESET] Password reset requested for non-existent email: ${normalizedEmail}`);
    // Still return success to prevent email enumeration
    return;
  }

  const user = userResult.rows[0];
  logger.info(`[AUTH] [REQUEST PASSWORD RESET] User found - ID: ${user.id}, Status: ${user.status}`);

  if (user.status !== 'active') {
    logger.warn(`[AUTH] [REQUEST PASSWORD RESET] Password reset requested for inactive account: ${normalizedEmail}, Status: ${user.status}`);
    // Still return success to prevent account enumeration
    return;
  }

  // Generate OTP
  logger.info(`[AUTH] [REQUEST PASSWORD RESET] Generating OTP for user ID: ${user.id}`);
  const otp = generateOTP();
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 10); // OTP valid for 10 minutes
  logger.info(`[AUTH] [REQUEST PASSWORD RESET] OTP generated: ${otp}, Expires at: ${expiresAt.toISOString()}`);

  // Invalidate any existing unused OTPs for this user
  logger.info(`[AUTH] [REQUEST PASSWORD RESET] Invalidating existing unused OTPs for user ID: ${user.id}`);
  await pool.query(
    'UPDATE password_reset_otps SET is_used = true WHERE user_id = $1 AND is_used = false',
    [user.id]
  );

  // Store new OTP
  logger.info(`[AUTH] [REQUEST PASSWORD RESET] Storing new OTP in database`);
  await pool.query(
    `INSERT INTO password_reset_otps (user_id, email, otp, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [user.id, normalizedEmail, otp, expiresAt]
  );
  logger.info(`[AUTH] [REQUEST PASSWORD RESET] OTP stored successfully`);

  // Send OTP email
  const userName = `${user.first_name} ${user.last_name || ''}`.trim() || 'User';
  try {
    const { sendPasswordResetEmail } = await import('../utils/emailTemplates');
    await sendPasswordResetEmail(normalizedEmail, {
      userName,
      otp
    });
    logger.info(`[AUTH] [REQUEST PASSWORD RESET] OTP email sent successfully to ${normalizedEmail}`);
  } catch (emailError: any) {
    logger.error(`[AUTH] [REQUEST PASSWORD RESET] Error sending OTP email to ${normalizedEmail}:`, emailError);
  }

  logger.info(`[AUTH] [REQUEST PASSWORD RESET] Password reset request completed successfully for user ID: ${user.id}`);
};

/**
 * Verify OTP for password reset
 */
export const verifyPasswordResetOTP = async (email: string, otp: string): Promise<boolean> => {
  logger.info(`[AUTH][VERIFY OTP] ========== FUNCTION CALLED ==========`);
  logger.info(`[AUTH][VERIFY OTP]Email: ${email} `);

  const normalizedEmail = email.trim().toLowerCase();

  // Find valid OTP
  logger.info(`[AUTH][VERIFY OTP] Searching for valid OTP`);
  const result = await pool.query(
    `SELECT pr.id, pr.user_id, pr.expires_at, pr.is_used, u.status
     FROM password_reset_otps pr
     JOIN users u ON pr.user_id = u.id
     WHERE LOWER(TRIM(pr.email)) = $1 
       AND pr.otp = $2 
       AND pr.is_used = false
       AND pr.expires_at > NOW()
       AND u.status = 'active'
     ORDER BY pr.created_at DESC
     LIMIT 1`,
    [normalizedEmail, otp]
  );

  if (result.rows.length === 0) {
    logger.warn(`[AUTH][VERIFY OTP] Invalid or expired OTP for email: ${normalizedEmail} `);
    return false;
  }

  logger.info(`[AUTH][VERIFY OTP] OTP verified successfully for user ID: ${result.rows[0].user_id} `);
  return true;
};

/**
 * Reset password using OTP
 */
export const resetPasswordWithOTP = async (
  email: string,
  otp: string,
  newPassword: string
): Promise<void> => {
  logger.info(`[AUTH][RESET PASSWORD WITH OTP] ========== FUNCTION CALLED ==========`);
  logger.info(`[AUTH][RESET PASSWORD WITH OTP]Email: ${email} `);

  const normalizedEmail = email.trim().toLowerCase();

  // Verify OTP
  logger.info(`[AUTH][RESET PASSWORD WITH OTP] Verifying OTP`);
  const otpResult = await pool.query(
    `SELECT pr.id, pr.user_id, pr.expires_at, pr.is_used, u.status
     FROM password_reset_otps pr
     JOIN users u ON pr.user_id = u.id
     WHERE LOWER(TRIM(pr.email)) = $1 
       AND pr.otp = $2 
       AND pr.is_used = false
       AND pr.expires_at > NOW()
       AND u.status = 'active'
     ORDER BY pr.created_at DESC
     LIMIT 1`,
    [normalizedEmail, otp]
  );

  if (otpResult.rows.length === 0) {
    logger.warn(`[AUTH][RESET PASSWORD WITH OTP] Invalid or expired OTP for email: ${normalizedEmail} `);
    throw new Error('Invalid or expired OTP');
  }

  const otpRecord = otpResult.rows[0];
  const userId = otpRecord.user_id;
  logger.info(`[AUTH][RESET PASSWORD WITH OTP] OTP verified successfully for user ID: ${userId} `);

  // Get current password hash to check if new password is same
  logger.info(`[AUTH][RESET PASSWORD WITH OTP] Fetching current password hash`);
  const userResult = await pool.query(
    'SELECT password_hash FROM users WHERE id = $1',
    [userId]
  );

  if (userResult.rows.length === 0) {
    logger.warn(`[AUTH][RESET PASSWORD WITH OTP] User not found - User ID: ${userId} `);
    throw new Error('User not found');
  }

  const currentPasswordHash = userResult.rows[0].password_hash;

  // Check if new password is same as current password
  logger.info(`[AUTH][RESET PASSWORD WITH OTP] Checking if new password is same as current password`);
  const isSamePassword = await bcrypt.compare(newPassword, currentPasswordHash);
  if (isSamePassword) {
    logger.warn(`[AUTH][RESET PASSWORD WITH OTP] New password is same as current password - User ID: ${userId} `);
    throw new Error('New password cannot be the same as your current password');
  }

  // Hash new password
  logger.info(`[AUTH][RESET PASSWORD WITH OTP] Hashing new password`);
  const newHash = await hashPassword(newPassword);

  // Update password and mark OTP as used (in transaction)
  logger.info(`[AUTH][RESET PASSWORD WITH OTP] Starting database transaction`);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    logger.info(`[AUTH][RESET PASSWORD WITH OTP] Transaction started`);

    // Update password
    logger.info(`[AUTH][RESET PASSWORD WITH OTP] Updating password in database`);
    await client.query(
      'UPDATE users SET password_hash = $1, must_change_password = false, token_version = COALESCE(token_version, 0) + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newHash, userId]
    );

    // Mark OTP as used
    logger.info(`[AUTH][RESET PASSWORD WITH OTP] Marking OTP as used`);
    await client.query(
      'UPDATE password_reset_otps SET is_used = true WHERE id = $1',
      [otpRecord.id]
    );

    await client.query('COMMIT');
    logger.info(`[AUTH][RESET PASSWORD WITH OTP] Transaction committed successfully`);
    logger.info(`[AUTH][RESET PASSWORD WITH OTP] Password reset successful for user ${userId}(${normalizedEmail})`);

    // Send security notification email
    try {
      logger.info(`[AUTH][RESET PASSWORD WITH OTP] Preparing to send security notification email`);
      const { sendPasswordChangeSecurityEmail } = await import('../utils/emailTemplates');
      const userResult = await pool.query(
        'SELECT email, first_name || \' \' || COALESCE(last_name, \'\') as user_name FROM users WHERE id = $1',
        [userId]
      );

      if (userResult.rows.length > 0) {
        const user = userResult.rows[0];
        await sendPasswordChangeSecurityEmail(user.email, {
          userName: user.user_name || 'User',
          changeTimestamp: new Date().toISOString()
        });
        logger.info(`[AUTH][RESET PASSWORD WITH OTP] Password reset security email sent to: ${user.email} `);
      }
    } catch (emailError: any) {
      logger.error(`[AUTH][RESET PASSWORD WITH OTP] Error sending password reset security email: `, emailError);
    }
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error(`[AUTH][RESET PASSWORD WITH OTP] Transaction rolled back - Password reset failed for ${normalizedEmail}: `, error);
    throw error;
  } finally {
    client.release();
  }
};

