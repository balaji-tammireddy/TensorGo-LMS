import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../database/db';
import { logger } from '../utils/logger';

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
      logger.warn('[AUTH] No token provided');
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Access token required'
        }
      });
    }

    // verification
    let decoded: any;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET!);
    } catch (jwtError: any) {
      logger.error(`[AUTH] JWT Verify Error: ${jwtError.message}`);
      throw jwtError;
    }
    logger.info(`[AUTH] Step 2: Token decoded. Keys: ${Object.keys(decoded).join(', ')}`);
    const userId = decoded.userId || decoded.id;
    logger.info(`[AUTH] Using userId: ${userId}`);

    if (!userId) {
      throw new Error('Token payload missing userId or id');
    }

    // Verify user still exists and is active
    let result;
    try {
      logger.info(`[AUTH] Step 3: Querying DB for userId: ${userId}`);
      result = await pool.query(
        'SELECT id, emp_id, email, role, first_name, last_name, status FROM users WHERE id = $1',
        [userId]
      );
      logger.info(`[AUTH] Step 4: DB Query success, rows: ${result.rows.length}`);
    } catch (dbError: any) {
      logger.error(`[AUTH] DB Error during user lookup: ${dbError.message}`);
      throw dbError;
    }

    if (result.rows.length === 0) {
      logger.warn(`[AUTH] User not found for ID: ${decoded.userId}`);
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid or inactive user'
        }
      });
    }

    if (result.rows[0].status !== 'active' && result.rows[0].status !== 'on_notice') {
      logger.warn(`[AUTH] User status invalid: ${result.rows[0].status} for ID: ${decoded.userId}`);
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
    logger.info(`[AUTH] Step 5: User attached to req, calling next()`);

    next();
  } catch (error: any) {
    logger.error(`[AUTH] Auth error: ${error.message}`, error);
    return res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: 'Invalid or expired token (DEBUG)'
      }
    });
  }
};
