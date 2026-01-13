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
        'SELECT id, emp_id, email, role, first_name, last_name, status, token_version FROM users WHERE id = $1',
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

    // Token Version Verification (Session Invalidation)
    // If token has version (new tokens) and it doesn't match DB version, or if DB has version and token doesn't
    const tokenVersion = decoded.tokenVersion; // Might be undefined for old tokens
    const dbTokenVersion = user.token_version || 0;

    // We compare strict equality if token has version.
    // If token has NO version (old token) and DB has version > 0, it's invalid?
    // Let's assume strict equality: tokenVersion matches dbTokenVersion.
    // NOTE: Newly created tokens will have tokenVersion matching DB.
    if (tokenVersion !== undefined && tokenVersion !== dbTokenVersion) {
      logger.warn(`[AUTH] Token version mismatch for user ID: ${userId}. Token: ${tokenVersion}, DB: ${dbTokenVersion}`);
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Session expired (password changed or revoked)'
        }
      });
    }

    // Optional: Forcing logout for old tokens without version if we want to be strict immediately
    // For now, if we assume migration set token_version=1, and old tokens are undefined,
    // undefined != 1, so they WILL be logged out. This is good for security.
    if (tokenVersion === undefined && dbTokenVersion > 0) {
      logger.warn(`[AUTH] Old token rejected (missing version) for user ID: ${userId}`);
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Session expired - Please login again'
        }
      });
    }
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

export const authorizeRole = (allowedRoles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      logger.warn('[AUTH] authorizeRole called but user not authenticated');
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'User not authenticated'
        }
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      logger.warn(`[AUTH] Access denied. User role: ${req.user.role}, Allowed: ${allowedRoles.join(', ')}`);
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied'
        }
      });
    }

    next();
  };
};
