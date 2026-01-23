import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import * as profileService from '../services/profile.service';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { logger } from '../utils/logger';
import { uploadToOVH, deleteFromOVH, extractKeyFromUrl, getSignedUrlFromOVH, getPublicUrlFromOVH } from '../utils/storage';
import { pool } from '../database/db';

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = process.env.UPLOAD_DIR || './uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req: AuthRequest, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `profile-${req.user!.id}-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '5242880') // 5MB default
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

export const getProfile = async (req: AuthRequest, res: Response) => {
  logger.info(`[CONTROLLER] [PROFILE] [GET PROFILE] ========== REQUEST RECEIVED ==========`);
  logger.info(`[CONTROLLER] [PROFILE] [GET PROFILE] User ID: ${req.user!.id}`);

  try {
    const profile = await profileService.getProfile(req.user!.id);
    logger.info(`[CONTROLLER] [PROFILE] [GET PROFILE] Profile retrieved successfully - User ID: ${req.user!.id}`);
    res.json(profile);
  } catch (error: any) {
    logger.error(`[CONTROLLER] [PROFILE] [GET PROFILE] Error:`, error);
    res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: error.message
      }
    });
  }
};

export const updateProfile = async (req: AuthRequest, res: Response) => {
  logger.info(`[CONTROLLER] [PROFILE] [UPDATE PROFILE] ========== REQUEST RECEIVED ==========`);
  logger.info(`[CONTROLLER] [PROFILE] [UPDATE PROFILE] User ID: ${req.user!.id}, Sections: ${Object.keys(req.body).join(', ')}`);

  try {
    const result = await profileService.updateProfile(req.user!.id, req.body, req.user!.role, req.user!.id);
    logger.info(`[CONTROLLER] [PROFILE] [UPDATE PROFILE] Profile updated successfully - User ID: ${req.user!.id}`);
    res.json(result);
  } catch (error: any) {
    logger.error(`[CONTROLLER] [PROFILE] [UPDATE PROFILE] Error:`, error);
    res.status(400).json({
      error: {
        code: 'UPDATE_ERROR',
        message: error.message
      }
    });
  }
};

export const uploadPhoto = [
  upload.single('photo'),
  async (req: AuthRequest, res: Response) => {
    logger.info(`[CONTROLLER] [PROFILE] [UPLOAD PHOTO] ========== REQUEST RECEIVED ==========`);
    logger.info(`[CONTROLLER] [PROFILE] [UPLOAD PHOTO] User ID: ${req.user!.id}, File: ${req.file?.originalname || 'none'}`);

    let localFilePath: string | null = null;

    try {
      if (!req.file) {
        logger.warn(`[CONTROLLER] [PROFILE] [UPLOAD PHOTO] No file uploaded`);
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'No file uploaded'
          }
        });
      }

      localFilePath = req.file.path;

      // OVHcloud is required - no local fallback
      if (!process.env.OVH_ACCESS_KEY || !process.env.OVH_SECRET_KEY || !process.env.OVH_BUCKET_NAME) {
        throw new Error('OVHcloud configuration is required. Please configure OVH_ACCESS_KEY, OVH_SECRET_KEY, and OVH_BUCKET_NAME environment variables.');
      }

      // Upload to OVHcloud bucket - returns key, not URL
      const key = `profile-photos/${req.user!.id}/${req.file.filename}`;
      const photoKey = await uploadToOVH(localFilePath, key, req.file.mimetype);

      // Delete local file after successful upload
      try {
        fs.unlinkSync(localFilePath);
        logger.info(`[CONTROLLER] [PROFILE] [UPLOAD PHOTO] Local file deleted: ${localFilePath}`);
      } catch (deleteError: any) {
        logger.warn(`[CONTROLLER] [PROFILE] [UPLOAD PHOTO] Failed to delete local file: ${deleteError.message}`);
      }

      // Store only the key in database (not URL)
      const result = await profileService.updateProfilePhoto(req.user!.id, photoKey, req.user!.id);
      logger.info(`[CONTROLLER] [PROFILE] [UPLOAD PHOTO] Photo uploaded successfully - User ID: ${req.user!.id}, Photo Key: ${photoKey}`);
      res.json(result);
    } catch (error: any) {
      // Clean up local file if upload failed
      if (localFilePath && fs.existsSync(localFilePath)) {
        try {
          fs.unlinkSync(localFilePath);
          logger.info(`[CONTROLLER] [PROFILE] [UPLOAD PHOTO] Cleaned up local file after error: ${localFilePath}`);
        } catch (deleteError: any) {
          logger.warn(`[CONTROLLER] [PROFILE] [UPLOAD PHOTO] Failed to clean up local file: ${deleteError.message}`);
        }
      }

      logger.error(`[CONTROLLER] [PROFILE] [UPLOAD PHOTO] Error:`, error);
      res.status(400).json({
        error: {
          code: 'UPLOAD_ERROR',
          message: error.message
        }
      });
    }
  }
];

export const deletePhoto = async (req: AuthRequest, res: Response) => {
  logger.info(`[CONTROLLER] [PROFILE] [DELETE PHOTO] ========== REQUEST RECEIVED ==========`);
  logger.info(`[CONTROLLER] [PROFILE] [DELETE PHOTO] User ID: ${req.user!.id}`);

  try {
    // Get current photo key/URL before deleting
    const profile = await profileService.getProfile(req.user!.id);
    const currentPhotoKey = (profile as any).profilePhotoKey || profile.profilePhotoUrl;

    // Delete from database
    const result = await profileService.deleteProfilePhoto(req.user!.id, req.user!.id);

    // Delete from OVHcloud if using cloud storage (key starts with 'profile-photos/')
    if (currentPhotoKey && currentPhotoKey.startsWith('profile-photos/')) {
      try {
        await deleteFromOVH(currentPhotoKey);
        logger.info(`[CONTROLLER] [PROFILE] [DELETE PHOTO] Photo deleted from OVHcloud: ${currentPhotoKey}`);
      } catch (deleteError: any) {
        logger.warn(`[CONTROLLER] [PROFILE] [DELETE PHOTO] Failed to delete file from OVHcloud: ${deleteError.message}`);
        // Don't fail the request if file deletion fails
      }
    } else if (currentPhotoKey) {
      // Legacy local file - log warning but don't try to delete (should be migrated)
      logger.warn(`[CONTROLLER] [PROFILE] [DELETE PHOTO] Legacy local file detected: ${currentPhotoKey}. File should be migrated to OVHcloud.`);
    }

    logger.info(`[CONTROLLER] [PROFILE] [DELETE PHOTO] Photo deleted successfully - User ID: ${req.user!.id}`);
    res.json(result);
  } catch (error: any) {
    logger.error(`[CONTROLLER] [PROFILE] [DELETE PHOTO] Error:`, error);
    res.status(400).json({
      error: {
        code: 'DELETE_ERROR',
        message: error.message
      }
    });
  }
};

export const getPhotoSignedUrl = async (req: AuthRequest, res: Response) => {
  logger.info(`[CONTROLLER] [PROFILE] [GET PHOTO SIGNED URL] ========== REQUEST RECEIVED ==========`);

  // Allow getting signed URL for any user (for viewing other users' profiles)
  // Default to logged-in user if no userId provided
  const targetUserId = req.query.userId ? parseInt(req.query.userId as string) : req.user!.id;

  logger.info(`[CONTROLLER] [PROFILE] [GET PHOTO SIGNED URL] Requested by User ID: ${req.user!.id}, Target User ID: ${targetUserId}`);

  try {
    // Get profile photo key directly from database
    const dbResult = await pool.query(
      'SELECT profile_photo_url FROM users WHERE id = $1',
      [targetUserId]
    );

    if (dbResult.rows.length === 0) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'User not found'
        }
      });
    }

    const profilePhotoKey = dbResult.rows[0].profile_photo_url;

    logger.info(`[CONTROLLER] [PROFILE] [GET PHOTO SIGNED URL] Database value: ${profilePhotoKey || 'null'}`);

    if (!profilePhotoKey) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'No profile photo found'
        }
      });
    }

    // Only handle OVHcloud keys (starts with 'profile-photos/')
    if (!profilePhotoKey.startsWith('profile-photos/')) {
      logger.warn(`[CONTROLLER] [PROFILE] [GET PHOTO SIGNED URL] Photo is not an OVHcloud key. Value: ${profilePhotoKey}. Please migrate to OVHcloud.`);
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Profile photo is not stored in OVHcloud. Please re-upload the photo.'
        }
      });
    }

    logger.info(`[CONTROLLER] [PROFILE] [GET PHOTO SIGNED URL] Generating public URL for OVHcloud key: ${profilePhotoKey}`);

    // Generate public URL (permanent, no expiration)
    const publicUrl = getPublicUrlFromOVH(profilePhotoKey);

    logger.info(`[CONTROLLER] [PROFILE] [GET PHOTO SIGNED URL] Public URL generated successfully - Target User ID: ${targetUserId}`);
    logger.info(`[CONTROLLER] [PROFILE] [GET PHOTO SIGNED URL] Key: ${profilePhotoKey}`);
    logger.info(`[CONTROLLER] [PROFILE] [GET PHOTO SIGNED URL] Public URL: ${publicUrl}`);

    return res.json({ signedUrl: publicUrl, expiresIn: null }); // null means permanent
  } catch (error: any) {
    logger.error(`[CONTROLLER] [PROFILE] [GET PHOTO SIGNED URL] Error:`, error);
    logger.error(`[CONTROLLER] [PROFILE] [GET PHOTO SIGNED URL] Error details:`, {
      message: error.message,
      stack: error.stack,
      requestedBy: req.user!.id,
      targetUserId
    });
    res.status(400).json({
      error: {
        code: 'SIGNED_URL_ERROR',
        message: error.message || 'Failed to generate signed URL'
      }
    });
  }
};

export const getReportingManagers = async (req: AuthRequest, res: Response) => {
  logger.info(`[CONTROLLER] [PROFILE] [GET REPORTING MANAGERS] ========== REQUEST RECEIVED ==========`);
  logger.info(`[CONTROLLER] [PROFILE] [GET REPORTING MANAGERS] User ID: ${req.user!.id}, Search: ${req.query.search || 'none'}, Employee Role: ${req.query.employeeRole || 'none'}, Exclude Employee ID: ${req.query.excludeEmployeeId || 'none'}`);

  try {
    const search = req.query.search as string | undefined;
    const employeeRole = req.query.employeeRole as string | undefined;
    const excludeEmployeeId = req.query.excludeEmployeeId ? parseInt(req.query.excludeEmployeeId as string) : undefined;
    const result = await profileService.getReportingManagers(search, employeeRole, excludeEmployeeId);
    logger.info(`[CONTROLLER] [PROFILE] [GET REPORTING MANAGERS] Retrieved ${result.managers.length} reporting managers`);
    res.json(result);
  } catch (error: any) {
    logger.error(`[CONTROLLER] [PROFILE] [GET REPORTING MANAGERS] Error:`, error);
    res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
};

