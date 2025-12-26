import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';

export const authorizeRole = (...allowedRoles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    console.log(`[AUTHORIZE] Checking authorization - User: ${req.user?.id}, Role: ${req.user?.role}, Allowed: ${allowedRoles.join(', ')}`);
    if (!req.user) {
      console.log(`[AUTHORIZE] ❌ No user found - returning 401`);
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required'
        }
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      console.log(`[AUTHORIZE] ❌ Role ${req.user.role} not in allowed roles - returning 403`);
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Insufficient permissions'
        }
      });
    }

    console.log(`[AUTHORIZE] ✅ Authorization passed`);
    next();
  };
};

