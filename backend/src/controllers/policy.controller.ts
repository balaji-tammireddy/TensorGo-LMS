import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { pool } from '../database/db';
import { logger } from '../utils/logger';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { uploadToOVH, deleteFromOVH, extractKeyFromUrl, getPublicUrlFromOVH, getSignedUrlFromOVH } from '../utils/storage';

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
            const { title, existingUrl } = req.body;

            if (!title) {
                return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Title is required' } });
            }

            if (!req.file && !existingUrl) {
                return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'File or existing URL is required' } });
            }

            let key = '';
            let signedUrl = '';

            if (req.file) {
                localFilePath = req.file.path;
                key = `policies/${req.file.originalname}`;
                logger.info(`[CONTROLLER] [POLICY] [CREATE POLICY] Uploading file to OVH: ${key}`);

                await uploadToOVH(localFilePath, key, req.file.mimetype);

                // Clean up local file immediately after upload
                if (fs.existsSync(localFilePath)) {
                    fs.unlinkSync(localFilePath);
                    localFilePath = null;
                }

                signedUrl = await getSignedUrlFromOVH(key, 3600);
            } else if (existingUrl) {
                logger.info(`[CONTROLLER] [POLICY] [CREATE POLICY] Using existing URL: ${existingUrl}`);
                key = extractKeyFromUrl(existingUrl);

                if (!key) {
                    return res.status(400).json({ error: { code: 'INVALID_URL', message: 'Could not extract key from existing URL' } });
                }

                // Get a fresh signed URL for the existing key
                signedUrl = await getSignedUrlFromOVH(key, 3600);
            }

            const result = await pool.query(
                'INSERT INTO policies (title, s3_key, public_url, created_by, updated_by) VALUES ($1, $2, $3, $4, $4) RETURNING *',
                [title, key, signedUrl, req.user!.id]
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

            const { title } = req.body;

            if (!req.file && !title) {
                return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Title or file is required for update' } });
            }

            // Fetch existing policies for validation
            const policiesResult = await pool.query('SELECT * FROM policies WHERE id != $1', [policyId]);
            if (title) {
                const titleExists = policiesResult.rows.some((p: any) => p.title.toLowerCase().trim() === title.toLowerCase().trim());
                if (titleExists) {
                    if (req.file) {
                        localFilePath = req.file.path;
                        if (fs.existsSync(localFilePath)) fs.unlinkSync(localFilePath);
                    }
                    return res.status(400).json({ error: { code: 'DUPLICATE_TITLE', message: 'A policy with this name already exists' } });
                }
            }

            // Fetch policy to update
            const policyResult = await pool.query('SELECT * FROM policies WHERE id = $1', [policyId]);
            if (policyResult.rows.length === 0) {
                if (req.file) {
                    localFilePath = req.file.path;
                    if (fs.existsSync(localFilePath)) fs.unlinkSync(localFilePath);
                }
                return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Policy not found' } });
            }
            const oldPolicy = policyResult.rows[0];

            let key = oldPolicy.s3_key;
            let signedUrl = oldPolicy.public_url;

            if (req.file) {
                localFilePath = req.file.path;
                key = `policies/${req.file.originalname}`;
                logger.info(`[CONTROLLER] [POLICY] [UPDATE POLICY] Uploading new file to OVH: ${key}`);

                await uploadToOVH(localFilePath, key, req.file.mimetype);

                // Clean up local file
                if (fs.existsSync(localFilePath)) {
                    fs.unlinkSync(localFilePath);
                    localFilePath = null;
                }

                // Delete old file if different and exists
                if (oldPolicy.s3_key && oldPolicy.s3_key !== key) {
                    try {
                        await deleteFromOVH(oldPolicy.s3_key);
                    } catch (delError) {
                        logger.warn(`[CONTROLLER] [POLICY] [UPDATE POLICY] Failed to delete old file (non-critical):`, delError);
                    }
                }

                // Get new signed URL
                signedUrl = await getSignedUrlFromOVH(key, 3600);
            }

            const updateQuery = `
                UPDATE policies 
                SET title = COALESCE($1, title), 
                    s3_key = $2, 
                    public_url = $3, 
                    updated_at = CURRENT_TIMESTAMP,
                    updated_by = $5
                WHERE id = $4 
                RETURNING *
            `;

            const updateResult = await pool.query(updateQuery, [title || null, key, signedUrl, policyId, req.user!.id]);

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
