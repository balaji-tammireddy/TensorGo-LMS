import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import * as timesheetController from '../controllers/timesheet.controller';

const router = Router();

router.post('/entry', authenticateToken, timesheetController.saveEntry);
router.delete('/entry/:id', authenticateToken, timesheetController.deleteEntry);
router.get('/weekly', authenticateToken, timesheetController.getWeeklyEntries);

export default router;
