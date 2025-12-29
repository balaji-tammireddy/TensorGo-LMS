import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import * as profileService from '../services/profile.service';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { logger } from '../utils/logger';
import { uploadToOVH, deleteFromOVH, extractKeyFromUrl } from '../utils/storage';

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
      
      // Check if OVHcloud is configured
      const useOVHCloud = process.env.OVH_ACCESS_KEY && process.env.OVH_SECRET_KEY && process.env.OVH_BUCKET_NAME;
      
      let photoUrl: string;
      
      if (useOVHCloud) {
        try {
          // Upload to OVHcloud bucket
          const key = `profile-photos/${req.user!.id}/${req.file.filename}`;
          photoUrl = await uploadToOVH(localFilePath, key, req.file.mimetype);
          
          // Delete local file after successful upload
          try {
            fs.unlinkSync(localFilePath);
            logger.info(`[CONTROLLER] [PROFILE] [UPLOAD PHOTO] Local file deleted: ${localFilePath}`);
          } catch (deleteError: any) {
            logger.warn(`[CONTROLLER] [PROFILE] [UPLOAD PHOTO] Failed to delete local file: ${deleteError.message}`);
          }
        } catch (ovhError: any) {
          // Fallback to local storage if OVHcloud upload fails
          logger.warn(`[CONTROLLER] [PROFILE] [UPLOAD PHOTO] OVHcloud upload failed, falling back to local storage: ${ovhError.message}`);
          photoUrl = `/uploads/${req.file.filename}`;
          logger.info(`[CONTROLLER] [PROFILE] [UPLOAD PHOTO] Using local storage as fallback`);
        }
      } else {
        // Fallback to local storage
        photoUrl = `/uploads/${req.file.filename}`;
        logger.info(`[CONTROLLER] [PROFILE] [UPLOAD PHOTO] Using local storage (OVHcloud not configured)`);
      }
      
      const result = await profileService.updateProfilePhoto(req.user!.id, photoUrl);
      logger.info(`[CONTROLLER] [PROFILE] [UPLOAD PHOTO] Photo uploaded successfully - User ID: ${req.user!.id}, Photo URL: ${photoUrl}`);
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
    // Get current photo URL before deleting
    const profile = await profileService.getProfile(req.user!.id);
    const currentPhotoUrl = profile.photo_url;
    
    // Delete from database
    const result = await profileService.deleteProfilePhoto(req.user!.id);
    
    // Delete from OVHcloud if using cloud storage
    if (currentPhotoUrl && process.env.OVH_ACCESS_KEY && process.env.OVH_SECRET_KEY && process.env.OVH_BUCKET_NAME) {
      try {
        // Check if it's an OVHcloud URL
        if (currentPhotoUrl.startsWith('http') && !currentPhotoUrl.startsWith('/uploads')) {
          const key = extractKeyFromUrl(currentPhotoUrl);
          await deleteFromOVH(key);
          logger.info(`[CONTROLLER] [PROFILE] [DELETE PHOTO] Photo deleted from OVHcloud: ${key}`);
        } else {
          // Local file - delete from filesystem
          const localPath = path.resolve(process.env.UPLOAD_DIR || './uploads', path.basename(currentPhotoUrl));
          if (fs.existsSync(localPath)) {
            fs.unlinkSync(localPath);
            logger.info(`[CONTROLLER] [PROFILE] [DELETE PHOTO] Local file deleted: ${localPath}`);
          }
        }
      } catch (deleteError: any) {
        logger.warn(`[CONTROLLER] [PROFILE] [DELETE PHOTO] Failed to delete file from storage: ${deleteError.message}`);
        // Don't fail the request if file deletion fails
      }
    } else if (currentPhotoUrl && currentPhotoUrl.startsWith('/uploads')) {
      // Delete local file
      try {
        const localPath = path.resolve(process.env.UPLOAD_DIR || './uploads', path.basename(currentPhotoUrl));
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

