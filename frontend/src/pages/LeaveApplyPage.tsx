import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import AppLayout from '../components/layout/AppLayout';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import ConfirmationDialog from '../components/ConfirmationDialog';
import * as leaveService from '../services/leaveService';
import { format, addDays, eachDayOfInterval } from 'date-fns';
import { FaPencilAlt, FaTrash } from 'react-icons/fa';
import './LeaveApplyPage.css';

const LeaveApplyPage: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { showSuccess, showError, showWarning, showInfo } = useToast();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteRequestId, setDeleteRequestId] = useState<number | null>(null);
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const [doctorNoteFile, setDoctorNoteFile] = useState<File | null>(null);
  const doctorNoteInputRef = useRef<HTMLInputElement | null>(null);
  const [formData, setFormData] = useState({
    leaveType: 'casual' as 'casual' | 'sick' | 'lop' | 'permission',
    startDate: '',
    startType: 'full' as 'full' | 'first_half' | 'second_half',
    endDate: '',
    endType: 'full' as 'full' | 'first_half' | 'second_half',
    reason: '',
    timeForPermission: { start: '', end: '' }
  });
  const minStartDate = (formData.leaveType === 'casual' || formData.leaveType === 'lop')
    ? format(addDays(new Date(), 3), 'yyyy-MM-dd') // block today + next two days
    : todayStr;

  const sanitizeLettersOnly = (value: string) => {
    return value.replace(/[^a-zA-Z\s]/g, '');
  };
  const formatHalfLabel = (val?: string) => {
    if (!val) return '';
    if (val === 'first_half') return ' (First half)';
    if (val === 'second_half') return ' (Second half)';
    if (val === 'half') return ' (Half day)';
    return '';
  };

  const computeRequestedDays = () => {
    if (!formData.startDate || !formData.endDate) return 0;
    const start = new Date(`${formData.startDate}T00:00:00`);
    const end = new Date(`${formData.endDate}T00:00:00`);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
    const daysArr = eachDayOfInterval({ start, end });
    let total = 0;
    const startHalf = formData.startType !== 'full';
    const endHalf = formData.endType !== 'full';
    daysArr.forEach((d, idx) => {
      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
      if (isWeekend) return;
      const isFirst = idx === 0;
      const isLast = idx === daysArr.length - 1;
      if (isFirst && isLast) {
        total += startHalf || endHalf ? 0.5 : 1;
      } else if (isFirst) {
        total += startHalf ? 0.5 : 1;
      } else if (isLast) {
        total += endHalf ? 0.5 : 1;
      } else {
        total += 1;
      }
    });
    return total;
  };

  const isSickLongLeave = formData.leaveType === 'sick' && computeRequestedDays() >= 3;

  // Check if requested dates overlap with existing leave requests
  const checkDateOverlap = (): string | null => {
    if (!formData.startDate || !formData.endDate || !myRequests?.requests) {
      return null;
    }

    const start = new Date(`${formData.startDate}T00:00:00`);
    const end = new Date(`${formData.endDate}T00:00:00`);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return null;
    }

    const requestedDays = eachDayOfInterval({ start, end });
    const startHalf = formData.startType !== 'full';
    const endHalf = formData.endType !== 'full';

    // Check each requested day against existing leave requests
    for (const day of requestedDays) {
      const dayStr = format(day, 'yyyy-MM-dd');
      const isWeekend = day.getDay() === 0 || day.getDay() === 6;
      if (isWeekend) continue; // Skip weekends

      const isFirst = dayStr === formData.startDate;
      const isLast = dayStr === formData.endDate;
      const isHalfDay = (isFirst && startHalf) || (isLast && endHalf);
      const requestedHalf = isFirst ? formData.startType : (isLast ? formData.endType : 'full');

      // Check against existing requests (exclude the one being edited)
      for (const request of myRequests.requests) {
        // Skip rejected requests and the request being edited
        if (request.currentStatus === 'rejected' || request.id === editingId) {
          continue;
        }

        // Check if this day falls within the request's date range
        const reqStart = new Date(`${request.startDate}T00:00:00`);
        const reqEnd = new Date(`${request.endDate}T00:00:00`);
        
        if (day >= reqStart && day <= reqEnd) {
          // Check leaveDays array if available (more accurate)
          if (request.leaveDays && Array.isArray(request.leaveDays)) {
            const existingDay = request.leaveDays.find((ld: any) => ld.date === dayStr);
            if (existingDay) {
              // Check status - only block if approved or pending
              if (existingDay.status === 'approved' || existingDay.status === 'pending') {
                // If existing leave is full day, block any new leave (full or half)
                if (existingDay.type === 'full') {
                  const statusText = existingDay.status === 'approved' ? 'approved' : 'pending';
                  return `Leave already applied for ${dayStr} (${statusText} - full day). Cannot apply leave on this date.`;
                }
                // If existing leave is half day
                if (existingDay.type === 'half') {
                  // Block if new request is full day
                  if (!isHalfDay) {
                    const statusText = existingDay.status === 'approved' ? 'approved' : 'pending';
                    return `Leave already applied for ${dayStr} (${statusText} - half day). Cannot apply full day leave on this date.`;
                  }
                  // If both are half days, we can't determine if they're different halves
                  // So we'll block to be safe (user can check their existing requests)
                  const statusText = existingDay.status === 'approved' ? 'approved' : 'pending';
                  return `Leave already applied for ${dayStr} (${statusText} - half day). Cannot apply leave on this date.`;
                }
              }
            }
          } else {
            // Fallback: check date range overlap (less precise but better than nothing)
            // If the request has approved or pending status, block the entire date range
            if (request.currentStatus === 'approved' || request.currentStatus === 'pending' || request.currentStatus === 'partially_approved') {
              const statusText = request.currentStatus === 'approved' ? 'approved' : 
                                request.currentStatus === 'partially_approved' ? 'partially approved' : 'pending';
              return `Leave already applied from ${request.startDate} to ${request.endDate} (${statusText}). Dates overlap with your request.`;
            }
          }
        }
      }
    }

    return null;
  };

  const readFileAsBase64 = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result?.toString() || '';
        const base64 = result.includes('base64,') ? result.split('base64,')[1] : result;
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  // Clear doctor note when not needed
  useEffect(() => {
    if (formData.leaveType !== 'sick' || !isSickLongLeave) {
      setDoctorNoteFile(null);
    }
  }, [formData.leaveType, isSickLongLeave]);

  // When the leave spans a single day (start === end and not permission), force endType to follow startType
  useEffect(() => {
    if (
      formData.leaveType !== 'permission' &&
      formData.startDate &&
      formData.endDate &&
      formData.startDate === formData.endDate &&
      formData.endType !== formData.startType
    ) {
      setFormData((prev) => ({
        ...prev,
        endType: prev.startType
      }));
    }
  }, [formData.leaveType, formData.startType, formData.startDate, formData.endDate, formData.endType]);

  const { data: balances, isLoading: balancesLoading, error: balancesError } = useQuery(
    'leaveBalances',
    leaveService.getLeaveBalances,
    { retry: false, onError: (error: any) => {
      if (error.response?.status === 401 || error.response?.status === 403) {
        window.location.href = '/login';
      }
    }}
  );
  const { data: holidays = [], isLoading: holidaysLoading, error: holidaysError } = useQuery(
    'holidays',
    leaveService.getHolidays,
    { retry: false }
  );
  const { data: rules = [], isLoading: rulesLoading, error: rulesError } = useQuery(
    'leaveRules',
    leaveService.getLeaveRules,
    { retry: false }
  );
  const { data: myRequests, isLoading: requestsLoading, error: requestsError } = useQuery(
    'myLeaveRequests',
    () => leaveService.getMyLeaveRequests(1, 100), // Fetch more requests to check overlaps
    { retry: false, onError: (error: any) => {
      if (error.response?.status === 401 || error.response?.status === 403) {
        window.location.href = '/login';
      }
    }}
  );

  const applyMutation = useMutation(
    (data: { id?: number; data: any }) => 
      data.id 
        ? leaveService.updateLeaveRequest(data.id, data.data)
        : leaveService.applyLeave(data.data),
    {
      onSuccess: (_, variables) => {
        queryClient.invalidateQueries('leaveBalances');
        queryClient.invalidateQueries('myLeaveRequests');
        showSuccess(variables.id ? 'Leave updated successfully!' : 'Leave applied successfully!');
        setFormData({
          leaveType: 'casual',
          startDate: '',
          startType: 'full',
          endDate: '',
          endType: 'full',
          reason: '',
          timeForPermission: { start: '', end: '' }
        });
        setDoctorNoteFile(null);
        setEditingId(null);
      },
      onError: (error: any) => {
        console.error('Leave application error:', error);
        const errorMessage = error.response?.data?.error?.message || error.message || 'Failed to apply leave';
        const errorDetails = error.response?.data?.error?.details;
        
        if (errorDetails && Array.isArray(errorDetails)) {
          const detailMessages = errorDetails.map((d: any) => `${d.path.join('.')}: ${d.message}`).join('\n');
          showError(`${errorMessage}\n\n${detailMessages}`);
        } else {
          showError(errorMessage);
        }
      }
    }
  );

  const deleteMutation = useMutation(leaveService.deleteLeaveRequest, {
    onSuccess: () => {
      queryClient.invalidateQueries('leaveBalances');
      queryClient.invalidateQueries('myLeaveRequests');
      showSuccess('Leave deleted successfully!');
      // Reset form after a delete (especially if we were editing)
      setFormData({
        leaveType: 'casual',
        startDate: '',
        startType: 'full',
        endDate: '',
        endType: 'full',
        reason: '',
        timeForPermission: { start: '', end: '' }
      });
      setDoctorNoteFile(null);
      setEditingId(null);
      setDeleteConfirmOpen(false);
      setDeleteRequestId(null);
    },
    onError: (error: any) => {
      showError(error.response?.data?.error?.message || 'Failed to delete leave');
      setDeleteConfirmOpen(false);
      setDeleteRequestId(null);
    }
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Check for date overlaps with existing leave requests
    const overlapError = checkDateOverlap();
    if (overlapError) {
      showWarning(overlapError);
      return;
    }

    const requestedDays = computeRequestedDays();

    // Client-side balance guard
    if (balances) {
      if (formData.leaveType === 'casual') {
        if ((balances.casual || 0) <= 0) {
          showWarning('Casual leave balance is zero. You cannot apply casual leave.');
          return;
        }
        if (requestedDays > (balances.casual || 0)) {
          showWarning(`Insufficient casual leave balance. Available: ${balances.casual || 0}, Required: ${requestedDays}`);
          return;
        }
      }
      if (formData.leaveType === 'sick') {
        if ((balances.sick || 0) <= 0) {
          showWarning('Sick leave balance is zero. You cannot apply sick leave.');
          return;
        }
        if (requestedDays > (balances.sick || 0)) {
          showWarning(`Insufficient sick leave balance. Available: ${balances.sick || 0}, Required: ${requestedDays}`);
          return;
        }
      }
      if (formData.leaveType === 'lop') {
        if ((balances.lop || 0) <= 0) {
          showWarning('LOP balance is zero. You cannot apply LOP leave.');
          return;
        }
        if (requestedDays > (balances.lop || 0)) {
          showWarning(`Insufficient LOP balance. Available: ${balances.lop || 0}, Required: ${requestedDays}`);
          return;
        }
      }
    }

    // Client-side guard: LOP only when casual balance is 0
    if (formData.leaveType === 'lop' && (balances?.casual ?? 0) > 0) {
      showWarning('LOP can be applied only when casual leave balance is 0');
      return;
    }

    // Prepare the data for submission
    // Date inputs already return YYYY-MM-DD format, so use directly to avoid timezone issues
    const normalizeHalf = (val: string) => (val === 'first_half' || val === 'second_half' ? 'half' : val);
    const submitData: any = {
      leaveType: formData.leaveType,
      startDate: formData.startDate,
      startType: formData.leaveType === 'permission' ? 'full' : normalizeHalf(formData.startType),
      // For permission, end date should be same as start date
      endDate: formData.leaveType === 'permission' ? formData.startDate : formData.endDate,
      endType: formData.leaveType === 'permission' ? 'full' : normalizeHalf(formData.endType),
      reason: formData.reason
    };
    
    // For permission, timeForPermission is required
    if (formData.leaveType === 'permission') {
      if (!formData.timeForPermission.start || !formData.timeForPermission.end) {
        showWarning('Please provide start and end timings for permission');
        return;
      }
      submitData.timeForPermission = {
        start: formData.timeForPermission.start,
        end: formData.timeForPermission.end
      };
    }

    if (isSickLongLeave) {
      if (!doctorNoteFile) {
        showWarning('Doctor prescription is required for sick leave longer than 3 days.');
        return;
      }
      try {
        const noteBase64 = await readFileAsBase64(doctorNoteFile);
        submitData.doctorNote = noteBase64;
      } catch (err) {
        showError('Failed to read doctor prescription file. Please try again.');
        return;
      }
    }
    
    if (editingId) {
      applyMutation.mutate({ id: editingId, data: submitData });
    } else {
      applyMutation.mutate({ data: submitData });
    }
  };

  const handleEdit = async (requestId: number) => {
    try {
      const request = await leaveService.getLeaveRequest(requestId);
      setFormData({
        leaveType: request.leaveType as 'casual' | 'sick' | 'lop' | 'permission',
        startDate: request.startDate,
        startType: request.leaveType === 'permission'
          ? 'full'
          : (request.startType === 'half' ? 'first_half' : request.startType) as 'full' | 'first_half' | 'second_half',
        endDate: request.endDate,
        endType: (request.endType === 'half' ? 'first_half' : request.endType) as 'full' | 'first_half' | 'second_half',
        reason: request.reason,
        timeForPermission: request.timeForPermission || { start: '', end: '' }
      });
      setDoctorNoteFile(null);
      setEditingId(requestId);
      // Scroll to form
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error: any) {
      showError(error.response?.data?.error?.message || 'Failed to load leave request');
    }
  };

  const handleDelete = (requestId: number) => {
    setDeleteRequestId(requestId);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = () => {
    if (deleteRequestId) {
      deleteMutation.mutate(deleteRequestId);
    }
  };

  const handleClear = () => {
    setFormData({
      leaveType: 'casual',
      startDate: '',
      startType: 'full',
      endDate: '',
      endType: 'full',
      reason: '',
      timeForPermission: { start: '', end: '' }
    });
    setDoctorNoteFile(null);
    setEditingId(null);
  };

  if (balancesLoading || holidaysLoading || rulesLoading || requestsLoading) {
    return (
      <AppLayout>
        <div className="leave-apply-page">
          <div style={{ padding: '20px', textAlign: 'center' }}>Loading...</div>
        </div>
      </AppLayout>
    );
  }

  if (balancesError || holidaysError || rulesError || requestsError) {
    const anyError: any =
      balancesError || holidaysError || rulesError || requestsError;

    return (
      <AppLayout>
        <div className="leave-apply-page">
          <div style={{ padding: '20px', textAlign: 'center', color: 'red' }}>
            {anyError?.response?.status === 429
              ? 'Too many requests. Please try again later.'
              : 'Error loading data. Please try again.'}
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="leave-apply-page">
        <h1 className="page-title">Welcome, {user?.name}</h1>

        {/* Top Row: Three Equal Sections */}
        <div className="top-sections-row">
          {/* Leave Balances - Top Left */}
          <div className="leave-balances-section">
            <h2>Leave Balances</h2>
            <div className="balance-cards-container">
              <div className="balance-card">
                <div className="balance-label">Casual</div>
                <div className="balance-value">{String(balances?.casual || 0).padStart(2, '0')}</div>
              </div>
              <div className="balance-separator"></div>
              <div className="balance-card">
                <div className="balance-label">Sick</div>
                <div className="balance-value">{String(balances?.sick || 0).padStart(2, '0')}</div>
              </div>
              <div className="balance-separator"></div>
              <div className="balance-card">
                <div className="balance-label">LOP</div>
                <div className="balance-value">{String(balances?.lop || 0).padStart(2, '0')}</div>
              </div>
            </div>
          </div>

          {/* Basic Rules - Top Center */}
          <div className="rules-section">
            <h2>Basic Rules To Apply Leave</h2>
            <table className="rules-table">
              <thead>
                <tr>
                  <th>Leave Required</th>
                  <th>Prior Information</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule, idx) => (
                  <tr key={idx}>
                    <td>{rule.leaveRequired.replace('4.0', '4').replace('10.0', '10')}</td>
                    <td>{rule.priorInformation.replace(/30\\s*Month/i, '30 days').replace('Month', 'days')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Holidays List - Top Right */}
          <div className="holidays-section">
            <h2>Holidays List</h2>
            <div className="holidays-table-container">
              <table className="holidays-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Holiday name</th>
                  </tr>
                </thead>
                <tbody>
                  {holidays.map((holiday, idx) => (
                    <tr key={idx}>
                    <td>{format(new Date(holiday.date + 'T00:00:00'), 'dd/MM/yyyy')}</td>
                      <td>{holiday.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Apply Leave Form Section */}
        <div className="apply-form-section">
          <h2>{editingId ? 'Edit Leave / Permission' : 'Apply Leave / Permission'}</h2>
          <form onSubmit={handleSubmit} className="leave-form">
            <div className="form-row-6">
              <div className="form-group">
                <label>Leave Type</label>
                <select
                  value={formData.leaveType}
                  onChange={(e) => {
                    const newLeaveType = e.target.value as any;
                    // For permission, set end date same as start date and force full day
                    if (newLeaveType === 'permission') {
                      setFormData({ 
                        ...formData, 
                        leaveType: newLeaveType,
                        startType: 'full',
                        endDate: formData.startDate || '',
                        endType: 'full'
                      });
                    } else {
                      setFormData({ ...formData, leaveType: newLeaveType });
                    }
                  }}
                  required
                >
                  <option value="casual">Casual</option>
                  <option value="sick">Sick</option>
                  <option value="lop">LOP</option>
                  <option value="permission">Permission</option>
                </select>
              </div>
              <div className="form-group">
                <label>Start Date</label>
                <div className="date-input-wrapper">
                  <input
                    type="date"
                    value={formData.startDate}
                    min={minStartDate}
                    onChange={(e) => {
                      const newStartDate = e.target.value;
                      // For permission, update end date to match start date
                      if (formData.leaveType === 'permission') {
                        setFormData({ ...formData, startDate: newStartDate, endDate: newStartDate });
                      } else {
                        setFormData({ ...formData, startDate: newStartDate });
                      }
                    }}
                    required
                    className="date-input"
                  />
                </div>
              </div>
              {formData.leaveType !== 'permission' && (
                <div className="form-group">
                  <label>Start Type</label>
                  <select
                    value={formData.startType}
                    onChange={(e) => setFormData({ ...formData, startType: e.target.value as any })}
                    required
                  >
                    <option value="full">Full day</option>
                    <option value="first_half">First half</option>
                    <option value="second_half">Second half</option>
                  </select>
                </div>
              )}
              {formData.leaveType !== 'permission' && (
                <>
                  <div className="form-group">
                    <label>End Date</label>
                    <div className="date-input-wrapper">
                      <input
                        type="date"
                        value={formData.endDate}
                        onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                        required
                        min={formData.startDate || minStartDate}
                        className="date-input"
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>End Type</label>
                    <select
                      value={formData.endType}
                      onChange={(e) => setFormData({ ...formData, endType: e.target.value as any })}
                      required
                      disabled={
                        !!formData.startDate &&
                        !!formData.endDate &&
                        formData.startDate === formData.endDate
                      }
                    >
                      <option value="full">Full day</option>
                      <option value="first_half">First half</option>
                      <option value="second_half">Second half</option>
                    </select>
                  </div>
                </>
            )}
              {formData.leaveType === 'sick' && (
                <div className="form-group doctor-note-group">
                  <label>Doctor Prescription{isSickLongLeave ? ' *' : ''}</label>
                  <input
                    ref={doctorNoteInputRef}
                    id="doctor-note-input"
                    className="doctor-note-input"
                    type="file"
                    accept="image/*"
                    onChange={(e) => setDoctorNoteFile(e.target.files?.[0] || null)}
                    required={isSickLongLeave}
                    disabled={!isSickLongLeave}
                  />
                  <button
                    type="button"
                    className={`doctor-note-button${!isSickLongLeave ? ' doctor-note-button--disabled' : ''}`}
                    onClick={() => {
                      if (!isSickLongLeave) return;
                      doctorNoteInputRef.current?.click();
                    }}
                  >
                    {doctorNoteFile ? 'Change prescription file' : 'Upload prescription'}
                  </button>
                  <div className="doctor-note-meta">
                    {doctorNoteFile && (
                      <span className="doctor-note-filename">{doctorNoteFile.name}</span>
                    )}
                    {isSickLongLeave && (
                      <span className="doctor-note-helper">
                        Required for sick leave longer than 3 days. Only image files are supported.
                      </span>
                    )}
                  </div>
                </div>
              )}
              {formData.leaveType === 'permission' && (
                <div className="form-group">
                  <label>Timings</label>
                  <div className="time-inputs">
                    <div className="time-input-wrapper">
                      <input
                        className="time-input"
                        type="time"
                        value={formData.timeForPermission.start}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            timeForPermission: { ...formData.timeForPermission, start: e.target.value }
                          })
                        }
                        placeholder="Start time"
                        required
                      />
                    </div>
                    <span style={{ margin: '0 5px', color: '#666', fontSize: '12px' }}>to</span>
                    <div className="time-input-wrapper">
                      <input
                        className="time-input"
                        type="time"
                        value={formData.timeForPermission.end}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            timeForPermission: { ...formData.timeForPermission, end: e.target.value }
                          })
                        }
                        placeholder="End time"
                        required
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="form-reason-row">
              <div className="form-group reason-group">
                <label>Reason</label>
                <textarea
                  value={formData.reason}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      reason: sanitizeLettersOnly(e.target.value)
                    })
                  }
                  placeholder="Type reason..."
                  required
                  rows={4}
                />
              </div>
              <div className="form-actions">
                <button type="submit" className="submit-button">Submit</button>
                <button type="button" onClick={handleClear} className="clear-button">Clear</button>
              </div>
            </div>
          </form>
        </div>

        {/* Recent Leave Requests Section */}
        <div className="recent-requests-section">
          <h2>Recent Leave Requests</h2>
          <table className="requests-table">
            <thead>
              <tr>
                <th>S No</th>
                <th>Appiled Date</th>
                <th>Leave Reason</th>
                <th>Start date</th>
                <th>End Date</th>
                <th>No Of Days</th>
                <th>Leave Type</th>
                <th>Approved Dates</th>
                <th>Current Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {!myRequests?.requests || myRequests.requests.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '16px' }}>No leaves applied</td>
                </tr>
              ) : (
                myRequests.requests.map((request: any, idx: number) => (
                  <tr key={request.id}>
                    <td>{idx + 1}</td>
                    <td>{format(new Date(request.appliedDate + 'T12:00:00'), 'dd/MM/yyyy')}</td>
                    <td>
                      <div className="reason-cell">
                        {request.leaveReason}
                      </div>
                    </td>
                    <td>
                      {format(new Date(request.startDate + 'T12:00:00'), 'dd/MM/yyyy')}
                      {request.startType && request.startType !== 'full' ? formatHalfLabel(request.startType) : ''}
                    </td>
                    <td>
                      {format(new Date(request.endDate + 'T12:00:00'), 'dd/MM/yyyy')}
                      {request.endType && request.endType !== 'full' ? formatHalfLabel(request.endType) : ''}
                    </td>
                    <td>{request.noOfDays}</td>
                    <td>{request.leaveType === 'lop' ? 'LOP' : request.leaveType}</td>
                    <td>
                      {(() => {
                        const approvedDates = (request.leaveDays || [])
                          .filter((d: any) => d.status === 'approved')
                          .map((d: any) => new Date(d.date + 'T12:00:00'))
                          .sort((a: Date, b: Date) => a.getTime() - b.getTime());

                        if (!(request.currentStatus === 'approved' || request.currentStatus === 'partially_approved')) {
                          return '-';
                        }
                        if (!approvedDates.length) return '-';
                        if (approvedDates.length === 1) return format(approvedDates[0], 'dd/MM/yyyy');
                        return `${format(approvedDates[0], 'dd/MM/yyyy')} to ${format(approvedDates[approvedDates.length - 1], 'dd/MM/yyyy')}`;
                      })()}
                    </td>
                    <td>
                    {request.currentStatus === 'pending' ? (
                      <span className="status-badge status-applied">Applied</span>
                    ) : request.currentStatus === 'approved' ? (
                        <span className="status-badge status-approved">Approved</span>
                      ) : request.currentStatus === 'rejected' ? (
                        <span className="status-badge status-rejected" title={request.rejectionReason || 'Rejected'}>
                          Rejected{request.rejectionReason ? `: ${request.rejectionReason}` : ''}
                        </span>
                    ) : request.currentStatus === 'partially_approved' ? (
                      <span className="status-badge status-partial">Partially Approved</span>
                      ) : (
                        <span className="status-badge">{request.currentStatus}</span>
                      )}
                    </td>
                    <td>
                      {request.currentStatus === 'pending' && (
                        <>
                          <span className="action-icon" title="Edit" onClick={() => handleEdit(request.id)}>
                            <FaPencilAlt />
                          </span>
                          <span className="action-icon" title="Delete" onClick={() => handleDelete(request.id)}>
                            <FaTrash />
                          </span>
                        </>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      <ConfirmationDialog
        isOpen={deleteConfirmOpen}
        title="Delete Leave Request"
        message="Are you sure you want to delete this leave request? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
        onConfirm={confirmDelete}
        onCancel={() => {
          setDeleteConfirmOpen(false);
          setDeleteRequestId(null);
        }}
      />
    </AppLayout>
  );
};

export default LeaveApplyPage;
