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
      WHERE user_status IN ('active', 'on_leave', 'on_notice')
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
        user_status as status,
        emp_id
      FROM users
      WHERE user_status IN ('active', 'on_leave', 'on_notice')
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
