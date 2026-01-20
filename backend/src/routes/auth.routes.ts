import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import { validateRequest } from '../middleware/validate.middleware';
import {
  loginSchema,
  refreshTokenSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  verifyOTPSchema,
  resetPasswordSchema
} from '../validations/auth.schema';
import { authenticateToken } from '../middleware/auth.middleware';
import rateLimit from 'express-rate-limit';

const router = Router();

// Rate limiting disabled to avoid 429s in current environment
router.post('/login', validateRequest(loginSchema), authController.login);
router.post('/refresh', validateRequest(refreshTokenSchema), authController.refresh);
router.post('/logout', authenticateToken, authController.logout);
router.post(
  '/change-password',
  authenticateToken,
  validateRequest(changePasswordSchema),
  authController.changePassword
);

// Forgot password routes

router.post(
  '/forgot-password',
  validateRequest(forgotPasswordSchema),
  authController.forgotPassword
);

router.post(
  '/verify-otp',
  validateRequest(verifyOTPSchema),
  authController.verifyOTP
);

router.post(
  '/reset-password',
  validateRequest(resetPasswordSchema),
  authController.resetPassword
);

export default router;

