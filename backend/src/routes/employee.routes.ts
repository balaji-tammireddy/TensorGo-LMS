import { Router } from 'express';
import * as employeeController from '../controllers/employee.controller';
import { authenticateToken } from '../middleware/auth.middleware';
import { authorizeRole } from '../middleware/authorize.middleware';
import { validateRequest } from '../middleware/validate.middleware';
import { createEmployeeSchema, updateEmployeeSchema } from '../validations/employee.schema';

const router = Router();

// All routes require authentication and HR/Super Admin role
router.use(authenticateToken);
// Routes for employee management
router.get('/', authorizeRole('hr', 'super_admin', 'manager'), employeeController.getEmployees);
router.get('/next-id', authorizeRole('hr', 'super_admin'), employeeController.getNextEmployeeId);
router.get('/:id', authorizeRole('hr', 'super_admin', 'manager'), employeeController.getEmployeeById);
router.post('/', authorizeRole('hr', 'super_admin'), validateRequest(createEmployeeSchema), employeeController.createEmployee);
router.put('/:id', authorizeRole('hr', 'super_admin'), validateRequest(updateEmployeeSchema), employeeController.updateEmployee);
// Only super_admin can delete employees
router.delete('/:id', authorizeRole('super_admin'), employeeController.deleteEmployee);
// HR and Super Admin can add leaves to employees
router.post('/:id/leaves', authorizeRole('hr', 'super_admin'), employeeController.addLeavesToEmployee);
// HR and Super Admin can view employee leave balances
router.get('/:id/leave-balances', authorizeRole('hr', 'super_admin'), employeeController.getEmployeeLeaveBalances);
// HR and Super Admin can send carryforward emails to all employees
router.post('/send-carryforward-emails', authorizeRole('hr', 'super_admin'), employeeController.sendCarryForwardEmails);
// HR and Super Admin can convert LOP leaves to casual leaves (only if LOP balance exists)


export default router;

