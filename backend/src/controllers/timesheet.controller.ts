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
