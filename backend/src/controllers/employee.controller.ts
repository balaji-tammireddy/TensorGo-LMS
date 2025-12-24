import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import * as employeeService from '../services/employee.service';
import { pool } from '../database/db';

export const getEmployees = async (req: AuthRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = req.query.search as string | undefined;
    const joiningDate = req.query.joiningDate as string | undefined;
    const status = req.query.status as string | undefined;

    const result = await employeeService.getEmployees(page, limit, search, joiningDate, status);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
};

export const getEmployeeById = async (req: AuthRequest, res: Response) => {
  try {
    const employeeId = parseInt(req.params.id);
    const employee = await employeeService.getEmployeeById(employeeId);
    res.json({ employee });
  } catch (error: any) {
    res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: error.message
      }
    });
  }
};

export const getNextEmployeeId = async (req: AuthRequest, res: Response) => {
  try {
    const nextId = await employeeService.getNextEmployeeId();
    res.json({ nextEmployeeId: nextId });
  } catch (error: any) {
    res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
};

export const createEmployee = async (req: AuthRequest, res: Response) => {
  try {
    const result = await employeeService.createEmployee(req.body);
    res.status(201).json(result);
  } catch (error: any) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: error.message
      }
    });
  }
};

export const updateEmployee = async (req: AuthRequest, res: Response) => {
  try {
    const employeeId = parseInt(req.params.id);
    const result = await employeeService.updateEmployee(
      employeeId, 
      req.body, 
      req.user?.role,
      req.user?.id
    );
    res.json(result);
  } catch (error: any) {
    res.status(400).json({
      error: {
        code: 'UPDATE_ERROR',
        message: error.message
      }
    });
  }
};

export const deleteEmployee = async (req: AuthRequest, res: Response) => {
  try {
    // Ensure only super_admin can delete
    if (req.user?.role !== 'super_admin') {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Only super admin can delete employees'
        }
      });
    }
    const employeeId = parseInt(req.params.id);
    const result = await employeeService.deleteEmployee(employeeId);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({
      error: {
        code: 'DELETE_ERROR',
        message: error.message
      }
    });
  }
};

export const addLeavesToEmployee = async (req: AuthRequest, res: Response) => {
  try {
    // Ensure only HR and super_admin can add leaves
    if (req.user?.role !== 'hr' && req.user?.role !== 'super_admin') {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Only HR and Super Admin can add leaves to employees'
        }
      });
    }

    const employeeId = parseInt(req.params.id);
    const { leaveType, count } = req.body;

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

    const result = await employeeService.addLeavesToEmployee(
      employeeId,
      leaveType,
      parseFloat(count),
      req.user!.id
    );
    res.json(result);
  } catch (error: any) {
    res.status(400).json({
      error: {
        code: 'BAD_REQUEST',
        message: error.message
      }
    });
  }
};

export const getEmployeeLeaveBalances = async (req: AuthRequest, res: Response) => {
  try {
    // Ensure only HR and super_admin can view employee leave balances
    if (req.user?.role !== 'hr' && req.user?.role !== 'super_admin') {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Only HR and Super Admin can view employee leave balances'
        }
      });
    }

    const employeeId = parseInt(req.params.id);
    const balances = await employeeService.getEmployeeLeaveBalances(employeeId);
    res.json(balances);
  } catch (error: any) {
    res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
};

