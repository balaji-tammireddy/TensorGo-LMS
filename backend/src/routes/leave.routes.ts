import { Router } from 'express';
import * as leaveController from '../controllers/leave.controller';
import { authenticateToken } from '../middleware/auth.middleware';
import { authorizeRole } from '../middleware/authorize.middleware';
import { validateRequest } from '../middleware/validate.middleware';
import { applyLeaveSchema, approveLeaveSchema, rejectLeaveSchema, updateLeaveSchema, deleteLeaveSchema } from '../validations/leave.schema';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// Public leave routes (for all authenticated users)
router.get('/balances', leaveController.getBalances);
router.get('/holidays', leaveController.getHolidays);
router.get('/rules', leaveController.getRules);
router.post('/apply', validateRequest(applyLeaveSchema), leaveController.applyLeave);
router.get('/my-requests', leaveController.getMyRequests);
router.get('/request/:id', leaveController.getLeaveRequest);
router.put('/request/:id', validateRequest(updateLeaveSchema), leaveController.updateLeaveRequest);
router.delete('/request/:id', validateRequest(deleteLeaveSchema), leaveController.deleteLeaveRequest);

// Approval routes (Manager, HR, Super Admin)
router.get('/pending', authorizeRole('manager', 'hr', 'super_admin'), leaveController.getPendingRequests);
router.post('/:id/approve', authorizeRole('manager', 'hr', 'super_admin'), validateRequest(approveLeaveSchema), leaveController.approveLeave);
router.post('/:id/reject', authorizeRole('manager', 'hr', 'super_admin'), validateRequest(rejectLeaveSchema), leaveController.rejectLeave);
router.get('/approved', authorizeRole('manager', 'hr', 'super_admin'), leaveController.getApprovedLeaves);

export default router;

