import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import LoginPage from '../pages/LoginPage';
import LeaveApplyPage from '../pages/LeaveApplyPage';
import LeaveApprovalPage from '../pages/LeaveApprovalPage';
import EmployeeManagementPage from '../pages/EmployeeManagementPage';
import ProfilePage from '../pages/ProfilePage';
import { useAuth } from '../contexts/AuthContext';

const AppRoutes: React.FC = () => {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={<LoginPage />}
      />
      <Route
        path="/leave-apply"
        element={
          <ProtectedRoute allowedRoles={['employee', 'manager', 'hr']}>
            <LeaveApplyPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/leave-approval"
        element={
          <ProtectedRoute allowedRoles={['manager', 'hr', 'super_admin']}>
            <LeaveApprovalPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/employee-management"
        element={
          <ProtectedRoute allowedRoles={['hr', 'super_admin']}>
            <EmployeeManagementPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <ProfilePage />
          </ProtectedRoute>
        }
      />
      <Route path="/" element={<Navigate to="/login" replace />} />
    </Routes>
  );
};

export default AppRoutes;

