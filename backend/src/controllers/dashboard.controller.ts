import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { pool } from '../database/db';
import { logger } from '../utils/logger';
import { getPublicUrlFromOVH } from '../utils/storage';

export const getStats = async (req: AuthRequest, res: Response) => {
    logger.info(`[CONTROLLER] [DASHBOARD] [GET STATS] ========== REQUEST RECEIVED ==========`);
    try {
        // Count users by role, excluding inactive/resigned/terminated if desired,
        // or just showing all "active" employees in the broader sense.
        // Usually dashboards show current workforce.
        const query = `
      SELECT user_role as role, COUNT(*) as count
      FROM users
      WHERE status IN ('active', 'on_leave', 'on_notice')
      GROUP BY user_role
    `;

        const result = await pool.query(query);

        // Format result into a simple object: { employee: 10, manager: 5, ... }
        const stats: Record<string, number> = {};
        let total = 0;

        result.rows.forEach((row: any) => {
            const count = parseInt(row.count, 10);
            stats[row.role] = count;
            total += count;
        });

        res.json({
            success: true,
            data: {
                total,
                breakdown: stats
            }
        });
    } catch (error: any) {
        logger.error(`[CONTROLLER] [DASHBOARD] [GET STATS] Error:`, error);
        res.status(500).json({
            error: {
                code: 'SERVER_ERROR',
                message: error.message || 'Failed to fetch dashboard stats'
            }
        });
    }
};

export const getHierarchy = async (req: AuthRequest, res: Response) => {
    logger.info(`[CONTROLLER] [DASHBOARD] [GET HIERARCHY] ========== REQUEST RECEIVED ==========`);
    try {
        // Fetch all active users for the tree
        const query = `
      SELECT 
        id, 
        first_name || ' ' || COALESCE(last_name, '') as name,
        user_role as role,
        designation,
        reporting_manager_id,
        profile_photo_url,
        status as status,
        emp_id
      FROM users
      WHERE status IN ('active', 'on_leave', 'on_notice')
      ORDER BY user_role = 'super_admin' DESC, first_name ASC
    `;

        const result = await pool.query(query);

        const rows = result.rows.map((row: any) => {
            if (row.profile_photo_url && row.profile_photo_url.startsWith('profile-photos/')) {
                row.profile_photo_url = getPublicUrlFromOVH(row.profile_photo_url);
            }
            return row;
        });

        res.json({
            success: true,
            data: rows
        });
    } catch (error: any) {
        logger.error(`[CONTROLLER] [DASHBOARD] [GET HIERARCHY] Error:`, error);
        res.status(500).json({
            error: {
                code: 'SERVER_ERROR',
                message: error.message || 'Failed to fetch hierarchy data'
            }
        });
    }
};

export const getUserDashboardDetails = async (req: AuthRequest, res: Response) => {
    const userId = req.params.id;
    logger.info(`[CONTROLLER] [DASHBOARD] [GET USER DETAILS] ID: ${userId}`);

    try {
        // 1. Get Leave Balances
        const balanceQuery = `
        SELECT casual_balance, sick_balance, lop_balance
        FROM leave_balances
        WHERE employee_id = $1
      `;
        const balanceResult = await pool.query(balanceQuery, [userId]);

        res.json({
            success: true,
            data: {
                balances: balanceResult.rows[0] || { casual_balance: 0, sick_balance: 0, lop_balance: 0 }
            }
        });
    } catch (error: any) {
        logger.error(`[CONTROLLER] [DASHBOARD] [GET USER DETAILS] Error:`, error);
        res.status(500).json({
            error: {
                code: 'SERVER_ERROR',
                message: error.message || 'Failed to fetch user details'
            }
        });
    }
};

export const getAnalytics = async (req: AuthRequest, res: Response) => {
    logger.info(`[CONTROLLER] [DASHBOARD] [GET ANALYTICS] ========== REQUEST RECEIVED ==========`);
    try {
        // 1. Weekly Time Logged (Previous Week: Monday to Sunday)
        // Calculate Previous Week Date Range
        const today = new Date();
        const currentDay = today.getDay(); // 0 = Sunday
        const diffToMon = today.getDate() - currentDay + (currentDay === 0 ? -6 : 1);
        const currentMon = new Date(today);
        currentMon.setDate(diffToMon);

        const lastWeekMon = new Date(currentMon);
        lastWeekMon.setDate(lastWeekMon.getDate() - 7);
        lastWeekMon.setHours(0, 0, 0, 0);

        const lastWeekSun = new Date(lastWeekMon);
        lastWeekSun.setDate(lastWeekSun.getDate() + 6);
        lastWeekSun.setHours(23, 59, 59, 999);

        // Format for SQL
        const startDateStr = lastWeekMon.toISOString().split('T')[0];
        const endDateStr = lastWeekSun.toISOString().split('T')[0];

        const weeklyTimeQuery = `
            WITH user_status AS (
                SELECT 
                    u.id,
                    CASE 
                        WHEN COUNT(pe.id) = 0 THEN 'not_submitted'
                        WHEN COUNT(CASE WHEN pe.log_status = 'rejected' THEN 1 END) > 0 THEN 'rejected'
                        WHEN COUNT(CASE WHEN pe.log_status = 'draft' THEN 1 END) > 0 THEN 'not_submitted'
                        WHEN COUNT(CASE WHEN pe.is_late = true THEN 1 END) > 0 THEN 'late'
                        WHEN COUNT(CASE WHEN pe.log_status = 'submitted' THEN 1 END) > 0 THEN 'submitted'
                        ELSE 'approved'
                    END as status
                FROM users u
                LEFT JOIN project_entries pe ON u.id = pe.user_id AND pe.log_date >= '${startDateStr}' AND pe.log_date <= '${endDateStr}'
                WHERE u.user_role != 'super_admin' 
                  AND u.status IN ('active', 'on_leave', 'on_notice')
                GROUP BY u.id
            )
            SELECT 
                'Total Users' as name,
                '${startDateStr} - ${endDateStr}' as date_range,
                COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved,
                COUNT(CASE WHEN status = 'submitted' THEN 1 END) as submitted,
                COUNT(CASE WHEN status = 'late' THEN 1 END) as late,
                COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected,
                COUNT(CASE WHEN status = 'not_submitted' THEN 1 END) as not_submitted
            FROM user_status
        `;

        // 2. Work Status Stats (Approved entries only)
        // We use a CTE to define all possible statuses so we get 0 counts for missing ones
        const workStatusQuery = `
            WITH all_statuses AS (
                SELECT unnest(ARRAY['not_applicable', 'in_progress', 'closed', 'differed', 'review', 'testing', 'fixed']) as status
            )
            SELECT 
                s.status as work_status,
                COUNT(pe.id)::INT as count
            FROM all_statuses s
            LEFT JOIN project_entries pe ON pe.work_status = s.status AND pe.log_status = 'approved'
            GROUP BY s.status
            ORDER BY s.status
        `;

        // 3. Employees On Leave Today
        const leavesTodayQuery = `
            SELECT 
                u.id,
                u.first_name || ' ' || COALESCE(u.last_name, '') as name,
                u.emp_id,
                u.profile_photo_url,
                ld.day_type,
                ld.leave_type
            FROM leave_days ld
            JOIN users u ON ld.employee_id = u.id
            JOIN leave_requests lr ON ld.leave_request_id = lr.id
            WHERE ld.leave_date = CURRENT_DATE
              AND lr.current_status = 'approved'
            ORDER BY u.first_name ASC
        `;

        const [weeklyTime, workStatus, leavesToday] = await Promise.all([
            pool.query(weeklyTimeQuery),
            pool.query(workStatusQuery),
            pool.query(leavesTodayQuery)
        ]);

        // Process profile photo URLs for leavesToday
        const leavesTodayProcessed = leavesToday.rows.map((row: any) => {
            if (row.profile_photo_url && row.profile_photo_url.startsWith('profile-photos/')) {
                row.profile_photo_url = getPublicUrlFromOVH(row.profile_photo_url);
            }
            return row;
        });

        res.json({
            success: true,
            data: {
                weeklyTime: weeklyTime.rows,
                workStatus: workStatus.rows,
                leavesToday: leavesTodayProcessed
            }
        });
    } catch (error: any) {
        logger.error(`[CONTROLLER] [DASHBOARD] [GET ANALYTICS] Error:`, error);
        res.status(500).json({
            error: {
                code: 'SERVER_ERROR',
                message: error.message || 'Failed to fetch analytics data'
            }
        });
    }
};
