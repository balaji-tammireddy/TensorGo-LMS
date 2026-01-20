import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { pool } from '../database/db';
import { logger } from '../utils/logger';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { uploadToOVH, deleteFromOVH, getPublicUrlFromOVH, getSignedUrlFromOVH } from '../utils/storage';

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = process.env.UPLOAD_DIR || './uploads';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req: Request, file, cb) => {
        // Keep original filename but prepend timestamp to avoid collisions locally
        const uniqueSuffix = Date.now();
        cb(null, `${uniqueSuffix}-${file.originalname}`);
    }
});

const upload = multer({
    storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed'));
        }
    }
});

export const getPolicies = async (req: Request, res: Response) => {
    logger.info(`[CONTROLLER] [POLICY] [GET POLICIES] Request received`);
    try {
        const result = await pool.query('SELECT * FROM policies ORDER BY id ASC');

        // Generate fresh signed URLs for all policies to ensure they are accessible
        const policiesWithUrls = await Promise.all(result.rows.map(async (policy) => {
            if (policy.s3_key) {
                try {
                    // Use a 1-hour expiration for the signed URL
                    const signedUrl = await getSignedUrlFromOVH(policy.s3_key, 3600);
                    return { ...policy, public_url: signedUrl };
                } catch (urlError) {
                    logger.error(`[CONTROLLER] [POLICY] [GET POLICIES] Failed to sign URL for ${policy.s3_key}:`, urlError);
                    return policy;
                }
            }
            return policy;
        }));

        res.json(policiesWithUrls);
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

export const createPolicy = [
    upload.single('file'),
    async (req: AuthRequest, res: Response) => {
        logger.info(`[CONTROLLER] [POLICY] [CREATE POLICY] Request received`);
        let localFilePath: string | null = null;
        try {
            const { title } = req.body;
            if (!req.file || !title) {
                return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Title and file are required' } });
            }

            localFilePath = req.file.path;
            const key = `policies/${req.file.originalname}`;
            logger.info(`[CONTROLLER] [POLICY] [CREATE POLICY] Uploading file to OVH: ${key}`);

            await uploadToOVH(localFilePath, key, req.file.mimetype);

            // Clean up local file immediately after upload
            if (fs.existsSync(localFilePath)) {
                fs.unlinkSync(localFilePath);
                localFilePath = null;
            }

            const signedUrl = await getSignedUrlFromOVH(key, 3600);
            const result = await pool.query(
                'INSERT INTO policies (title, s3_key, public_url) VALUES ($1, $2, $3) RETURNING *',
                [title, key, signedUrl]
            );

            logger.info(`[CONTROLLER] [POLICY] [CREATE POLICY] Policy created successfully`);
            res.status(201).json(result.rows[0]);
        } catch (error: any) {
            // Cleanup local file if error occurred mid-process
            if (localFilePath && fs.existsSync(localFilePath)) {
                try {
                    fs.unlinkSync(localFilePath);
                } catch (cleanupError) {
                    logger.error(`[CONTROLLER] [POLICY] [CREATE POLICY] Failed to cleanup local file:`, cleanupError);
                }
            }
            logger.error(`[CONTROLLER] [POLICY] [CREATE POLICY] Error:`, error);
            res.status(500).json({ error: { code: 'SERVER_ERROR', message: error.message } });
        }
    }
];

export const updatePolicy = [
    upload.single('file'),
    async (req: AuthRequest, res: Response) => {
        const policyId = req.params.id;
        logger.info(`[CONTROLLER] [POLICY] [UPDATE POLICY] Request received for Policy ID: ${policyId}`);
        let localFilePath: string | null = null;

        try {
            // Validate ID is a number to prevent DB crash (default policies have string IDs)
            if (isNaN(Number(policyId))) {
                if (req.file) {
                    localFilePath = req.file.path;
                    if (fs.existsSync(localFilePath)) fs.unlinkSync(localFilePath);
                }
                return res.status(400).json({ error: { code: 'INVALID_ID', message: 'Default policies cannot be edited directly. Please upload a new policy.' } });
            }

            if (!req.file) {
                return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'No file uploaded' } });
            }

            localFilePath = req.file.path;

            // Fetch existing policy for old key
            const policyResult = await pool.query('SELECT * FROM policies WHERE id = $1', [policyId]);
            if (policyResult.rows.length === 0) {
                if (localFilePath && fs.existsSync(localFilePath)) fs.unlinkSync(localFilePath);
                return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Policy not found' } });
            }
            const oldPolicy = policyResult.rows[0];

            const key = `policies/${req.file.originalname}`;
            logger.info(`[CONTROLLER] [POLICY] [UPDATE POLICY] Uploading new file to OVH: ${key}`);

            await uploadToOVH(localFilePath, key, req.file.mimetype);

            // Clean up local file
            if (fs.existsSync(localFilePath)) {
                fs.unlinkSync(localFilePath);
                localFilePath = null;
            }

            // Delete old file if different
            if (oldPolicy.s3_key && oldPolicy.s3_key !== key) {
                try {
                    await deleteFromOVH(oldPolicy.s3_key);
                } catch (delError) {
                    logger.warn(`[CONTROLLER] [POLICY] [UPDATE POLICY] Failed to delete old file (non-critical):`, delError);
                }
            }

            const signedUrl = await getSignedUrlFromOVH(key, 3600);
            const updateResult = await pool.query(
                'UPDATE policies SET s3_key = $1, public_url = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *',
                [key, signedUrl, policyId]
            );

            logger.info(`[CONTROLLER] [POLICY] [UPDATE POLICY] Policy updated successfully`);
            res.json(updateResult.rows[0]);

        } catch (error: any) {
            if (localFilePath && fs.existsSync(localFilePath)) {
                try {
                    fs.unlinkSync(localFilePath);
                } catch (cleanupError) {
                    logger.error(`[CONTROLLER] [POLICY] [UPDATE POLICY] Failed to cleanup local file:`, cleanupError);
                }
            }
            logger.error(`[CONTROLLER] [POLICY] [UPDATE POLICY] Error:`, error);
            res.status(500).json({ error: { code: 'SERVER_ERROR', message: error.message } });
        }
    }
];

export const deletePolicy = async (req: AuthRequest, res: Response) => {
    const policyId = req.params.id;
    logger.info(`[CONTROLLER] [POLICY] [DELETE POLICY] Request received for Policy ID: ${policyId}`);

    try {
        // Validate ID is a number to prevent DB crash
        if (isNaN(Number(policyId))) {
            return res.status(400).json({ error: { code: 'INVALID_ID', message: 'Default policies cannot be deleted.' } });
        }
        const policyResult = await pool.query('SELECT * FROM policies WHERE id = $1', [policyId]);
        if (policyResult.rows.length === 0) {
            return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Policy not found' } });
        }
        const policy = policyResult.rows[0];

        if (policy.s3_key) {
            try {
                await deleteFromOVH(policy.s3_key);
            } catch (delError) {
                logger.warn(`[CONTROLLER] [POLICY] [DELETE POLICY] Failed to delete file from OVH (non-critical):`, delError);
            }
        }

        await pool.query('DELETE FROM policies WHERE id = $1', [policyId]);
        logger.info(`[CONTROLLER] [POLICY] [DELETE POLICY] Policy deleted successfully`);
        res.json({ message: 'Policy deleted successfully' });

    } catch (error: any) {
        logger.error(`[CONTROLLER] [POLICY] [DELETE POLICY] Error:`, error);
        res.status(500).json({ error: { code: 'SERVER_ERROR', message: error.message } });
    }
};
