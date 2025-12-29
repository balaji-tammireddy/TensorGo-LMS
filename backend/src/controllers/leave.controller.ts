import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import * as leaveService from '../services/leave.service';
import { logger } from '../utils/logger';

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

export const applyLeave = async (req: AuthRequest, res: Response) => {
  logger.info(`[CONTROLLER] [LEAVE] [APPLY LEAVE] ========== REQUEST RECEIVED ==========`);
  logger.info(`[CONTROLLER] [LEAVE] [APPLY LEAVE] User ID: ${req.user!.id}, Leave Type: ${req.body.leaveType}, Start: ${req.body.startDate}, End: ${req.body.endDate}`);
  
  try {
    const result = await leaveService.applyLeave(req.user!.id, req.body);
    logger.info(`[CONTROLLER] [LEAVE] [APPLY LEAVE] Leave applied successfully - Leave Request ID: ${result.leaveRequestId}`);
    res.status(201).json(result);
  } catch (error: any) {
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
};

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
    logger.info(`[CONTROLLER] [LEAVE] [GET APPROVED LEAVES] Retrieved ${result.leaves.length} approved leaves, Total: ${result.pagination.total}`);
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

export const updateLeaveRequest = async (req: AuthRequest, res: Response) => {
  logger.info(`[CONTROLLER] [LEAVE] [UPDATE LEAVE REQUEST] ========== REQUEST RECEIVED ==========`);
  logger.info(`[CONTROLLER] [LEAVE] [UPDATE LEAVE REQUEST] Request ID: ${req.params.id}, User ID: ${req.user!.id}, Role: ${req.user!.role}, Leave Type: ${req.body.leaveType || 'none'}`);
  
  try {
    const requestId = parseInt(req.params.id);
    const result = await leaveService.updateLeaveRequest(requestId, req.user!.id, req.user!.role, req.body);
    logger.info(`[CONTROLLER] [LEAVE] [UPDATE LEAVE REQUEST] Leave request updated successfully - Request ID: ${requestId}`);
    res.json(result);
  } catch (error: any) {
    logger.error(`[CONTROLLER] [LEAVE] [UPDATE LEAVE REQUEST] Error:`, error);
    res.status(400).json({
      error: {
        code: 'UPDATE_FAILED',
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

