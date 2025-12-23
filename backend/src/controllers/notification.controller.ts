import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import * as notificationService from '../services/notification.service';

export const getNotifications = async (req: AuthRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const unreadOnly = req.query.unreadOnly === 'true';
    
    const result = await notificationService.getNotifications(
      req.user!.id,
      page,
      limit,
      unreadOnly
    );
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

export const markAsRead = async (req: AuthRequest, res: Response) => {
  try {
    const notificationId = parseInt(req.params.id);
    await notificationService.markAsRead(notificationId, req.user!.id);
    res.json({ message: 'Notification marked as read' });
  } catch (error: any) {
    res.status(400).json({
      error: {
        code: 'UPDATE_ERROR',
        message: error.message
      }
    });
  }
};

export const markAllAsRead = async (req: AuthRequest, res: Response) => {
  try {
    await notificationService.markAllAsRead(req.user!.id);
    res.json({ message: 'All notifications marked as read' });
  } catch (error: any) {
    res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
};

export const deleteNotification = async (req: AuthRequest, res: Response) => {
  try {
    const notificationId = parseInt(req.params.id);
    await notificationService.deleteNotification(notificationId, req.user!.id);
    res.json({ message: 'Notification deleted' });
  } catch (error: any) {
    res.status(400).json({
      error: {
        code: 'DELETE_ERROR',
        message: error.message
      }
    });
  }
};

