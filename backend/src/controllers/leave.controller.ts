import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import * as leaveService from '../services/leave.service';
import { logger } from '../utils/logger';

export const getBalances = async (req: AuthRequest, res: Response) => {
  try {
    const balances = await leaveService.getLeaveBalances(req.user!.id);
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

export const getHolidays = async (req: AuthRequest, res: Response) => {
  try {
    let year: number | undefined = undefined;
    if (req.query.year) {
      const yearParam = parseInt(req.query.year as string, 10);
      if (!isNaN(yearParam)) {
        year = yearParam;
      }
    }
    console.log(`[getHolidays] Request received - year param: ${req.query.year}, parsed year: ${year}`);
    const holidays = await leaveService.getHolidays(year);
    console.log(`[getHolidays] Returning ${holidays.length} holidays`);
    res.json({ holidays });
  } catch (error: any) {
    console.error('[getHolidays] Error:', error);
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
  try {
    const rules = await leaveService.getLeaveRules();
    res.json({ rules });
  } catch (error: any) {
    res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
};

export const applyLeave = async (req: AuthRequest, res: Response) => {
  try {
    const result = await leaveService.applyLeave(req.user!.id, req.body);
    res.status(201).json(result);
  } catch (error: any) {
    console.error('Apply leave error:', error);
    console.error('Error stack:', error.stack);
    console.error('Request body:', req.body);
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
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const status = req.query.status as string | undefined;
    
    const result = await leaveService.getMyLeaveRequests(req.user!.id, page, limit, status, req.user!.role);
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

export const getPendingRequests = async (req: AuthRequest, res: Response) => {
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

export const approveLeave = async (req: AuthRequest, res: Response) => {
  console.log(`[CONTROLLER START] approveLeave - Params:`, req.params, `Body:`, req.body, `User:`, req.user?.id);
  logger.info(`[CONTROLLER] approveLeave called - Leave ID: ${req.params.id}, User ID: ${req.user!.id}, Role: ${req.user!.role}`);
  try {
    const leaveRequestId = parseInt(req.params.id);
    const { comment } = req.body;
    
    const result = await leaveService.approveLeave(
      leaveRequestId,
      req.user!.id,
      req.user!.role,
      comment
    );
    res.json(result);
  } catch (error: any) {
    res.status(400).json({
      error: {
        code: 'APPROVAL_ERROR',
        message: error.message
      }
    });
  }
};

export const rejectLeave = async (req: AuthRequest, res: Response) => {
  console.log(`[CONTROLLER START] rejectLeave - Params:`, req.params, `Body:`, req.body, `User:`, req.user?.id);
  logger.info(`[CONTROLLER] rejectLeave called - Leave ID: ${req.params.id}, User ID: ${req.user!.id}, Role: ${req.user!.role}`);
  try {
    const leaveRequestId = parseInt(req.params.id);
    const { comment } = req.body;
    
    if (!comment) {
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
    res.json(result);
  } catch (error: any) {
    res.status(400).json({
      error: {
        code: 'REJECTION_ERROR',
        message: error.message
      }
    });
  }
};

export const approveLeaveDay = async (req: AuthRequest, res: Response) => {
  console.log(`[CONTROLLER START] approveLeaveDay - Params:`, req.params, `Body:`, req.body, `User:`, req.user?.id);
  logger.info(`[CONTROLLER] approveLeaveDay called - Leave ID: ${req.params.id}, Day ID: ${req.params.dayId}, User ID: ${req.user!.id}, Role: ${req.user!.role}`);
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
    res.json(result);
  } catch (error: any) {
    res.status(400).json({
      error: {
        code: 'APPROVAL_ERROR',
        message: error.message
      }
    });
  }
};

export const approveLeaveDays = async (req: AuthRequest, res: Response) => {
  console.log(`[CONTROLLER START] approveLeaveDays - Params:`, req.params, `Body:`, req.body, `User:`, req.user?.id);
  logger.info(`[CONTROLLER] approveLeaveDays called - Leave ID: ${req.params.id}, Day IDs: ${req.body.dayIds?.join(', ') || 'none'}, User ID: ${req.user!.id}, Role: ${req.user!.role}`);
  try {
    const leaveRequestId = parseInt(req.params.id);
    const { dayIds, comment } = req.body;
    
    if (!dayIds || !Array.isArray(dayIds) || dayIds.length === 0) {
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
    res.json(result);
  } catch (error: any) {
    res.status(400).json({
      error: {
        code: 'APPROVAL_ERROR',
        message: error.message
      }
    });
  }
};

export const rejectLeaveDay = async (req: AuthRequest, res: Response) => {
  console.log(`[CONTROLLER START] rejectLeaveDay - Params:`, req.params, `Body:`, req.body, `User:`, req.user?.id);
  logger.info(`[CONTROLLER] rejectLeaveDay called - Leave ID: ${req.params.id}, Day ID: ${req.params.dayId}, User ID: ${req.user!.id}, Role: ${req.user!.role}`);
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
    res.json(result);
  } catch (error: any) {
    res.status(400).json({
      error: {
        code: 'REJECTION_ERROR',
        message: error.message
      }
    });
  }
};

export const getApprovedLeaves = async (req: AuthRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    
    const result = await leaveService.getApprovedLeaves(page, limit, req.user!.role);
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

export const updateLeaveStatus = async (req: AuthRequest, res: Response) => {
  try {
    const leaveRequestId = parseInt(req.params.id);
    const { status, dayIds, rejectReason, leaveReason } = req.body;
    
    if (!status) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Status is required'
        }
      });
    }

    if (!['approved', 'rejected', 'partially_approved'].includes(status)) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid status. Must be approved, rejected, or partially_approved'
        }
      });
    }

    if (status === 'partially_approved' && (!dayIds || !Array.isArray(dayIds) || dayIds.length === 0)) {
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
    res.json(result);
  } catch (error: any) {
    res.status(400).json({
      error: {
        code: 'UPDATE_STATUS_ERROR',
        message: error.message
      }
    });
  }
};

export const getLeaveRequest = async (req: AuthRequest, res: Response) => {
  try {
    const requestId = parseInt(req.params.id);
    if (isNaN(requestId)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_REQUEST_ID',
          message: 'Invalid leave request ID'
        }
      });
    }
    const result = await leaveService.getLeaveRequestById(requestId, req.user!.id, req.user!.role);
    res.json(result);
  } catch (error: any) {
    res.status(error.message.includes('not found') || error.message.includes('permission') ? 404 : 400).json({
      error: {
        code: 'NOT_FOUND',
        message: error.message
      }
    });
  }
};

export const updateLeaveRequest = async (req: AuthRequest, res: Response) => {
  try {
    const requestId = parseInt(req.params.id);
    const result = await leaveService.updateLeaveRequest(requestId, req.user!.id, req.user!.role, req.body);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({
      error: {
        code: 'UPDATE_FAILED',
        message: error.message
      }
    });
  }
};

export const deleteLeaveRequest = async (req: AuthRequest, res: Response) => {
  try {
    const requestId = parseInt(req.params.id);
    const result = await leaveService.deleteLeaveRequest(requestId, req.user!.id, req.user!.role);
    res.json(result);
  } catch (error: any) {
    res.status(error.message.includes('not found') || error.message.includes('permission') ? 404 : 400).json({
      error: {
        code: 'DELETE_FAILED',
        message: error.message
      }
    });
  }
};

