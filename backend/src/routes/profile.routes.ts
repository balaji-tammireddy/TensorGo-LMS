import { Router } from 'express';
import * as profileController from '../controllers/profile.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

router.get('/', profileController.getProfile);
router.put('/', profileController.updateProfile);
router.post('/photo', profileController.uploadPhoto);
router.get('/photo/signed-url', profileController.getPhotoSignedUrl);
router.delete('/photo', profileController.deletePhoto);
router.get('/reporting-managers', profileController.getReportingManagers);

export default router;

