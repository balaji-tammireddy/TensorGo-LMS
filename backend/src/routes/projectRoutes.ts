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

// Tasks
router.post(
    '/modules/:moduleId/tasks',
    authenticateToken,
    authorizeRole(['super_admin', 'hr', 'manager']),
    projectController.createTask
);

router.get(
    '/modules/:moduleId/tasks',
    authenticateToken,
    projectController.getTasks
);

// Activities
router.post(
    '/tasks/:taskId/activities',
    authenticateToken,
    authorizeRole(['super_admin', 'hr', 'manager']),
    projectController.createActivity
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

export default router;
