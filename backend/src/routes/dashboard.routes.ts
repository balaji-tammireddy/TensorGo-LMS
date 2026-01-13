import express from 'express';
import * as dashboardController from '../controllers/dashboard.controller';
import { authenticateToken, authorizeRole } from '../middleware/auth.middleware';

const router = express.Router();

// All dashboard routes require authentication and Super Admin role
router.get('/stats', authenticateToken, authorizeRole('super_admin'), dashboardController.getStats);
router.get('/hierarchy', authenticateToken, authorizeRole('super_admin'), dashboardController.getHierarchy);
router.get('/user-details/:id', authenticateToken, authorizeRole('super_admin'), dashboardController.getUserDashboardDetails);

export default router;
