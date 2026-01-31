import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { TimesheetService } from '../services/timesheet.service';
import { logger } from '../utils/logger';
import { pool } from '../database/db';

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
        const approverRole = req.user?.role;
        const { targetUserId: targetUserIdStr } = req.params;
        const { start_date, end_date } = req.query;

        if (!approverId) return res.status(401).json({ error: 'Unauthorized' });

        const targetUserId = parseInt(targetUserIdStr);
        if (isNaN(targetUserId)) {
            return res.status(400).json({ error: 'Invalid user ID' });
        }

        // --- Permissions ---
        // 1. Always allow viewing your own timesheet
        const isSelf = approverId === targetUserId;
        if (isSelf) {
            const entries = await TimesheetService.getEntriesForWeek(targetUserId, String(start_date || ''), String(end_date || ''));
            return res.json(entries);
        }

        // 2. HR and Super Admin can view all users' timesheets
        const isHROrAdmin = approverRole === 'hr' || approverRole === 'super_admin';
        if (isHROrAdmin) {
            const entries = await TimesheetService.getEntriesForWeek(targetUserId, String(start_date || ''), String(end_date || ''));
            return res.json(entries);
        }

        // 3. Managers: Check if they manage this user
        const isAllowed = await TimesheetService.isManagerOrAdmin(approverId, targetUserId);
        if (!isAllowed) {
            logger.warn(`[TimeSheet] Unauthorized view attempt by user ${approverId} for member ${targetUserId}`);
            return res.status(403).json({ error: 'You are not authorized to view this user\'s timesheet' });
        }

        const entries = await TimesheetService.getEntriesForWeek(targetUserId, String(start_date || ''), String(end_date || ''));
        res.json(entries);
    } catch (error: any) {
        logger.error('[TimeSheet] Member Entries Error:', error);
        res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
};

export const approveEntry = async (req: AuthRequest, res: Response) => {
    try {
        const approverId = req.user?.id;
        const { entryId } = req.body;

        if (!approverId) return res.status(401).json({ error: 'Unauthorized' });
        if (!entryId) return res.status(400).json({ error: 'Entry ID is required' });

        await TimesheetService.approveTimesheetEntry(approverId, entryId);
        res.json({ success: true, message: 'Entry approved successfully' });
    } catch (error: any) {
        logger.error('[TimeSheet] Approve Entry Error:', error);
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

export const manualSubmit = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        const { start_date, end_date } = req.body;

        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        if (!start_date || !end_date) return res.status(400).json({ error: 'Date range required' });

        await TimesheetService.manualSubmitTimesheet(userId, start_date, end_date);
        res.json({ success: true, message: 'Timesheet submitted successfully' });
    } catch (error: any) {
        logger.error('[TimeSheet] Manual Submit Error:', error);
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

        const { projectId, moduleId, taskId, activityId, startDate, endDate, targetUserId } = req.query;

        const filters: any = {
            startDate: startDate ? String(startDate) : undefined,
            endDate: endDate ? String(endDate) : undefined,
            projectId: projectId ? parseInt(String(projectId)) : undefined,
            moduleId: moduleId ? parseInt(String(moduleId)) : undefined,
            taskId: taskId ? parseInt(String(taskId)) : undefined,
            activityId: activityId ? parseInt(String(activityId)) : undefined,
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

export const generatePDFReport = async (req: AuthRequest, res: Response) => {
    try {
        const { id: userId, role, name: userName } = req.user!;
        const queryParams = { ...req.query } as any;

        logger.info(`[Timesheet Report] Generating PDF report. User: ${userId}, Role: ${role}, Filters: ${JSON.stringify(queryParams)}`);

        const filters: any = {
            startDate: queryParams.startDate ? String(queryParams.startDate) : undefined,
            endDate: queryParams.endDate ? String(queryParams.endDate) : undefined,
            projectId: queryParams.projectId ? parseInt(String(queryParams.projectId)) : undefined,
            moduleId: queryParams.moduleId ? parseInt(String(queryParams.moduleId)) : undefined,
            taskId: queryParams.taskId ? parseInt(String(queryParams.taskId)) : undefined,
            activityId: queryParams.activityId ? parseInt(String(queryParams.activityId)) : undefined,
            userId: queryParams.employeeId ? parseInt(String(queryParams.employeeId)) : undefined
        };

        if (role !== 'super_admin' && role !== 'hr') {
            filters.managerScopeId = userId;
            logger.info(`[Timesheet Report] Limiting scope to manager: ${userId}`);
        }

        const filterNames: any = {
            startDate: filters.startDate,
            endDate: filters.endDate
        };

        if (filters.userId) {
            const userRes = await pool.query('SELECT first_name, last_name, official_email FROM users WHERE id = $1', [filters.userId]);
            if (userRes.rows.length === 0) {
                logger.warn(`[Timesheet Report] Target user ${filters.userId} not found`);
                return res.status(404).json({ error: 'Target user not found' });
            }
            filterNames.employeeName = `${userRes.rows[0].first_name} ${userRes.rows[0].last_name}`;
            logger.info(`[Timesheet Report] Generating report for user: ${filterNames.employeeName}`);
        }

        const reportData = await TimesheetService.getReportData(filters);
        logger.info(`[Timesheet Report] Data fetched. Rows: ${reportData.length}`);

        if (reportData.length === 0) {
            logger.warn('[Timesheet Report] No entries found for selected filters');
            return res.status(404).json({ error: 'No timesheet entries found for the selected criteria' });
        }

        if (filters.projectId) {
            const projRes = await pool.query('SELECT name FROM projects WHERE id = $1', [filters.projectId]);
            if (projRes.rows.length > 0) filterNames.projectName = projRes.rows[0].name;
        }
        if (filters.moduleId) {
            const modRes = await pool.query('SELECT name FROM project_modules WHERE id = $1', [filters.moduleId]);
            if (modRes.rows.length > 0) filterNames.moduleName = modRes.rows[0].name;
        }
        if (filters.taskId) {
            const taskRes = await pool.query('SELECT name FROM project_tasks WHERE id = $1', [filters.taskId]);
            if (taskRes.rows.length > 0) filterNames.taskName = taskRes.rows[0].name;
        }
        if (filters.activityId) {
            const actRes = await pool.query('SELECT name FROM project_activities WHERE id = $1', [filters.activityId]);
            if (actRes.rows.length > 0) filterNames.activityName = actRes.rows[0].name;
        }

        const { generateTimesheetPDF } = await import('../utils/pdfGenerator');

        const pdfBuffer = await generateTimesheetPDF({
            entries: reportData,
            filters: filterNames,
            generatedBy: userName || 'Manager',
            generatedAt: new Date().toISOString()
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=timesheet-report-${new Date().toISOString().split('T')[0]}.pdf`);
        res.setHeader('Content-Length', pdfBuffer.length);

        res.send(pdfBuffer);
        logger.info('[Timesheet Report] PDF report sent to client');

    } catch (error: any) {
        logger.error('[Timesheet Report] Controller Error:', error);
        res.status(500).json({ error: error.message });
    }
};
