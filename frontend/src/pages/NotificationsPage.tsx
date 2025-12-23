import React, { useState, useEffect } from 'react';
import { getNotifications, markAsRead, markAllAsRead, deleteNotification, Notification } from '../services/notificationService';
import { FaCheck, FaTrash, FaBell, FaCheckCircle } from 'react-icons/fa';
import './NotificationsPage.css';

const NotificationsPage: React.FC = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    fetchNotifications();
  }, [filter, page]);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const data = await getNotifications(page, 20, filter === 'unread');
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
      setHasMore(data.notifications.length === 20);
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsRead = async (notificationId: number) => {
    try {
      await markAsRead(notificationId);
      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, isRead: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await markAllAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  };

  const handleDelete = async (notificationId: number) => {
    try {
      await deleteNotification(notificationId);
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
      const deleted = notifications.find(n => n.id === notificationId);
      if (deleted && !deleted.isRead) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (error) {
      console.error('Failed to delete notification:', error);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'leave_submission':
      case 'leave_approval':
        return <FaCheckCircle className="notification-icon approval" />;
      case 'leave_rejection':
        return <FaCheckCircle className="notification-icon rejection" />;
      case 'leave_partial_approval':
        return <FaCheckCircle className="notification-icon partial" />;
      case 'leave_cancellation':
        return <FaBell className="notification-icon cancellation" />;
      default:
        return <FaBell className="notification-icon default" />;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="notifications-page">
      <div className="notifications-header">
        <h1>Notifications</h1>
        <div className="notifications-actions">
          <div className="filter-buttons">
            <button
              className={filter === 'all' ? 'active' : ''}
              onClick={() => {
                setFilter('all');
                setPage(1);
              }}
            >
              All
            </button>
            <button
              className={filter === 'unread' ? 'active' : ''}
              onClick={() => {
                setFilter('unread');
                setPage(1);
              }}
            >
              Unread ({unreadCount})
            </button>
          </div>
          {unreadCount > 0 && (
            <button className="mark-all-read" onClick={handleMarkAllAsRead}>
              <FaCheck /> Mark all as read
            </button>
          )}
        </div>
      </div>

      <div className="notifications-content">
        {loading ? (
          <div className="loading">Loading notifications...</div>
        ) : notifications.length === 0 ? (
          <div className="empty-state">
            <FaBell className="empty-icon" />
            <p>No notifications found</p>
          </div>
        ) : (
          <div className="notifications-list">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className={`notification-item ${notification.isRead ? 'read' : 'unread'}`}
              >
                <div className="notification-content">
                  <div className="notification-header">
                    {getNotificationIcon(notification.type)}
                    <div className="notification-info">
                      <h3>{notification.title}</h3>
                      <span className="notification-time">{formatDate(notification.createdAt)}</span>
                    </div>
                  </div>
                  <p className="notification-message">{notification.message}</p>
                </div>
                <div className="notification-actions">
                  {!notification.isRead && (
                    <button
                      className="action-button read-button"
                      onClick={() => handleMarkAsRead(notification.id)}
                      title="Mark as read"
                    >
                      <FaCheck />
                    </button>
                  )}
                  <button
                    className="action-button delete-button"
                    onClick={() => handleDelete(notification.id)}
                    title="Delete"
                  >
                    <FaTrash />
                  </button>
                </div>
              </div>
            ))}
            {hasMore && (
              <button
                className="load-more"
                onClick={() => setPage(prev => prev + 1)}
              >
                Load more
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default NotificationsPage;

