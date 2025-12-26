import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import * as authService from '../services/auth.service';
import { verifyToken, generateAccessToken } from '../utils/jwt';

export const login = async (req: AuthRequest, res: Response) => {
  try {
    const { email, password } = req.body;
    const result = await authService.login(email, password);
    
    // Set refresh token in httpOnly cookie
    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.json({
      accessToken: result.accessToken,
      user: result.user
    });
  } catch (error: any) {
    res.status(401).json({
      error: {
        code: 'AUTH_FAILED',
        message: error.message || 'Invalid credentials'
      }
    });
  }
};

export const refresh = async (req: AuthRequest, res: Response) => {
  try {
    const { refreshToken } = req.body;
    const decoded = verifyToken(refreshToken);
    
    const newAccessToken = generateAccessToken({
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role
    });

    res.json({ accessToken: newAccessToken });
  } catch (error: any) {
    res.status(403).json({
      error: {
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired refresh token'
      }
    });
  }
};

export const logout = async (req: AuthRequest, res: Response) => {
  res.clearCookie('refreshToken');
  res.json({ message: 'Logged out successfully' });
};

export const changePassword = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'User not authenticated'
        }
      });
    }

    const { oldPassword, newPassword } = req.body;
    await authService.changePassword(req.user.id, oldPassword, newPassword);

    res.json({ message: 'Password updated successfully' });
  } catch (error: any) {
    res.status(400).json({
      error: {
        code: 'CHANGE_PASSWORD_FAILED',
        message: error.message || 'Failed to change password'
      }
    });
  }
};

export const forgotPassword = async (req: AuthRequest, res: Response) => {
  try {
    const { email } = req.body;
    await authService.requestPasswordReset(email);

    // Always return success to prevent email enumeration
    res.json({ 
      message: 'If the email exists, an OTP has been sent to your registered email address.' 
    });
  } catch (error: any) {
    res.status(500).json({
      error: {
        code: 'FORGOT_PASSWORD_FAILED',
        message: error.message || 'Failed to send password reset OTP'
      }
    });
  }
};

export const verifyOTP = async (req: AuthRequest, res: Response) => {
  try {
    const { email, otp } = req.body;
    const isValid = await authService.verifyPasswordResetOTP(email, otp);

    if (!isValid) {
      return res.status(400).json({
        error: {
          code: 'INVALID_OTP',
          message: 'Invalid or expired OTP'
        }
      });
    }

    res.json({ message: 'OTP verified successfully' });
  } catch (error: any) {
    res.status(400).json({
      error: {
        code: 'VERIFY_OTP_FAILED',
        message: error.message || 'Failed to verify OTP'
      }
    });
  }
};

export const resetPassword = async (req: AuthRequest, res: Response) => {
  try {
    const { email, otp, newPassword } = req.body;
    await authService.resetPasswordWithOTP(email, otp, newPassword);

    res.json({ message: 'Password reset successfully' });
  } catch (error: any) {
    res.status(400).json({
      error: {
        code: 'RESET_PASSWORD_FAILED',
        message: error.message || 'Failed to reset password'
      }
    });
  }
};

