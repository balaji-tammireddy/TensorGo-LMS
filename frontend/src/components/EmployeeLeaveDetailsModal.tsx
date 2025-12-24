import React from 'react';
import { FaTimes } from 'react-icons/fa';
import { format } from 'date-fns';
import './LeaveDetailsModal.css';

interface LeaveDay {
  date: string;
  type: string;
  status: string;
}

interface EmployeeLeaveDetailsModalProps {
  isOpen: boolean;
  leaveRequest: {
    id: number;
    appliedDate: string;
    startDate: string;
    endDate: string;
    startType?: string;
    endType?: string;
    leaveType: string;
    noOfDays: number;
    leaveReason: string;
    currentStatus: string;
    rejectionReason?: string;
    doctorNote?: string | null;
    leaveDays?: LeaveDay[];
  } | null;
  onClose: () => void;
}

const EmployeeLeaveDetailsModal: React.FC<EmployeeLeaveDetailsModalProps> = ({
  isOpen,
  leaveRequest,
  onClose
}) => {
  if (!isOpen || !leaveRequest) return null;

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
    const status = leaveRequest.currentStatus;
    if (status === 'pending') return 'Pending';
    if (status === 'approved') return 'Approved';
    if (status === 'rejected') return 'Rejected';
    if (status === 'partially_approved') return 'Partially Approved';
    return status;
  };

  const approvedDays = leaveRequest.leaveDays?.filter(day => day.status === 'approved') || [];
  const rejectedDays = leaveRequest.leaveDays?.filter(day => day.status === 'rejected') || [];
  const pendingDays = leaveRequest.leaveDays?.filter(day => day.status === 'pending') || [];

  return (
    <div className="leave-details-modal-overlay" onClick={onClose}>
      <div className="leave-details-modal" onClick={(e) => e.stopPropagation()}>
        <div className="leave-details-modal-header">
          <h2>Leave Request Details</h2>
          <button className="leave-details-modal-close" onClick={onClose}>
            <FaTimes />
          </button>
        </div>

        <div className="leave-details-modal-body">
          <div className="leave-details-grid">
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

            {leaveRequest.leaveType === 'sick' && leaveRequest.doctorNote && (
              <div className="leave-detail-item leave-detail-item-full">
                <label>Doctor Prescription</label>
                <div className="prescription-container">
                  <button
                    type="button"
                    className="prescription-view-button"
                    onClick={() => {
                      const img = document.createElement('img');
                      img.src = `data:image/jpeg;base64,${leaveRequest.doctorNote}`;
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

            {leaveRequest.rejectionReason && (
              <div className="leave-detail-item leave-detail-item-full">
                <label>Rejection Reason</label>
                <div className="leave-detail-value rejection-reason">{leaveRequest.rejectionReason}</div>
              </div>
            )}

            {leaveRequest.leaveDays && leaveRequest.leaveDays.length > 0 && (
              <div className="leave-detail-item leave-detail-item-full">
                <label>Leave Days Breakdown</label>
                <div className="leave-days-breakdown">
                  <div className="breakdown-stats">
                    {approvedDays.length > 0 && (
                      <div className="breakdown-stat approved">
                        <span className="stat-label">Approved:</span>
                        <span className="stat-value">{approvedDays.length} day(s)</span>
                      </div>
                    )}
                    {rejectedDays.length > 0 && (
                      <div className="breakdown-stat rejected">
                        <span className="stat-label">Rejected:</span>
                        <span className="stat-value">{rejectedDays.length} day(s)</span>
                      </div>
                    )}
                    {pendingDays.length > 0 && (
                      <div className="breakdown-stat pending">
                        <span className="stat-label">Pending:</span>
                        <span className="stat-value">{pendingDays.length} day(s)</span>
                      </div>
                    )}
                  </div>
                  <div className="leave-days-list">
                    {leaveRequest.leaveDays.map((day, idx) => {
                      const isApproved = day.status === 'approved';
                      const isRejected = day.status === 'rejected';
                      const isPending = day.status === 'pending';

                      return (
                        <div
                          key={idx}
                          className={`leave-day-item ${
                            isApproved ? 'day-approved' :
                            isRejected ? 'day-rejected' :
                            isPending ? 'day-pending' : ''
                          }`}
                        >
                          <span className="day-date">{formatDateSafe(day.date)}</span>
                          <span className="day-type">{getDayTypeLabel(day.type)}</span>
                          <span className={`day-status status-${day.status}`}>
                            {isApproved ? 'Approved' : isRejected ? 'Rejected' : 'Pending'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="leave-details-modal-footer">
          <button
            className="leave-details-modal-button leave-details-modal-button-cancel"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default EmployeeLeaveDetailsModal;

