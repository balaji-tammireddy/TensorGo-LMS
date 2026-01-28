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
router.post('/approve-entry', authenticateToken, timesheetController.approveEntry);
router.post('/submit-manual', authenticateToken, timesheetController.manualSubmit);
router.post('/reject-entry', authenticateToken, timesheetController.rejectEntry);
router.post('/reject', authenticateToken, timesheetController.rejectTimesheet);
router.get('/report', authenticateToken, timesheetController.generateReport);
router.get('/report/pdf', authenticateToken, timesheetController.generatePDFReport);

export default router;
