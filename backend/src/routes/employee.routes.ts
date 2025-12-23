import { Router } from 'express';
import * as employeeController from '../controllers/employee.controller';
import { authenticateToken } from '../middleware/auth.middleware';
import { authorizeRole } from '../middleware/authorize.middleware';

const router = Router();

// All routes require authentication and HR/Super Admin role
router.use(authenticateToken);
router.use(authorizeRole('hr', 'super_admin'));

router.get('/', employeeController.getEmployees);
router.get('/:id', employeeController.getEmployeeById);
router.post('/', employeeController.createEmployee);
router.put('/:id', employeeController.updateEmployee);
// Only super_admin can delete employees
router.delete('/:id', authorizeRole('super_admin'), employeeController.deleteEmployee);

export default router;

