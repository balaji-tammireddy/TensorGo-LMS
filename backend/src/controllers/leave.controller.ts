import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import * as leaveService from '../services/leave.service';
import { logger } from '../utils/logger';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { uploadToOVH, getSignedUrlFromOVH, deleteFromOVH } from '../utils/storage';
import { pool } from '../database/db';
import { applyLeaveSchema, updateLeaveSchema } from '../validations/leave.schema';

export const getBalances = async (req: AuthRequest, res: Response) => {
  logger.info(`[CONTROLLER] [LEAVE] [GET BALANCES] ========== REQUEST RECEIVED ==========`);
  logger.info(`[CONTROLLER] [LEAVE] [GET BALANCES] User ID: ${req.user!.id}`);

  try {
    const balances = await leaveService.getLeaveBalances(req.user!.id);
    logger.info(`[CONTROLLER] [LEAVE] [GET BALANCES] Balances retrieved successfully`);
    res.json(balances);
  } catch (error: any) {
    logger.error(`[CONTROLLER] [LEAVE] [GET BALANCES] Error:`, error);
    res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
};

export const getHolidays = async (req: AuthRequest, res: Response) => {
  logger.info(`[CONTROLLER] [LEAVE] [GET HOLIDAYS] ========== REQUEST RECEIVED ==========`);
  logger.info(`[CONTROLLER] [LEAVE] [GET HOLIDAYS] Year param: ${req.query.year || 'none'}`);

  try {
    let year: number | undefined = undefined;
    if (req.query.year) {
      const yearParam = parseInt(req.query.year as string, 10);
      if (!isNaN(yearParam)) {
        year = yearParam;
      }
    }
    logger.info(`[CONTROLLER] [LEAVE] [GET HOLIDAYS] Parsed year: ${year || 'all'}`);
    const holidays = await leaveService.getHolidays(year);
    logger.info(`[CONTROLLER] [LEAVE] [GET HOLIDAYS] Returning ${holidays.length} holidays`);
    res.json({ holidays });
  } catch (error: any) {
    logger.error(`[CONTROLLER] [LEAVE] [GET HOLIDAYS] Error:`, error);
    res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
};

/**
 * Get Leave Rules - READ ONLY
 * 
 * IMPORTANT: This endpoint is read-only. The leave_rules table should NEVER be modified
 * through the application. No create, update, or delete endpoints should be implemented.
 */
export const getRules = async (req: AuthRequest, res: Response) => {
  logger.info(`[CONTROLLER] [LEAVE] [GET RULES] ========== REQUEST RECEIVED ==========`);

  try {
    const rules = await leaveService.getLeaveRules();
    logger.info(`[CONTROLLER] [LEAVE] [GET RULES] Rules retrieved successfully`);
    res.json({ rules });
  } catch (error: any) {
    logger.error(`[CONTROLLER] [LEAVE] [GET RULES] Error:`, error);
    res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
};

// Configure multer for medical certificate uploads
const medicalCertStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = process.env.UPLOAD_DIR || './uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req: AuthRequest, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `medical-cert-${req.user!.id}-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const uploadMedicalCert = multer({
  storage: medicalCertStorage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '5242880') // 5MB default
  },
  fileFilter: (req, file, cb) => {
    // Allow images and PDFs
    const allowedTypes = /jpeg|jpg|png|gif|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype) || file.mimetype === 'application/pdf';

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files (JPEG, PNG, GIF) and PDF files are allowed'));
    }
  }
});

export const applyLeave = [
  uploadMedicalCert.single('doctorNote'),
  async (req: AuthRequest, res: Response) => {
    logger.info(`[CONTROLLER] [LEAVE] [APPLY LEAVE] ========== REQUEST RECEIVED ==========`);
    logger.info(`[CONTROLLER] [LEAVE] [APPLY LEAVE] User ID: ${req.user!.id}, Leave Type: ${req.body.leaveType}, Start: ${req.body.startDate}, End: ${req.body.endDate}`);

    let localFilePath: string | null = null;

    try {
      // Parse timeForPermission from FormData format (timeForPermission[start], timeForPermission[end])
      const bodyData: any = { ...req.body };
      if (req.body['timeForPermission[start]'] || req.body['timeForPermission[end]']) {
        bodyData.timeForPermission = {
          start: req.body['timeForPermission[start]'] || undefined,
          end: req.body['timeForPermission[end]'] || undefined
        };
        delete bodyData['timeForPermission[start]'];
        delete bodyData['timeForPermission[end]'];
      }

      // Validate request data
      const validationResult = applyLeaveSchema.safeParse({
        body: bodyData
      });

      if (!validationResult.success) {
        const errorMessages = validationResult.error.errors.map(err => {
          const field = err.path.join('.');
          return `${field}: ${err.message}`;
        });

        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: errorMessages.length === 1
              ? errorMessages[0]
              : `Validation failed: ${errorMessages.join(', ')}`,
            details: validationResult.error.errors
          }
        });
      }

      const leaveData = { ...bodyData };

      // Handle medical certificate file upload
      if (req.file && req.body.leaveType === 'sick') {
        localFilePath = req.file.path;
        const useOVHCloud = process.env.OVH_ACCESS_KEY && process.env.OVH_SECRET_KEY && process.env.OVH_BUCKET_NAME;

        if (useOVHCloud) {
          try {
            // Upload to OVHcloud bucket - returns key
            const key = `medical-certificates/${req.user!.id}/${req.file.filename}`;
            const certificateKey = await uploadToOVH(localFilePath, key, req.file.mimetype);

            // Delete local file after successful upload
            try {
              fs.unlinkSync(localFilePath);
              logger.info(`[CONTROLLER] [LEAVE] [APPLY LEAVE] Local medical cert file deleted: ${localFilePath}`);
            } catch (deleteError: any) {
              logger.warn(`[CONTROLLER] [LEAVE] [APPLY LEAVE] Failed to delete local file: ${deleteError.message}`);
            }

            // Store key instead of base64
            leaveData.doctorNote = certificateKey;
            logger.info(`[CONTROLLER] [LEAVE] [APPLY LEAVE] Medical certificate uploaded to OVHcloud: ${certificateKey}`);
          } catch (ovhError: any) {
            // Fallback: convert to base64 if OVHcloud upload fails
            logger.warn(`[CONTROLLER] [LEAVE] [APPLY LEAVE] OVHcloud upload failed, falling back to base64: ${ovhError.message}`);
            const fileContent = fs.readFileSync(localFilePath);
            leaveData.doctorNote = `data:${req.file.mimetype};base64,${fileContent.toString('base64')}`;

            // Clean up local file
            try {
              fs.unlinkSync(localFilePath);
            } catch (deleteError: any) {
              logger.warn(`[CONTROLLER] [LEAVE] [APPLY LEAVE] Failed to clean up local file: ${deleteError.message}`);
            }
          }
        } else {
          // No OVHcloud configured - use base64
          const fileContent = fs.readFileSync(localFilePath);
          leaveData.doctorNote = `data:${req.file.mimetype};base64,${fileContent.toString('base64')}`;

          // Clean up local file
          try {
            fs.unlinkSync(localFilePath);
          } catch (deleteError: any) {
            logger.warn(`[CONTROLLER] [LEAVE] [APPLY LEAVE] Failed to clean up local file: ${deleteError.message}`);
          }
        }
      } else if (req.body.doctorNote && req.body.doctorNote.startsWith('medical-certificates/')) {
        // Existing OVHcloud key - preserve it
        leaveData.doctorNote = req.body.doctorNote;
      } else if (req.body.doctorNote && req.body.doctorNote.startsWith('data:')) {
        // Existing base64 - preserve it (legacy support)
        leaveData.doctorNote = req.body.doctorNote;
      }

      const result = await leaveService.applyLeave(req.user!.id, leaveData);
      logger.info(`[CONTROLLER] [LEAVE] [APPLY LEAVE] Leave applied successfully - Leave Request ID: ${result.leaveRequestId}`);
      res.status(201).json(result);
    } catch (error: any) {
      // Clean up local file if upload failed
      if (localFilePath && fs.existsSync(localFilePath)) {
        try {
          fs.unlinkSync(localFilePath);
          logger.info(`[CONTROLLER] [LEAVE] [APPLY LEAVE] Cleaned up local file after error: ${localFilePath}`);
        } catch (deleteError: any) {
          logger.warn(`[CONTROLLER] [LEAVE] [APPLY LEAVE] Failed to clean up local file: ${deleteError.message}`);
        }
      }

      logger.error(`[CONTROLLER] [LEAVE] [APPLY LEAVE] Error:`, error);
      logger.error(`[CONTROLLER] [LEAVE] [APPLY LEAVE] Error stack:`, error.stack);
      logger.error(`[CONTROLLER] [LEAVE] [APPLY LEAVE] Request body:`, req.body);
      const statusCode = error.message?.includes('not found') || error.message?.includes('permission') ? 404 : 400;
      res.status(statusCode).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: error.message || 'Failed to apply leave',
          details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        }
      });
    }
  }
];

export const getMyRequests = async (req: AuthRequest, res: Response) => {
  logger.info(`[CONTROLLER] [LEAVE] [GET MY REQUESTS] ========== REQUEST RECEIVED ==========`);
  logger.info(`[CONTROLLER] [LEAVE] [GET MY REQUESTS] User ID: ${req.user!.id}, Page: ${req.query.page || 1}, Limit: ${req.query.limit || 10}, Status: ${req.query.status || 'all'}`);

  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const status = req.query.status as string | undefined;

    const result = await leaveService.getMyLeaveRequests(req.user!.id, page, limit, status, req.user!.role);
    logger.info(`[CONTROLLER] [LEAVE] [GET MY REQUESTS] Retrieved ${result.requests.length} leave requests, Total: ${result.pagination.total}`);
    res.json(result);
  } catch (error: any) {
    logger.error(`[CONTROLLER] [LEAVE] [GET MY REQUESTS] Error:`, error);
    res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
};

export const getPendingRequests = async (req: AuthRequest, res: Response) => {
  logger.info(`[CONTROLLER] [LEAVE] [GET PENDING REQUESTS] ========== REQUEST RECEIVED ==========`);
  logger.info(`[CONTROLLER] [LEAVE] [GET PENDING REQUESTS] Approver ID: ${req.user!.id}, Role: ${req.user!.role}, Page: ${req.query.page || 1}, Limit: ${req.query.limit || 10}, Search: ${req.query.search || 'none'}, Filter: ${req.query.filter || 'none'}`);

  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = req.query.search as string | undefined;
    const filter = req.query.filter as string | undefined;

    const result = await leaveService.getPendingLeaveRequests(
      req.user!.id,
      req.user!.role,
      page,
      limit,
      search,
      filter
    );
    logger.info(`[CONTROLLER] [LEAVE] [GET PENDING REQUESTS] Retrieved ${result.requests.length} pending requests, Total: ${result.pagination.total}`);
    res.json(result);
  } catch (error: any) {
    logger.error(`[CONTROLLER] [LEAVE] [GET PENDING REQUESTS] Error:`, error);
    res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
};

export const approveLeave = async (req: AuthRequest, res: Response) => {
  logger.info(`[CONTROLLER] [LEAVE] [APPROVE LEAVE] ========== REQUEST RECEIVED ==========`);
  logger.info(`[CONTROLLER] [LEAVE] [APPROVE LEAVE] Leave ID: ${req.params.id}, User ID: ${req.user!.id}, Role: ${req.user!.role}, Comment: ${req.body.comment || 'none'}`);

  try {
    const leaveRequestId = parseInt(req.params.id);
    const { comment } = req.body;

    const result = await leaveService.approveLeave(
      leaveRequestId,
      req.user!.id,
      req.user!.role,
      comment
    );
    logger.info(`[CONTROLLER] [LEAVE] [APPROVE LEAVE] Leave approved successfully - Leave Request ID: ${leaveRequestId}`);
    res.json(result);
  } catch (error: any) {
    logger.error(`[CONTROLLER] [LEAVE] [APPROVE LEAVE] Error:`, error);
    res.status(400).json({
      error: {
        code: 'APPROVAL_ERROR',
        message: error.message
      }
    });
  }
};

export const rejectLeave = async (req: AuthRequest, res: Response) => {
  logger.info(`[CONTROLLER] [LEAVE] [REJECT LEAVE] ========== REQUEST RECEIVED ==========`);
  logger.info(`[CONTROLLER] [LEAVE] [REJECT LEAVE] Leave ID: ${req.params.id}, User ID: ${req.user!.id}, Role: ${req.user!.role}, Comment: ${req.body.comment || 'none'}`);

  try {
    const leaveRequestId = parseInt(req.params.id);
    const { comment } = req.body;

    if (!comment) {
      logger.warn(`[CONTROLLER] [LEAVE] [REJECT LEAVE] Comment is required for rejection`);
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Comment is required for rejection'
        }
      });
    }

    const result = await leaveService.rejectLeave(
      leaveRequestId,
      req.user!.id,
      req.user!.role,
      comment
    );
    logger.info(`[CONTROLLER] [LEAVE] [REJECT LEAVE] Leave rejected successfully - Leave Request ID: ${leaveRequestId}`);
    res.json(result);
  } catch (error: any) {
    logger.error(`[CONTROLLER] [LEAVE] [REJECT LEAVE] Error:`, error);
    res.status(400).json({
      error: {
        code: 'REJECTION_ERROR',
        message: error.message
      }
    });
  }
};

export const approveLeaveDay = async (req: AuthRequest, res: Response) => {
  logger.info(`[CONTROLLER] [LEAVE] [APPROVE LEAVE DAY] ========== REQUEST RECEIVED ==========`);
  logger.info(`[CONTROLLER] [LEAVE] [APPROVE LEAVE DAY] Leave ID: ${req.params.id}, Day ID: ${req.params.dayId}, User ID: ${req.user!.id}, Role: ${req.user!.role}, Comment: ${req.body.comment || 'none'}`);

  try {
    const leaveRequestId = parseInt(req.params.id);
    const dayId = parseInt(req.params.dayId);
    const { comment } = req.body;

    const result = await leaveService.approveLeaveDay(
      leaveRequestId,
      dayId,
      req.user!.id,
      req.user!.role,
      comment
    );
    logger.info(`[CONTROLLER] [LEAVE] [APPROVE LEAVE DAY] Leave day approved successfully - Leave Request ID: ${leaveRequestId}, Day ID: ${dayId}`);
    res.json(result);
  } catch (error: any) {
    logger.error(`[CONTROLLER] [LEAVE] [APPROVE LEAVE DAY] Error:`, error);
    res.status(400).json({
      error: {
        code: 'APPROVAL_ERROR',
        message: error.message
      }
    });
  }
};

export const approveLeaveDays = async (req: AuthRequest, res: Response) => {
  logger.info(`[CONTROLLER] [LEAVE] [APPROVE LEAVE DAYS] ========== REQUEST RECEIVED ==========`);
  logger.info(`[CONTROLLER] [LEAVE] [APPROVE LEAVE DAYS] Leave ID: ${req.params.id}, Day IDs: ${req.body.dayIds?.join(', ') || 'none'}, User ID: ${req.user!.id}, Role: ${req.user!.role}, Comment: ${req.body.comment || 'none'}`);

  try {
    const leaveRequestId = parseInt(req.params.id);
    const { dayIds, comment } = req.body;

    if (!dayIds || !Array.isArray(dayIds) || dayIds.length === 0) {
      logger.warn(`[CONTROLLER] [LEAVE] [APPROVE LEAVE DAYS] dayIds array is required`);
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'dayIds array is required'
        }
      });
    }

    const result = await leaveService.approveLeaveDays(
      leaveRequestId,
      dayIds,
      req.user!.id,
      req.user!.role,
      comment
    );
    logger.info(`[CONTROLLER] [LEAVE] [APPROVE LEAVE DAYS] Leave days approved successfully - Leave Request ID: ${leaveRequestId}, Day IDs: ${dayIds.join(', ')}`);
    res.json(result);
  } catch (error: any) {
    logger.error(`[CONTROLLER] [LEAVE] [APPROVE LEAVE DAYS] Error:`, error);
    res.status(400).json({
      error: {
        code: 'APPROVAL_ERROR',
        message: error.message
      }
    });
  }
};

export const rejectLeaveDay = async (req: AuthRequest, res: Response) => {
  logger.info(`[CONTROLLER] [LEAVE] [REJECT LEAVE DAY] ========== REQUEST RECEIVED ==========`);
  logger.info(`[CONTROLLER] [LEAVE] [REJECT LEAVE DAY] Leave ID: ${req.params.id}, Day ID: ${req.params.dayId}, User ID: ${req.user!.id}, Role: ${req.user!.role}, Comment: ${req.body.comment || 'none'}`);

  try {
    const leaveRequestId = parseInt(req.params.id);
    const dayId = parseInt(req.params.dayId);
    const { comment } = req.body;

    const result = await leaveService.rejectLeaveDay(
      leaveRequestId,
      dayId,
      req.user!.id,
      req.user!.role,
      comment
    );
    logger.info(`[CONTROLLER] [LEAVE] [REJECT LEAVE DAY] Leave day rejected successfully - Leave Request ID: ${leaveRequestId}, Day ID: ${dayId}`);
    res.json(result);
  } catch (error: any) {
    logger.error(`[CONTROLLER] [LEAVE] [REJECT LEAVE DAY] Error:`, error);
    res.status(400).json({
      error: {
        code: 'REJECTION_ERROR',
        message: error.message
      }
    });
  }
};

export const getApprovedLeaves = async (req: AuthRequest, res: Response) => {
  logger.info(`[CONTROLLER] [LEAVE] [GET APPROVED LEAVES] ========== REQUEST RECEIVED ==========`);
  logger.info(`[CONTROLLER] [LEAVE] [GET APPROVED LEAVES] User ID: ${req.user!.id}, Role: ${req.user!.role}, Page: ${req.query.page || 1}, Limit: ${req.query.limit || 10}`);

  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;

    const result = await leaveService.getApprovedLeaves(page, limit, req.user!.role);
    logger.info(`[CONTROLLER] [LEAVE] [GET APPROVED LEAVES] Retrieved ${result.requests?.length || 0} approved leaves, Total: ${result.pagination?.total || 0}`);
    res.json(result);
  } catch (error: any) {
    logger.error(`[CONTROLLER] [LEAVE] [GET APPROVED LEAVES] Error:`, error);
    res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
};

export const updateLeaveStatus = async (req: AuthRequest, res: Response) => {
  logger.info(`[CONTROLLER] [LEAVE] [UPDATE LEAVE STATUS] ========== REQUEST RECEIVED ==========`);
  logger.info(`[CONTROLLER] [LEAVE] [UPDATE LEAVE STATUS] Leave ID: ${req.params.id}, User ID: ${req.user!.id}, Role: ${req.user!.role}, Status: ${req.body.status}, Day IDs: ${req.body.dayIds?.join(', ') || 'none'}`);

  try {
    const leaveRequestId = parseInt(req.params.id);
    const { status, dayIds, rejectReason, leaveReason } = req.body;

    if (!status) {
      logger.warn(`[CONTROLLER] [LEAVE] [UPDATE LEAVE STATUS] Status is required`);
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Status is required'
        }
      });
    }

    if (!['approved', 'rejected', 'partially_approved'].includes(status)) {
      logger.warn(`[CONTROLLER] [LEAVE] [UPDATE LEAVE STATUS] Invalid status: ${status}`);
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid status. Must be approved, rejected, or partially_approved'
        }
      });
    }

    if (status === 'partially_approved' && (!dayIds || !Array.isArray(dayIds) || dayIds.length === 0)) {
      logger.warn(`[CONTROLLER] [LEAVE] [UPDATE LEAVE STATUS] dayIds array is required for partially_approved status`);
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'dayIds array is required for partially_approved status'
        }
      });
    }

    const result = await leaveService.updateLeaveStatus(
      leaveRequestId,
      req.user!.id,
      req.user!.role,
      status,
      dayIds,
      rejectReason,
      leaveReason
    );
    logger.info(`[CONTROLLER] [LEAVE] [UPDATE LEAVE STATUS] Leave status updated successfully - Leave Request ID: ${leaveRequestId}, New Status: ${status}`);
    res.json(result);
  } catch (error: any) {
    logger.error(`[CONTROLLER] [LEAVE] [UPDATE LEAVE STATUS] Error:`, error);
    res.status(400).json({
      error: {
        code: 'UPDATE_STATUS_ERROR',
        message: error.message
      }
    });
  }
};

export const getEmployeeLeaveRequests = async (req: AuthRequest, res: Response) => {
  logger.info(`[CONTROLLER] [LEAVE] [GET EMPLOYEE LEAVE REQUESTS] ========== REQUEST RECEIVED ==========`);
  logger.info(`[CONTROLLER] [LEAVE] [GET EMPLOYEE LEAVE REQUESTS] Employee ID: ${req.params.employeeId}, User ID: ${req.user!.id}, Role: ${req.user!.role}, Page: ${req.query.page || 1}, Limit: ${req.query.limit || 10}, Status: ${req.query.status || 'all'}`);

  try {
    // Only HR and Super Admin can view leave requests for any employee
    if (req.user!.role !== 'hr' && req.user!.role !== 'super_admin') {
      logger.warn(`[CONTROLLER] [LEAVE] [GET EMPLOYEE LEAVE REQUESTS] Unauthorized access attempt by user ${req.user!.id} with role ${req.user!.role}`);
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Only HR and Super Admin can view employee leave requests'
        }
      });
    }

    const employeeId = parseInt(req.params.employeeId);
    if (isNaN(employeeId)) {
      logger.warn(`[CONTROLLER] [LEAVE] [GET EMPLOYEE LEAVE REQUESTS] Invalid employee ID: ${req.params.employeeId}`);
      return res.status(400).json({
        error: {
          code: 'INVALID_EMPLOYEE_ID',
          message: 'Invalid employee ID'
        }
      });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const status = req.query.status as string | undefined;

    const result = await leaveService.getMyLeaveRequests(employeeId, page, limit, status, req.user!.role);
    logger.info(`[CONTROLLER] [LEAVE] [GET EMPLOYEE LEAVE REQUESTS] Retrieved ${result.requests.length} leave requests for employee ${employeeId}, Total: ${result.pagination.total}`);
    res.json(result);
  } catch (error: any) {
    logger.error(`[CONTROLLER] [LEAVE] [GET EMPLOYEE LEAVE REQUESTS] Error:`, error);
    res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
};

export const getLeaveRequest = async (req: AuthRequest, res: Response) => {
  logger.info(`[CONTROLLER] [LEAVE] [GET LEAVE REQUEST] ========== REQUEST RECEIVED ==========`);
  logger.info(`[CONTROLLER] [LEAVE] [GET LEAVE REQUEST] Request ID: ${req.params.id}, User ID: ${req.user!.id}, Role: ${req.user!.role}`);

  try {
    const requestId = parseInt(req.params.id);
    if (isNaN(requestId)) {
      logger.warn(`[CONTROLLER] [LEAVE] [GET LEAVE REQUEST] Invalid leave request ID: ${req.params.id}`);
      return res.status(400).json({
        error: {
          code: 'INVALID_REQUEST_ID',
          message: 'Invalid leave request ID'
        }
      });
    }
    const result = await leaveService.getLeaveRequestById(requestId, req.user!.id, req.user!.role);
    logger.info(`[CONTROLLER] [LEAVE] [GET LEAVE REQUEST] Leave request retrieved successfully - Request ID: ${requestId}`);
    res.json(result);
  } catch (error: any) {
    logger.error(`[CONTROLLER] [LEAVE] [GET LEAVE REQUEST] Error:`, error);
    res.status(error.message.includes('not found') || error.message.includes('permission') ? 404 : 400).json({
      error: {
        code: 'NOT_FOUND',
        message: error.message
      }
    });
  }
};

export const updateLeaveRequest = [
  uploadMedicalCert.single('doctorNote'),
  async (req: AuthRequest, res: Response) => {
    logger.info(`[CONTROLLER] [LEAVE] [UPDATE LEAVE REQUEST] ========== REQUEST RECEIVED ==========`);
    logger.info(`[CONTROLLER] [LEAVE] [UPDATE LEAVE REQUEST] Request ID: ${req.params.id}, User ID: ${req.user!.id}, Role: ${req.user!.role}, Leave Type: ${req.body.leaveType || 'none'}`);

    let localFilePath: string | null = null;

    try {
      const requestId = parseInt(req.params.id);

      // Parse timeForPermission from FormData format (timeForPermission[start], timeForPermission[end])
      const bodyData: any = { ...req.body };
      if (req.body['timeForPermission[start]'] || req.body['timeForPermission[end]']) {
        bodyData.timeForPermission = {
          start: req.body['timeForPermission[start]'] || undefined,
          end: req.body['timeForPermission[end]'] || undefined
        };
        delete bodyData['timeForPermission[start]'];
        delete bodyData['timeForPermission[end]'];
      }

      // Validate request data
      const validationResult = updateLeaveSchema.safeParse({
        params: { id: req.params.id },
        body: bodyData
      });

      if (!validationResult.success) {
        const errorMessages = validationResult.error.errors.map(err => {
          const field = err.path.join('.');
          return `${field}: ${err.message}`;
        });

        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: errorMessages.length === 1
              ? errorMessages[0]
              : `Validation failed: ${errorMessages.join(', ')}`,
            details: validationResult.error.errors
          }
        });
      }

      const leaveData = { ...bodyData };

      // Handle medical certificate file upload
      if (req.file && req.body.leaveType === 'sick') {
        localFilePath = req.file.path;
        const useOVHCloud = process.env.OVH_ACCESS_KEY && process.env.OVH_SECRET_KEY && process.env.OVH_BUCKET_NAME;

        if (useOVHCloud) {
          try {
            // Upload to OVHcloud bucket - returns key
            const key = `medical-certificates/${req.user!.id}/${req.file.filename}`;
            const certificateKey = await uploadToOVH(localFilePath, key, req.file.mimetype);

            // Delete local file after successful upload
            try {
              fs.unlinkSync(localFilePath);
              logger.info(`[CONTROLLER] [LEAVE] [UPDATE LEAVE REQUEST] Local medical cert file deleted: ${localFilePath}`);
            } catch (deleteError: any) {
              logger.warn(`[CONTROLLER] [LEAVE] [UPDATE LEAVE REQUEST] Failed to delete local file: ${deleteError.message}`);
            }

            // Store key instead of base64
            leaveData.doctorNote = certificateKey;
            logger.info(`[CONTROLLER] [LEAVE] [UPDATE LEAVE REQUEST] Medical certificate uploaded to OVHcloud: ${certificateKey}`);
          } catch (ovhError: any) {
            // Fallback: convert to base64 if OVHcloud upload fails
            logger.warn(`[CONTROLLER] [LEAVE] [UPDATE LEAVE REQUEST] OVHcloud upload failed, falling back to base64: ${ovhError.message}`);
            const fileContent = fs.readFileSync(localFilePath);
            leaveData.doctorNote = `data:${req.file.mimetype};base64,${fileContent.toString('base64')}`;

            // Clean up local file
            try {
              fs.unlinkSync(localFilePath);
            } catch (deleteError: any) {
              logger.warn(`[CONTROLLER] [LEAVE] [UPDATE LEAVE REQUEST] Failed to clean up local file: ${deleteError.message}`);
            }
          }
        } else {
          // No OVHcloud configured - use base64
          const fileContent = fs.readFileSync(localFilePath);
          leaveData.doctorNote = `data:${req.file.mimetype};base64,${fileContent.toString('base64')}`;

          // Clean up local file
          try {
            fs.unlinkSync(localFilePath);
          } catch (deleteError: any) {
            logger.warn(`[CONTROLLER] [LEAVE] [UPDATE LEAVE REQUEST] Failed to clean up local file: ${deleteError.message}`);
          }
        }
      } else if (req.body.doctorNote && req.body.doctorNote.startsWith('medical-certificates/')) {
        // Existing OVHcloud key - preserve it
        leaveData.doctorNote = req.body.doctorNote;
      } else if (req.body.doctorNote && req.body.doctorNote.startsWith('data:')) {
        // Existing base64 - preserve it (backward compatibility)
        leaveData.doctorNote = req.body.doctorNote;
      }

      const result = await leaveService.updateLeaveRequest(requestId, req.user!.id, req.user!.role, leaveData);
      logger.info(`[CONTROLLER] [LEAVE] [UPDATE LEAVE REQUEST] Leave request updated successfully - Request ID: ${requestId}`);
      res.json(result);
    } catch (error: any) {
      // Clean up local file if upload failed
      if (localFilePath && fs.existsSync(localFilePath)) {
        try {
          fs.unlinkSync(localFilePath);
          logger.info(`[CONTROLLER] [LEAVE] [UPDATE LEAVE REQUEST] Cleaned up local file after error: ${localFilePath}`);
        } catch (deleteError: any) {
          logger.warn(`[CONTROLLER] [LEAVE] [UPDATE LEAVE REQUEST] Failed to clean up local file: ${deleteError.message}`);
        }
      }

      logger.error(`[CONTROLLER] [LEAVE] [UPDATE LEAVE REQUEST] Error:`, error);
      res.status(400).json({
        error: {
          code: 'UPDATE_FAILED',
          message: error.message
        }
      });
    }
  }
];

export const getMedicalCertificateSignedUrl = async (req: AuthRequest, res: Response) => {
  logger.info(`[CONTROLLER] [LEAVE] [GET MEDICAL CERT SIGNED URL] ========== REQUEST RECEIVED ==========`);
  logger.info(`[CONTROLLER] [LEAVE] [GET MEDICAL CERT SIGNED URL] Request ID: ${req.params.requestId}, User ID: ${req.user!.id}`);

  try {
    const requestId = parseInt(req.params.requestId);

    // Get leave request to verify access and get certificate key
    const leaveRequest = await leaveService.getLeaveRequestById(requestId, req.user!.id, req.user!.role);

    // Get full request details to check employee_id
    const fullRequest = await leaveService.getMyLeaveRequests(req.user!.id, 1, 1000);
    const request = fullRequest.requests.find((r: any) => r.id === requestId);

    if (!request) {
      // Check if user is manager/hr/super_admin who can view any request
      const isAuthorized = ['manager', 'hr', 'super_admin'].includes(req.user!.role);
      if (!isAuthorized) {
        return res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: 'You do not have permission to access this medical certificate'
          }
        });
      }
    }

    // Get doctor note from database directly
    const dbResult = await pool.query(
      'SELECT doctor_note, employee_id FROM leave_requests WHERE id = $1',
      [requestId]
    );

    if (dbResult.rows.length === 0) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Leave request not found'
        }
      });
    }

    const doctorNote = dbResult.rows[0].doctor_note;
    const employeeId = dbResult.rows[0].employee_id;

    // Check permissions
    const isOwner = employeeId === req.user!.id;
    const isAuthorized = ['manager', 'hr', 'super_admin'].includes(req.user!.role);

    if (!isOwner && !isAuthorized) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have permission to access this medical certificate'
        }
      });
    }

    if (!doctorNote) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'No medical certificate found for this leave request'
        }
      });
    }

    // Check if it's an OVHcloud key or base64
    if (doctorNote.startsWith('medical-certificates/')) {
      // Generate signed URL for OVHcloud key
      const signedUrl = await getSignedUrlFromOVH(doctorNote, 900);
      logger.info(`[CONTROLLER] [LEAVE] [GET MEDICAL CERT SIGNED URL] Signed URL generated successfully - Request ID: ${requestId}`);
      res.json({ signedUrl, expiresIn: 900 });
    } else if (doctorNote.startsWith('data:')) {
      // Base64 - return as-is (backward compatibility)
      res.json({ signedUrl: doctorNote, expiresIn: null });
    } else {
      return res.status(400).json({
        error: {
          code: 'INVALID_FORMAT',
          message: 'Invalid medical certificate format'
        }
      });
    }
  } catch (error: any) {
    logger.error(`[CONTROLLER] [LEAVE] [GET MEDICAL CERT SIGNED URL] Error:`, error);
    res.status(400).json({
      error: {
        code: 'SIGNED_URL_ERROR',
        message: error.message
      }
    });
  }
};

export const deleteLeaveRequest = async (req: AuthRequest, res: Response) => {
  logger.info(`[CONTROLLER] [LEAVE] [DELETE LEAVE REQUEST] ========== REQUEST RECEIVED ==========`);
  logger.info(`[CONTROLLER] [LEAVE] [DELETE LEAVE REQUEST] Request ID: ${req.params.id}, User ID: ${req.user!.id}, Role: ${req.user!.role}`);

  try {
    const requestId = parseInt(req.params.id);
    const result = await leaveService.deleteLeaveRequest(requestId, req.user!.id, req.user!.role);
    logger.info(`[CONTROLLER] [LEAVE] [DELETE LEAVE REQUEST] Leave request deleted successfully - Request ID: ${requestId}`);
    res.json(result);
  } catch (error: any) {
    logger.error(`[CONTROLLER] [LEAVE] [DELETE LEAVE REQUEST] Error:`, error);
    res.status(error.message.includes('not found') || error.message.includes('permission') ? 404 : 400).json({
      error: {
        code: 'DELETE_FAILED',
        message: error.message
      }
    });
  }
};

/**
 * Convert leave request from LOP to Casual
 * Only HR and Super Admin can perform this conversion
 */
export const convertLeaveRequestLopToCasual = async (req: AuthRequest, res: Response) => {
  logger.info(`[CONTROLLER] [LEAVE] [CONVERT LOP TO CASUAL] ========== REQUEST RECEIVED ==========`);
  logger.info(`[CONTROLLER] [LEAVE] [CONVERT LOP TO CASUAL] Request ID: ${req.params.id}, User ID: ${req.user?.id || 'unknown'}, Role: ${req.user?.role || 'unknown'}`);

  try {
    // Ensure only HR and super_admin can convert leave types
    if (req.user?.role !== 'hr' && req.user?.role !== 'super_admin') {
      logger.warn(`[CONTROLLER] [LEAVE] [CONVERT LOP TO CASUAL] Unauthorized attempt - User ID: ${req.user?.id}, Role: ${req.user?.role}`);
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Only HR and Super Admin can convert leave types'
        }
      });
    }

    const requestId = parseInt(req.params.id);
    if (isNaN(requestId)) {
      logger.warn(`[CONTROLLER] [LEAVE] [CONVERT LOP TO CASUAL] Invalid leave request ID: ${req.params.id}`);
      return res.status(400).json({
        error: {
          code: 'BAD_REQUEST',
          message: 'Invalid leave request ID'
        }
      });
    }

    const result = await leaveService.convertLeaveRequestLopToCasual(
      requestId,
      req.user!.id,
      req.user!.role
    );

    logger.info(`[CONTROLLER] [LEAVE] [CONVERT LOP TO CASUAL] Leave converted successfully - Request ID: ${requestId}`);
    res.json({
      success: true,
      ...result
    });
  } catch (error: any) {
    logger.error(`[CONTROLLER] [LEAVE] [CONVERT LOP TO CASUAL] Error:`, error);
    const isValidationError = error.message && (
      error.message.includes('not found') ||
      error.message.includes('not LOP') ||
      error.message.includes('Insufficient') ||
      error.message.includes('exceed')
    );

    const statusCode = isValidationError ? 400 : 500;
    const errorCode = isValidationError ? 'BAD_REQUEST' : 'SERVER_ERROR';

    res.status(statusCode).json({
      error: {
        code: errorCode,
        message: error.message || 'An error occurred while converting leave request'
      }
    });
  }
};

/**
 * Create a new holiday
 * Only HR and Super Admin can create holidays
 */
export const createHoliday = async (req: AuthRequest, res: Response) => {
  logger.info(`[CONTROLLER] [LEAVE] [CREATE HOLIDAY] ========== REQUEST RECEIVED ==========`);
  logger.info(`[CONTROLLER] [LEAVE] [CREATE HOLIDAY] User ID: ${req.user?.id || 'unknown'}, Role: ${req.user?.role || 'unknown'}`);

  try {
    const { holidayDate, holidayName } = req.body;

    if (!holidayDate || !holidayName) {
      logger.warn(`[CONTROLLER] [LEAVE] [CREATE HOLIDAY] Missing required fields`);
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Holiday date and name are required'
        }
      });
    }

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(holidayDate)) {
      logger.warn(`[CONTROLLER] [LEAVE] [CREATE HOLIDAY] Invalid date format: ${holidayDate}`);
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid date format. Use YYYY-MM-DD'
        }
      });
    }

    const holiday = await leaveService.createHoliday(holidayDate, holidayName);

    logger.info(`[CONTROLLER] [LEAVE] [CREATE HOLIDAY] Holiday created successfully - ID: ${holiday.id}`);

    res.status(201).json({
      success: true,
      holiday
    });
  } catch (error: any) {
    logger.error(`[CONTROLLER] [LEAVE] [CREATE HOLIDAY] Error:`, error);

    if (error.message === 'A holiday already exists for this date') {
      return res.status(400).json({
        error: {
          code: 'DUPLICATE_HOLIDAY',
          message: error.message
        }
      });
    }

    res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: error.message || 'Failed to create holiday'
      }
    });
  }
};

/**
 * Delete a holiday
 * Only HR and Super Admin can delete holidays
 */
export const deleteHoliday = async (req: AuthRequest, res: Response) => {
  logger.info(`[CONTROLLER] [LEAVE] [DELETE HOLIDAY] ========== REQUEST RECEIVED ==========`);
  logger.info(`[CONTROLLER] [LEAVE] [DELETE HOLIDAY] Holiday ID: ${req.params.id}, User ID: ${req.user?.id || 'unknown'}, Role: ${req.user?.role || 'unknown'}`);

  try {
    const holidayId = parseInt(req.params.id);
    if (isNaN(holidayId)) {
      logger.warn(`[CONTROLLER] [LEAVE] [DELETE HOLIDAY] Invalid holiday ID: ${req.params.id}`);
      return res.status(400).json({
        error: {
          code: 'BAD_REQUEST',
          message: 'Invalid holiday ID'
        }
      });
    }

    const holiday = await leaveService.deleteHoliday(holidayId);

    logger.info(`[CONTROLLER] [LEAVE] [DELETE HOLIDAY] Holiday deleted successfully - ID: ${holidayId}`);

    res.json({
      success: true,
      message: 'Holiday deleted successfully',
      holiday
    });
  } catch (error: any) {
    logger.error(`[CONTROLLER] [LEAVE] [DELETE HOLIDAY] Error:`, error);

    if (error.message === 'Holiday not found') {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Holiday not found'
        }
      });
    }

    res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: error.message || 'Failed to delete holiday'
      }
    });
  }
};

