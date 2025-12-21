import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import * as employeeService from '../services/employee.service';

export const getEmployees = async (req: AuthRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = req.query.search as string | undefined;
    const filter = req.query.filter as string | undefined;
    const status = req.query.status as string | undefined;

    const result = await employeeService.getEmployees(page, limit, search, filter, status);
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
    const result = await employeeService.updateEmployee(employeeId, req.body);
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

