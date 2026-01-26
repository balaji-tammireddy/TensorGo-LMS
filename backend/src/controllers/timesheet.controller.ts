import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { TimesheetService } from '../services/timesheet.service';
import { logger } from '../utils/logger';

export const saveEntry = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        // Basic payload validation
        const { id, project_id, module_id, task_id, activity_id, log_date, duration, description, work_status } = req.body;

        if (!project_id || !module_id || !task_id || !activity_id || !log_date || !duration || !description || !work_status) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        const entry = await TimesheetService.upsertEntry(userId, {
            id,
            user_id: userId,
            project_id,
            module_id,
            task_id,
            activity_id,
            log_date,
            duration,
            description,
            work_status
        });

        res.json(entry);
    } catch (error: any) {
        logger.error('[TimeSheet] Save Error:', error);
        res.status(500).json({ error: error.message });
    }
};

export const deleteEntry = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        const { id } = req.params;

        await TimesheetService.deleteEntry(userId, parseInt(id));
        res.json({ success: true });
    } catch (error: any) {
        logger.error('[TimeSheet] Delete Error:', error);
        res.status(500).json({ error: error.message });
    }
};

export const getWeeklyEntries = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        console.log(`[TimesheetController] getWeeklyEntries called by user ${userId}`);

        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const { start_date, end_date } = req.query;
        console.log(`[TimesheetController] params: start=${start_date}, end=${end_date}`);

        if (!start_date || !end_date) {
            return res.status(400).json({ error: 'Start and End date required' });
        }

        const entries = await TimesheetService.getEntriesForWeek(userId, String(start_date), String(end_date));
        console.log(`[TimesheetController] found ${entries.length} entries`);
        res.json(entries);
    } catch (error: any) {
        logger.error('[TimeSheet] Get Weekly Error:', error);
        res.status(500).json({ error: error.message });
    }
};

export const getTeamStatus = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        const role = req.user?.role;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        // Access: Manager, HR, Super Admin
        if (role !== 'manager' && role !== 'hr' && role !== 'super_admin') {
            return res.status(403).json({ error: 'Access denied' });
        }

        const { start_date, end_date } = req.query;
        if (!start_date || !end_date) return res.status(400).json({ error: 'Date range required' });

        const data = await TimesheetService.getTeamStatus(userId, role!, String(start_date), String(end_date));
        res.json(data);
    } catch (error: any) {
        logger.error('[TimeSheet] Team Status Error:', error);
        res.status(500).json({ error: error.message });
    }
};

export const getMemberWeeklyEntries = async (req: AuthRequest, res: Response) => {
    try {
        const approverId = req.user?.id;
        const { targetUserId } = req.params;
        const { start_date, end_date } = req.query;

        if (!approverId) return res.status(401).json({ error: 'Unauthorized' });

        // Check Permissions
        const isAllowed = await TimesheetService.isManagerOrAdmin(approverId, parseInt(targetUserId));
        if (!isAllowed) return res.status(403).json({ error: 'You are not authorized to view this user\'s timesheet' });

        const entries = await TimesheetService.getEntriesForWeek(parseInt(targetUserId), String(start_date), String(end_date));
        res.json(entries);
    } catch (error: any) {
        logger.error('[TimeSheet] Member Entries Error:', error);
        res.status(500).json({ error: error.message });
    }
};

export const approveTimesheet = async (req: AuthRequest, res: Response) => {
    try {
        const approverId = req.user?.id;
        const { targetUserId, start_date, end_date } = req.body;

        if (!approverId) return res.status(401).json({ error: 'Unauthorized' });

        const isAllowed = await TimesheetService.isManagerOrAdmin(approverId, targetUserId);
        if (!isAllowed) return res.status(403).json({ error: 'Not authorized to approve' });

        await TimesheetService.approveTimesheet(approverId, targetUserId, start_date, end_date);
        res.json({ success: true, message: 'Approved successfully' });
    } catch (error: any) {
        logger.error('[TimeSheet] Approve Error:', error);
        res.status(500).json({ error: error.message });
    }
};

export const rejectEntry = async (req: AuthRequest, res: Response) => {
    try {
        const approverId = req.user?.id;
        const { entryId, reason } = req.body;

        if (!approverId) return res.status(401).json({ error: 'Unauthorized' });
        if (!reason) return res.status(400).json({ error: 'Rejection reason is required' });

        await TimesheetService.rejectTimesheetEntry(approverId, entryId, reason);
        res.json({ success: true, message: 'Rejected successfully' });
    } catch (error: any) {
        logger.error('[TimeSheet] Reject Error:', error);
        res.status(500).json({ error: error.message });
    }
};

export const rejectTimesheet = async (req: AuthRequest, res: Response) => {
    try {
        const approverId = req.user?.id;
        const { targetUserId, start_date, end_date, reason } = req.body;

        if (!approverId) return res.status(401).json({ error: 'Unauthorized' });
        if (!reason) return res.status(400).json({ error: 'Rejection reason is required' });

        const isAllowed = await TimesheetService.isManagerOrAdmin(approverId, targetUserId);
        if (!isAllowed) return res.status(403).json({ error: 'Not authorized to reject' });

        await TimesheetService.rejectTimesheet(approverId, targetUserId, start_date, end_date, reason);
        res.json({ success: true, message: 'Rejected successfully' });
    } catch (error: any) {
        logger.error('[TimeSheet] Reject Bulk Error:', error);
        res.status(500).json({ error: error.message });
    }
};

export const generateReport = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        const role = req.user?.role;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const { projectId, moduleId, startDate, endDate, targetUserId } = req.query;

        const filters: any = {
            startDate: startDate ? String(startDate) : undefined,
            endDate: endDate ? String(endDate) : undefined,
            projectId: projectId ? parseInt(String(projectId)) : undefined,
            moduleId: moduleId ? parseInt(String(moduleId)) : undefined,
            userId: targetUserId ? parseInt(String(targetUserId)) : undefined
        };

        // Scope enforcement
        if (role !== 'super_admin' && role !== 'hr') {
            filters.managerScopeId = userId; // Limit to reportees
        }

        const data = await TimesheetService.getReportData(filters);

        // Return JSON for frontend to parse into CSV/Excel
        res.json(data);
    } catch (error: any) {
        logger.error('[TimeSheet] Report Error:', error);
        res.status(500).json({ error: error.message });
    }
};
