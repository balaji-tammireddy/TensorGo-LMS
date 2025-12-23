import { pool } from '../database/db';

export interface Notification {
  id: number;
  userId: number;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: Date;
}

/**
 * Create a notification for a user
 */
export const createNotification = async (
  userId: number,
  title: string,
  message: string,
  type: string = 'info'
): Promise<void> => {
  await pool.query(
    `INSERT INTO notifications (user_id, title, message, type)
     VALUES ($1, $2, $3, $4)`,
    [userId, title, message, type]
  );
};

/**
 * Get notifications for a user
 */
export const getNotifications = async (
  userId: number,
  page: number = 1,
  limit: number = 50,
  unreadOnly: boolean = false
): Promise<{ notifications: Notification[]; total: number; unreadCount: number }> => {
  const offset = (page - 1) * limit;
  
  let query = `
    SELECT id, user_id, title, message, type, is_read, created_at
    FROM notifications
    WHERE user_id = $1
  `;
  const params: any[] = [userId];
  
  if (unreadOnly) {
    query += ' AND is_read = false';
  }
  
  query += ' ORDER BY created_at DESC LIMIT $2 OFFSET $3';
  params.push(limit, offset);
  
  const result = await pool.query(query, params);
  
  // Get total count
  let countQuery = 'SELECT COUNT(*) FROM notifications WHERE user_id = $1';
  const countParams: any[] = [userId];
  if (unreadOnly) {
    countQuery += ' AND is_read = false';
  }
  const countResult = await pool.query(countQuery, countParams);
  
  // Get unread count
  const unreadResult = await pool.query(
    'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = false',
    [userId]
  );
  
  return {
    notifications: result.rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      title: row.title,
      message: row.message,
      type: row.type,
      isRead: row.is_read,
      createdAt: row.created_at
    })),
    total: parseInt(countResult.rows[0].count),
    unreadCount: parseInt(unreadResult.rows[0].count)
  };
};

/**
 * Mark notification as read
 */
export const markAsRead = async (notificationId: number, userId: number): Promise<void> => {
  await pool.query(
    'UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2',
    [notificationId, userId]
  );
};

/**
 * Mark all notifications as read for a user
 */
export const markAllAsRead = async (userId: number): Promise<void> => {
  await pool.query(
    'UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false',
    [userId]
  );
};

/**
 * Delete a notification
 */
export const deleteNotification = async (notificationId: number, userId: number): Promise<void> => {
  await pool.query(
    'DELETE FROM notifications WHERE id = $1 AND user_id = $2',
    [notificationId, userId]
  );
};

