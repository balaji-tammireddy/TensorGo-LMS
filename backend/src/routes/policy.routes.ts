import { Router } from 'express';
import { getPolicies } from '../controllers/policy.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

// Get all policies (authenticated users only)
router.get('/', authenticateToken, getPolicies);

export default router;
