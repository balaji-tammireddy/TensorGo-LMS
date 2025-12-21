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
  };
}

export const login = async (email: string, password: string): Promise<LoginResult> => {
  // Normalize email: trim and convert to lowercase
  const normalizedEmail = email.trim().toLowerCase();
  
  const result = await pool.query(
    'SELECT id, emp_id, email, password_hash, role, first_name, last_name, status FROM users WHERE LOWER(TRIM(email)) = $1',
    [normalizedEmail]
  );

  if (result.rows.length === 0) {
    throw new Error('Invalid credentials');
  }

  const user = result.rows[0];

  if (user.status !== 'active') {
    throw new Error('Account is not active');
  }

  const isValidPassword = await bcrypt.compare(password, user.password_hash);
  if (!isValidPassword) {
    throw new Error('Invalid credentials');
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
      email: user.email
    }
  };
};

export const hashPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password, 12);
};

