import React, { useState, useEffect } from 'react';
import { FaTimes, FaCheck, FaTimesCircle } from 'react-icons/fa';
import { format, parse, eachDayOfInterval } from 'date-fns';
import './LeaveDetailsModal.css';

interface LeaveDay {
  id: number;
  date: string;
  type: string;
  status: string;
}

interface LeaveDetailsModalProps {
  isOpen: boolean;
  leaveRequest: {
    id: number;
    empId: string;
    empName: string;
    appliedDate: string;
    startDate: string;
    endDate: string;
    startType?: string;
    endType?: string;
    leaveType: string;
    noOfDays: number;
    leaveReason: string;
    currentStatus: string;
    leaveDays?: LeaveDay[];
  } | null;
  onClose: () => void;
  onApprove: (requestId: number, selectedDayIds?: number[]) => void;
  onReject: (requestId: number, selectedDayIds?: number[], reason?: string) => void;
  isLoading?: boolean;
}

const LeaveDetailsModal: React.FC<LeaveDetailsModalProps> = ({
  isOpen,
  leaveRequest,
  onClose,
  onApprove,
  onReject,
  isLoading = false
}) => {
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setFromDate('');
      setToDate('');
      setShowRejectDialog(false);
      setRejectReason('');
    }
  }, [isOpen]);

  if (!isOpen || !leaveRequest) return null;

  const isMultiDay = leaveRequest.leaveDays && leaveRequest.leaveDays.length > 1;
  const pendingDays = leaveRequest.leaveDays?.filter(day => day.status === 'pending') || [];
  const approvedDays = leaveRequest.leaveDays?.filter(day => day.status === 'approved') || [];
  const rejectedDays = leaveRequest.leaveDays?.filter(day => day.status === 'rejected') || [];

  // Get available dates for selection (only pending dates)
  const availableDates = pendingDays.map(day => day.date).sort();
  const minDate = availableDates[0] || '';
  const maxDate = availableDates[availableDates.length - 1] || '';

  // Get all dates in the leave request for calendar display
  const allLeaveDates = leaveRequest.leaveDays || [];
  const dateMap = new Map<string, { id: number; type: string; status: string }>();
  allLeaveDates.forEach(day => {
    dateMap.set(day.date, { id: day.id, type: day.type, status: day.status });
  });

  // Get selected date range as day IDs
  const getSelectedDayIds = (): number[] => {
    if (!fromDate || !toDate) {
      return [];
    }

    const from = parse(fromDate, 'yyyy-MM-dd', new Date());
    const to = parse(toDate, 'yyyy-MM-dd', new Date());
    
    const selectedDates: number[] = [];
    const interval = eachDayOfInterval({ start: from, end: to });
    
    interval.forEach(date => {
      const dateStr = format(date, 'yyyy-MM-dd');
      const dayInfo = dateMap.get(dateStr);
      if (dayInfo && dayInfo.status === 'pending') {
        selectedDates.push(dayInfo.id);
      }
    });

    return selectedDates;
  };

  const handleApproveClick = () => {
    if (isMultiDay && pendingDays.length > 0) {
      // For multi-day, approve selected range or all pending if no range selected
      const daysToApprove = fromDate && toDate 
        ? getSelectedDayIds()
        : pendingDays.map(day => day.id);
      
      if (daysToApprove.length === 0) {
        return;
      }
      
      onApprove(leaveRequest.id, daysToApprove);
      setFromDate('');
      setToDate('');
    } else {
      // Single day - use the day ID
      const dayId = pendingDays.length === 1 ? pendingDays[0].id : undefined;
      onApprove(leaveRequest.id, dayId ? [dayId] : undefined);
    }
  };

  const handleRejectClick = () => {
    setShowRejectDialog(true);
  };

  const confirmReject = () => {
    if (!rejectReason.trim()) return;
    
    if (isMultiDay && pendingDays.length > 0) {
      // For multi-day, reject selected range or all pending if no range selected
      const daysToReject = fromDate && toDate 
        ? getSelectedDayIds()
        : pendingDays.map(day => day.id);
      
      if (daysToReject.length === 0) {
        return;
      }
      
      onReject(leaveRequest.id, daysToReject, rejectReason.trim());
    } else {
      // Single day - use the day ID
      const dayId = pendingDays.length === 1 ? pendingDays[0].id : undefined;
      onReject(leaveRequest.id, dayId ? [dayId] : undefined, rejectReason.trim());
    }
    
    setShowRejectDialog(false);
    setRejectReason('');
    setFromDate('');
    setToDate('');
  };

  const handleFromDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFromDate = e.target.value;
    
    // Validate that the date is within available dates
    if (newFromDate && !availableDates.includes(newFromDate)) {
      return;
    }
    
    setFromDate(newFromDate);
    
    // If toDate is before new fromDate, clear it
    if (toDate && newFromDate && toDate < newFromDate) {
      setToDate('');
    }
  };

  const handleToDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newToDate = e.target.value;
    
    // Validate that the date is within available dates
    if (newToDate && !availableDates.includes(newToDate)) {
      return;
    }
    
    // Validate that toDate is after fromDate
    if (fromDate && newToDate && newToDate < fromDate) {
      return;
    }
    
    setToDate(newToDate);
  };

  const getLeaveTypeLabel = (type: string) => {
    const labels: { [key: string]: string } = {
      casual: 'Casual',
      sick: 'Sick',
      lop: 'LOP',
      permission: 'Permission'
    };
    return labels[type] || type;
  };

  const getDayTypeLabel = (type: string) => {
    if (type === 'full') return 'Full Day';
    if (type === 'half') return 'Half Day';
    if (type === 'first_half') return 'First Half';
    if (type === 'second_half') return 'Second Half';
    return type;
  };

  const formatDateSafe = (dateStr: string) => {
    try {
      const date = new Date(dateStr + 'T12:00:00');
      return format(date, 'dd/MM/yyyy');
    } catch {
      return dateStr;
    }
  };

  const getStatusLabel = () => {
    if (approvedDays.length === 0 && rejectedDays.length === 0) {
      return 'Pending';
    }
    if (approvedDays.length > 0 && pendingDays.length > 0) {
      return 'Partially Approved';
    }
    if (approvedDays.length > 0 && pendingDays.length === 0) {
      return 'Approved';
    }
    if (rejectedDays.length > 0 && pendingDays.length === 0) {
      return 'Rejected';
    }
    return leaveRequest.currentStatus;
  };

  return (
    <>
      <div className="leave-details-modal-overlay" onClick={onClose}>
        <div className="leave-details-modal" onClick={(e) => e.stopPropagation()}>
          <div className="leave-details-modal-header">
            <h2>Leave Request Details</h2>
            <button className="leave-details-modal-close" onClick={onClose} disabled={isLoading}>
              <FaTimes />
            </button>
          </div>

          <div className="leave-details-modal-body">
            <div className="leave-details-grid">
              <div className="leave-detail-item">
                <label>Employee ID</label>
                <div className="leave-detail-value">{leaveRequest.empId}</div>
              </div>

              <div className="leave-detail-item">
                <label>Employee Name</label>
                <div className="leave-detail-value">{leaveRequest.empName}</div>
              </div>

              <div className="leave-detail-item">
                <label>Applied Date</label>
                <div className="leave-detail-value">{formatDateSafe(leaveRequest.appliedDate)}</div>
              </div>

              <div className="leave-detail-item">
                <label>Leave Type</label>
                <div className="leave-detail-value">{getLeaveTypeLabel(leaveRequest.leaveType)}</div>
              </div>

              <div className="leave-detail-item">
                <label>Start Date</label>
                <div className="leave-detail-value">
                  {formatDateSafe(leaveRequest.startDate)}
                  {leaveRequest.startType && leaveRequest.startType !== 'full' && (
                    <span className="day-type-badge"> ({getDayTypeLabel(leaveRequest.startType)})</span>
                  )}
                </div>
              </div>

              <div className="leave-detail-item">
                <label>End Date</label>
                <div className="leave-detail-value">
                  {formatDateSafe(leaveRequest.endDate)}
                  {leaveRequest.endType && leaveRequest.endType !== 'full' && (
                    <span className="day-type-badge"> ({getDayTypeLabel(leaveRequest.endType)})</span>
                  )}
                </div>
              </div>

              <div className="leave-detail-item">
                <label>Number of Days</label>
                <div className="leave-detail-value">{leaveRequest.noOfDays}</div>
              </div>

              <div className="leave-detail-item">
                <label>Current Status</label>
                <div className="leave-detail-value">
                  <span className={`status-badge status-${getStatusLabel().toLowerCase().replace(' ', '-')}`}>
                    {getStatusLabel()}
                  </span>
                </div>
              </div>

              <div className="leave-detail-item leave-detail-item-full">
                <label>Leave Reason</label>
                <div className="leave-detail-value">{leaveRequest.leaveReason || 'N/A'}</div>
              </div>

              {isMultiDay && leaveRequest.leaveDays && leaveRequest.leaveDays.length > 0 && pendingDays.length > 0 && (
                <div className="leave-detail-item leave-detail-item-full">
                  <label>Select Date Range to Approve/Reject</label>
                  <div className="date-range-picker-container">
                    <div className="date-range-inputs">
                      <div className="date-range-input-group">
                        <label>From Date</label>
                        <input
                          type="date"
                          value={fromDate}
                          min={minDate}
                          max={maxDate}
                          onChange={handleFromDateChange}
                          disabled={isLoading}
                          className="date-range-input"
                        />
                      </div>
                      <div className="date-range-input-group">
                        <label>To Date</label>
                        <input
                          type="date"
                          value={toDate}
                          min={fromDate || minDate}
                          max={maxDate}
                          onChange={handleToDateChange}
                          disabled={isLoading || !fromDate}
                          className="date-range-input"
                        />
                      </div>
                    </div>
                    {fromDate && toDate && (
                      <div className="date-range-selection-info">
                        Selected range: {formatDateSafe(fromDate)} to {formatDateSafe(toDate)} 
                        ({getSelectedDayIds().length} day(s))
                      </div>
                    )}
                    {!fromDate && !toDate && (
                      <div className="date-range-selection-hint">
                        Select a date range above to approve specific dates, or leave empty to process all pending dates. Note: Reject can only be used for all pending dates.
                      </div>
                    )}
                    {fromDate && toDate && (
                      <div className="date-range-selection-hint">
                        Partial approval selected. Remaining dates will be automatically rejected.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="leave-details-modal-footer">
            <button
              className="leave-details-modal-button leave-details-modal-button-cancel"
              onClick={onClose}
              disabled={isLoading}
            >
              Close
            </button>
            {pendingDays.length > 0 && (
              <>
                {!fromDate || !toDate ? (
                  <button
                    className="leave-details-modal-button leave-details-modal-button-reject"
                    onClick={handleRejectClick}
                    disabled={isLoading}
                  >
                    <FaTimesCircle /> Reject All
                  </button>
                ) : null}
                <button
                  className="leave-details-modal-button leave-details-modal-button-approve"
                  onClick={handleApproveClick}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <span className="loading-spinner"></span>
                      Processing...
                    </>
                  ) : (
                    <>
                      <FaCheck /> {fromDate && toDate ? 'Approve Selected' : 'Approve'}
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {showRejectDialog && (
        <div className="reject-reason-dialog-overlay" onClick={() => setShowRejectDialog(false)}>
          <div className="reject-reason-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="reject-reason-dialog-header">
              <h3>Reject Leave Request</h3>
              <button 
                className="reject-reason-dialog-close" 
                onClick={() => {
                  setShowRejectDialog(false);
                  setRejectReason('');
                }}
                disabled={isLoading}
              >
                <FaTimes />
              </button>
            </div>
            <div className="reject-reason-dialog-body">
              <p>Please provide a reason for rejection:</p>
              <textarea
                className="reject-reason-textarea"
                placeholder="Enter rejection reason..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={4}
                autoFocus
                disabled={isLoading}
              />
            </div>
            <div className="reject-reason-dialog-footer">
              <button
                className="reject-reason-dialog-button reject-reason-dialog-button-cancel"
                onClick={() => {
                  setShowRejectDialog(false);
                  setRejectReason('');
                }}
                disabled={isLoading}
              >
                Cancel
              </button>
              <button
                className="reject-reason-dialog-button reject-reason-dialog-button-confirm"
                onClick={confirmReject}
                disabled={!rejectReason.trim() || isLoading}
              >
                {isLoading ? (
                  <>
                    <span className="loading-spinner"></span>
                    Rejecting...
                  </>
                ) : (
                  'Reject'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default LeaveDetailsModal;

