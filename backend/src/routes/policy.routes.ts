import { Router } from 'express';
import { getPolicies, createPolicy, updatePolicy, deletePolicy } from '../controllers/policy.controller';
import { authenticateToken, authorizeRole } from '../middleware/auth.middleware';

const router = Router();

// Get all policies (authenticated users only)
router.get('/', authenticateToken, getPolicies);

// Create policy (Super Admin & HR only)
router.post('/', authenticateToken, authorizeRole(['super_admin', 'hr']), createPolicy);

// Update policy (Super Admin & HR only)
router.put('/:id', authenticateToken, authorizeRole(['super_admin', 'hr']), updatePolicy);

// Delete policy (Super Admin & HR only)
router.delete('/:id', authenticateToken, authorizeRole(['super_admin', 'hr']), deletePolicy);

export default router;
