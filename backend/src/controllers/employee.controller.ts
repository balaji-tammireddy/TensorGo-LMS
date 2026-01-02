import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import * as employeeService from '../services/employee.service';
import { sendCarryForwardEmailsToAll } from '../services/leaveCredit.service';
import { pool } from '../database/db';
import { logger } from '../utils/logger';

export const getEmployees = async (req: AuthRequest, res: Response) => {
  logger.info(`[CONTROLLER] [EMPLOYEE] [GET EMPLOYEES] ========== REQUEST RECEIVED ==========`);
  logger.info(`[CONTROLLER] [EMPLOYEE] [GET EMPLOYEES] User ID: ${req.user!.id}, Role: ${req.user!.role}, Page: ${req.query.page || 1}, Limit: ${req.query.limit || 20}, Search: ${req.query.search || 'none'}`);

  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = req.query.search as string | undefined;
    const joiningDate = req.query.joiningDate as string | undefined;
    const status = req.query.status as string | undefined;

    const result = await employeeService.getEmployees(page, limit, search, joiningDate, status);
    logger.info(`[CONTROLLER] [EMPLOYEE] [GET EMPLOYEES] Retrieved ${result.employees.length} employees, Total: ${result.pagination.total}`);
    res.json(result);
  } catch (error: any) {
    logger.error(`[CONTROLLER] [EMPLOYEE] [GET EMPLOYEES] Error:`, error);
    res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
};

export const getEmployeeById = async (req: AuthRequest, res: Response) => {
  logger.info(`[CONTROLLER] [EMPLOYEE] [GET EMPLOYEE BY ID] ========== REQUEST RECEIVED ==========`);
  logger.info(`[CONTROLLER] [EMPLOYEE] [GET EMPLOYEE BY ID] Employee ID: ${req.params.id}, User ID: ${req.user!.id}, Role: ${req.user!.role}`);

  try {
    const employeeId = parseInt(req.params.id);
    const employee = await employeeService.getEmployeeById(employeeId);
    logger.info(`[CONTROLLER] [EMPLOYEE] [GET EMPLOYEE BY ID] Employee retrieved successfully - Employee ID: ${employeeId}`);
    res.json({ employee });
  } catch (error: any) {
    logger.error(`[CONTROLLER] [EMPLOYEE] [GET EMPLOYEE BY ID] Error:`, error);
    res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: error.message
      }
    });
  }
};

export const getNextEmployeeId = async (req: AuthRequest, res: Response) => {
  logger.info(`[CONTROLLER] [EMPLOYEE] [GET NEXT EMPLOYEE ID] ========== REQUEST RECEIVED ==========`);
  logger.info(`[CONTROLLER] [EMPLOYEE] [GET NEXT EMPLOYEE ID] User ID: ${req.user!.id}, Role: ${req.user!.role}`);

  try {
    const nextId = await employeeService.getNextEmployeeId();
    logger.info(`[CONTROLLER] [EMPLOYEE] [GET NEXT EMPLOYEE ID] Next employee ID: ${nextId}`);
    res.json({ nextEmployeeId: nextId });
  } catch (error: any) {
    logger.error(`[CONTROLLER] [EMPLOYEE] [GET NEXT EMPLOYEE ID] Error:`, error);
    res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
};

export const createEmployee = async (req: AuthRequest, res: Response) => {
  logger.info(`[CONTROLLER] [EMPLOYEE] [CREATE EMPLOYEE] ========== REQUEST RECEIVED ==========`);
  logger.info(`[CONTROLLER] [EMPLOYEE] [CREATE EMPLOYEE] User ID: ${req.user!.id}, Role: ${req.user!.role}, Employee ID: ${req.body.empId}, Email: ${req.body.email}`);

  try {
    const result = await employeeService.createEmployee(req.body);
    logger.info(`[CONTROLLER] [EMPLOYEE] [CREATE EMPLOYEE] Employee created successfully - Employee ID: ${result.employeeId}`);
    res.status(201).json(result);
  } catch (error: any) {
    logger.error(`[CONTROLLER] [EMPLOYEE] [CREATE EMPLOYEE] Error:`, error);
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: error.message
      }
    });
  }
};

export const updateEmployee = async (req: AuthRequest, res: Response) => {
  logger.info(`[CONTROLLER] [EMPLOYEE] [UPDATE EMPLOYEE] ========== REQUEST RECEIVED ==========`);
  logger.info(`[CONTROLLER] [EMPLOYEE] [UPDATE EMPLOYEE] Employee ID: ${req.params.id}, User ID: ${req.user!.id}, Role: ${req.user!.role}, Fields: ${Object.keys(req.body).join(', ')}`);

  try {
    const employeeId = parseInt(req.params.id);
    const result = await employeeService.updateEmployee(
      employeeId,
      req.body,
      req.user?.role,
      req.user?.id
    );
    logger.info(`[CONTROLLER] [EMPLOYEE] [UPDATE EMPLOYEE] Employee updated successfully - Employee ID: ${employeeId}`);
    res.json(result);
  } catch (error: any) {
    logger.error(`[CONTROLLER] [EMPLOYEE] [UPDATE EMPLOYEE] Error:`, error);
    res.status(400).json({
      error: {
        code: 'UPDATE_ERROR',
        message: error.message
      }
    });
  }
};

export const deleteEmployee = async (req: AuthRequest, res: Response) => {
  logger.info(`[CONTROLLER] [EMPLOYEE] [DELETE EMPLOYEE] ========== REQUEST RECEIVED ==========`);
  logger.info(`[CONTROLLER] [EMPLOYEE] [DELETE EMPLOYEE] Employee ID: ${req.params.id}, User ID: ${req.user?.id || 'unknown'}, Role: ${req.user?.role || 'unknown'}`);

  try {
    // Ensure only super_admin can delete
    if (req.user?.role !== 'super_admin') {
      logger.warn(`[CONTROLLER] [EMPLOYEE] [DELETE EMPLOYEE] Unauthorized attempt - User ID: ${req.user?.id}, Role: ${req.user?.role}`);
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Only super admin can delete employees'
        }
      });
    }
    const employeeId = parseInt(req.params.id);

    // Prevent super admin from deleting themselves
    if (req.user?.id === employeeId) {
      logger.warn(`[CONTROLLER] [EMPLOYEE] [DELETE EMPLOYEE] Super Admin attempted to delete themselves - User ID: ${req.user.id}`);
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Super Admin cannot delete themselves'
        }
      });
    }

    const result = await employeeService.deleteEmployee(employeeId);
    logger.info(`[CONTROLLER] [EMPLOYEE] [DELETE EMPLOYEE] Employee deleted successfully - Employee ID: ${employeeId}`);
    res.json(result);
  } catch (error: any) {
    logger.error(`[CONTROLLER] [EMPLOYEE] [DELETE EMPLOYEE] Error:`, error);
    res.status(400).json({
      error: {
        code: 'DELETE_ERROR',
        message: error.message
      }
    });
  }
};

export const addLeavesToEmployee = async (req: AuthRequest, res: Response) => {
  logger.info(`[CONTROLLER] [EMPLOYEE] [ADD LEAVES] ========== REQUEST RECEIVED ==========`);
  logger.info(`[CONTROLLER] [EMPLOYEE] [ADD LEAVES] Employee ID: ${req.params.id}, User ID: ${req.user?.id || 'unknown'}, Role: ${req.user?.role || 'unknown'}, Leave Type: ${req.body.leaveType}, Count: ${req.body.count}`);

  try {
    // Ensure only HR and super_admin can add leaves
    if (req.user?.role !== 'hr' && req.user?.role !== 'super_admin') {
      logger.warn(`[CONTROLLER] [EMPLOYEE] [ADD LEAVES] Unauthorized attempt - User ID: ${req.user?.id}, Role: ${req.user?.role}`);
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Only HR and Super Admin can add leaves to employees'
        }
      });
    }

    const employeeId = parseInt(req.params.id);
    const { leaveType, count, comment } = req.body;

    // Prevent Super Admin from adding leaves to themselves
    if (req.user?.role === 'super_admin' && req.user?.id === employeeId) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Super Admin cannot add leaves to themselves'
        }
      });
    }

    // HR cannot add leaves to themselves or super_admin users
    if (req.user?.role === 'hr') {
      // Check if employee exists and get their role
      const employeeCheckResult = await pool.query('SELECT id, role FROM users WHERE id = $1', [employeeId]);
      if (employeeCheckResult.rows.length === 0) {
        return res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: 'Employee not found'
          }
        });
      }

      const employeeRole = employeeCheckResult.rows[0].role;
      if (employeeRole === 'super_admin') {
        return res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: 'HR cannot add leaves to Super Admin users'
          }
        });
      }

      if (employeeId === req.user.id) {
        return res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: 'HR cannot add leaves to themselves'
          }
        });
      }
    }

    if (!leaveType || !count) {
      return res.status(400).json({
        error: {
          code: 'BAD_REQUEST',
          message: 'Leave type and count are required'
        }
      });
    }

    if (!['casual', 'sick', 'lop'].includes(leaveType)) {
      return res.status(400).json({
        error: {
          code: 'BAD_REQUEST',
          message: 'Invalid leave type. Must be casual, sick, or lop'
        }
      });
    }

    // HR cannot add LOP leaves, only Super Admin can add LOP leaves
    if (req.user?.role === 'hr' && leaveType === 'lop') {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'HR cannot add LOP leaves. Only Super Admin can add LOP leaves'
        }
      });
    }

    const result = await employeeService.addLeavesToEmployee(
      employeeId,
      leaveType,
      parseFloat(count),
      req.user!.id,
      comment
    );
    logger.info(`[CONTROLLER] [EMPLOYEE] [ADD LEAVES] Leaves added successfully - Employee ID: ${employeeId}, Leave Type: ${leaveType}, Count: ${count}`);
    res.json(result);
  } catch (error: any) {
    logger.error(`[CONTROLLER] [EMPLOYEE] [ADD LEAVES] Error:`, error);
    res.status(400).json({
      error: {
        code: 'BAD_REQUEST',
        message: error.message
      }
    });
  }
};

export const getEmployeeLeaveBalances = async (req: AuthRequest, res: Response) => {
  logger.info(`[CONTROLLER] [EMPLOYEE] [GET LEAVE BALANCES] ========== REQUEST RECEIVED ==========`);
  logger.info(`[CONTROLLER] [EMPLOYEE] [GET LEAVE BALANCES] Employee ID: ${req.params.id}, User ID: ${req.user?.id || 'unknown'}, Role: ${req.user?.role || 'unknown'}`);

  try {
    // Ensure only HR and super_admin can view employee leave balances
    if (req.user?.role !== 'hr' && req.user?.role !== 'super_admin') {
      logger.warn(`[CONTROLLER] [EMPLOYEE] [GET LEAVE BALANCES] Unauthorized attempt - User ID: ${req.user?.id}, Role: ${req.user?.role}`);
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Only HR and Super Admin can view employee leave balances'
        }
      });
    }

    const employeeId = parseInt(req.params.id);
    const balances = await employeeService.getEmployeeLeaveBalances(employeeId);
    logger.info(`[CONTROLLER] [EMPLOYEE] [GET LEAVE BALANCES] Balances retrieved - Employee ID: ${employeeId}, Casual: ${balances.casual}, Sick: ${balances.sick}, LOP: ${balances.lop}`);
    res.json(balances);
  } catch (error: any) {
    logger.error(`[CONTROLLER] [EMPLOYEE] [GET LEAVE BALANCES] Error:`, error);
    res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
};

/**
 * Send carryforward email notifications to all employees
 * Only HR and Super Admin can trigger this
 */
export const sendCarryForwardEmails = async (req: AuthRequest, res: Response) => {
  logger.info(`[CONTROLLER] [EMPLOYEE] [SEND CARRY FORWARD EMAILS] ========== REQUEST RECEIVED ==========`);
  logger.info(`[CONTROLLER] [EMPLOYEE] [SEND CARRY FORWARD EMAILS] User ID: ${req.user?.id || 'unknown'}, Role: ${req.user?.role || 'unknown'}, Previous Year: ${req.query.previousYear || 'auto'}, New Year: ${req.query.newYear || 'auto'}`);

  try {
    // Ensure only HR and super_admin can send carryforward emails
    if (req.user?.role !== 'hr' && req.user?.role !== 'super_admin') {
      logger.warn(`[CONTROLLER] [EMPLOYEE] [SEND CARRY FORWARD EMAILS] Unauthorized attempt - User ID: ${req.user?.id}, Role: ${req.user?.role}`);
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Only HR and Super Admin can send carryforward emails'
        }
      });
    }

    // Optional: Allow specifying previous year and new year in query params
    const previousYear = req.query.previousYear ? parseInt(req.query.previousYear as string) : undefined;
    const newYear = req.query.newYear ? parseInt(req.query.newYear as string) : undefined;

    const result = await sendCarryForwardEmailsToAll(previousYear, newYear);

    logger.info(`[CONTROLLER] [EMPLOYEE] [SEND CARRY FORWARD EMAILS] Emails sent successfully - Sent: ${result.sent}, Errors: ${result.errors}`);
    res.json({
      success: true,
      message: `Carryforward emails sent successfully`,
      sent: result.sent,
      errors: result.errors
    });
  } catch (error: any) {
    logger.error(`[CONTROLLER] [EMPLOYEE] [SEND CARRY FORWARD EMAILS] Error:`, error);
    res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
};

/**
 * Convert LOP leaves to casual leaves
 * Only HR and Super Admin can perform this conversion
 * Conversion is only allowed if employee has LOP balance
 */
export const convertLopToCasual = async (req: AuthRequest, res: Response) => {
  logger.info(`[CONTROLLER] [EMPLOYEE] [CONVERT LOP TO CASUAL] ========== REQUEST RECEIVED ==========`);
  logger.info(`[CONTROLLER] [EMPLOYEE] [CONVERT LOP TO CASUAL] Employee ID: ${req.params.id}, User ID: ${req.user?.id || 'unknown'}, Role: ${req.user?.role || 'unknown'}, Count: ${req.body.count}`);

  try {
    // Ensure only HR and super_admin can convert LOP to casual
    if (req.user?.role !== 'hr' && req.user?.role !== 'super_admin') {
      logger.warn(`[CONTROLLER] [EMPLOYEE] [CONVERT LOP TO CASUAL] Unauthorized attempt - User ID: ${req.user?.id}, Role: ${req.user?.role}`);
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Only HR and Super Admin can convert LOP to casual leaves'
        }
      });
    }

    const employeeId = parseInt(req.params.id);
    if (isNaN(employeeId)) {
      logger.warn(`[CONTROLLER] [EMPLOYEE] [CONVERT LOP TO CASUAL] Invalid employee ID: ${req.params.id}`);
      return res.status(400).json({
        error: {
          code: 'BAD_REQUEST',
          message: 'Invalid employee ID'
        }
      });
    }

    const { count } = req.body;

    if (!count || count <= 0) {
      logger.warn(`[CONTROLLER] [EMPLOYEE] [CONVERT LOP TO CASUAL] Invalid count: ${count}`);
      return res.status(400).json({
        error: {
          code: 'BAD_REQUEST',
          message: 'Count is required and must be greater than 0'
        }
      });
    }

    // Prevent Super Admin from converting leaves for themselves
    if (req.user?.role === 'super_admin' && req.user?.id === employeeId) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Super Admin cannot convert leaves for themselves'
        }
      });
    }

    // HR cannot convert leaves for themselves or super_admin users
    if (req.user?.role === 'hr') {
      // Check if employee exists and get their role
      const employeeCheckResult = await pool.query('SELECT id, role FROM users WHERE id = $1', [employeeId]);
      if (employeeCheckResult.rows.length === 0) {
        return res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: 'Employee not found'
          }
        });
      }

      const employeeRole = employeeCheckResult.rows[0].role;
      if (employeeRole === 'super_admin') {
        return res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: 'HR cannot convert leaves for Super Admin users'
          }
        });
      }

      if (employeeId === req.user.id) {
        return res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: 'HR cannot convert leaves for themselves'
          }
        });
      }
    }

    const result = await employeeService.convertLopToCasual(
      employeeId,
      parseFloat(count),
      req.user!.id
    );

    logger.info(`[CONTROLLER] [EMPLOYEE] [CONVERT LOP TO CASUAL] Conversion successful - Employee ID: ${employeeId}, Count: ${count}`);
    res.json({
      success: true,
      ...result
    });
  } catch (error: any) {
    logger.error(`[CONTROLLER] [EMPLOYEE] [CONVERT LOP TO CASUAL] Error:`, error);
    // Check if it's a validation error (400) or server error (500)
    const isValidationError = error.message && (
      error.message.includes('not found') ||
      error.message.includes('required') ||
      error.message.includes('Invalid') ||
      error.message.includes('Insufficient') ||
      error.message.includes('Cannot convert') ||
      error.message.includes('no LOP balance')
    );

    const statusCode = isValidationError ? 400 : 500;
    const errorCode = isValidationError ? 'BAD_REQUEST' : 'SERVER_ERROR';

    res.status(statusCode).json({
      error: {
        code: errorCode,
        message: error.message || 'An error occurred while converting LOP to casual leaves'
      }
    });
  }
};

