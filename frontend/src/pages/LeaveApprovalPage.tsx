import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import AppLayout from '../components/layout/AppLayout';
import { useToast } from '../contexts/ToastContext';
import LeaveDetailsModal from '../components/LeaveDetailsModal';
import * as leaveService from '../services/leaveService';
import { format } from 'date-fns';
import { FaPencilAlt } from 'react-icons/fa';
import './LeaveApprovalPage.css';

const LeaveApprovalPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useToast();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const [selectedRequest, setSelectedRequest] = useState<any | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [updatingRequestIds, setUpdatingRequestIds] = useState<Set<number>>(new Set());

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
    ({ id, dayIds, comment }: { id: number; dayIds?: number[]; comment?: string }) => {
      if (dayIds && dayIds.length > 0) {
        // Approve multiple days at once (auto-rejects remaining)
        return leaveService.approveLeaveDays(id, dayIds, comment);
      } else {
        return leaveService.approveLeave(id, comment);
      }
    },
    {
      onMutate: ({ id }) => {
        setUpdatingRequestIds(prev => new Set(prev).add(id));
      },
      onSuccess: () => {
        queryClient.invalidateQueries('pendingLeaves');
        queryClient.invalidateQueries('approvedLeaves');
        showSuccess('Leave approved successfully!');
        setIsModalOpen(false);
        setSelectedRequest(null);
      },
      onError: (error: any) => {
        showError(error.response?.data?.error?.message || 'Failed to approve leave');
      },
      onSettled: (_, __, { id }) => {
        setUpdatingRequestIds(prev => {
          const newSet = new Set(prev);
          newSet.delete(id);
          return newSet;
        });
      }
    }
  );

  const rejectMutation = useMutation(
    ({ id, dayIds, comment }: { id: number; dayIds?: number[]; comment: string }) => {
      if (dayIds && dayIds.length > 0) {
        // Reject multiple days sequentially
        return Promise.all(dayIds.map(dayId => leaveService.rejectLeaveDay(id, dayId, comment)));
      } else {
        return leaveService.rejectLeave(id, comment);
      }
    },
    {
      onMutate: ({ id }) => {
        setUpdatingRequestIds(prev => new Set(prev).add(id));
      },
      onSuccess: () => {
        queryClient.invalidateQueries('pendingLeaves');
        queryClient.invalidateQueries('approvedLeaves');
        showSuccess('Leave rejected successfully!');
        setIsModalOpen(false);
        setSelectedRequest(null);
      },
      onError: (error: any) => {
        showError(error.response?.data?.error?.message || 'Failed to reject leave');
      },
      onSettled: (_, __, { id }) => {
        setUpdatingRequestIds(prev => {
          const newSet = new Set(prev);
          newSet.delete(id);
          return newSet;
        });
      }
    }
  );

  const handleEditClick = (request: any) => {
    // Find the original request from pendingRequests (not expanded)
    const originalRequest = pendingRequests.find((r: any) => r.id === request.id);
    if (originalRequest) {
      setSelectedRequest(originalRequest);
      setIsModalOpen(true);
    }
  };

  const handleModalApprove = (requestId: number, selectedDayIds?: number[]) => {
    approveMutation.mutate({ id: requestId, dayIds: selectedDayIds });
  };

  const handleModalReject = (requestId: number, selectedDayIds?: number[], reason?: string) => {
    if (!reason) {
      showError('Rejection reason is required');
      return;
    }
    rejectMutation.mutate({ id: requestId, dayIds: selectedDayIds, comment: reason });
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

  // Group requests by ID and show one row per request (not expanded by days)
  const groupedPendingRequests = pendingRequests.map((request: any) => {
    const pendingDays = request.leaveDays?.filter((day: any) => (day.status || 'pending') === 'pending') || [];
    const approvedDays = request.leaveDays?.filter((day: any) => day.status === 'approved') || [];
    const rejectedDays = request.leaveDays?.filter((day: any) => day.status === 'rejected') || [];
    
    // Determine display status
    let displayStatus = request.currentStatus;
    if (approvedDays.length > 0 && pendingDays.length > 0) {
      displayStatus = 'partially_approved';
    } else if (approvedDays.length > 0 && pendingDays.length === 0) {
      displayStatus = 'approved';
    } else if (rejectedDays.length > 0 && pendingDays.length === 0) {
      displayStatus = 'rejected';
    }

    return {
      ...request,
      displayStatus,
      pendingDaysCount: pendingDays.length,
      approvedDaysCount: approvedDays.length,
      rejectedDaysCount: rejectedDays.length
    };
  }).filter((request: any) => request.pendingDaysCount > 0); // Only show requests with pending days

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
          <div 
            className={`requests-table-container ${groupedPendingRequests.length > 3 ? 'scrollable' : ''} ${approveMutation.isLoading || rejectMutation.isLoading ? 'updating' : ''}`}
            style={{ 
              pointerEvents: (approveMutation.isLoading || rejectMutation.isLoading) ? 'none' : 'auto',
              opacity: (approveMutation.isLoading || rejectMutation.isLoading) ? 0.8 : 1
            }}
          >
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
            {groupedPendingRequests.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ textAlign: 'center', padding: '16px' }}>
                  No leaves applied
                </td>
              </tr>
            ) : (
              groupedPendingRequests.map((request: any, idx: number) => {
                const isUpdating = updatingRequestIds.has(request.id);
                const leaveDateRange = request.leaveDays && request.leaveDays.length > 0
                  ? `${formatDateSafe(request.startDate)} to ${formatDateSafe(request.endDate)}`
                  : formatDateSafe(request.startDate);
                return (
                <tr 
                  key={request.id}
                  className={isUpdating ? 'updating-row' : ''}
                >
                  <td>{idx + 1}</td>
                  <td>{request.empId}</td>
                  <td>{request.empName}</td>
                  <td>{formatDateSafe(request.appliedDate)}</td>
                  <td>{leaveDateRange}</td>
                  <td>{request.leaveType}</td>
                  <td>{request.noOfDays}</td>
                  <td>{request.leaveReason}</td>
                  <td>
                    {request.displayStatus === 'pending' ? (
                      <span className="status-badge status-applied">Applied</span>
                    ) : request.displayStatus === 'approved' ? (
                      <span className="status-badge status-approved">Approved</span>
                    ) : request.displayStatus === 'rejected' ? (
                      <span className="status-badge status-rejected">Rejected</span>
                    ) : request.displayStatus === 'partially_approved' ? (
                      <span className="status-badge status-partial">Partially Approved</span>
                    ) : (
                      <span className="status-badge">{request.displayStatus}</span>
                    )}
                  </td>
                  <td className="actions-cell">
                    <button
                      className={`edit-btn ${isUpdating || approveMutation.isLoading || rejectMutation.isLoading ? 'disabled' : ''}`}
                      onClick={() => !isUpdating && !approveMutation.isLoading && !rejectMutation.isLoading && handleEditClick(request)}
                      title={isUpdating ? 'Updating...' : 'View Details & Approve/Reject'}
                      disabled={isUpdating || approveMutation.isLoading || rejectMutation.isLoading}
                    >
                      {isUpdating ? (
                        <span className="loading-spinner-small"></span>
                      ) : (
                        <FaPencilAlt />
                      )}
                    </button>
                  </td>
                </tr>
                );
              })
            )}
            </tbody>
          </table>
          </div>
        </div>

        <div className="approved-requests-section">
          <h2>Recent Approved Requests</h2>
          <div 
            className={`requests-table-container ${approvedData?.requests && approvedData.requests.length > 3 ? 'scrollable' : ''} ${approveMutation.isLoading || rejectMutation.isLoading ? 'updating' : ''}`}
            style={{ 
              pointerEvents: (approveMutation.isLoading || rejectMutation.isLoading) ? 'none' : 'auto',
              opacity: (approveMutation.isLoading || rejectMutation.isLoading) ? 0.8 : 1
            }}
          >
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
                approvedData.requests.map((request: any, idx: number) => {
                  const isUpdating = updatingRequestIds.has(request.id);
                  return (
                  <tr 
                    key={request.id}
                    className={isUpdating ? 'updating-row' : ''}
                  >
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
                  );
                })
              )}
            </tbody>
          </table>
          </div>
        </div>
      </div>
    </AppLayout>
    <LeaveDetailsModal
      isOpen={isModalOpen}
      leaveRequest={selectedRequest}
      onClose={() => {
        setIsModalOpen(false);
        setSelectedRequest(null);
      }}
      onApprove={handleModalApprove}
      onReject={handleModalReject}
      isLoading={approveMutation.isLoading || rejectMutation.isLoading}
    />
    </>
  );
};

export default LeaveApprovalPage;

