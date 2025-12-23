import api from './api';

export interface Notification {
  id: number;
  userId: number;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationResponse {
  notifications: Notification[];
  total: number;
  unreadCount: number;
}

export const getNotifications = async (
  page: number = 1,
  limit: number = 50,
  unreadOnly: boolean = false
): Promise<NotificationResponse> => {
  const response = await api.get('/notifications', {
    params: { page, limit, unreadOnly }
  });
  return response.data;
};

export const markAsRead = async (notificationId: number): Promise<void> => {
  await api.post(`/notifications/${notificationId}/read`);
};

export const markAllAsRead = async (): Promise<void> => {
  await api.post('/notifications/read-all');
};

export const deleteNotification = async (notificationId: number): Promise<void> => {
  await api.delete(`/notifications/${notificationId}`);
};

