import { Router } from 'express';
import * as leaveController from '../controllers/leave.controller';
import { authenticateToken } from '../middleware/auth.middleware';
import { authorizeRole } from '../middleware/authorize.middleware';
import { validateRequest } from '../middleware/validate.middleware';
import { applyLeaveSchema, approveLeaveSchema, rejectLeaveSchema, updateLeaveSchema, deleteLeaveSchema, approveLeaveDaySchema, rejectLeaveDaySchema } from '../validations/leave.schema';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// Public leave routes (for all authenticated users)
router.get('/balances', leaveController.getBalances);
router.get('/holidays', leaveController.getHolidays);
// IMPORTANT: Leave Rules is READ-ONLY. No POST/PUT/DELETE routes should ever be added for /rules
router.get('/rules', leaveController.getRules);
router.post('/apply', validateRequest(applyLeaveSchema), leaveController.applyLeave);
router.get('/my-requests', leaveController.getMyRequests);
router.get('/request/:id', leaveController.getLeaveRequest);
router.put('/request/:id', validateRequest(updateLeaveSchema), leaveController.updateLeaveRequest);
router.delete('/request/:id', validateRequest(deleteLeaveSchema), leaveController.deleteLeaveRequest);
// HR and Super Admin can convert leave request from LOP to Casual
router.post('/request/:id/convert-lop-to-casual', authorizeRole('hr', 'super_admin'), leaveController.convertLeaveRequestLopToCasual);

// Approval routes (Manager, HR, Super Admin)
router.get('/pending', authorizeRole('manager', 'hr', 'super_admin'), leaveController.getPendingRequests);
router.post('/:id/approve', authorizeRole('manager', 'hr', 'super_admin'), validateRequest(approveLeaveSchema), (req, res, next) => {
  console.log(`[ROUTE] POST /leave/${req.params.id}/approve - User: ${(req as any).user?.id}, Role: ${(req as any).user?.role}`);
  console.log(`[ROUTE] Request body:`, req.body);
  console.log(`[ROUTE] Request params:`, req.params);
  next();
}, leaveController.approveLeave);
router.post('/:id/reject', authorizeRole('manager', 'hr', 'super_admin'), validateRequest(rejectLeaveSchema), (req, res, next) => {
  console.log(`[ROUTE] POST /leave/${req.params.id}/reject - User: ${(req as any).user?.id}, Role: ${(req as any).user?.role}`);
  console.log(`[ROUTE] Request body:`, req.body);
  console.log(`[ROUTE] Request params:`, req.params);
  next();
}, leaveController.rejectLeave);
router.post('/:id/day/:dayId/approve', authorizeRole('manager', 'hr', 'super_admin'), validateRequest(approveLeaveDaySchema), (req, res, next) => {
  console.log(`[ROUTE] POST /leave/${req.params.id}/day/${req.params.dayId}/approve - User: ${(req as any).user?.id}, Role: ${(req as any).user?.role}`);
  console.log(`[ROUTE] Request body:`, req.body);
  console.log(`[ROUTE] Request params:`, req.params);
  next();
}, leaveController.approveLeaveDay);
router.post('/:id/days/approve', authorizeRole('manager', 'hr', 'super_admin'), (req, res, next) => {
  console.log(`[ROUTE] POST /leave/${req.params.id}/days/approve - User: ${(req as any).user?.id}, Role: ${(req as any).user?.role}`);
  console.log(`[ROUTE] Request body:`, req.body);
  console.log(`[ROUTE] Request params:`, req.params);
  next();
}, leaveController.approveLeaveDays);
router.post('/:id/day/:dayId/reject', authorizeRole('manager', 'hr', 'super_admin'), validateRequest(rejectLeaveDaySchema), (req, res, next) => {
  console.log(`[ROUTE] POST /leave/${req.params.id}/day/${req.params.dayId}/reject - User: ${(req as any).user?.id}, Role: ${(req as any).user?.role}`);
  console.log(`[ROUTE] Request body:`, req.body);
  console.log(`[ROUTE] Request params:`, req.params);
  next();
}, leaveController.rejectLeaveDay);
router.post('/:id/update-status', authorizeRole('hr', 'super_admin'), leaveController.updateLeaveStatus);
router.get('/approved', authorizeRole('manager', 'hr', 'super_admin'), leaveController.getApprovedLeaves);

export default router;

