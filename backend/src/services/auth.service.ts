import bcrypt from 'bcrypt';
import { pool } from '../database/db';
import { generateAccessToken, generateRefreshToken } from '../utils/jwt';

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

  const newHash = await hashPassword(newPassword);

  await pool.query(
    'UPDATE users SET password_hash = $1, must_change_password = false, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
    [newHash, userId]
  );
};

