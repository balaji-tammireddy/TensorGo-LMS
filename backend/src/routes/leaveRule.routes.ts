import { Router } from 'express';
import * as leaveRuleController from '../controllers/leaveRule.controller';
import { authenticateToken } from '../middleware/auth.middleware';
import { authorizeRole } from '../middleware/authorize.middleware';

const router = Router();

// All leave rule routes require Super Admin access
router.use(authenticateToken);
router.use(authorizeRole('super_admin'));

// Leave Types
router.get('/types', leaveRuleController.getLeaveTypes);
router.post('/types', leaveRuleController.createLeaveType);
router.put('/types/:id', leaveRuleController.updateLeaveType);
router.delete('/types/:id', leaveRuleController.deleteLeaveType);

// Policies
router.get('/policies', leaveRuleController.getPolicies);
router.put('/policies/:id', leaveRuleController.updatePolicy);

export default router;
