import React, { useState, useEffect } from 'react';
import { FaTimes, FaCheck, FaTimesCircle, FaExchangeAlt } from 'react-icons/fa';
import { format, parse, eachDayOfInterval } from 'date-fns';
import ConfirmationDialog from './ConfirmationDialog';
import { DatePicker } from './ui/date-picker';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { Button } from './ui/button';
import { ChevronDown } from 'lucide-react';
import * as leaveService from '../services/leaveService';
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
    doctorNote?: string | null;
    rejectionReason?: string | null;
    approverName?: string | null;
    approverRole?: string | null;
    leaveDays?: LeaveDay[];
  } | null;
  onClose: () => void;
  onApprove: (requestId: number, selectedDayIds?: number[]) => void;
  onReject: (requestId: number, selectedDayIds?: number[], reason?: string) => void;
  onUpdate?: (requestId: number, status: string, selectedDayIds?: number[], rejectReason?: string, leaveReason?: string) => void;
  onConvertLopToCasual?: (requestId: number) => void;
  isLoading?: boolean;
  isEditMode?: boolean;
  userRole?: string;
  isConverting?: boolean;
}

const LeaveDetailsModal: React.FC<LeaveDetailsModalProps> = ({
  isOpen,
  leaveRequest,
  onClose,
  onApprove,
  onReject,
  onUpdate,
  onConvertLopToCasual,
  isLoading = false,
  isEditMode = false,
  userRole,
  isConverting = false
}) => {
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [updatedLeaveReason, setUpdatedLeaveReason] = useState<string>('');
  const [showConvertConfirmDialog, setShowConvertConfirmDialog] = useState(false);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setFromDate('');
      setToDate('');
      setShowRejectDialog(false);
      setRejectReason('');
      setSelectedStatus('');
      setUpdatedLeaveReason('');
      setShowConvertConfirmDialog(false);
    } else if (isOpen && leaveRequest && isEditMode) {
      // Set initial status and reason when opening in edit mode
      setSelectedStatus(leaveRequest.currentStatus);
      setUpdatedLeaveReason(leaveRequest.leaveReason || '');
    }
  }, [isOpen, leaveRequest, isEditMode]);

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
    
    if (isEditMode && onUpdate) {
      // Edit mode - update status to rejected
      const allDayIds = allLeaveDates.map(day => day.id);
      onUpdate(leaveRequest.id, 'rejected', allDayIds, rejectReason.trim(), updatedLeaveReason);
      setShowRejectDialog(false);
      setRejectReason('');
    } else if (isMultiDay && pendingDays.length > 0) {
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

  const handleFromDateChange = (newFromDate: string) => {
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

  const handleToDateChange = (newToDate: string) => {
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

  // Helper to convert date string to YYYY-MM-DD format for input
  const convertToInputDate = (dateStr: string): string => {
    try {
      if (dateStr.includes('/')) {
        // DD/MM/YYYY format
        const [day, month, year] = dateStr.split('/');
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      } else if (dateStr.includes('-')) {
        // Already YYYY-MM-DD
        return dateStr;
      } else {
        const date = new Date(dateStr + 'T12:00:00');
        return format(date, 'yyyy-MM-dd');
      }
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
      <div className="leave-details-modal-overlay">
        <div className="leave-details-modal">
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
                {isEditMode && (userRole === 'hr' || userRole === 'super_admin') ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button 
                        variant="outline" 
                        className="leave-type-dropdown-trigger"
                        disabled={isLoading}
                        style={{ 
                          padding: '6px 8px',
                          fontSize: '12px',
                          fontFamily: 'Poppins, sans-serif',
                          border: '1px solid #ddd',
                          borderRadius: '4px',
                          backgroundColor: 'transparent',
                          color: '#1f2a3d',
                          height: 'auto'
                        }}
                      >
                        <span>
                          {selectedStatus === 'approved' ? 'Approved' :
                           selectedStatus === 'partially_approved' ? 'Partially Approved' :
                           selectedStatus === 'rejected' ? 'Rejected' : selectedStatus}
                        </span>
                        <ChevronDown style={{ width: '14px', height: '14px', marginLeft: '8px' }} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="leave-type-dropdown-content">
                      <DropdownMenuItem
                        onClick={() => {
                          setSelectedStatus('approved');
                          setFromDate('');
                          setToDate('');
                        }}
                      >
                        Approved
                      </DropdownMenuItem>
                      {isMultiDay && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedStatus('partially_approved');
                            }}
                          >
                            Partially Approved
                          </DropdownMenuItem>
                        </>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => {
                          setSelectedStatus('rejected');
                          setFromDate('');
                          setToDate('');
                        }}
                      >
                        Rejected
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <div className="leave-detail-value">
                    <span className={`status-badge status-${getStatusLabel().toLowerCase().replace(' ', '-')}`}>
                      {getStatusLabel()}
                    </span>
                  </div>
                )}
              </div>

              <div className="leave-detail-item leave-detail-item-full">
                <label>Leave Reason</label>
                {isEditMode && (userRole === 'hr' || userRole === 'super_admin') ? (
                  <textarea
                    value={updatedLeaveReason}
                    onChange={(e) => setUpdatedLeaveReason(e.target.value)}
                    className="leave-reason-textarea"
                    rows={4}
                    placeholder="Enter leave reason..."
                    disabled={isLoading}
                  />
                ) : (
                  <div className="leave-detail-value">{leaveRequest.leaveReason || 'N/A'}</div>
                )}
              </div>

              {/* Rejection Reason - show only if rejected */}
              {leaveRequest.currentStatus === 'rejected' && leaveRequest.rejectionReason && (
                <div className="leave-detail-item leave-detail-item-full">
                  <label>Rejection Reason</label>
                  <div className="leave-detail-value">
                    {leaveRequest.rejectionReason}
                  </div>
                </div>
              )}

              {/* Approver Information - show only if approved or rejected */}
              {(leaveRequest.currentStatus === 'approved' || leaveRequest.currentStatus === 'rejected' || leaveRequest.currentStatus === 'partially_approved') && leaveRequest.approverName && (
                <div className="leave-detail-item">
                  <label>{leaveRequest.currentStatus === 'rejected' ? 'Rejected By' : 'Approved By'}</label>
                  <div className="leave-detail-value">
                    {leaveRequest.approverName}
                    {leaveRequest.approverRole && (
                      <span className="approver-role-badge"> ({leaveRequest.approverRole})</span>
                    )}
                  </div>
                </div>
              )}

              {leaveRequest.leaveType === 'sick' && leaveRequest.doctorNote && (
                <div className="leave-detail-item leave-detail-item-full">
                  <label>Doctor Prescription</label>
                  <div className="prescription-container">
                    <button
                      type="button"
                      className="prescription-view-button"
                      onClick={async () => {
                        let imageUrl: string;
                        
                        // Check if it's an OVHcloud key or base64
                        if (leaveRequest.doctorNote && leaveRequest.doctorNote.startsWith('medical-certificates/')) {
                          // Request signed URL from backend
                          try {
                            const { signedUrl } = await leaveService.getMedicalCertificateSignedUrl(leaveRequest.id);
                            imageUrl = signedUrl;
                          } catch (err) {
                            console.error('Failed to get signed URL:', err);
                            alert('Failed to load medical certificate. Please try again.');
                            return;
                          }
                        } else if (leaveRequest.doctorNote && leaveRequest.doctorNote.startsWith('data:')) {
                          // Base64 - use as-is
                          imageUrl = leaveRequest.doctorNote;
                        } else {
                          // Fallback - try as base64
                          imageUrl = `data:image/jpeg;base64,${leaveRequest.doctorNote}`;
                        }
                        
                        const img = document.createElement('img');
                        img.src = imageUrl;
                        img.style.maxWidth = '90vw';
                        img.style.maxHeight = '90vh';
                        img.style.objectFit = 'contain';
                        img.style.cursor = 'default';
                        img.onclick = (e) => e.stopPropagation();
                        
                        const closeButton = document.createElement('button');
                        closeButton.innerHTML = '×';
                        closeButton.style.position = 'absolute';
                        closeButton.style.top = '20px';
                        closeButton.style.right = '20px';
                        closeButton.style.width = '40px';
                        closeButton.style.height = '40px';
                        closeButton.style.borderRadius = '50%';
                        closeButton.style.border = 'none';
                        closeButton.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
                        closeButton.style.color = '#333';
                        closeButton.style.fontSize = '28px';
                        closeButton.style.fontWeight = 'bold';
                        closeButton.style.cursor = 'pointer';
                        closeButton.style.display = 'flex';
                        closeButton.style.alignItems = 'center';
                        closeButton.style.justifyContent = 'center';
                        closeButton.style.zIndex = '10001';
                        closeButton.style.transition = 'background-color 0.2s';
                        closeButton.onmouseenter = () => {
                          closeButton.style.backgroundColor = 'rgba(255, 255, 255, 1)';
                        };
                        closeButton.onmouseleave = () => {
                          closeButton.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
                        };
                        
                        const closeOverlay = () => {
                          if (document.body.contains(overlay)) {
                            document.body.removeChild(overlay);
                          }
                        };
                        
                        closeButton.onclick = (e) => {
                          e.stopPropagation();
                          closeOverlay();
                        };
                        
                        const overlay = document.createElement('div');
                        overlay.style.position = 'fixed';
                        overlay.style.top = '0';
                        overlay.style.left = '0';
                        overlay.style.right = '0';
                        overlay.style.bottom = '0';
                        overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
                        overlay.style.display = 'flex';
                        overlay.style.alignItems = 'center';
                        overlay.style.justifyContent = 'center';
                        overlay.style.zIndex = '10000';
                        overlay.style.cursor = 'pointer';
                        overlay.onclick = closeOverlay;
                        
                        overlay.appendChild(img);
                        overlay.appendChild(closeButton);
                        document.body.appendChild(overlay);
                      }}
                    >
                      View Prescription
                    </button>
                  </div>
                </div>
              )}

              {/* Date selection for pending leaves (approval flow) */}
              {isMultiDay && leaveRequest.leaveDays && leaveRequest.leaveDays.length > 0 && pendingDays.length > 0 && !isEditMode && (
                <div className="leave-detail-item leave-detail-item-full">
                  <label>Select Date Range to Approve/Reject</label>
                  <div className="date-range-picker-container">
                    <div className="date-range-inputs">
                      <div className="date-range-input-group">
                        <label>From Date</label>
                        <DatePicker
                          value={fromDate}
                          onChange={handleFromDateChange}
                          min={minDate}
                          max={maxDate}
                          disabled={isLoading}
                          placeholder="Select from date"
                        />
                      </div>
                      <div className="date-range-input-group">
                        <label>To Date</label>
                        <DatePicker
                          value={toDate}
                          onChange={handleToDateChange}
                          min={fromDate || minDate}
                          max={maxDate}
                          disabled={isLoading || !fromDate}
                          placeholder="Select to date"
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

              {/* Date selection for edit mode - partially approved */}
              {isEditMode && isMultiDay && selectedStatus === 'partially_approved' && (
                <div className="leave-detail-item leave-detail-item-full">
                  <label>Select Date Range to Approve</label>
                  <div className="date-range-picker-container">
                    <div className="date-range-selection-hint">
                      Select the date range to approve. Remaining dates will be rejected.
                    </div>
                    <div className="date-range-inputs">
                      <div className="date-range-input-group">
                        <label>From Date</label>
                        <DatePicker
                          value={fromDate}
                          min={convertToInputDate(leaveRequest.startDate)}
                          max={convertToInputDate(leaveRequest.endDate)}
                          onChange={(newFromDate) => {
                            setFromDate(newFromDate);
                            if (toDate && newFromDate && toDate < newFromDate) {
                              setToDate('');
                            }
                          }}
                          disabled={isLoading}
                          placeholder="Select from date"
                        />
                      </div>
                      <div className="date-range-input-group">
                        <label>To Date</label>
                        <DatePicker
                          value={toDate}
                          min={fromDate || convertToInputDate(leaveRequest.startDate)}
                          max={convertToInputDate(leaveRequest.endDate)}
                          onChange={(newToDate) => {
                            if (fromDate && newToDate && newToDate < fromDate) {
                              return;
                            }
                            setToDate(newToDate);
                          }}
                          disabled={isLoading || !fromDate}
                          placeholder="Select to date"
                        />
                      </div>
                    </div>
                    {fromDate && toDate && (
                      <div className="date-range-selection-info">
                        Selected range: {formatDateSafe(fromDate)} to {formatDateSafe(toDate)}
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
              disabled={isLoading || isConverting}
            >
              Close
            </button>
            {leaveRequest.leaveType === 'lop' && 
             (userRole === 'hr' || userRole === 'super_admin') && 
             onConvertLopToCasual && (
              <button
                className="leave-details-modal-button leave-details-modal-button-convert"
                onClick={() => setShowConvertConfirmDialog(true)}
                disabled={isLoading || isConverting}
                title="Convert LOP to Casual"
              >
                {isConverting ? (
                  <>
                    <span className="loading-spinner"></span>
                    Converting...
                  </>
                ) : (
                  <>
                    <FaExchangeAlt /> Convert to Casual
                  </>
                )}
              </button>
            )}
            {isEditMode && (userRole === 'hr' || userRole === 'super_admin') ? (
              <button
                className="leave-details-modal-button leave-details-modal-button-approve"
                onClick={() => {
                  if (!onUpdate) return;
                  
                  // For partially approved, need date range
                  if (selectedStatus === 'partially_approved') {
                    if (!fromDate || !toDate) {
                      alert('Please select a date range for partial approval');
                      return;
                    }
                    // Get day IDs for selected date range
                    const from = parse(fromDate, 'yyyy-MM-dd', new Date());
                    const to = parse(toDate, 'yyyy-MM-dd', new Date());
                    const interval = eachDayOfInterval({ start: from, end: to });
                    const selectedDayIds: number[] = [];
                    interval.forEach(date => {
                      const dateStr = format(date, 'yyyy-MM-dd');
                      const dayInfo = dateMap.get(dateStr);
                      if (dayInfo) {
                        selectedDayIds.push(dayInfo.id);
                      }
                    });
                    onUpdate(leaveRequest.id, selectedStatus, selectedDayIds, undefined, updatedLeaveReason);
                  } else if (selectedStatus === 'rejected') {
                    // For rejection, show dialog for reason
                    setShowRejectDialog(true);
                  } else {
                    // For approved, approve all days
                    const allDayIds = allLeaveDates.map(day => day.id);
                    onUpdate(leaveRequest.id, selectedStatus, allDayIds, undefined, updatedLeaveReason);
                  }
                }}
                disabled={isLoading || selectedStatus === leaveRequest.currentStatus || (selectedStatus === 'partially_approved' && (!fromDate || !toDate))}
              >
                {isLoading ? (
                  <>
                    <span className="loading-spinner"></span>
                    Updating...
                  </>
                ) : (
                  <>
                    <FaCheck /> Update Status
                  </>
                )}
              </button>
            ) : (
              pendingDays.length > 0 && (
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
              )
            )}
          </div>
        </div>
      </div>

      {showRejectDialog && (
        <div className="reject-reason-dialog-overlay">
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

      {/* Convert LOP to Casual Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showConvertConfirmDialog}
        title="Convert LOP to Casual"
        message={
          leaveRequest
            ? `Are you sure you want to convert this LOP leave request to Casual?\n\nThis will:\n• Refund ${leaveRequest.noOfDays} ${leaveRequest.noOfDays === 1 ? 'day' : 'days'} to LOP balance\n• Deduct ${leaveRequest.noOfDays} ${leaveRequest.noOfDays === 1 ? 'day' : 'days'} from Casual balance\n\n⚠️ This action cannot be undone.`
            : ''
        }
        confirmText="Convert"
        cancelText="Cancel"
        onConfirm={() => {
          if (onConvertLopToCasual && leaveRequest) {
            onConvertLopToCasual(leaveRequest.id);
          }
          setShowConvertConfirmDialog(false);
        }}
        onCancel={() => setShowConvertConfirmDialog(false)}
        type="warning"
        isLoading={isConverting}
      />
    </>
  );
};

export default LeaveDetailsModal;

