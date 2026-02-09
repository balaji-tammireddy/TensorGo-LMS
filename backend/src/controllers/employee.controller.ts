import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import * as employeeService from '../services/employee.service';
import { sendCarryForwardEmailsToAll } from '../services/leaveCredit.service';
import { pool } from '../database/db';
import { logger } from '../utils/logger';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { uploadToOVH, getPublicUrlFromOVH } from '../utils/storage';

export const getEmployees = async (req: AuthRequest, res: Response) => {
  logger.info(`[CONTROLLER] [EMPLOYEE] [GET EMPLOYEES] ========== REQUEST RECEIVED ==========`);
  logger.info(`[CONTROLLER] [EMPLOYEE] [GET EMPLOYEES] User ID: ${req.user!.id}, Role: ${req.user!.role}, Page: ${req.query.page || 1}, Limit: ${req.query.limit || 20}, Search: ${req.query.search || 'none'}`);

  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = req.query.search as string | undefined;
    const joiningDate = req.query.joiningDate as string | undefined;
    const status = req.query.status as string | undefined;
    const role = req.query.role as string | undefined;
    const sortBy = req.query.sortBy as string | undefined;
    const sortOrder = (req.query.sortOrder as 'asc' | 'desc') || 'asc';

    const result = await employeeService.getEmployees(page, limit, search, joiningDate, status, role, sortBy, sortOrder);
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
    const result = await employeeService.createEmployee(req.body, req.user?.role, req.user?.id);
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

const addLeavesDocStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = process.env.UPLOAD_DIR || './uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req: any, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `leave-doc-${req.user!.id}-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const uploadAddLeavesDoc = multer({
  storage: addLeavesDocStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype) || file.mimetype === 'application/pdf';
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Only image files (JPEG, PNG) and PDF files are allowed'));
  }
});

export const addLeavesToEmployee = [
  uploadAddLeavesDoc.single('document'),
  async (req: AuthRequest, res: Response) => {
    logger.info(`[CONTROLLER] [EMPLOYEE] [ADD LEAVES] ========== REQUEST RECEIVED ==========`);
    logger.info(`[CONTROLLER] [EMPLOYEE] [ADD LEAVES] Employee ID: ${req.params.id}, User ID: ${req.user?.id || 'unknown'}, Role: ${req.user?.role || 'unknown'}, Leave Type: ${req.body.leaveType}, Count: ${req.body.count}`);

    let localFilePath: string | null = null;

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
      const { leaveType, count } = req.body;

      // Check if employee exists and get their role
      const employeeCheckResult = await pool.query('SELECT id, user_role as role FROM users WHERE id = $1', [employeeId]);
      if (employeeCheckResult.rows.length === 0) {
        return res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: 'Employee not found'
          }
        });
      }

      const employeeRole = employeeCheckResult.rows[0].role;

      // Global restriction: Cannot add leaves to Super Admin
      if (employeeRole === 'super_admin') {
        return res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: 'Cannot add leave balances to Super Admin users'
          }
        });
      }



      if (!leaveType || !count) {
        return res.status(400).json({
          error: {
            code: 'BAD_REQUEST',
            message: 'Leave type and count are required'
          }
        });
      }

      if (parseFloat(count) > 12) {
        return res.status(400).json({
          error: {
            code: 'BAD_REQUEST',
            message: 'Maximum 12 leaves can be added at once'
          }
        });
      }

      // Implicitly handle form-data parsing quirks (sometimes strings)
      // Validate leaveType
      if (leaveType !== 'casual' && leaveType !== 'lop') {
        return res.status(400).json({
          error: {
            code: 'BAD_REQUEST',
            message: 'Only casual and LOP leaves can be added manually'
          }
        });
      }

      // Validate request has a file
      if (!req.file) {
        return res.status(400).json({
          error: {
            code: 'BAD_REQUEST',
            message: 'Document attachment is mandatory'
          }
        });
      }

      localFilePath = req.file.path;
      let documentUrl = '';

      // Upload to OVH
      const useOVHCloud = process.env.OVH_ACCESS_KEY && process.env.OVH_SECRET_KEY && process.env.OVH_BUCKET_NAME;
      if (useOVHCloud) {
        try {
          const key = `leave-documents/${req.user!.id}/${req.file.filename}`;
          const certificateKey = await uploadToOVH(localFilePath, key, req.file.mimetype);
          // Generate public URL for the email
          documentUrl = getPublicUrlFromOVH(certificateKey);

          // Delete local file
          try {
            fs.unlinkSync(localFilePath);
          } catch (e) { /* ignore */ }
        } catch (ovhError: any) {
          logger.warn(`[CONTROLLER] [ADD LEAVES] OVH upload failed: ${ovhError.message}`);
          // Fallback? If upload fails, we probably shouldn't proceed if it is mandatory.
          // Or store base64 as last resort? Let's error out for now to ensure consistency.
          throw new Error('Failed to upload document');
        }
      } else {
        // Local storage not implemented fully for permanent storage in this snippet, 
        // but typically we would just keep the file. 
        // For now, let's assume OVH is required or return local path (URL construction needed).
        // Assuming OVH is configured as per project pattern.
        // If not, maybe we just use the filename?
        documentUrl = req.file.filename;
      }

      const result = await employeeService.addLeavesToEmployee(
        employeeId,
        leaveType,
        parseFloat(count),
        req.user!.id,
        undefined,
        documentUrl
      );
      logger.info(`[CONTROLLER] [EMPLOYEE] [ADD LEAVES] Leaves added successfully - Employee ID: ${employeeId}, Leave Type: ${leaveType}, Count: ${count}`);
      res.json(result);
    } catch (error: any) {
      // Cleanup
      if (localFilePath && fs.existsSync(localFilePath)) {
        try { fs.unlinkSync(localFilePath); } catch (e) { }
      }

      logger.error(`[CONTROLLER] [EMPLOYEE] [ADD LEAVES] Error:`, error);
      res.status(400).json({
        error: {
          code: 'BAD_REQUEST',
          message: error.message
        }
      });
    }
  }
];

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


