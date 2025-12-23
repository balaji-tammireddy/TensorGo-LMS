import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import AppLayout from '../components/layout/AppLayout';
import { useToast } from '../contexts/ToastContext';
import ConfirmationDialog from '../components/ConfirmationDialog';
import RejectCommentDialog from '../components/RejectCommentDialog';
import * as leaveService from '../services/leaveService';
import { format } from 'date-fns';
import './LeaveApprovalPage.css';

const LeaveApprovalPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useToast();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const [approveConfirmOpen, setApproveConfirmOpen] = useState(false);
  const [approveRequestId, setApproveRequestId] = useState<number | null>(null);
  const [approveDayId, setApproveDayId] = useState<number | undefined>(undefined);
  const [rejectConfirmOpen, setRejectConfirmOpen] = useState(false);
  const [rejectRequestId, setRejectRequestId] = useState<number | null>(null);
  const [rejectDayId, setRejectDayId] = useState<number | undefined>(undefined);

  const { data: pendingData, isLoading: pendingLoading, error: pendingError } = useQuery(
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
    ({ id, dayId, comment }: { id: number; dayId?: number; comment?: string }) =>
      dayId
        ? leaveService.approveLeaveDay(id, dayId, comment)
        : leaveService.approveLeave(id, comment),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('pendingLeaves');
        queryClient.invalidateQueries('approvedLeaves');
        showSuccess('Leave approved successfully!');
      },
      onError: (error: any) => {
        showError(error.response?.data?.error?.message || 'Failed to approve leave');
      }
    }
  );

  const rejectMutation = useMutation(
    ({ id, dayId, comment }: { id: number; dayId?: number; comment: string }) =>
      dayId
        ? leaveService.rejectLeaveDay(id, dayId, comment)
        : leaveService.rejectLeave(id, comment),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('pendingLeaves');
        queryClient.invalidateQueries('approvedLeaves');
        showSuccess('Leave rejected successfully!');
      },
      onError: (error: any) => {
        showError(error.response?.data?.error?.message || 'Failed to reject leave');
      }
    }
  );

  const handleApprove = (id: number, dayId?: number) => {
    setApproveRequestId(id);
    setApproveDayId(dayId);
    setApproveConfirmOpen(true);
  };

  const confirmApprove = () => {
    if (approveRequestId !== null) {
      if (approveDayId) {
        approveMutation.mutate({ id: approveRequestId, dayId: approveDayId });
      } else {
        approveMutation.mutate({ id: approveRequestId });
      }
      setApproveConfirmOpen(false);
      setApproveRequestId(null);
      setApproveDayId(undefined);
    }
  };

  const handleReject = (id: number, dayId?: number) => {
    setRejectRequestId(id);
    setRejectDayId(dayId);
    setRejectConfirmOpen(true);
  };

  const confirmReject = (comment: string) => {
    if (rejectRequestId !== null) {
      if (rejectDayId) {
        rejectMutation.mutate({ id: rejectRequestId, dayId: rejectDayId, comment });
      } else {
        rejectMutation.mutate({ id: rejectRequestId, comment });
      }
      setRejectConfirmOpen(false);
      setRejectRequestId(null);
      setRejectDayId(undefined);
    }
  };

  const triggerSearch = () => {
    const term = searchInput.trim();
    if (term.length >= 3) {
      setSearch(term);
    } else {
      setSearch('');
    }
  };

  const clearSearch = () => {
    setSearchInput('');
    setSearch('');
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      triggerSearch();
    }
  };

  const formatDateSafe = (value: Date | string | null | undefined) => {
    if (!value) return '';
    try {
      if (value instanceof Date) {
        return format(value, 'dd/MM/yyyy');
      }
      const str = value.toString();
      if (!str || str.toLowerCase() === 'invalid date') return '';
      const hasTime = str.includes('T');
      const d = new Date(hasTime ? str : `${str}T12:00:00`);
      if (isNaN(d.getTime())) return '';
      return format(d, 'dd/MM/yyyy');
    } catch {
      return '';
    }
  };

  const pendingRequests = pendingData?.requests || [];

  // Expand into day-wise rows for display (duplicate other columns per row) and show only pending days
  const expandedPendingRequests = pendingRequests.flatMap((request: any) => {
    if (!request.leaveDays || request.leaveDays.length === 0) {
      return [request];
    }
    const pendingDays = request.leaveDays.filter((day: any) => (day.status || 'pending') === 'pending');
    if (pendingDays.length === 0) {
      return [];
    }
    return pendingDays.map((day: any) => ({
      ...request,
      leaveDate: formatDateSafe(day.date),
      dayType: day.type,
      leaveDayId: day.id,
      dayStatus: day.status || 'pending'
    }));
  });

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
              : pendingError?.response?.status === 429 || approvedError?.response?.status === 429
              ? 'Too many requests. Please try again later.'
              : 'Error loading data. Please try again.'}
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <>
    <AppLayout>
      <div className="leave-approval-page">
        <h1 className="page-title">Leave Requests</h1>

        <div className="search-filter-bar">
          <div className="search-box">
            <input
              type="text"
              placeholder="Search by Name or Emp ID..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={handleSearchKeyDown}
            />
            {searchInput && (
              <button type="button" className="search-clear" onClick={clearSearch} aria-label="Clear search">
                ×
              </button>
            )}
          </div>
          <div className="filter-box">
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="">All Types</option>
              <option value="casual">Casual</option>
              <option value="sick">Sick</option>
              <option value="lop">LOP</option>
            </select>
          </div>
        </div>

        <div className="pending-requests-section">
          <div className={`requests-table-container ${expandedPendingRequests.length > 3 ? 'scrollable' : ''}`}>
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
            {expandedPendingRequests.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ textAlign: 'center', padding: '16px' }}>
                  No leaves applied
                </td>
              </tr>
            ) : (
              expandedPendingRequests.map((request: any, idx: number) => (
                <tr key={`${request.id}-${idx}`}>
                  <td>{idx + 1}</td>
                  <td>{request.empId}</td>
                  <td>{request.empName}</td>
                  <td>{formatDateSafe(request.appliedDate)}</td>
                  <td>
                    {request.leaveDate}
                    {request.dayType === 'half' ? ' (Half day)' : ''}
                  </td>
                  <td>{request.leaveType}</td>
                  <td>{request.noOfDays}</td>
                  <td>{request.leaveReason}</td>
                  <td>
                    {request.currentStatus === 'pending' ? (
                      <span className="status-badge status-applied">Applied</span>
                    ) : request.currentStatus === 'approved' ? (
                      <span className="status-badge status-approved">Approved</span>
                    ) : request.currentStatus === 'rejected' ? (
                      <span className="status-badge status-rejected">Rejected</span>
                    ) : request.currentStatus === 'partially_approved' ? (
                      <span className="status-badge status-partial">Partially Approved</span>
                    ) : (
                      <span className="status-badge">{request.currentStatus}</span>
                    )}
                  </td>
                  <td className="actions-cell">
                    <button
                      className="approve-btn"
                      onClick={() => handleApprove(request.id, request.leaveDayId)}
                      title="Approve"
                    >
                      ✓
                    </button>
                    <button
                      className="reject-btn"
                      onClick={() => handleReject(request.id, request.leaveDayId)}
                      title="Reject"
                    >
                      ✗
                    </button>
                  </td>
                </tr>
              ))
            )}
            </tbody>
          </table>
          </div>
        </div>

        <div className="approved-requests-section">
          <h2>Recent Approved Requests</h2>
          <div className={`requests-table-container ${approvedData?.requests && approvedData.requests.length > 3 ? 'scrollable' : ''}`}>
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
              {!approvedData?.requests || approvedData.requests.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '16px' }}>
                    No leaves applied
                  </td>
                </tr>
              ) : (
                approvedData.requests.map((request: any, idx: number) => (
                  <tr key={request.id}>
                    <td>{idx + 1}</td>
                    <td>{request.empId}</td>
                    <td>{request.empName}</td>
                    <td>{formatDateSafe(request.appliedDate)}</td>
                    <td>{request.leaveDate || `${formatDateSafe(request.startDate)} to ${formatDateSafe(request.endDate)}`}</td>
                    <td>{request.leaveType}</td>
                    <td>{request.noOfDays}</td>
                    <td>
                    {request.leaveStatus === 'pending' ? (
                      <span className="status-badge status-applied">Applied</span>
                    ) : request.leaveStatus === 'approved' ? (
                        <span className="status-badge status-approved">Approved</span>
                      ) : request.leaveStatus === 'rejected' ? (
                        <span className="status-badge status-rejected">Rejected</span>
                    ) : request.leaveStatus === 'partially_approved' ? (
                      <span className="status-badge status-partial">Partially Approved</span>
                      ) : (
                        <span className="status-badge">{request.leaveStatus}</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </div>
        </div>
      </div>
    </AppLayout>
    <ConfirmationDialog
      isOpen={approveConfirmOpen}
      title="Approve Leave Request"
      message="Are you sure you want to approve this leave request?"
      confirmText="Approve"
      cancelText="Cancel"
      type="info"
      onConfirm={confirmApprove}
      onCancel={() => {
        setApproveConfirmOpen(false);
        setApproveRequestId(null);
        setApproveDayId(undefined);
      }}
    />
    <RejectCommentDialog
      isOpen={rejectConfirmOpen}
      title="Reject Leave Request"
      message="Please provide a reason for rejection:"
      confirmText="Reject"
      cancelText="Cancel"
      type="danger"
      onConfirm={confirmReject}
      onCancel={() => {
        setRejectConfirmOpen(false);
        setRejectRequestId(null);
        setRejectDayId(undefined);
      }}
    />
    </>
  );
};

export default LeaveApprovalPage;

