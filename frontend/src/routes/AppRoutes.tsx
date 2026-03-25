import React, { Suspense, lazy, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import { useAuth } from '../contexts/AuthContext';
import { useQueryClient } from 'react-query';
import * as profileService from '../services/profileService';
import * as leaveService from '../services/leaveService';
import SkeletonLoader from '../components/common/SkeletonLoader';

// Lazy load pages for code splitting and faster initial load
const LoginPage = lazy(() => import('../pages/LoginPage'));
const LeaveApplyPage = lazy(() => import('../pages/LeaveApplyPage'));
const LeaveApprovalPage = lazy(() => import('../pages/LeaveApprovalPage'));
const EmployeeManagementPage = lazy(() => import('../pages/EmployeeManagementPage'));
const EmployeeDetailsPage = lazy(() => import('../pages/EmployeeDetailsPage'));
const EmployeeLeaveHistoryPage = lazy(() => import('../pages/EmployeeLeaveHistoryPage'));
const ProfilePage = lazy(() => import('../pages/ProfilePage'));
const ChangePasswordPage = lazy(() => import('../pages/ChangePasswordPage'));
const HolidayManagementPage = lazy(() => import('../pages/HolidayManagementPage'));
const ViewPoliciesPage = lazy(() => import('../pages/ViewPoliciesPage'));
const AccessDeniedPage = lazy(() => import('../pages/AccessDeniedPage'));
const NotFoundPage = lazy(() => import('../pages/NotFoundPage'));
const DashboardPage = lazy(() => import('../pages/DashboardPage'));
const LeaveRulesPage = lazy(() => import('../pages/LeaveRulesPage'));
const ProjectDashboard = lazy(() => import('../pages/ProjectManagement/ProjectDashboard').then(m => ({ default: m.ProjectDashboard })));
const ProjectListPage = lazy(() => import('../pages/ProjectManagement/ProjectListPage').then(m => ({ default: m.ProjectListPage })));
const ProjectWorkspace = lazy(() => import('../pages/ProjectManagement/ProjectWorkspace').then(m => ({ default: m.ProjectWorkspace })));
const ProjectTeamPage = lazy(() => import('../pages/ProjectManagement/ProjectTeamPage').then(m => ({ default: m.ProjectTeamPage })));
const TimesheetPage = lazy(() => import('../pages/Timesheet/TimesheetPage').then(m => ({ default: m.TimesheetPage })));
const TimesheetApprovalPage = lazy(() => import('../pages/Timesheet/TimesheetApprovalPage').then(m => ({ default: m.TimesheetApprovalPage })));

import * as policyService from '../services/policyService';

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
      queryClient.prefetchQuery(['policies'], policyService.getPolicies);

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
    <Suspense fallback={<SkeletonLoader variant="page" rows={5} />}>
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
            <ProtectedRoute allowedRoles={['employee', 'manager', 'hr', 'intern']}>
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
          path="/employee-management/view/:id"
          element={
            <ProtectedRoute allowedRoles={['hr', 'super_admin']}>
              <EmployeeDetailsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/employee-management/leaves/:id"
          element={
            <ProtectedRoute allowedRoles={['hr', 'super_admin']}>
              <EmployeeLeaveHistoryPage />
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
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute allowedRoles={['super_admin', 'hr']}>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/leave-rules"
          element={
            <ProtectedRoute allowedRoles={['super_admin']}>
              <LeaveRulesPage />
            </ProtectedRoute>
          }
        />

        {/* Project and Timesheet Routes */}
        <Route
          path="/project-management"
          element={
            <ProtectedRoute>
              <ProjectDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/project-management/list"
          element={
            <ProtectedRoute>
              <ProjectListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/project-management/:id"
          element={
            <ProtectedRoute>
              <ProjectWorkspace />
            </ProtectedRoute>
          }
        />
        <Route
          path="/project-management/:id/team"
          element={
            <ProtectedRoute>
              <ProjectTeamPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/timesheets"
          element={
            <ProtectedRoute>
              <TimesheetPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/timesheet/approvals"
          element={
            <ProtectedRoute allowedRoles={['manager', 'hr', 'super_admin']}>
              <TimesheetApprovalPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/access-denied"
          element={<AccessDeniedPage />}
        />
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
};

export default AppRoutes;

