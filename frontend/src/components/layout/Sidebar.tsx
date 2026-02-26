import React, { useMemo, useState, useCallback, memo, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { FaFileAlt, FaCheckCircle, FaUsers, FaUser, FaSignOutAlt, FaCalendarAlt, FaBook, FaChartPie, FaCog, FaBriefcase, FaClock, FaClipboardCheck } from 'react-icons/fa';
import './Sidebar.css';

const Sidebar: React.FC = memo(() => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };

    if (showUserMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showUserMenu]);

  const getRoleDisplayName = useCallback((role: string) => {
    const roleMap: Record<string, string> = {
      employee: 'Employee',
      manager: 'Manager',
      hr: 'HR',
      intern: 'Intern',
      super_admin: 'Super Admin'
    };
    return roleMap[role] || role;
  }, []);

  const availableRoutes = useMemo(() => {
    if (!user) return [];

    const routes: Array<{ path: string; icon: React.ReactNode; label: string }> = [];

    // Dashboard - For Super Admin and HR
    if (user.role === 'super_admin' || user.role === 'hr') {
      routes.push({ path: '/dashboard', icon: <FaChartPie />, label: 'Dashboard' });
    }

    // Leave Apply available to everyone except super_admin
    if (user.role !== 'super_admin') {
      routes.push({ path: '/leave-apply', icon: <FaFileAlt />, label: 'Apply Leave' });
    }

    // Manager, HR, Super Admin can access Leave Approval
    if (['manager', 'hr', 'super_admin'].includes(user.role)) {
      routes.push({ path: '/leave-approval', icon: <FaCheckCircle />, label: 'Leave Approval' });
    }

    // HR and Super Admin can access Employee Management
    if (['hr', 'super_admin'].includes(user.role)) {
      routes.push({ path: '/employee-management', icon: <FaUsers />, label: 'Employee Management' });
    }

    // HR and Super Admin can access Holiday Management
    if (['hr', 'super_admin'].includes(user.role)) {
      routes.push({ path: '/holiday-management', icon: <FaCalendarAlt />, label: 'Holiday Management' });
    }

    // Leave Rules - For Super Admin only
    if (user.role === 'super_admin') {
      routes.push({ path: '/leave-rules', icon: <FaCog />, label: 'Leave Rules' });
    }

    // View Policies - Available to all
    routes.push({ path: '/view-policies', icon: <FaBook />, label: 'View Policies' });

    // Project Management
    if (['manager', 'hr', 'super_admin', 'employee', 'intern'].includes(user.role)) {
      routes.push({ path: '/project-management', icon: <FaBriefcase />, label: 'Projects' });
    }

    // Timesheet
    if (['manager', 'hr', 'employee', 'intern'].includes(user.role)) {
      routes.push({ path: '/timesheets', icon: <FaClock />, label: 'Timesheets' });
    }

    // Timesheet Approval
    if (['manager', 'hr', 'super_admin'].includes(user.role)) {
      routes.push({ path: '/timesheet/approvals', icon: <FaClipboardCheck />, label: 'Timesheet Approvals' });
    }

    // Profile is always available
    routes.push({ path: '/profile', icon: <FaUser />, label: 'Profile' });

    return routes;
  }, [user]);

  const userInitial = useMemo(() => {
    if (!user) return '';
    const source = (user as any).name || user.email || '';
    return source.trim().charAt(0).toUpperCase() || '';
  }, [user]);

  const handleLogout = useCallback(async () => {
    await logout();
    navigate('/login');
  }, [logout, navigate]);

  return (
    <div className="sidebar">
      <div className="sidebar-nav">
        {availableRoutes.map((route) => (
          <div className="nav-item-wrapper" key={route.path} data-tooltip={route.label}>
            <div
              className={`nav-item ${location.pathname === route.path || (route.path === '/project-management' && location.pathname.startsWith('/project-management/')) ? 'active' : ''}`}
              onClick={() => navigate(route.path)}
            >
              <span className="nav-icon">{route.icon}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="sidebar-user" ref={userMenuRef}>
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
});

Sidebar.displayName = 'Sidebar';

export default Sidebar;

