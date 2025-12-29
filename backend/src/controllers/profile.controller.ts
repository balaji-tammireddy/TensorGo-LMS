import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import * as profileService from '../services/profile.service';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { logger } from '../utils/logger';

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

      // In production, upload to cloud storage (S3, etc.) and get URL
      // For now, return relative path
      const photoUrl = `/uploads/${req.file.filename}`;
      const result = await profileService.updateProfilePhoto(req.user!.id, photoUrl);
      logger.info(`[CONTROLLER] [PROFILE] [UPLOAD PHOTO] Photo uploaded successfully - User ID: ${req.user!.id}, Photo URL: ${photoUrl}`);
      res.json(result);
    } catch (error: any) {
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
    const result = await profileService.deleteProfilePhoto(req.user!.id);
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

