import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import { validateRequest } from '../middleware/validate.middleware';
import { loginSchema, refreshTokenSchema } from '../validations/auth.schema';
import rateLimit from 'express-rate-limit';

const router = Router();

// Rate limiting disabled to avoid 429s in current environment
router.post('/login', validateRequest(loginSchema), authController.login);
router.post('/refresh', validateRequest(refreshTokenSchema), authController.refresh);
router.post('/logout', authController.logout);

export default router;

