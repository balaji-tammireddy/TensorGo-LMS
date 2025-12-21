import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import * as profileService from '../services/profile.service';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

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
  try {
    const profile = await profileService.getProfile(req.user!.id);
    res.json(profile);
  } catch (error: any) {
    res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: error.message
      }
    });
  }
};

export const updateProfile = async (req: AuthRequest, res: Response) => {
  try {
    const result = await profileService.updateProfile(req.user!.id, req.body);
    res.json(result);
  } catch (error: any) {
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
    try {
      if (!req.file) {
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
      res.json(result);
    } catch (error: any) {
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
  try {
    const result = await profileService.deleteProfilePhoto(req.user!.id);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({
      error: {
        code: 'DELETE_ERROR',
        message: error.message
      }
    });
  }
};

export const getReportingManagers = async (req: AuthRequest, res: Response) => {
  try {
    const search = req.query.search as string | undefined;
    const result = await profileService.getReportingManagers(search);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
};

