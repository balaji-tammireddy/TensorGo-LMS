import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import * as timesheetController from '../controllers/timesheet.controller';

const router = Router();

router.post('/entry', authenticateToken, timesheetController.saveEntry);
router.delete('/entry/:id', authenticateToken, timesheetController.deleteEntry);
router.get('/weekly', authenticateToken, timesheetController.getWeeklyEntries);

// Approval Module Routes
router.get('/team-status', authenticateToken, timesheetController.getTeamStatus);
router.get('/member/:targetUserId', authenticateToken, timesheetController.getMemberWeeklyEntries);
router.post('/approve', authenticateToken, timesheetController.approveTimesheet);
router.post('/reject', authenticateToken, timesheetController.rejectEntry);
router.post('/reject-bulk', authenticateToken, timesheetController.rejectTimesheet);
router.get('/report', authenticateToken, timesheetController.generateReport);

export default router;
