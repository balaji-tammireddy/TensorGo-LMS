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
    mustChangePassword: boolean;
  };
}

export const login = async (email: string, password: string): Promise<LoginResult> => {
  // Normalize email: trim and convert to lowercase
  const normalizedEmail = email.trim().toLowerCase();
  
  const result = await pool.query(
    'SELECT id, emp_id, email, password_hash, role, first_name, last_name, status, must_change_password FROM users WHERE LOWER(TRIM(email)) = $1',
    [normalizedEmail]
  );

  if (result.rows.length === 0) {
    // Email does not exist
    throw new Error('Email not found');
  }

  const user = result.rows[0];

  if (user.status !== 'active') {
    throw new Error('Account is not active');
  }

  const isValidPassword = await bcrypt.compare(password, user.password_hash);
  if (!isValidPassword) {
    // Email exists but password is incorrect
    throw new Error('Wrong password');
  }

  const tokenPayload = {
    userId: user.id,
    email: user.email,
    role: user.role
  };

  const accessToken = generateAccessToken(tokenPayload);
  const refreshToken = generateRefreshToken(tokenPayload);

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      empId: user.emp_id,
      name: `${user.first_name} ${user.last_name || ''}`.trim(),
      role: user.role,
      email: user.email,
      mustChangePassword: !!user.must_change_password
    }
  };
};

export const hashPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password, 12);
};

export const changePassword = async (
  userId: number,
  oldPassword: string,
  newPassword: string
): Promise<void> => {
  const result = await pool.query(
    'SELECT password_hash FROM users WHERE id = $1',
    [userId]
  );

  if (result.rows.length === 0) {
    throw new Error('User not found');
  }

  const user = result.rows[0];
  const isValidOld = await bcrypt.compare(oldPassword, user.password_hash);

  if (!isValidOld) {
    throw new Error('Old password is incorrect');
  }

  // Check if new password is same as old password
  const isSamePassword = await bcrypt.compare(newPassword, user.password_hash);
  if (isSamePassword) {
    throw new Error('New password cannot be the same as your current password');
  }

  const newHash = await hashPassword(newPassword);

  await pool.query(
    'UPDATE users SET password_hash = $1, must_change_password = false, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
    [newHash, userId]
  );

  // Send security notification email
  try {
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
      logger.info(`✅ Password change security email sent to: ${user.email}`);
    }
  } catch (emailError: any) {
    // Log error but don't fail password change
    logger.error(`❌ Error sending password change security email:`, emailError);
  }
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
  // Normalize email
  const normalizedEmail = email.trim().toLowerCase();
  
  // Check if user exists and is active
  const userResult = await pool.query(
    'SELECT id, email, first_name, last_name, status FROM users WHERE LOWER(TRIM(email)) = $1',
    [normalizedEmail]
  );

  if (userResult.rows.length === 0) {
    // Don't reveal if email exists or not for security
    logger.warn(`Password reset requested for non-existent email: ${normalizedEmail}`);
    // Still return success to prevent email enumeration
    return;
  }

  const user = userResult.rows[0];

  if (user.status !== 'active') {
    logger.warn(`Password reset requested for inactive account: ${normalizedEmail}`);
    // Still return success to prevent account enumeration
    return;
  }

  // Generate OTP
  const otp = generateOTP();
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 10); // OTP valid for 10 minutes

  // Invalidate any existing unused OTPs for this user
  await pool.query(
    'UPDATE password_reset_otps SET is_used = true WHERE user_id = $1 AND is_used = false',
    [user.id]
  );

  // Store new OTP
  await pool.query(
    `INSERT INTO password_reset_otps (user_id, email, otp, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [user.id, normalizedEmail, otp, expiresAt]
  );

  // Send OTP email
  const userName = `${user.first_name} ${user.last_name || ''}`.trim() || 'User';
  // Add unique identifier to prevent email threading - Gmail threads aggressively
  // Use timestamp + random string to ensure each email has a completely unique subject
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  // Include unique code in subject to prevent Gmail from threading
  const emailSubject = `Password Reset OTP - TensorGo-LMS [Ref: ${timestamp}${randomStr}]`;
  const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Password Reset OTP</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 20px 0; text-align: center; background-color: #ffffff;">
        <table role="presentation" style="width: 600px; margin: 0 auto; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 30px 40px; background-color: #2563eb; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">Password Reset Request</h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px; text-align: center;">
              <p style="margin: 0 0 20px 0; color: #333333; font-size: 16px; line-height: 1.6;">
                Dear ${userName},
              </p>
              
              <p style="margin: 0 0 20px 0; color: #333333; font-size: 16px; line-height: 1.6;">
                You have requested to reset your password for your TensorGo-LMS account.
              </p>
              
              <div style="background-color: #f8f9fa; border-left: 4px solid #2563eb; padding: 20px; margin: 20px 0; border-radius: 4px; text-align: center;">
                <p style="margin: 0 0 10px 0; color: #333333; font-size: 14px;">Your OTP Code:</p>
                <p style="margin: 0; color: #2563eb; font-size: 32px; letter-spacing: 8px; font-family: 'Courier New', monospace;">${otp}</p>
              </div>
              
              <p style="margin: 20px 0 0 0; color: #666666; font-size: 14px; line-height: 1.6;">
                This OTP is valid for 10 minutes. Please enter this code to reset your password.
              </p>
              
              <p style="margin: 20px 0 0 0; color: #ef4444; font-size: 14px; line-height: 1.6;">
                ⚠️ Security Notice: If you did not request this password reset, please ignore this email or contact your administrator immediately.
              </p>
              
              <p style="margin: 30px 0 0 0; color: #333333; font-size: 14px; line-height: 1.6;">
                Best regards,<br>
                TensorGo-LMS
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px; background-color: #f8f9fa; border-radius: 0 0 8px 8px; text-align: center;">
              <p style="margin: 0; color: #666666; font-size: 12px;">
                This is an automated email from TensorGo Leave Management System.
              </p>
              <p style="margin: 8px 0 0 0; color: #666666; font-size: 12px;">
                Please do not reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  const emailText = `
Password Reset Request

Dear ${userName},

You have requested to reset your password for your TensorGo-LMS account.

Your OTP Code: ${otp}

This OTP is valid for 10 minutes. Please enter this code to reset your password.

⚠️ Security Notice: If you did not request this password reset, please ignore this email or contact your administrator immediately.

Best regards,
TensorGo-LMS

---
This is an automated email from TensorGo Leave Management System.
Please do not reply to this email.
  `;

  const emailSent = await sendEmail({
    to: normalizedEmail,
    subject: emailSubject,
    html: emailHtml,
    text: emailText,
  });

  if (emailSent) {
    logger.info(`Password reset OTP sent to ${normalizedEmail}`);
  } else {
    logger.error(`Failed to send password reset OTP to ${normalizedEmail}`);
    throw new Error('Failed to send OTP email. Please try again later.');
  }
};

/**
 * Verify OTP for password reset
 */
export const verifyPasswordResetOTP = async (email: string, otp: string): Promise<boolean> => {
  const normalizedEmail = email.trim().toLowerCase();
  
  // Find valid OTP
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
    return false;
  }

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
  const normalizedEmail = email.trim().toLowerCase();
  
  // Verify OTP
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
    throw new Error('Invalid or expired OTP');
  }

  const otpRecord = otpResult.rows[0];
  const userId = otpRecord.user_id;

  // Get current password hash to check if new password is same
  const userResult = await pool.query(
    'SELECT password_hash FROM users WHERE id = $1',
    [userId]
  );

  if (userResult.rows.length === 0) {
    throw new Error('User not found');
  }

  const currentPasswordHash = userResult.rows[0].password_hash;

  // Check if new password is same as current password
  const isSamePassword = await bcrypt.compare(newPassword, currentPasswordHash);
  if (isSamePassword) {
    throw new Error('New password cannot be the same as your current password');
  }

  // Hash new password
  const newHash = await hashPassword(newPassword);

  // Update password and mark OTP as used (in transaction)
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Update password
    await client.query(
      'UPDATE users SET password_hash = $1, must_change_password = false, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newHash, userId]
    );

    // Mark OTP as used
    await client.query(
      'UPDATE password_reset_otps SET is_used = true WHERE id = $1',
      [otpRecord.id]
    );

    await client.query('COMMIT');
    logger.info(`Password reset successful for user ${userId} (${normalizedEmail})`);
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error(`Password reset failed for ${normalizedEmail}:`, error);
    throw error;
  } finally {
    client.release();
  }
};

