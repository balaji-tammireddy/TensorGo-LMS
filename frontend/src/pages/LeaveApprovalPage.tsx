import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import AppLayout from '../components/layout/AppLayout';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import LeaveDetailsModal from '../components/LeaveDetailsModal';
import ErrorDisplay from '../components/common/ErrorDisplay';
import { DatePicker } from '../components/ui/date-picker';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { Button } from '../components/ui/button';
import { ChevronDown } from 'lucide-react';
import * as leaveService from '../services/leaveService';
import { format } from 'date-fns';
import { FaPencilAlt, FaEye, FaSort, FaSortUp, FaSortDown } from 'react-icons/fa';
import EmptyState from '../components/common/EmptyState';
import './LeaveApprovalPage.css';

const LeaveApprovalPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useToast();
  const { user } = useAuth();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const [selectedRequest, setSelectedRequest] = useState<any | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [updatingRequestIds, setUpdatingRequestIds] = useState<Set<number>>(new Set());
  const [editingRequestId, setEditingRequestId] = useState<number | null>(null);
  const [isRefetchingRequest, setIsRefetchingRequest] = useState(false);
  const [recentFilterDate, setRecentFilterDate] = useState('');
  const [recentSearchInput, setRecentSearchInput] = useState('');
  const [recentSearch, setRecentSearch] = useState('');
  const [recentSortConfig, setRecentSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' | null }>({
    key: 'appliedDate',
    direction: 'desc'
  });

  const handleRecentSort = (key: string) => {
    setRecentSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  const [pendingSortConfig, setPendingSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({
    key: 'appliedDate',
    direction: 'desc'
  });

  const handlePendingSort = (key: string) => {
    setPendingSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
    }, 500); // 500ms debounce delay

    return () => clearTimeout(timer);
  }, [searchInput]);

  // Debounce recent search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setRecentSearch(recentSearchInput);
    }, 500);

    return () => clearTimeout(timer);
  }, [recentSearchInput]);

  const { data: pendingData, isLoading: pendingLoading, error: pendingError } = useQuery(
    ['pendingLeaves', search, filter],
    () => leaveService.getPendingLeaveRequests(1, 10, search || undefined, filter || undefined),
    {
      retry: false,
      staleTime: 5000, // Cache for 5 seconds to reduce redundant hits
      refetchInterval: 30000, // Poll every 30 seconds instead of 15
      cacheTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
      keepPreviousData: true, // Keep old data while fetching new
      onError: (error: any) => {
        if (error.response?.status === 403 || error.response?.status === 401) {
          // Redirect to login if unauthorized
          window.location.href = '/login';
        }
      }
    }
  );

  const { data: approvedData, isLoading: approvedLoading, error: approvedError } = useQuery(
    ['approvedLeaves'],
    () => leaveService.getApprovedLeaves(1, 10),
    {
      retry: false,
      staleTime: 5000, // Cache for 5 seconds
      refetchInterval: 30000, // Poll every 30 seconds
      cacheTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
      keepPreviousData: true, // Keep old data while fetching new
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
      onMutate: async ({ id }) => {
        setUpdatingRequestIds(prev => new Set(prev).add(id));
        // Cancel outgoing refetches
        await queryClient.cancelQueries(['pendingLeaves']);
        await queryClient.cancelQueries(['approvedLeaves']);

        // Snapshot for rollback
        const previousPending = queryClient.getQueryData(['pendingLeaves']);
        const previousApproved = queryClient.getQueryData(['approvedLeaves']);

        // Optimistically remove from pending list
        queryClient.setQueryData(['pendingLeaves'], (old: any) => {
          if (!old?.requests) return old;
          return {
            ...old,
            requests: old.requests.filter((r: any) => r.id !== id)
          };
        });

        return { previousPending, previousApproved };
      },
      onSuccess: (_response, _variables) => {
        // Invalidate in background (non-blocking)
        queryClient.invalidateQueries(['pendingLeaves']);
        queryClient.invalidateQueries(['approvedLeaves']);
        showSuccess('Leave Approved Successfully!');
        setIsModalOpen(false);
        setSelectedRequest(null);
      },
      onError: (error: any, _, context) => {
        // Rollback on error
        if (context?.previousPending) {
          queryClient.setQueryData(['pendingLeaves'], context.previousPending);
        }
        if (context?.previousApproved) {
          queryClient.setQueryData(['approvedLeaves'], context.previousApproved);
        }
        showError(error.response?.data?.error?.message || 'Approval failed');
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
      // Use batch rejection if dayIds are provided
      if (dayIds && dayIds.length > 0) {
        return leaveService.rejectLeaveDays(id, dayIds, comment);
      } else {
        // Fallback for full leave rejection (legacy or if not using day selection)
        return leaveService.rejectLeave(id, comment);
      }
    },
    {
      onMutate: async ({ id }) => {
        setUpdatingRequestIds(prev => new Set(prev).add(id));
        // Cancel outgoing refetches
        await queryClient.cancelQueries(['pendingLeaves']);
        await queryClient.cancelQueries(['approvedLeaves']);

        // Snapshot for rollback
        const previousPending = queryClient.getQueryData(['pendingLeaves']);
        const previousApproved = queryClient.getQueryData(['approvedLeaves']);

        // Optimistically remove from pending list
        queryClient.setQueryData(['pendingLeaves'], (old: any) => {
          if (!old?.requests) return old;
          return {
            ...old,
            requests: old.requests.filter((r: any) => r.id !== id)
          };
        });

        return { previousPending, previousApproved };
      },
      onSuccess: () => {
        // Invalidate in background (non-blocking)
        queryClient.invalidateQueries(['pendingLeaves']);
        queryClient.invalidateQueries(['approvedLeaves']);
        showSuccess('Leave Rejected Successfully!');
        setIsModalOpen(false);
        setSelectedRequest(null);
      },
      onError: (error: any, _, context) => {
        // Rollback on error
        if (context?.previousPending) {
          queryClient.setQueryData(['pendingLeaves'], context.previousPending);
        }
        if (context?.previousApproved) {
          queryClient.setQueryData(['approvedLeaves'], context.previousApproved);
        }
        showError(error.response?.data?.error?.message || 'Rejection failed');
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
    const originalRequest = (pendingData?.requests || []).find((r: any) => r.id === request.id);
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
      showError('Rejection reason required');
      return;
    }
    rejectMutation.mutate({ id: requestId, dayIds: selectedDayIds, comment: reason });
  };

  const convertLopToCasualMutation = useMutation(
    (requestId: number) => leaveService.convertLeaveRequestLopToCasual(requestId),
    {
      onMutate: async (requestId) => {
        await queryClient.cancelQueries(['pendingLeaves']);
        const previousPending = queryClient.getQueryData(['pendingLeaves']);

        // Optimistically update leave type in the list
        queryClient.setQueryData(['pendingLeaves'], (old: any) => {
          if (!old?.requests) return old;
          return {
            ...old,
            requests: old.requests.map((r: any) =>
              r.id === requestId ? { ...r, leaveType: 'casual' } : r
            )
          };
        });

        return { previousPending };
      },
      onSuccess: async (_response, requestId) => {
        // Invalidate in background
        queryClient.invalidateQueries(['pendingLeaves']);
        queryClient.invalidateQueries(['approvedLeaves']);
        queryClient.invalidateQueries(['leaveBalances']);
        showSuccess('Converted LOP to Casual Successfully!');

        // Update selected request if modal is open - fetch full updated request to get new leave day IDs
        if (selectedRequest && selectedRequest.id === requestId) {
          try {
            setIsRefetchingRequest(true);
            const updatedRequest = await leaveService.getLeaveRequest(requestId);
            // We need to merge because leaveService.getLeaveRequest might not have all fields 
            // used in LeaveApprovalPage (like empId, empName)
            setSelectedRequest({
              ...selectedRequest,
              ...updatedRequest,
              leaveType: 'casual', // Explicitly set to match state
              leaveDays: updatedRequest.leaveDays || []
            });
          } catch (error) {
            console.error('Failed to refetch request after conversion:', error);
          } finally {
            setIsRefetchingRequest(false);
          }
        }
      },
      onError: (error: any, _requestId, context) => {
        // Rollback on error
        if (context?.previousPending) {
          queryClient.setQueryData(['pendingLeaves'], context.previousPending);
        }
        showError(error.response?.data?.error?.message || 'Conversion failed');
      }
    }
  );

  const handleConvertLopToCasual = (requestId: number) => {
    convertLopToCasualMutation.mutate(requestId);
  };


  const handleViewApprovedLeave = async (requestId: number) => {
    try {
      // Find the request from approvedData which already has leaveDays
      const fullRequest = approvedData?.requests?.find((r: any) => r.id === requestId);
      if (fullRequest) {
        // Format the request to match LeaveDetailsModal structure
        const request = await leaveService.getLeaveRequest(requestId);
        setSelectedRequest({
          id: request.id,
          empId: fullRequest.empId,
          empName: fullRequest.empName,
          appliedDate: fullRequest.appliedDate,
          startDate: request.startDate,
          endDate: request.endDate,
          startType: request.startType,
          endType: request.endType,
          leaveType: request.leaveType,
          noOfDays: fullRequest.noOfDays,
          leaveReason: request.reason,
          currentStatus: fullRequest.leaveStatus,
          doctorNote: request.doctorNote || null,
          rejectionReason: fullRequest.rejectionReason || request.rejectionReason || null,
          approverName: fullRequest.approverName || request.approverName || null,
          approverRole: fullRequest.approverRole || request.approverRole || null,
          empStatus: fullRequest.empStatus || request.empStatus || null,
          leaveDays: fullRequest.leaveDays || []
        });
        setIsEditMode(false);
        setIsModalOpen(true);
      }
    } catch (error: any) {
      showError(error.response?.data?.error?.message || 'Failed to load details');
    }
  };

  const handleEditApprovedLeave = async (requestId: number) => {
    try {
      setEditingRequestId(requestId);
      // Check permissions before opening modal
      const fullRequest = approvedData?.requests?.find((r: any) => r.id === requestId);
      if (!fullRequest) {
        showError('Request not found');
        setEditingRequestId(null);
        return;
      }

      // Check hierarchy: If super admin has updated, only super admin can edit
      // If HR has updated, manager cannot edit
      const lastUpdatedByRole = fullRequest.lastUpdatedByRole;
      if (lastUpdatedByRole === 'super_admin') {
        if (user?.role !== 'super_admin') {
          showError('Super Admin updated this. Cannot edit.');
          setEditingRequestId(null);
          return;
        }
      } else if (lastUpdatedByRole === 'hr') {
        if (user?.role === 'manager') {
          showError('HR updated this. Cannot edit.');
          setEditingRequestId(null);
          return;
        }
      }

      // Open the same modal in edit mode (only for HR and Super Admin)
      const request = await leaveService.getLeaveRequest(requestId);
      setSelectedRequest({
        id: request.id,
        empId: fullRequest.empId,
        empName: fullRequest.empName,
        appliedDate: fullRequest.appliedDate,
        startDate: request.startDate,
        endDate: request.endDate,
        startType: request.startType,
        endType: request.endType,
        leaveType: request.leaveType,
        noOfDays: fullRequest.noOfDays,
        leaveReason: request.reason,
        currentStatus: fullRequest.leaveStatus,
        doctorNote: request.doctorNote || null,
        rejectionReason: fullRequest.rejectionReason || request.rejectionReason || null,
        approverName: fullRequest.approverName || request.approverName || null,
        approverRole: fullRequest.approverRole || request.approverRole || null,
        empStatus: fullRequest.empStatus || request.empStatus || null,
        leaveDays: fullRequest.leaveDays || []
      });
      // Only set edit mode for HR and Super Admin
      setIsEditMode((user?.role === 'hr' || user?.role === 'super_admin') && fullRequest.canEdit);
      setIsModalOpen(true);
    } catch (error: any) {
      showError(error.response?.data?.error?.message || 'Failed to load for editing');
    } finally {
      setEditingRequestId(null);
    }
  };

  const updateStatusMutation = useMutation(
    ({ id, status, dayIds, rejectReason, leaveReason }: { id: number; status: string; dayIds?: number[]; rejectReason?: string; leaveReason?: string }) => {
      // Use the new updateLeaveStatus endpoint for HR/Super Admin
      return leaveService.updateLeaveStatus(id, status, dayIds, rejectReason, leaveReason);
    },
    {
      onMutate: async ({ id, status }) => {
        setUpdatingRequestIds(prev => new Set(prev).add(id));
        // Cancel outgoing refetches
        await queryClient.cancelQueries(['pendingLeaves']);
        await queryClient.cancelQueries(['approvedLeaves']);

        // Snapshot for rollback
        const previousPending = queryClient.getQueryData(['pendingLeaves']);
        const previousApproved = queryClient.getQueryData(['approvedLeaves']);

        // Optimistically update based on status
        if (status === 'approved') {
          queryClient.setQueryData(['pendingLeaves'], (old: any) => {
            if (!old?.requests) return old;
            return {
              ...old,
              requests: old.requests.filter((r: any) => r.id !== id)
            };
          });
        } else if (status === 'rejected') {
          queryClient.setQueryData(['pendingLeaves'], (old: any) => {
            if (!old?.requests) return old;
            return {
              ...old,
              requests: old.requests.filter((r: any) => r.id !== id)
            };
          });
        }

        return { previousPending, previousApproved };
      },
      onSuccess: () => {
        // Invalidate in background (non-blocking)
        queryClient.invalidateQueries(['pendingLeaves']);
        queryClient.invalidateQueries(['approvedLeaves']);
        showSuccess('Status updated!');
        setIsModalOpen(false);
        setSelectedRequest(null);
        setIsEditMode(false);
      },
      onError: (error: any, _, context) => {
        // Rollback on error
        if (context?.previousPending) {
          queryClient.setQueryData(['pendingLeaves'], context.previousPending);
        }
        if (context?.previousApproved) {
          queryClient.setQueryData(['approvedLeaves'], context.previousApproved);
        }
        showError(error.response?.data?.error?.message || 'Update failed');
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

  const handleUpdateStatus = (requestId: number, status: string, selectedDayIds?: number[], rejectReason?: string, leaveReason?: string) => {
    updateStatusMutation.mutate({ id: requestId, status, dayIds: selectedDayIds, rejectReason, leaveReason });
  };


  // Debounce search input
  useEffect(() => {
    const term = searchInput.trim();
    const timer = setTimeout(() => {
      if (term.length >= 3) {
        setSearch(term);
      } else if (term.length === 0) {
        setSearch('');
      }
    }, 500); // 500ms debounce

    return () => clearTimeout(timer);
  }, [searchInput]);

  const triggerSearch = useCallback(() => {
    const term = searchInput.trim();
    if (term.length >= 3) {
      setSearch(term);
    } else {
      setSearch('');
    }
  }, [searchInput]);

  const clearSearch = useCallback(() => {
    setSearchInput('');
    setSearch('');
  }, []);

  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      triggerSearch();
    }
  }, [triggerSearch]);

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

  // Helper to format leaveDate string (e.g., "2025-12-30 to 2025-12-31" -> "30/12/2025 to 31/12/2025")
  const formatLeaveDateString = (leaveDateStr: string | null | undefined) => {
    if (!leaveDateStr) return '';
    try {
      // Check if it contains " to " (date range)
      if (leaveDateStr.includes(' to ')) {
        const [startDate, endDate] = leaveDateStr.split(' to ');
        return `${formatDateSafe(startDate.trim())} to ${formatDateSafe(endDate.trim())}`;
      }
      // Single date
      return formatDateSafe(leaveDateStr);
    } catch {
      return leaveDateStr || '';
    }
  };

  // Group requests by ID and show one row per request (not expanded by days)
  const groupedPendingRequests = useMemo(() => {
    const pendingRequests = pendingData?.requests || [];
    const mapped = pendingRequests.map((request: any) => {
      const pendingDays = request.leaveDays?.filter((day: any) => (day.status || 'pending') === 'pending') || [];
      const approvedDays = request.leaveDays?.filter((day: any) => day.status === 'approved') || [];
      const rejectedDays = request.leaveDays?.filter((day: any) => day.status === 'rejected') || [];

      // Determine display status - prioritize pending status if there are any pending days
      let displayStatus = request.currentStatus;

      // If there are pending days, status should be 'pending' or 'partially_approved', never 'rejected' or 'approved'
      if (pendingDays.length > 0) {
        if (approvedDays.length > 0) {
          displayStatus = 'partially_approved';
        } else {
          displayStatus = 'pending';
        }
      } else {
        // No pending days - determine final status
        if (approvedDays.length > 0 && rejectedDays.length === 0) {
          displayStatus = 'approved';
        } else if (rejectedDays.length > 0 && approvedDays.length === 0) {
          displayStatus = 'rejected';
        } else if (approvedDays.length > 0 && rejectedDays.length > 0) {
          displayStatus = 'partially_approved';
        } else {
          displayStatus = 'pending';
        }
      }

      return {
        ...request,
        displayStatus,
        pendingDaysCount: pendingDays.length,
        approvedDaysCount: approvedDays.length,
        rejectedDaysCount: rejectedDays.length
      };
    }).filter((request: any) => request.pendingDaysCount > 0); // Only show requests with pending days

    // Sort based on pendingSortConfig
    return mapped.sort((a: any, b: any) => {
      if (!pendingSortConfig.key) return 0;

      let valA: number, valB: number;
      if (pendingSortConfig.key === 'appliedDate') {
        valA = a.appliedDate ? new Date(a.appliedDate + 'T00:00:00').getTime() : 0;
        valB = b.appliedDate ? new Date(b.appliedDate + 'T00:00:00').getTime() : 0;
      } else if (pendingSortConfig.key === 'startDate') {
        valA = a.startDate ? new Date(a.startDate + 'T00:00:00').getTime() : 0;
        valB = b.startDate ? new Date(b.startDate + 'T00:00:00').getTime() : 0;
      } else {
        return 0;
      }

      return pendingSortConfig.direction === 'asc' ? valA - valB : valB - valA;
    });
  }, [pendingData, pendingSortConfig]);

  // Initial loading state (only for first-time page load)
  if ((pendingLoading && !pendingData) || (approvedLoading && !approvedData)) {
    return (
      <AppLayout>
        <div className="leave-approval-page">
          <div className="skeleton-loader">
            {/* Page Title Skeleton */}
            <div className="skeleton-title"></div>

            {/* Search and Filter Bar Skeleton */}
            <div className="skeleton-search-filter">
              <div className="skeleton-input" style={{ width: '300px', height: '40px' }}></div>
              <div className="skeleton-input" style={{ width: '150px', height: '40px' }}></div>
            </div>

            {/* Table Section Skeleton */}
            <div className="skeleton-card">
              <div className="skeleton-header"></div>
              <div className="skeleton-table">
                <div className="skeleton-table-header"></div>
                {Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="skeleton-table-row" style={{ width: `${90 - index * 2}%` }}></div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (pendingError || approvedError) {
    const errorMessage = pendingError?.response?.status === 403 || approvedError?.response?.status === 403
      ? 'You do not have permission to view this page'
      : pendingError?.response?.status === 429 || approvedError?.response?.status === 429
        ? 'Too many requests. Please try again later.'
        : 'Error loading data. Please try again.';

    const handleRetry = () => {
      window.location.reload();
    };

    return (
      <AppLayout>
        <div className="leave-approval-page">
          <ErrorDisplay
            message={errorMessage}
            onRetry={handleRetry}
            showRetryButton={pendingError?.response?.status !== 403 && approvedError?.response?.status !== 403}
          />
        </div>
      </AppLayout>
    );
  }

  return (
    <>
      <AppLayout>
        <div className="leave-approval-page">
          <h1 className="page-title">Pending Requests</h1>

          <div className="search-filter-bar">
            <div className="search-box">
              <input
                type="text"
                placeholder="Search by Name or Emp ID..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value.replace(/[^a-zA-Z0-9 ]/g, ''))}
                onKeyDown={handleSearchKeyDown}
              />
              {searchInput && (
                <button type="button" className="search-clear" onClick={clearSearch} aria-label="Clear search">
                  ×
                </button>
              )}
            </div>
            <div className="filter-box">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className="leave-type-dropdown-trigger leave-filter-dropdown"
                  >
                    <span>{filter === '' ? 'All Types' : filter === 'casual' ? 'Casual' : filter === 'sick' ? 'Sick' : 'LOP'}</span>
                    <ChevronDown style={{ width: '14px', height: '14px', marginLeft: '8px' }} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="leave-type-dropdown-content">
                  <DropdownMenuItem
                    onClick={() => setFilter('')}
                  >
                    All Types
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setFilter('casual')}
                  >
                    Casual
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setFilter('sick')}
                  >
                    Sick
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setFilter('lop')}
                  >
                    LOP
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="pending-requests-section">
            <div
              className={`requests-table-container ${groupedPendingRequests.length > 3 ? 'scrollable' : ''} ${approveMutation.isLoading || rejectMutation.isLoading || pendingLoading ? 'updating' : ''}`}
              style={{
                pointerEvents: (approveMutation.isLoading || rejectMutation.isLoading || pendingLoading) ? 'none' : 'auto',
                opacity: (approveMutation.isLoading || rejectMutation.isLoading || pendingLoading) ? 0.8 : 1
              }}
            >
              <table className="requests-table">
                <thead>
                  <tr>
                    <th>S No</th>
                    <th>EMP ID</th>
                    <th>EMP NAME</th>
                    <th className="sortable-header" onClick={() => handlePendingSort('appliedDate')}>
                      <div className="header-sort-wrapper">
                        APPLIED DATE
                        {pendingSortConfig.key === 'appliedDate' ? (
                          pendingSortConfig.direction === 'asc' ? <FaSortUp className="sort-icon active" /> : <FaSortDown className="sort-icon active" />
                        ) : (
                          <FaSort className="sort-icon" />
                        )}
                      </div>
                    </th>
                    <th className="sortable-header" onClick={() => handlePendingSort('startDate')}>
                      <div className="header-sort-wrapper">
                        LEAVE DATE
                        {pendingSortConfig.key === 'startDate' ? (
                          pendingSortConfig.direction === 'asc' ? <FaSortUp className="sort-icon active" /> : <FaSortDown className="sort-icon active" />
                        ) : (
                          <FaSort className="sort-icon" />
                        )}
                      </div>
                    </th>
                    <th>LEAVE TYPE</th>
                    <th>NO OF DAYS</th>
                    <th>LEAVE REASON</th>
                    <th>CURRENT STATUS</th>
                    <th>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingLoading && !pendingData ? (
                    <tr>
                      <td colSpan={10}>
                        <div className="skeleton-table">
                          <div className="skeleton-table-row"></div>
                          <div className="skeleton-table-row"></div>
                          <div className="skeleton-table-row"></div>
                        </div>
                      </td>
                    </tr>
                  ) : groupedPendingRequests.length === 0 ? (
                    <tr>
                      <td colSpan={10} style={{ padding: 0 }}>
                        <EmptyState
                          title="No Pending Requests"
                          description="There are no leave requests waiting for your approval."
                        />
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
                          <td>
                            {request.empName}
                          </td>
                          <td>{formatDateSafe(request.appliedDate)}</td>
                          <td>{leaveDateRange}</td>
                          <td>{request.leaveType === 'lop' ? 'LOP' : request.leaveType.charAt(0).toUpperCase() + request.leaveType.slice(1)}</td>
                          <td>{request.noOfDays}</td>
                          <td>{request.leaveReason}</td>
                          <td>
                            {request.displayStatus === 'pending' ? (
                              <span className="status-badge status-pending">Pending</span>
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
                          <td>
                            <div className="actions-cell">
                              <button
                                className={`action-btn edit-btn ${isUpdating || approveMutation.isLoading || rejectMutation.isLoading ? 'disabled' : ''}`}
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
                            </div>
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
            <div className="requests-section-header">
              <h2>Recent Leave Requests</h2>
              <div className="filter-date-controls">
                {(recentFilterDate || recentSearchInput) && (
                  <button
                    className="filter-clear-button"
                    onClick={() => {
                      setRecentFilterDate('');
                      setRecentSearchInput('');
                    }}
                    title="Reset all filters"
                  >
                    Reset
                  </button>
                )}
                <div className="recent-search-box">
                  <input
                    type="text"
                    placeholder="Search by Name or Emp ID..."
                    value={recentSearchInput}
                    onChange={(e) => setRecentSearchInput(e.target.value.replace(/[^a-zA-Z0-9 ]/g, ''))}
                  />
                  {recentSearchInput && (
                    <button
                      className="search-clear-small"
                      onClick={() => setRecentSearchInput('')}
                      title="Clear search"
                    >
                      &times;
                    </button>
                  )}
                </div>
                <div className="recent-filter-controls">
                  <DatePicker
                    value={recentFilterDate}
                    onChange={(date) => setRecentFilterDate(date)}
                    placeholder="Filter by date"
                    allowManualEntry={true}
                    isEmployeeVariant={true}
                  />
                </div>
              </div>
            </div>
            <div
              className={`requests-table-container ${approvedData?.requests && approvedData.requests.length > 3 ? 'scrollable' : ''} ${approveMutation.isLoading || rejectMutation.isLoading || approvedLoading ? 'updating' : ''}`}
              style={{
                pointerEvents: (approveMutation.isLoading || rejectMutation.isLoading || approvedLoading) ? 'none' : 'auto',
                opacity: (approveMutation.isLoading || rejectMutation.isLoading || approvedLoading) ? 0.8 : 1
              }}
            >
              <table className="requests-table">
                <thead>
                  <tr>
                    <th>S No</th>
                    <th>EMP ID</th>
                    <th>EMP NAME</th>
                    <th className="sortable-header" onClick={() => handleRecentSort('appliedDate')}>
                      <div className="header-sort-wrapper">
                        APPLIED DATE
                        {recentSortConfig.key === 'appliedDate' ? (
                          recentSortConfig.direction === 'asc' ? <FaSortUp className="sort-icon active" /> : <FaSortDown className="sort-icon active" />
                        ) : (
                          <FaSort className="sort-icon" />
                        )}
                      </div>
                    </th>
                    <th className="sortable-header" onClick={() => handleRecentSort('startDate')}>
                      <div className="header-sort-wrapper">
                        LEAVE DATE
                        {recentSortConfig.key === 'startDate' ? (
                          recentSortConfig.direction === 'asc' ? <FaSortUp className="sort-icon active" /> : <FaSortDown className="sort-icon active" />
                        ) : (
                          <FaSort className="sort-icon" />
                        )}
                      </div>
                    </th>
                    <th>LEAVE TYPE</th>
                    <th>NO OF DAYS</th>
                    <th>STATUS</th>
                    <th>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {approvedLoading && !approvedData ? (
                    <tr>
                      <td colSpan={9}>
                        <div className="skeleton-table">
                          <div className="skeleton-table-row"></div>
                          <div className="skeleton-table-row"></div>
                        </div>
                      </td>
                    </tr>
                  ) : (() => {
                    // Filter and sort approved requests
                    const filteredSortedRequests = (approvedData?.requests || [])
                      .filter((request: any) => {
                        // Filter out any requests that still have pending days
                        const hasPendingDays = request.leaveDays?.some((day: any) =>
                          (day.status || 'pending') === 'pending'
                        );
                        if (hasPendingDays || request.leaveStatus === 'pending') return false;

                        // Apply search filter if set (EMP Name or ID)
                        if (recentSearch) {
                          const searchTerm = recentSearch.toLowerCase();
                          const matchesName = request.empName?.toLowerCase().includes(searchTerm);
                          const matchesId = request.empId?.toString().toLowerCase().includes(searchTerm);
                          if (!matchesName && !matchesId) return false;
                        }

                        // Apply date filter if set
                        if (!recentFilterDate) return true;

                        const filterStr = recentFilterDate;

                        // Check if filterDate matches applied date
                        const appliedStr = request.appliedDate ? request.appliedDate.split('T')[0] : '';
                        if (appliedStr === filterStr) return true;

                        // Check if filterDate falls within start-end date range
                        if (request.startDate && request.endDate) {
                          const start = request.startDate;
                          const end = request.endDate;
                          if (filterStr >= start && filterStr <= end) return true;
                        }

                        return false;
                      })
                      .sort((a: any, b: any) => {
                        if (!recentSortConfig.key || !recentSortConfig.direction) return 0;

                        const valA = a[recentSortConfig.key] ? new Date(a[recentSortConfig.key] + 'T00:00:00').getTime() : 0;
                        const valB = b[recentSortConfig.key] ? new Date(b[recentSortConfig.key] + 'T00:00:00').getTime() : 0;

                        if (recentSortConfig.direction === 'asc') {
                          return valA - valB;
                        } else {
                          return valB - valA;
                        }
                      });

                    if (filteredSortedRequests.length === 0) {
                      return (
                        <tr>
                          <td colSpan={9} style={{ padding: 0 }}>
                            <EmptyState
                              title={recentFilterDate ? "No Results Found" : "No Recent Activity"}
                              description={recentFilterDate ? "Try adjusting your filter to find what you're looking for." : "No recently approved or rejected leave requests found."}
                            />
                          </td>
                        </tr>
                      );
                    }

                    return filteredSortedRequests.map((request: any, idx: number) => {
                      const isUpdating = updatingRequestIds.has(request.id) || (editingRequestId === request.id);
                      return (
                        <tr
                          key={request.id}
                          className={isUpdating ? 'updating-row' : ''}
                        >
                          <td>{idx + 1}</td>
                          <td>{request.empId}</td>
                          <td>
                            {request.empName}
                          </td>
                          <td>{formatDateSafe(request.appliedDate)}</td>
                          <td>{formatLeaveDateString(request.leaveDate) || `${formatDateSafe(request.startDate)} to ${formatDateSafe(request.endDate)}`}</td>
                          <td>{request.leaveType === 'lop' ? 'LOP' : request.leaveType.charAt(0).toUpperCase() + request.leaveType.slice(1)}</td>
                          <td>{request.noOfDays}</td>
                          <td>
                            {request.leaveStatus === 'pending' ? (
                              <span className="status-badge status-pending">Pending</span>
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
                          <td>
                            <div className="actions-cell">
                              {(user?.role === 'hr' || user?.role === 'super_admin' || user?.role === 'manager') && (
                                <div className="action-icons-container">
                                  <button
                                    className={`action-btn view-btn ${isUpdating ? 'disabled' : ''}`}
                                    title="View Details"
                                    onClick={() => !isUpdating && handleViewApprovedLeave(request.id)}
                                    disabled={isUpdating}
                                  >
                                    <FaEye />
                                  </button>
                                  {(() => {
                                    const lastUpdatedBy = request.lastUpdatedByRole;
                                    const userRole = user?.role;
                                    let isEditDisabled = false;
                                    let editTitle = isUpdating ? 'Loading...' : 'Edit';

                                    if (lastUpdatedBy === 'super_admin' && userRole !== 'super_admin') {
                                      isEditDisabled = true;
                                      editTitle = 'Edited by Super Admin';
                                    } else if (lastUpdatedBy === 'hr' && userRole === 'manager') {
                                      isEditDisabled = true;
                                      editTitle = 'Edited by HR';
                                    }

                                    return (
                                      <button
                                        className={`action-btn edit-btn ${isUpdating || isEditDisabled ? 'disabled' : ''}`}
                                        title={editTitle}
                                        onClick={() => !isUpdating && !isEditDisabled && handleEditApprovedLeave(request.id)}
                                        disabled={isUpdating || isEditDisabled}
                                        style={isEditDisabled ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                                      >
                                        {isUpdating && editingRequestId === request.id ? (
                                          <span className="loading-spinner-small"></span>
                                        ) : (
                                          <FaPencilAlt />
                                        )}
                                      </button>
                                    );
                                  })()}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    });
                  })()}
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
          setIsEditMode(false);
        }}
        onApprove={handleModalApprove}
        onReject={handleModalReject}
        onUpdate={handleUpdateStatus}
        onConvertLopToCasual={handleConvertLopToCasual}
        isLoading={approveMutation.isLoading || rejectMutation.isLoading || updateStatusMutation.isLoading || isRefetchingRequest}
        isConverting={convertLopToCasualMutation.isLoading}
        isEditMode={isEditMode}
        userRole={user?.role}
      />
    </>
  );
};

export default LeaveApprovalPage;

