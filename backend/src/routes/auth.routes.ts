import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import { validateRequest } from '../middleware/validate.middleware';
import { loginSchema, refreshTokenSchema } from '../validations/auth.schema';
import rateLimit from 'express-rate-limit';

const router = Router();

// Stricter rate limiting for auth endpoints
const parseEnvInt = (name: string, fallback: number) => {
  const val = parseInt(process.env[name] || '', 10);
  return Number.isFinite(val) && val > 0 ? val : fallback;
};

const authLimiter = rateLimit({
  windowMs: parseEnvInt('AUTH_RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000), // default 15 minutes
  max: parseEnvInt('AUTH_RATE_LIMIT_MAX', 10000), // very high by default to avoid 429s in dev
  message: {
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many login attempts. Please try again later.'
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/login', authLimiter, validateRequest(loginSchema), authController.login);
router.post('/refresh', validateRequest(refreshTokenSchema), authController.refresh);
router.post('/logout', authController.logout);

export default router;

