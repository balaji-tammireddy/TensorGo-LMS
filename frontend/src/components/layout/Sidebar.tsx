import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { FaFileAlt, FaCheckCircle, FaUsers, FaUser, FaSignOutAlt } from 'react-icons/fa';
import './Sidebar.css';

const Sidebar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

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
    
    // All roles can access Leave Apply and Profile
    routes.push({ path: '/leave-apply', icon: <FaFileAlt />, label: 'Leave Apply' });
    
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

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="sidebar">
      <div className="sidebar-role">
        {user && <div className="role-badge">{getRoleDisplayName(user.role)}</div>}
      </div>
      
      <div className="sidebar-nav">
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
      
      <div className="sidebar-bottom">
        <div className="nav-item" onClick={handleLogout} title="Logout">
          <span className="nav-icon"><FaSignOutAlt /></span>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;

