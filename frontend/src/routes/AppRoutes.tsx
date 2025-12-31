import React, { Suspense, lazy, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import { useAuth } from '../contexts/AuthContext';
import { useQueryClient } from 'react-query';
import * as profileService from '../services/profileService';
import * as leaveService from '../services/leaveService';

// Lazy load pages for code splitting and faster initial load
const LoginPage = lazy(() => import('../pages/LoginPage'));
const LeaveApplyPage = lazy(() => import('../pages/LeaveApplyPage'));
const LeaveApprovalPage = lazy(() => import('../pages/LeaveApprovalPage'));
const EmployeeManagementPage = lazy(() => import('../pages/EmployeeManagementPage'));
const ProfilePage = lazy(() => import('../pages/ProfilePage'));
const ChangePasswordPage = lazy(() => import('../pages/ChangePasswordPage'));
const HolidayManagementPage = lazy(() => import('../pages/HolidayManagementPage'));
const ViewPoliciesPage = lazy(() => import('../pages/ViewPoliciesPage'));

// Prefetch core data for authenticated users
const DataPrefetcher: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (user) {
      const currentYear = new Date().getFullYear();

      // Prefetch common data
      queryClient.prefetchQuery('profile', profileService.getProfile);
      queryClient.prefetchQuery('leaveBalances', leaveService.getLeaveBalances);
      queryClient.prefetchQuery(['holidays', currentYear], () => leaveService.getHolidays(currentYear));
      queryClient.prefetchQuery('leaveRules', leaveService.getLeaveRules);
      queryClient.prefetchQuery('myLeaveRequests', () => leaveService.getMyLeaveRequests(1, 50));

      // If HR/Admin, prefetch pending requests and employee list
      if (user.role === 'hr' || user.role === 'super_admin') {
        queryClient.prefetchQuery(['pendingLeaves', '', ''], () => leaveService.getPendingLeaveRequests(1, 10));
      }
    }
  }, [user, queryClient]);

  return null;
};

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
      <DataPrefetcher />
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

