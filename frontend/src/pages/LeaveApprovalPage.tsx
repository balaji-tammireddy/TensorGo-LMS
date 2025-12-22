import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import AppLayout from '../components/layout/AppLayout';
import * as leaveService from '../services/leaveService';
import { format } from 'date-fns';
import './LeaveApprovalPage.css';

const LeaveApprovalPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');

  const { data: pendingData, isLoading: pendingLoading, error: pendingError, refetch: refetchPending } = useQuery(
    ['pendingLeaves', search, filter],
    () => leaveService.getPendingLeaveRequests(1, 10, search || undefined, filter || undefined),
    {
      retry: false,
      onError: (error: any) => {
        if (error.response?.status === 403 || error.response?.status === 401) {
          // Redirect to login if unauthorized
          window.location.href = '/login';
        }
      }
    }
  );

  const { data: approvedData, isLoading: approvedLoading, error: approvedError } = useQuery(
    'approvedLeaves',
    () => leaveService.getApprovedLeaves(1, 10),
    {
      retry: false,
      onError: (error: any) => {
        if (error.response?.status === 403 || error.response?.status === 401) {
          window.location.href = '/login';
        }
      }
    }
  );

  const approveMutation = useMutation(
    ({ id, comment }: { id: number; comment?: string }) => leaveService.approveLeave(id, comment),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('pendingLeaves');
        queryClient.invalidateQueries('approvedLeaves');
        alert('Leave approved successfully!');
      },
      onError: (error: any) => {
        alert(error.response?.data?.error?.message || 'Failed to approve leave');
      }
    }
  );

  const rejectMutation = useMutation(
    ({ id, comment }: { id: number; comment: string }) => leaveService.rejectLeave(id, comment),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('pendingLeaves');
        queryClient.invalidateQueries('approvedLeaves');
        alert('Leave rejected successfully!');
      },
      onError: (error: any) => {
        alert(error.response?.data?.error?.message || 'Failed to reject leave');
      }
    }
  );

  const handleApprove = (id: number) => {
    if (window.confirm('Are you sure you want to approve this leave?')) {
      approveMutation.mutate({ id });
    }
  };

  const handleReject = (id: number) => {
    const comment = window.prompt('Please provide a reason for rejection:');
    if (comment) {
      rejectMutation.mutate({ id, comment });
    }
  };

  const formatDateSafe = (value: Date | string | null | undefined) => {
    if (!value) return '';
    if (value instanceof Date) {
      return format(value, 'dd/MM/yyyy');
    }
    const str = value.toString();
    const hasTime = str.includes('T');
    return format(new Date(hasTime ? str : `${str}T12:00:00`), 'dd/MM/yyyy');
  };

  const formatHalfLabel = (val?: string) => {
    if (!val) return '';
    if (val === 'first_half') return ' (First half)';
    if (val === 'second_half') return ' (Second half)';
    if (val === 'half') return ' (Half day)';
    return '';
  };

  const pendingRequests = pendingData?.requests || [];

  if (pendingLoading || approvedLoading) {
    return (
      <AppLayout>
        <div className="leave-approval-page">
          <div style={{ padding: '20px', textAlign: 'center' }}>Loading...</div>
        </div>
      </AppLayout>
    );
  }

  if (pendingError || approvedError) {
    return (
      <AppLayout>
        <div className="leave-approval-page">
          <div style={{ padding: '20px', textAlign: 'center', color: 'red' }}>
            {pendingError?.response?.status === 403 || approvedError?.response?.status === 403
              ? 'You do not have permission to view this page'
              : 'Error loading data. Please try again.'}
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="leave-approval-page">
        <h1 className="page-title">Leave Requests</h1>

        <div className="search-filter-bar">
          <div className="search-box">
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button className="search-button">🔍</button>
          </div>
          <div className="filter-box">
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="">All Types</option>
              <option value="casual">Casual</option>
              <option value="sick">Sick</option>
              <option value="lop">LOP</option>
            </select>
            <button className="filter-button">▼</button>
          </div>
        </div>

        <div className="pending-requests-section">
          <table className="requests-table">
            <thead>
              <tr>
                <th>S NO</th>
                <th>EMP ID</th>
                <th>EMP NAME</th>
                <th>APPLIED DATE</th>
                <th>LEAVE DATE</th>
                <th>LEAVE TYPE</th>
                <th>NO OF DAYS</th>
                <th>LEAVE REASON</th>
                <th>CURRENT STATUS</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {pendingRequests.map((request: any, idx: number) => {
                const leaveDisplay = request.leaveDate
                  ? formatDateSafe(request.leaveDate)
                  : `${formatDateSafe(request.startDate)}${formatHalfLabel(request.startType)} to ${formatDateSafe(request.endDate)}${formatHalfLabel(request.endType)}`;
                return (
                  <tr key={`${request.id}-${idx}`}>
                    <td>{idx + 1}</td>
                    <td>{request.empId}</td>
                    <td>{request.empName}</td>
                    <td>{formatDateSafe(request.appliedDate)}</td>
                    <td>{leaveDisplay}</td>
                    <td>{request.leaveType}</td>
                    <td>{request.noOfDays}</td>
                    <td>{request.leaveReason}</td>
                    <td>{request.currentStatus}</td>
                    <td className="actions-cell">
                      <button
                        className="approve-btn"
                        onClick={() => handleApprove(request.id)}
                        title="Approve"
                      >
                        ✓
                      </button>
                      <button
                        className="reject-btn"
                        onClick={() => handleReject(request.id)}
                        title="Reject"
                      >
                        ✗
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="approved-requests-section">
          <h2>Recent Approved Requests</h2>
          <table className="requests-table">
            <thead>
              <tr>
                <th>S NO</th>
                <th>EMP ID</th>
                <th>EMP NAME</th>
                <th>APPLIED DATE</th>
                <th>LEAVE DATE</th>
                <th>LEAVE TYPE</th>
                <th>NO OF DAYS</th>
                <th>LEAVE STATUS</th>
              </tr>
            </thead>
            <tbody>
              {approvedData?.requests.map((request: any, idx) => (
                <tr key={request.id}>
                  <td>{idx + 1}</td>
                  <td>{request.empId}</td>
                  <td>{request.empName}</td>
                  <td>{formatDateSafe(request.appliedDate)}</td>
                  <td>{request.leaveDate || `${formatDateSafe(request.startDate)} to ${formatDateSafe(request.endDate)}`}</td>
                  <td>{request.leaveType}</td>
                  <td>{request.noOfDays}</td>
                  <td>{request.leaveStatus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
};

export default LeaveApprovalPage;

