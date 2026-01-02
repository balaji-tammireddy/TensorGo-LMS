import { Request, Response } from 'express';
import { pool } from '../database/db';
import { logger } from '../utils/logger';

export const getPolicies = async (req: Request, res: Response) => {
    logger.info(`[CONTROLLER] [POLICY] [GET POLICIES] Request received`);
    try {
        const result = await pool.query('SELECT * FROM policies ORDER BY title ASC');
        res.json(result.rows);
    } catch (error: any) {
        logger.error(`[CONTROLLER] [POLICY] [GET POLICIES] Error:`, error);
        res.status(500).json({
            error: {
                code: 'SERVER_ERROR',
                message: error.message
            }
        });
    }
};
