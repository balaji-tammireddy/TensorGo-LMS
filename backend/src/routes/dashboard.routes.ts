import express from 'express';
import * as dashboardController from '../controllers/dashboard.controller';
import { authenticateToken, authorizeRole } from '../middleware/auth.middleware';

const router = express.Router();

// All dashboard routes require authentication and Super Admin/HR role
router.get('/stats', authenticateToken, authorizeRole(['super_admin', 'hr']), dashboardController.getStats);
router.get('/analytics', authenticateToken, authorizeRole(['super_admin', 'hr']), dashboardController.getAnalytics);
router.get('/hierarchy', authenticateToken, authorizeRole(['super_admin', 'hr']), dashboardController.getHierarchy);
router.get('/user-details/:id', authenticateToken, authorizeRole(['super_admin', 'hr']), dashboardController.getUserDashboardDetails);

export default router;
