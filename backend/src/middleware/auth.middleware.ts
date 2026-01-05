import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../database/db';

export interface AuthRequest extends Request {
  user?: {
    id: number;
    empId: string;
    email: string;
    role: string;
    name: string;
  };
}

export const authenticateToken = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Access token required'
        }
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;

    // Verify user still exists and is active
    const result = await pool.query(
      'SELECT id, emp_id, email, role, first_name, last_name, status FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (result.rows.length === 0 || (result.rows[0].status !== 'active' && result.rows[0].status !== 'on_notice')) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid or inactive user'
        }
      });
    }

    const user = result.rows[0];
    req.user = {
      id: user.id,
      empId: user.emp_id,
      email: user.email,
      role: user.role,
      name: `${user.first_name} ${user.last_name || ''}`.trim()
    };

    next();
  } catch (error) {
    return res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: 'Invalid or expired token'
      }
    });
  }
};

