import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import * as authService from '../services/auth.service';
import { verifyToken, generateAccessToken } from '../utils/jwt';
import { logger } from '../utils/logger';

export const login = async (req: AuthRequest, res: Response) => {
  logger.info(`[CONTROLLER] [AUTH] [LOGIN] ========== REQUEST RECEIVED ==========`);
  logger.info(`[CONTROLLER] [AUTH] [LOGIN] Email: ${req.body.email}`);

  try {
    const { email, password } = req.body;
    const result = await authService.login(email, password);

    // Set refresh token in httpOnly cookie
    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/'
    });

    logger.info(`[CONTROLLER] [AUTH] [LOGIN] Login successful - User ID: ${result.user.id}, Role: ${result.user.role}`);
    res.json({
      accessToken: result.accessToken,
      user: result.user
    });
  } catch (error: any) {
    logger.error(`[CONTROLLER] [AUTH] [LOGIN] Login failed:`, error);
    res.status(401).json({
      error: {
        code: 'AUTH_FAILED',
        message: error.message || 'Invalid credentials'
      }
    });
  }
};

export const refresh = async (req: AuthRequest, res: Response) => {
  logger.info(`[CONTROLLER] [AUTH] [REFRESH] ========== REQUEST RECEIVED ==========`);

  try {
    const refreshToken = req.cookies.refreshToken || req.body.refreshToken;

    if (!refreshToken) {
      logger.warn(`[CONTROLLER] [AUTH] [REFRESH] No refresh token provided`);
      return res.status(401).json({
        error: {
          code: 'TokenMissingError',
          message: 'Refresh token is required'
        }
      });
    }

    const decoded = verifyToken(refreshToken);

    // Check if user exists and is active
    const user = await authService.validateUser(decoded.userId);
    if (!user) {
      logger.warn(`[CONTROLLER] [AUTH] [REFRESH] User not found or inactive: ${decoded.userId}`);
      return res.status(401).json({
        error: {
          code: 'InvalidUserError',
          message: 'User not found or inactive'
        }
      });
    }

    // Verify Token Version (Session Invalidation)
    const tokenVersion = decoded.tokenVersion;
    const dbTokenVersion = user.tokenVersion;

    if (tokenVersion !== undefined && tokenVersion !== dbTokenVersion) {
      logger.warn(`[CONTROLLER] [AUTH] [REFRESH] Token version mismatch. Token: ${tokenVersion}, DB: ${dbTokenVersion}`);
      return res.status(403).json({
        error: {
          code: 'INVALID_TOKEN',
          message: 'Session expired (password changed)'
        }
      });
    }

    // Strict check for old tokens (optional but recommended)
    if (tokenVersion === undefined && dbTokenVersion > 0) {
      logger.warn(`[CONTROLLER] [AUTH] [REFRESH] Old token rejected (missing version)`);
      return res.status(403).json({
        error: {
          code: 'INVALID_TOKEN',
          message: 'Session expired - Please login again'
        }
      });
    }

    const newAccessToken = generateAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion
    });

    logger.info(`[CONTROLLER] [AUTH] [REFRESH] Token refreshed successfully - User ID: ${user.id}`);

    // Return both token and user data to satisfy frontend requirements
    res.json({
      accessToken: newAccessToken,
      user
    });
  } catch (error: any) {
    logger.error(`[CONTROLLER] [AUTH] [REFRESH] Token refresh failed:`, error);
    res.status(403).json({
      error: {
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired refresh token'
      }
    });
  }
};

export const logout = async (req: AuthRequest, res: Response) => {
  logger.info(`[CONTROLLER] [AUTH] [LOGOUT] ========== REQUEST RECEIVED ==========`);
  const userId = req.user?.id;
  logger.info(`[CONTROLLER] [AUTH] [LOGOUT] User ID: ${userId || 'unknown'}`);

  if (userId) {
    try {
      await authService.invalidateSession(userId);
    } catch (error) {
      logger.warn(`[CONTROLLER] [AUTH] [LOGOUT] Failed to invalidate session:`, error);
    }
  }

  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/'
  });
  logger.info(`[CONTROLLER] [AUTH] [LOGOUT] Logout successful`);
  res.json({ message: 'Logged out successfully' });
};

export const changePassword = async (req: AuthRequest, res: Response) => {
  logger.info(`[CONTROLLER] [AUTH] [CHANGE PASSWORD] ========== REQUEST RECEIVED ==========`);
  logger.info(`[CONTROLLER] [AUTH] [CHANGE PASSWORD] User ID: ${req.user?.id || 'unknown'}`);

  try {
    if (!req.user) {
      logger.warn(`[CONTROLLER] [AUTH] [CHANGE PASSWORD] User not authenticated`);
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'User not authenticated'
        }
      });
    }

    const { oldPassword, newPassword } = req.body;
    await authService.changePassword(req.user.id, oldPassword, newPassword);

    logger.info(`[CONTROLLER] [AUTH] [CHANGE PASSWORD] Password changed successfully - User ID: ${req.user.id}`);
    res.json({ message: 'Password updated successfully' });
  } catch (error: any) {
    logger.error(`[CONTROLLER] [AUTH] [CHANGE PASSWORD] Password change failed:`, error);
    res.status(400).json({
      error: {
        code: 'CHANGE_PASSWORD_FAILED',
        message: error.message || 'Failed to change password'
      }
    });
  }
};

export const forgotPassword = async (req: AuthRequest, res: Response) => {
  logger.info(`[CONTROLLER] [AUTH] [FORGOT PASSWORD] ========== REQUEST RECEIVED ==========`);
  logger.info(`[CONTROLLER] [AUTH] [FORGOT PASSWORD] Email: ${req.body.email}`);

  try {
    const { email } = req.body;
    await authService.requestPasswordReset(email);

    logger.info(`[CONTROLLER] [AUTH] [FORGOT PASSWORD] Password reset request processed`);
    res.json({
      message: 'OTP has been sent to your registered email address.'
    });
  } catch (error: any) {
    logger.error(`[CONTROLLER] [AUTH] [FORGOT PASSWORD] Password reset request failed:`, error);
    res.status(400).json({
      error: {
        code: 'FORGOT_PASSWORD_FAILED',
        message: error.message || 'Failed to send password reset OTP'
      }
    });
  }
};

export const verifyOTP = async (req: AuthRequest, res: Response) => {
  logger.info(`[CONTROLLER] [AUTH] [VERIFY OTP] ========== REQUEST RECEIVED ==========`);
  logger.info(`[CONTROLLER] [AUTH] [VERIFY OTP] Email: ${req.body.email}`);

  try {
    const { email, otp } = req.body;
    const isValid = await authService.verifyPasswordResetOTP(email, otp);

    if (!isValid) {
      logger.warn(`[CONTROLLER] [AUTH] [VERIFY OTP] Invalid or expired OTP for email: ${email}`);
      return res.status(400).json({
        error: {
          code: 'INVALID_OTP',
          message: 'Invalid or expired OTP'
        }
      });
    }

    logger.info(`[CONTROLLER] [AUTH] [VERIFY OTP] OTP verified successfully`);
    res.json({ message: 'OTP verified successfully' });
  } catch (error: any) {
    logger.error(`[CONTROLLER] [AUTH] [VERIFY OTP] OTP verification failed:`, error);
    res.status(400).json({
      error: {
        code: 'VERIFY_OTP_FAILED',
        message: error.message || 'Failed to verify OTP'
      }
    });
  }
};

export const resetPassword = async (req: AuthRequest, res: Response) => {
  logger.info(`[CONTROLLER] [AUTH] [RESET PASSWORD] ========== REQUEST RECEIVED ==========`);
  logger.info(`[CONTROLLER] [AUTH] [RESET PASSWORD] Email: ${req.body.email}`);

  try {
    const { email, otp, newPassword } = req.body;
    await authService.resetPasswordWithOTP(email, otp, newPassword);

    logger.info(`[CONTROLLER] [AUTH] [RESET PASSWORD] Password reset successfully`);
    res.json({ message: 'Password reset successfully' });
  } catch (error: any) {
    logger.error(`[CONTROLLER] [AUTH] [RESET PASSWORD] Password reset failed:`, error);
    res.status(400).json({
      error: {
        code: 'RESET_PASSWORD_FAILED',
        message: error.message || 'Failed to reset password'
      }
    });
  }
};

