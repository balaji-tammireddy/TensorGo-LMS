import { Router } from 'express';
import * as employeeController from '../controllers/employee.controller';
import { authenticateToken } from '../middleware/auth.middleware';
import { authorizeRole } from '../middleware/authorize.middleware';

const router = Router();

// All routes require authentication and HR/Super Admin role
router.use(authenticateToken);
router.use(authorizeRole('hr', 'super_admin'));

router.get('/', employeeController.getEmployees);
router.get('/next-id', employeeController.getNextEmployeeId);
router.get('/:id', employeeController.getEmployeeById);
router.post('/', employeeController.createEmployee);
router.put('/:id', employeeController.updateEmployee);
// Only super_admin can delete employees
router.delete('/:id', authorizeRole('super_admin'), employeeController.deleteEmployee);
// HR and Super Admin can add leaves to employees
router.post('/:id/leaves', employeeController.addLeavesToEmployee);
// HR and Super Admin can view employee leave balances
router.get('/:id/leave-balances', employeeController.getEmployeeLeaveBalances);
// HR and Super Admin can send carryforward emails to all employees
router.post('/send-carryforward-emails', employeeController.sendCarryForwardEmails);

export default router;

