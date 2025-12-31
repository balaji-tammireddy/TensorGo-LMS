import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';


// Lazy load pages for code splitting and faster initial load
const LoginPage = lazy(() => import('../pages/LoginPage'));
const LeaveApplyPage = lazy(() => import('../pages/LeaveApplyPage'));
const LeaveApprovalPage = lazy(() => import('../pages/LeaveApprovalPage'));
const EmployeeManagementPage = lazy(() => import('../pages/EmployeeManagementPage'));
const ProfilePage = lazy(() => import('../pages/ProfilePage'));
const ChangePasswordPage = lazy(() => import('../pages/ChangePasswordPage'));
const HolidayManagementPage = lazy(() => import('../pages/HolidayManagementPage'));
const ViewPoliciesPage = lazy(() => import('../pages/ViewPoliciesPage'));

const AppRoutes: React.FC = () => {


  return (
    <Suspense fallback={
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        fontSize: '18px',
        color: '#666'
      }}>
        Loading...
      </div>
    }>
      <Routes>
        <Route
          path="/login"
          element={<LoginPage />}
        />
        <Route
          path="/change-password"
          element={
            <ProtectedRoute>
              <ChangePasswordPage />
            </ProtectedRoute>
          }
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
        <Route
          path="/holiday-management"
          element={
            <ProtectedRoute allowedRoles={['hr', 'super_admin']}>
              <HolidayManagementPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/view-policies"
          element={
            <ProtectedRoute>
              <ViewPoliciesPage />
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<Navigate to="/login" replace />} />
      </Routes>
    </Suspense>
  );
};

export default AppRoutes;

