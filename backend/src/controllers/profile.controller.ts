import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import * as profileService from '../services/profile.service';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { logger } from '../utils/logger';
import { uploadToOVH, uploadBufferToOVH, deleteFromOVH, extractKeyFromUrl, getSignedUrlFromOVH } from '../utils/storage';

// Configure multer for memory storage - upload directly to OVHcloud without saving to disk
const upload = multer({
  storage: multer.memoryStorage(),
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
    const result = await profileService.updateProfile(req.user!.id, req.body);
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

      // Check if OVHcloud is configured
      const useOVHCloud = process.env.OVH_ACCESS_KEY && process.env.OVH_SECRET_KEY && process.env.OVH_BUCKET_NAME;
      
      let photoUrl: string;
      
      if (useOVHCloud) {
        try {
          // Generate unique filename
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
          const filename = `profile-${req.user!.id}-${uniqueSuffix}${path.extname(req.file.originalname)}`;
          const key = `profile-photos/${req.user!.id}/${filename}`;
          
          logger.info(`[CONTROLLER] [PROFILE] [UPLOAD PHOTO] Uploading directly to OVHcloud with key: ${key}`);
          logger.info(`[CONTROLLER] [PROFILE] [UPLOAD PHOTO] File size: ${req.file.size} bytes, MIME type: ${req.file.mimetype}`);
          
          // Upload directly from memory buffer to OVHcloud - no local file saved
          const photoKey = await uploadBufferToOVH(req.file.buffer, key, req.file.mimetype);
          
          logger.info(`[CONTROLLER] [PROFILE] [UPLOAD PHOTO] Successfully uploaded to OVHcloud: ${photoKey}`);
          
          // Store only the key in database (not URL)
          photoUrl = photoKey;
        } catch (ovhError: any) {
          // Log detailed error information
          logger.error(`[CONTROLLER] [PROFILE] [UPLOAD PHOTO] OVHcloud upload failed:`, {
            error: ovhError.message,
            name: ovhError.name,
            code: ovhError.Code,
            requestId: ovhError.$metadata?.requestId,
            httpStatusCode: ovhError.$metadata?.httpStatusCode,
            key: `profile-photos/${req.user!.id}/${req.file.originalname}`
          });
          
          // No fallback - OVHcloud is required
          return res.status(500).json({
            error: {
              code: 'UPLOAD_ERROR',
              message: `Failed to upload photo to OVHcloud: ${ovhError.message}`
            }
          });
        }
      } else {
        return res.status(500).json({
          error: {
            code: 'CONFIGURATION_ERROR',
            message: 'OVHcloud is not configured. Please configure OVH_ACCESS_KEY, OVH_SECRET_KEY, and OVH_BUCKET_NAME'
          }
        });
      }
      
      // Store key in database
      const result = await profileService.updateProfilePhoto(req.user!.id, photoUrl);
      logger.info(`[CONTROLLER] [PROFILE] [UPLOAD PHOTO] Photo uploaded successfully - User ID: ${req.user!.id}, Photo Key: ${photoUrl}`);
      res.json(result);
    } catch (error: any) {
      // No local file to clean up - we upload directly from memory
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
    const result = await profileService.deleteProfilePhoto(req.user!.id);
    
    // Delete from OVHcloud if using cloud storage (key starts with 'profile-photos/')
    if (currentPhotoKey && currentPhotoKey.startsWith('profile-photos/')) {
      try {
        await deleteFromOVH(currentPhotoKey);
        logger.info(`[CONTROLLER] [PROFILE] [DELETE PHOTO] Photo deleted from OVHcloud: ${currentPhotoKey}`);
      } catch (deleteError: any) {
        logger.warn(`[CONTROLLER] [PROFILE] [DELETE PHOTO] Failed to delete file from OVHcloud: ${deleteError.message}`);
        // Don't fail the request if file deletion fails
      }
    } else if (currentPhotoKey && currentPhotoKey.startsWith('/uploads')) {
      // Delete local file
      try {
        const localPath = path.resolve(process.env.UPLOAD_DIR || './uploads', path.basename(currentPhotoKey));
        if (fs.existsSync(localPath)) {
          fs.unlinkSync(localPath);
          logger.info(`[CONTROLLER] [PROFILE] [DELETE PHOTO] Local file deleted: ${localPath}`);
        }
      } catch (deleteError: any) {
        logger.warn(`[CONTROLLER] [PROFILE] [DELETE PHOTO] Failed to delete local file: ${deleteError.message}`);
      }
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
  logger.info(`[CONTROLLER] [PROFILE] [GET PHOTO SIGNED URL] User ID: ${req.user!.id}`);
  
  try {
    // Get profile photo key directly from database
    const dbResult = await pool.query(
      'SELECT profile_photo_url FROM users WHERE id = $1',
      [req.user!.id]
    );
    
    if (dbResult.rows.length === 0) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'User not found'
        }
      });
    }
    
    const profilePhotoUrl = dbResult.rows[0].profile_photo_url;
    
    // Check if it's an OVHcloud key (starts with 'profile-photos/')
    if (!profilePhotoUrl || !profilePhotoUrl.startsWith('profile-photos/')) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'No OVHcloud profile photo found. Photo may be stored locally.'
        }
      });
    }
    
    // Generate signed URL (valid for 15 minutes)
    const signedUrl = await getSignedUrlFromOVH(profilePhotoUrl, 900);
    
    logger.info(`[CONTROLLER] [PROFILE] [GET PHOTO SIGNED URL] Signed URL generated successfully - User ID: ${req.user!.id}, Key: ${profilePhotoUrl}`);
    res.json({ signedUrl, expiresIn: 900 });
  } catch (error: any) {
    logger.error(`[CONTROLLER] [PROFILE] [GET PHOTO SIGNED URL] Error:`, error);
    logger.error(`[CONTROLLER] [PROFILE] [GET PHOTO SIGNED URL] Error details:`, {
      message: error.message,
      stack: error.stack,
      userId: req.user!.id
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

