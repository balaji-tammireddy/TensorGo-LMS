import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { FaFileAlt, FaCheckCircle, FaUsers, FaUser, FaSignOutAlt, FaBell } from 'react-icons/fa';
import { getNotifications } from '../../services/notificationService';
import './Sidebar.css';

const Sidebar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const getRoleDisplayName = (role: string) => {
    const roleMap: Record<string, string> = {
      employee: 'Employee',
      manager: 'Manager',
      hr: 'HR',
      super_admin: 'Super Admin'
    };
    return roleMap[role] || role;
  };

  const getAvailableRoutes = () => {
    if (!user) return [];
    
    const routes: Array<{ path: string; icon: React.ReactNode; label: string }> = [];
    
    // Leave Apply available to everyone except super_admin
    if (user.role !== 'super_admin') {
    routes.push({ path: '/leave-apply', icon: <FaFileAlt />, label: 'Leave Apply' });
    }
    
    // Manager, HR, Super Admin can access Leave Approval
    if (['manager', 'hr', 'super_admin'].includes(user.role)) {
      routes.push({ path: '/leave-approval', icon: <FaCheckCircle />, label: 'Leave Approval' });
    }
    
    // HR and Super Admin can access Employee Management
    if (['hr', 'super_admin'].includes(user.role)) {
      routes.push({ path: '/employee-management', icon: <FaUsers />, label: 'Employee Management' });
    }
    
    // Profile is always available
    routes.push({ path: '/profile', icon: <FaUser />, label: 'Profile' });
    
    return routes;
  };

  const userInitial = useMemo(() => {
    if (!user) return '';
    const source = (user as any).name || user.email || '';
    return source.trim().charAt(0).toUpperCase() || '';
  }, [user]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  // Fetch unread notification count
  useEffect(() => {
    const fetchUnreadCount = async () => {
      if (user) {
        try {
          const data = await getNotifications(1, 1, true);
          setUnreadCount(data.unreadCount);
        } catch (error) {
          console.error('Failed to fetch notification count:', error);
        }
      }
    };

    fetchUnreadCount();
    // Refresh every 30 seconds
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [user]);

  return (
    <div className="sidebar">
      <div className="sidebar-nav">
        {/* Notifications button at the top */}
        <div
          className={`nav-item ${location.pathname === '/notifications' ? 'active' : ''}`}
          onClick={() => navigate('/notifications')}
          title="Notifications"
        >
          <span className="nav-icon">
            <FaBell />
          </span>
          {unreadCount > 0 && (
            <span className="notification-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
          )}
        </div>
        
        {getAvailableRoutes().map((route) => (
          <div
            key={route.path}
            className={`nav-item ${location.pathname === route.path ? 'active' : ''}`}
            onClick={() => navigate(route.path)}
            title={route.label}
          >
            <span className="nav-icon">{route.icon}</span>
          </div>
        ))}
      </div>
      
      <div className="sidebar-user">
        {user && (
          <div className="user-toggle" onClick={() => setShowUserMenu((prev) => !prev)}>
            <div className="user-avatar">{userInitial || 'U'}</div>
          </div>
        )}
        {showUserMenu && (
          <div className="user-menu">
            <div className="role-text">{user ? getRoleDisplayName(user.role) : ''}</div>
            <button className="logout-button" onClick={handleLogout}>
              <FaSignOutAlt /> Logout
            </button>
        </div>
        )}
      </div>
    </div>
  );
};

export default Sidebar;

