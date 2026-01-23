import { Router } from 'express';
import { authenticateToken, authorizeRole } from '../middleware/auth.middleware';
import * as projectController from '../controllers/projectController';

const router = Router();

// Projects
router.post(
    '/',
    authenticateToken,
    authorizeRole(['super_admin', 'hr', 'manager']),
    projectController.createProject
);

router.get(
    '/',
    authenticateToken,
    projectController.getProjects
);

router.put(
    '/:id',
    authenticateToken,
    authorizeRole(['super_admin', 'hr', 'manager']),
    projectController.updateProject
);

router.get(
    '/:id/access-list',
    authenticateToken,
    projectController.getAccessList
);

router.delete(
    '/:id',
    authenticateToken,
    authorizeRole(['super_admin']),
    projectController.deleteProject
);

// Modules
router.post(
    '/:projectId/modules',
    authenticateToken,
    authorizeRole(['super_admin', 'hr', 'manager']), // Only PM/Admin can create modules
    projectController.createModule
);

router.get(
    '/:projectId/modules',
    authenticateToken,
    projectController.getModules
);

router.put(
    '/modules/:moduleId',
    authenticateToken,
    authorizeRole(['super_admin', 'hr', 'manager']),
    projectController.updateModule
);

router.delete(
    '/modules/:moduleId',
    authenticateToken,
    authorizeRole(['super_admin', 'hr', 'manager']),
    projectController.deleteModule
);

// Tasks
router.post(
    '/modules/:moduleId/tasks',
    authenticateToken,
    authorizeRole(['super_admin', 'hr', 'manager', 'employee', 'intern']),
    projectController.createTask
);

router.get(
    '/modules/:moduleId/tasks',
    authenticateToken,
    projectController.getTasks
);

router.put(
    '/tasks/:taskId',
    authenticateToken,
    authorizeRole(['super_admin', 'hr', 'manager']),
    projectController.updateTask
);

router.delete(
    '/tasks/:taskId',
    authenticateToken,
    authorizeRole(['super_admin', 'hr', 'manager']),
    projectController.deleteTask
);

// Activities
router.post(
    '/tasks/:taskId/activities',
    authenticateToken,
    authorizeRole(['super_admin', 'hr', 'manager', 'employee', 'intern']),
    projectController.createActivity
);

router.get(
    '/tasks/:taskId/activities',
    authenticateToken,
    projectController.getActivities
);

router.put(
    '/activities/:activityId',
    authenticateToken,
    authorizeRole(['super_admin', 'hr', 'manager']),
    projectController.updateActivity
);

router.delete(
    '/activities/:activityId',
    authenticateToken,
    authorizeRole(['super_admin', 'hr', 'manager']),
    projectController.deleteActivity
);

// Access Control
router.get(
    '/access/:level/:id',
    authenticateToken,
    projectController.getAccessList
);

router.delete(
    '/access',
    authenticateToken,
    authorizeRole(['super_admin', 'hr', 'manager']),
    projectController.removeAccess
);

router.post(
    '/access/toggle',
    authenticateToken,
    authorizeRole(['super_admin', 'hr', 'manager']),
    projectController.toggleAccess
);

export default router;
