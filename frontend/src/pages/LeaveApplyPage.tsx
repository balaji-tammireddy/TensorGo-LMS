import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import AppLayout from '../components/layout/AppLayout';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import ConfirmationDialog from '../components/ConfirmationDialog';
import EmployeeLeaveDetailsModal from '../components/EmployeeLeaveDetailsModal';
import ErrorDisplay from '../components/common/ErrorDisplay';
import { DatePicker } from '../components/ui/date-picker';
import * as leaveService from '../services/leaveService';
import { format, addDays, eachDayOfInterval } from 'date-fns';
import { FaPencilAlt, FaTrash, FaEye } from 'react-icons/fa';
import './LeaveApplyPage.css';

const LeaveApplyPage: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { showSuccess, showError, showWarning, showInfo } = useToast();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingRequestId, setEditingRequestId] = useState<number | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteRequestId, setDeleteRequestId] = useState<number | null>(null);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [viewRequest, setViewRequest] = useState<any | null>(null);
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const [doctorNoteFile, setDoctorNoteFile] = useState<File | null>(null);
  const [existingDoctorNote, setExistingDoctorNote] = useState<string | null>(null);
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
  // For sick leave: allow past 3 days (including today) or ONLY tomorrow for future dates
  // For future dates, can ONLY apply for next day (tomorrow), not any other future dates
  const minStartDate = formData.leaveType === 'casual'
    ? format(addDays(new Date(), 3), 'yyyy-MM-dd') // block today + next two days for casual
    : formData.leaveType === 'sick'
    ? format(addDays(new Date(), -3), 'yyyy-MM-dd') // allow past 3 days for sick leave
    : todayStr; // LOP and permission can be applied for today
  
  // For sick leave: max date is tomorrow (only allow tomorrow for future dates)
  const maxStartDate = formData.leaveType === 'sick'
    ? format(addDays(new Date(), 1), 'yyyy-MM-dd') // only allow tomorrow for future sick leave
    : undefined; // no max date for other leave types

  const sanitizeLettersOnly = (value: string) => {
    return value.replace(/[^a-zA-Z\s]/g, '');
  };

  // Check if a date is a weekend (Saturday = 6, Sunday = 0)
  const isWeekend = (dateStr: string): boolean => {
    if (!dateStr) return false;
    const date = new Date(dateStr + 'T00:00:00');
    const dayOfWeek = date.getDay();
    return dayOfWeek === 0 || dayOfWeek === 6; // Sunday or Saturday
  };

  const formatHalfLabel = (val?: string) => {
    if (!val) return '';
    if (val === 'first_half') return ' (First half)';
    if (val === 'second_half') return ' (Second half)';
    if (val === 'half') return ' (Half day)';
    return '';
  };

  // Round time to nearest 15-minute slot
  const roundTo15Minutes = (timeStr: string): string => {
    if (!timeStr) return timeStr;
    const [hours, minutes] = timeStr.split(':').map(Number);
    const roundedMinutes = Math.round(minutes / 15) * 15;
    if (roundedMinutes >= 60) {
      return `${String(hours + 1).padStart(2, '0')}:00`;
    }
    return `${String(hours).padStart(2, '0')}:${String(roundedMinutes).padStart(2, '0')}`;
  };

  // Validate and force 15-minute intervals (00, 15, 30, 45 only)
  const validate15MinuteInterval = (timeStr: string): string => {
    if (!timeStr) return timeStr;
    const [hours, minutes] = timeStr.split(':').map(Number);
    // Only allow 00, 15, 30, 45
    const validMinutes = [0, 15, 30, 45];
    if (!validMinutes.includes(minutes)) {
      // Round to nearest valid minute
      return roundTo15Minutes(timeStr);
    }
    return timeStr;
  };

  // Round current time to next 15-minute slot within office hours (10:00-19:00)
  const getNext15MinuteSlot = (): string => {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinutes = now.getMinutes();
    
    // If before office hours, return 10:00
    if (currentHour < 10) {
      return '10:00';
    }
    
    // If after office hours for start time (18:00), return 10:00 (next day, but we'll handle this in validation)
    if (currentHour >= 18) {
      return '10:00';
    }
    
    // Round to next 15-minute slot
    const roundedMinutes = Math.ceil(currentMinutes / 15) * 15;
    
    if (roundedMinutes >= 60) {
      const nextHour = currentHour + 1;
      // If next hour is after office hours for start time, cap at 18:00
      if (nextHour >= 18) {
        return '18:00';
      }
      return `${String(nextHour).padStart(2, '0')}:00`;
    }
    
    const result = `${String(currentHour).padStart(2, '0')}:${String(roundedMinutes).padStart(2, '0')}`;
    
    // Ensure result is within office hours for start time (max 18:00)
    if (result >= '18:00') {
      return '18:00';
    }
    
    return result;
  };

  // Clamp time to office hours (10:00-19:00 for end time, 10:00-18:00 for start time)
  const clampToOfficeHours = (timeStr: string, isStartTime: boolean = false): string => {
    if (!timeStr) return timeStr;
    if (timeStr < '10:00') return '10:00';
    const maxTime = isStartTime ? '18:00' : '19:00';
    if (timeStr > maxTime) return maxTime;
    return timeStr;
  };

  // Handle start time change from custom picker
  const handleStartTimeChange = (newStartTime: string) => {
    if (!newStartTime) return;
    
    // Round to nearest 15-minute slot (should already be valid from select, but ensure)
    let roundedStartTime = roundTo15Minutes(newStartTime);
    
    // Clamp to office hours (10:00-18:00 for start time)
    if (roundedStartTime < '10:00') {
      showWarning('Start time must be within office hours (10:00 AM - 6:00 PM). Setting to 10:00.');
      roundedStartTime = '10:00';
    } else if (roundedStartTime > '18:00') {
      showWarning('Start time must be within office hours (10:00 AM - 6:00 PM). Setting to 18:00.');
      roundedStartTime = '18:00';
    }
    
    // Validate start time is not in the past (if date is today)
    if (formData.startDate === todayStr) {
      const now = new Date();
      const [hours, minutes] = roundedStartTime.split(':').map(Number);
      const selectedTime = new Date();
      selectedTime.setHours(hours, minutes, 0, 0);
      
      if (selectedTime < now) {
        const nextSlot = clampToOfficeHours(getNext15MinuteSlot(), true);
        showWarning('Start time cannot be in the past. Setting to next available 15-minute slot within office hours.');
        setFormData({
          ...formData,
          timeForPermission: { 
            start: nextSlot, 
            end: (() => {
              const [h, m] = nextSlot.split(':').map(Number);
              const st = new Date();
              st.setHours(h, m, 0, 0);
              const et = new Date(st);
              et.setHours(et.getHours() + 2);
              let eh = et.getHours();
              let em = et.getMinutes();
              em = Math.round(em / 15) * 15;
              if (em >= 60) {
                eh += 1;
                em = 0;
              }
              if (eh >= 19) {
                eh = 19;
                em = 0;
              }
              return `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
            })()
          }
        });
        return;
      }
    }
    
    // Calculate end time (2 hours after start, rounded to 15 minutes)
    const [hours, minutes] = roundedStartTime.split(':').map(Number);
    const startTime = new Date();
    startTime.setHours(hours, minutes, 0, 0);
    const endTime = new Date(startTime);
    endTime.setHours(endTime.getHours() + 2);
    
    // Round end time to 15-minute slot and clamp to office hours
    let endHour = endTime.getHours();
    let endMinute = endTime.getMinutes();
    
    // Round to 15-minute slot
    endMinute = Math.round(endMinute / 15) * 15;
    if (endMinute >= 60) {
      endHour += 1;
      endMinute = 0;
    }
    
    // Clamp to office hours (19:00 max)
    if (endHour >= 19) {
      endHour = 19;
      endMinute = 0;
    }
    
    const calculatedEndTime = `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`;
    
    setFormData({
      ...formData,
      timeForPermission: { start: roundedStartTime, end: calculatedEndTime }
    });
  };

  // Handle end time change from custom picker
  const handleEndTimeChange = (newEndTime: string) => {
    if (!newEndTime || !formData.timeForPermission.start) return;
    
    // Round to nearest 15-minute slot (should already be valid from select, but ensure)
    let roundedEndTime = roundTo15Minutes(newEndTime);
    
    // Clamp to office hours (10:00-19:00)
    if (roundedEndTime < '10:00') {
      roundedEndTime = '10:00';
      showWarning('End time must be within office hours (10:00 AM - 7:00 PM).');
    } else if (roundedEndTime > '19:00') {
      roundedEndTime = '19:00';
      showWarning('End time must be within office hours (10:00 AM - 7:00 PM).');
    }
    
    const [startHours, startMinutes] = formData.timeForPermission.start.split(':').map(Number);
    const [endHours, endMinutes] = roundedEndTime.split(':').map(Number);
    const startTime = new Date(`2000-01-01T${String(startHours).padStart(2, '0')}:${String(startMinutes).padStart(2, '0')}:00`);
    let endTime = new Date(`2000-01-01T${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}:00`);
    
    // Handle case where end time is next day (after midnight)
    if (endTime < startTime) {
      endTime.setDate(endTime.getDate() + 1);
    }
    
    const diffMs = endTime.getTime() - startTime.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    
    // Validate end time is after start time
    if (diffHours <= 0) {
      showWarning('End time must be after start time.');
      // Reset to 2 hours after start, rounded to 15 minutes, within office hours
      const calculatedEndTime = new Date(startTime);
      calculatedEndTime.setHours(calculatedEndTime.getHours() + 2);
      let endHour = calculatedEndTime.getHours();
      let endMinute = calculatedEndTime.getMinutes();
      endMinute = Math.round(endMinute / 15) * 15;
      if (endMinute >= 60) {
        endHour += 1;
        endMinute = 0;
      }
      // Clamp to office hours
      if (endHour >= 19) {
        endHour = 19;
        endMinute = 0;
      }
      const validEndTime = `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`;
      setFormData({
        ...formData,
        timeForPermission: { ...formData.timeForPermission, end: validEndTime }
      });
      return;
    }
    
    // Validate duration doesn't exceed 2 hours
    if (diffHours > 2) {
      showWarning('Permission duration cannot exceed 2 hours. Maximum end time is 2 hours after start time.');
      // Reset to 2 hours after start, rounded to 15 minutes, within office hours
      const calculatedEndTime = new Date(startTime);
      calculatedEndTime.setHours(calculatedEndTime.getHours() + 2);
      let endHour = calculatedEndTime.getHours();
      let endMinute = calculatedEndTime.getMinutes();
      endMinute = Math.round(endMinute / 15) * 15;
      if (endMinute >= 60) {
        endHour += 1;
        endMinute = 0;
      }
      // Clamp to office hours
      if (endHour >= 19) {
        endHour = 19;
        endMinute = 0;
      }
      const validEndTime = `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`;
      setFormData({
        ...formData,
        timeForPermission: { ...formData.timeForPermission, end: validEndTime }
      });
      return;
    }
    
    setFormData({
      ...formData,
      timeForPermission: { ...formData.timeForPermission, end: roundedEndTime }
    });
  };

  // Memoize expensive computation
  const requestedDays = useMemo(() => {
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
  }, [formData.startDate, formData.endDate, formData.startType, formData.endType]);

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
    if (formData.leaveType !== 'sick') {
      setDoctorNoteFile(null);
      setExistingDoctorNote(null);
    }
  }, [formData.leaveType]);

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

  // Set default permission times when permission type is selected
  useEffect(() => {
    if (formData.leaveType === 'permission' && formData.startDate && !formData.timeForPermission.start) {
      const isToday = formData.startDate === todayStr;
      
      // If it's today, use next 15-minute slot within office hours; otherwise use 10:00
      let defaultStartTime = isToday ? getNext15MinuteSlot() : '10:00';
      defaultStartTime = clampToOfficeHours(defaultStartTime);
      
      // Calculate end time (2 hours after start time, rounded to 15 minutes, within office hours)
      const [startHours, startMinutes] = defaultStartTime.split(':').map(Number);
      const startTime = new Date();
      startTime.setHours(startHours, startMinutes, 0, 0);
      const endTime = new Date(startTime);
      endTime.setHours(endTime.getHours() + 2);
      let endHour = endTime.getHours();
      let endMinute = endTime.getMinutes();
      
      // Round to 15-minute slot
      endMinute = Math.round(endMinute / 15) * 15;
      if (endMinute >= 60) {
        endHour += 1;
        endMinute = 0;
      }
      
      // Clamp to office hours (19:00 max)
      if (endHour >= 19) {
        endHour = 19;
        endMinute = 0;
      }
      
      const defaultEndTime = `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`;
      
      setFormData(prev => ({
        ...prev,
        timeForPermission: { start: defaultStartTime, end: defaultEndTime }
      }));
    }
  }, [formData.leaveType, formData.startDate, todayStr]);

  // Update end time when start time changes (for permission) - auto-set to 2 hours after start
  useEffect(() => {
    if (formData.leaveType === 'permission' && formData.timeForPermission.start) {
      const [hours, minutes] = formData.timeForPermission.start.split(':').map(Number);
      const startTime = new Date();
      startTime.setHours(hours, minutes, 0, 0);
      
      // Calculate end time (2 hours after start, rounded to 15 minutes)
      const endTime = new Date(startTime);
      endTime.setHours(endTime.getHours() + 2);
      let endHour = endTime.getHours();
      let endMinute = endTime.getMinutes();
      
      // Round to 15-minute slot
      endMinute = Math.round(endMinute / 15) * 15;
      if (endMinute >= 60) {
        endHour += 1;
        endMinute = 0;
      }
      if (endHour >= 24) {
        endHour = 23;
        endMinute = 45;
      }
      
      const calculatedEndTime = `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`;
      
      // Auto-update end time to be 2 hours after start (unless user manually changed it)
      // We'll allow manual changes but validate max 2 hours
      setFormData(prev => {
        // Only auto-update if end time is empty or if current end time is more than 2 hours
        const shouldUpdate = !prev.timeForPermission.end || (() => {
          if (!prev.timeForPermission.end) return true;
          const [endHours, endMinutes] = prev.timeForPermission.end.split(':').map(Number);
          const currentEndTime = new Date();
          currentEndTime.setHours(endHours, endMinutes, 0, 0);
          const diffMs = currentEndTime.getTime() - startTime.getTime();
          const diffHours = diffMs / (1000 * 60 * 60);
          return diffHours > 2;
        })();
        
        return {
          ...prev,
          timeForPermission: { 
            ...prev.timeForPermission, 
            end: shouldUpdate ? calculatedEndTime : prev.timeForPermission.end 
          }
        };
      });
    }
  }, [formData.timeForPermission.start, formData.leaveType]);

  const { data: balances, isLoading: balancesLoading, error: balancesError } = useQuery(
    'leaveBalances',
    leaveService.getLeaveBalances,
    { 
      retry: false,
      staleTime: 1 * 60 * 1000, // Cache for 1 minute
      cacheTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
      onError: (error: any) => {
        if (error.response?.status === 401 || error.response?.status === 403) {
          window.location.href = '/login';
        }
      }
    }
  );


  const [selectedYear, setSelectedYear] = useState<number>(2026);
  
  const { data: holidaysData = [], isLoading: holidaysLoading, error: holidaysError } = useQuery(
    ['holidays', selectedYear],
    () => leaveService.getHolidays(selectedYear),
    { 
      retry: false,
      staleTime: 0, // Always refetch when year changes
      cacheTime: 0, // Don't cache old year data
      refetchOnMount: true, // Always refetch when component mounts
      refetchOnWindowFocus: false // Don't refetch on window focus
    }
  );

  // Filter holidays by selected year only (for display)
  // Backend returns both years for leave calculations, but UI shows only selected year
  const holidays = React.useMemo(() => {
    if (!holidaysData || holidaysData.length === 0) return [];
    return holidaysData.filter((holiday: any) => {
      try {
        const holidayDate = new Date(holiday.date + 'T00:00:00');
        const holidayYear = holidayDate.getFullYear();
        // Show only holidays for the selected year in the UI
        return holidayYear === selectedYear;
      } catch (error) {
        return false;
      }
    }).sort((a: any, b: any) => {
      // Sort by date
      const dateA = new Date(a.date + 'T00:00:00');
      const dateB = new Date(b.date + 'T00:00:00');
      return dateA.getTime() - dateB.getTime();
    });
  }, [holidaysData, selectedYear]);
  const { data: rules = [], isLoading: rulesLoading, error: rulesError } = useQuery(
    'leaveRules',
    leaveService.getLeaveRules,
    { retry: false }
  );
  const { data: myRequests, isLoading: requestsLoading, error: requestsError } = useQuery(
    'myLeaveRequests',
    () => leaveService.getMyLeaveRequests(1, 50), // Reduced from 100 to 50 for faster loading
    { 
      retry: false,
      staleTime: 2 * 60 * 1000, // Cache for 2 minutes
      cacheTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
      onError: (error: any) => {
        if (error.response?.status === 401 || error.response?.status === 403) {
          window.location.href = '/login';
        }
      }
    }
  );

  // Optimize date overlap check with memoization and early exits
  const checkDateOverlap = useCallback((): string | null => {
    if (!formData.startDate || !formData.endDate || !myRequests?.requests) {
      return null;
    }

    const start = new Date(`${formData.startDate}T00:00:00`);
    const end = new Date(`${formData.endDate}T00:00:00`);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return null;
    }

    // Pre-filter and pre-process existing requests for faster lookup
    const activeRequests = myRequests.requests
      .filter((r: any) => r.currentStatus !== 'rejected' && r.id !== editingId)
      .map((r: any) => ({
        ...r,
        reqStart: new Date(`${r.startDate}T00:00:00`),
        reqEnd: new Date(`${r.endDate}T00:00:00`),
        leaveDaysMap: r.leaveDays && Array.isArray(r.leaveDays) 
          ? new Map(r.leaveDays.map((ld: any) => [ld.date, ld]))
          : null
      }));

    if (activeRequests.length === 0) return null;

    const requestedDaysArray = eachDayOfInterval({ start, end });
    const startHalf = formData.startType !== 'full';
    const endHalf = formData.endType !== 'full';

    // Check each requested day against existing leave requests
    for (const day of requestedDaysArray) {
      const dayStr = format(day, 'yyyy-MM-dd');
      const isWeekend = day.getDay() === 0 || day.getDay() === 6;
      if (isWeekend) continue; // Skip weekends

      const isFirst = dayStr === formData.startDate;
      const isLast = dayStr === formData.endDate;
      const isHalfDay = (isFirst && startHalf) || (isLast && endHalf);

      // Check against existing requests with optimized lookup
      for (const request of activeRequests) {
        // Quick date range check first (faster than day-by-day)
        if (day < request.reqStart || day > request.reqEnd) {
          continue;
        }

        // Check leaveDays array if available (more accurate)
        if (request.leaveDaysMap) {
          const existingDay = request.leaveDaysMap.get(dayStr);
          if (existingDay) {
            // Check status - block if approved, pending, or partially_approved (not rejected)
            if (existingDay.status === 'approved' || existingDay.status === 'pending' || existingDay.status === 'partially_approved') {
              // If existing leave is full day, block any new leave (full or half)
              if (existingDay.type === 'full') {
                const statusText = existingDay.status === 'approved' ? 'approved' : 
                                  existingDay.status === 'partially_approved' ? 'partially approved' : 'pending';
                return `Leave already exists for ${dayStr} (${statusText} - full day). Cannot apply leave on this date.`;
              }
              // If existing leave is half day
              if (existingDay.type === 'half') {
                // Block if new request is full day
                if (!isHalfDay) {
                  const statusText = existingDay.status === 'approved' ? 'approved' : 
                                    existingDay.status === 'partially_approved' ? 'partially approved' : 'pending';
                  return `Leave already exists for ${dayStr} (${statusText} - half day). Cannot apply full day leave on this date.`;
                }
                // If both are half days, block to prevent conflicts
                const statusText = existingDay.status === 'approved' ? 'approved' : 
                                  existingDay.status === 'partially_approved' ? 'partially approved' : 'pending';
                return `Leave already exists for ${dayStr} (${statusText} - half day). Cannot apply leave on this date.`;
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

    return null;
  }, [formData.startDate, formData.endDate, formData.startType, formData.endType, myRequests?.requests, editingId]);

  const applyMutation = useMutation(
    (data: { id?: number; data: any }) => 
      data.id 
        ? leaveService.updateLeaveRequest(data.id, data.data)
        : leaveService.applyLeave(data.data),
    {
      onMutate: async (variables) => {
        // Cancel outgoing refetches
        await queryClient.cancelQueries('myLeaveRequests');
        await queryClient.cancelQueries('leaveBalances');
        
        // Snapshot previous values for rollback
        const previousRequests = queryClient.getQueryData('myLeaveRequests');
        const previousBalances = queryClient.getQueryData('leaveBalances');
        
        return { previousRequests, previousBalances };
      },
      onSuccess: (response, variables) => {
        // Optimistically add/update request in the list immediately
        if (response?.request) {
          queryClient.setQueryData('myLeaveRequests', (old: any) => {
            if (!old?.requests) return old;
            const requests = [...old.requests];
            if (variables.id) {
              // Update existing
              const index = requests.findIndex((r: any) => r.id === variables.id);
              if (index !== -1) {
                requests[index] = { ...requests[index], ...response.request };
              }
            } else {
              // Add new at the beginning
              requests.unshift(response.request);
            }
            return { ...old, requests };
          });
        }
        
        // Invalidate queries in background (non-blocking) for fresh data
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
        setEditingRequestId(null);
      },
      onError: (error: any, variables, context) => {
        // Rollback on error
        if (context?.previousRequests) {
          queryClient.setQueryData('myLeaveRequests', context.previousRequests);
        }
        if (context?.previousBalances) {
          queryClient.setQueryData('leaveBalances', context.previousBalances);
        }
        
        const errorMessage = error.response?.data?.error?.message || error.message || 'Failed to apply leave';
        const errorDetails = error.response?.data?.error?.details;
        
        if (errorDetails && Array.isArray(errorDetails)) {
          // Format field names to be user-friendly
          const formatFieldName = (path: string[]): string => {
            const field = path[path.length - 1]; // Get the last part (e.g., 'reason' from 'body.reason')
            // Capitalize first letter and replace underscores with spaces
            return field.charAt(0).toUpperCase() + field.slice(1).replace(/_/g, ' ');
          };
          
          // Remove duplicates and format messages
          const uniqueMessages = new Map<string, string>();
          errorDetails.forEach((d: any) => {
            const fieldName = formatFieldName(d.path || []);
            const message = d.message || '';
            // Use field name + message as key to avoid duplicates
            const key = `${fieldName}:${message}`;
            if (!uniqueMessages.has(key)) {
              uniqueMessages.set(key, `${fieldName}: ${message}`);
            }
          });
          
          const detailMessages = Array.from(uniqueMessages.values()).join('\n');
          showError(detailMessages || errorMessage);
        } else {
          showError(errorMessage);
        }
      }
    }
  );

  const deleteMutation = useMutation(leaveService.deleteLeaveRequest, {
    onMutate: async (requestId) => {
      await queryClient.cancelQueries('myLeaveRequests');
      const previousRequests = queryClient.getQueryData('myLeaveRequests');
      
      // Optimistically remove from list
      queryClient.setQueryData('myLeaveRequests', (old: any) => {
        if (!old?.requests) return old;
        return {
          ...old,
          requests: old.requests.filter((r: any) => r.id !== requestId)
        };
      });
      
      return { previousRequests };
    },
    onSuccess: () => {
      // Invalidate in background for fresh data
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
    onError: (error: any, requestId, context) => {
      // Rollback on error
      if (context?.previousRequests) {
        queryClient.setQueryData('myLeaveRequests', context.previousRequests);
      }
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

    // Use memoized requestedDays

    // Validation for sick leave: can apply for past 3 days (including today) or ONLY tomorrow for future dates
    // Optimized with single date calculation
    if (formData.leaveType === 'sick') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const oneDayMs = 1000 * 60 * 60 * 24;
      
      // Validate start date
      if (formData.startDate) {
        const startDate = new Date(formData.startDate + 'T12:00:00');
        startDate.setHours(0, 0, 0, 0);
        const daysDifference = Math.floor((startDate.getTime() - today.getTime()) / oneDayMs);
        
        if (daysDifference < -3) {
          showWarning('Cannot apply sick leave for start dates more than 3 days in the past.');
          return;
        }
        if (daysDifference > 1) {
          showWarning('For future dates, sick leave start date can only be tomorrow (next day). You can apply for past dates (up to 3 days) or tomorrow only.');
          return;
        }
      }
      
      // Validate end date
      if (formData.endDate) {
        const endDate = new Date(formData.endDate + 'T12:00:00');
        endDate.setHours(0, 0, 0, 0);
        const endDaysDifference = Math.floor((endDate.getTime() - today.getTime()) / oneDayMs);
        
        if (endDaysDifference < -3) {
          showWarning('Cannot apply sick leave for end dates more than 3 days in the past.');
          return;
        }
        if (endDaysDifference > 1) {
          showWarning('For future dates, sick leave end date can only be tomorrow (next day). You can apply for past dates (up to 3 days) or tomorrow only.');
          return;
        }
      }
    }

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

    // Prepare the data for submission
    // Date inputs already return YYYY-MM-DD format, so use directly to avoid timezone issues
    const submitData: any = {
      leaveType: formData.leaveType,
      startDate: formData.startDate,
      startType: formData.leaveType === 'permission' ? 'full' : formData.startType,
      // For permission, end date should be same as start date
      endDate: formData.leaveType === 'permission' ? formData.startDate : formData.endDate,
      endType: formData.leaveType === 'permission' ? 'full' : formData.endType,
      reason: formData.reason
    };
    
    // For permission, timeForPermission is required
    if (formData.leaveType === 'permission') {
      if (!formData.timeForPermission.start || !formData.timeForPermission.end) {
        showWarning('Please provide start and end timings for permission');
        return;
      }
      
      // Validate permission duration (max 2 hours)
      const [startHours, startMinutes] = formData.timeForPermission.start.split(':').map(Number);
      const [endHours, endMinutes] = formData.timeForPermission.end.split(':').map(Number);
      const startTime = new Date(`2000-01-01T${String(startHours).padStart(2, '0')}:${String(startMinutes).padStart(2, '0')}:00`);
      const endTime = new Date(`2000-01-01T${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}:00`);
      
      // Handle case where end time is next day (after midnight)
      if (endTime < startTime) {
        endTime.setDate(endTime.getDate() + 1);
      }
      
      const diffMs = endTime.getTime() - startTime.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);
      
      if (diffHours > 2) {
        showWarning('Permission duration cannot exceed 2 hours');
        return;
      }
      
      if (diffHours <= 0) {
        showWarning('End time must be after start time');
        return;
      }
      submitData.timeForPermission = {
        start: formData.timeForPermission.start,
        end: formData.timeForPermission.end
      };
    }

    // Upload doctor note if provided (optional for all sick leaves)
    // If editing and no new file is uploaded, preserve existing doctor note
    if (formData.leaveType === 'sick') {
      if (doctorNoteFile) {
        // Send file directly - backend will handle upload to OVHcloud
        submitData.doctorNote = doctorNoteFile;
      } else if (editingId && existingDoctorNote) {
        // Preserve existing doctor note when editing without uploading new file
        // Could be OVHcloud key (medical-certificates/...) or base64 (data:...)
        submitData.doctorNote = existingDoctorNote;
      }
    }
    
    if (editingId) {
      applyMutation.mutate({ id: editingId, data: submitData });
    } else {
      applyMutation.mutate({ data: submitData });
    }
  };

  const handleEdit = async (requestId: number) => {
    // Prevent editing if any mutation is in progress
    if (applyMutation.isLoading || deleteMutation.isLoading) {
      return;
    }
    
    try {
      setEditingRequestId(requestId);
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
      setExistingDoctorNote(request.doctorNote || null);
      setEditingId(requestId);
      // Scroll to form
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error: any) {
      showError(error.response?.data?.error?.message || 'Failed to load leave request');
    } finally {
      setEditingRequestId(null);
    }
  };

  const handleDelete = (requestId: number) => {
    setDeleteRequestId(requestId);
    setDeleteConfirmOpen(true);
  };

  const handleView = (requestId: number) => {
    // Get the request data directly from myRequests (no need to call API)
    const request = myRequests?.requests?.find((r: any) => r.id === requestId);
    if (request) {
      setViewRequest({
        id: request.id,
        appliedDate: request.appliedDate,
        startDate: request.startDate,
        endDate: request.endDate,
        startType: request.startType || 'full',
        endType: request.endType || 'full',
        leaveType: request.leaveType,
        noOfDays: request.noOfDays,
        leaveReason: request.leaveReason,
        currentStatus: request.currentStatus,
        rejectionReason: request.rejectionReason,
        approverName: request.approverName || null,
        approverRole: request.approverRole || null,
        doctorNote: request.doctorNote || null,
        leaveDays: request.leaveDays || []
      });
      setViewModalOpen(true);
    } else {
      showError('Leave request not found');
    }
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
          {/* Skeleton Loader */}
          <div className="skeleton-loader">
            {/* Page Title Skeleton */}
            <div className="skeleton-title"></div>
            
            {/* Top Sections Row Skeleton */}
            <div className="top-sections-row">
              {/* Leave Balances Skeleton */}
              <div className="skeleton-card">
                <div className="skeleton-header"></div>
                <div className="skeleton-balances">
                  <div className="skeleton-balance-item">
                    <div className="skeleton-label"></div>
                    <div className="skeleton-value"></div>
                  </div>
                  <div className="skeleton-separator"></div>
                  <div className="skeleton-balance-item">
                    <div className="skeleton-label"></div>
                    <div className="skeleton-value"></div>
                  </div>
                  <div className="skeleton-separator"></div>
                  <div className="skeleton-balance-item">
                    <div className="skeleton-label"></div>
                    <div className="skeleton-value"></div>
                  </div>
                </div>
              </div>
              
              {/* Rules Skeleton */}
              <div className="skeleton-card">
                <div className="skeleton-header"></div>
                <div className="skeleton-table">
                  <div className="skeleton-table-row"></div>
                  <div className="skeleton-table-row"></div>
                  <div className="skeleton-table-row"></div>
                </div>
              </div>
              
              {/* Holidays Skeleton */}
              <div className="skeleton-card">
                <div className="skeleton-header"></div>
                <div className="skeleton-holidays-controls"></div>
                <div className="skeleton-table">
                  <div className="skeleton-table-row"></div>
                  <div className="skeleton-table-row"></div>
                  <div className="skeleton-table-row"></div>
                </div>
              </div>
            </div>
            
            {/* Form Section Skeleton */}
            <div className="skeleton-card skeleton-form">
              <div className="skeleton-header"></div>
              <div className="skeleton-form-grid">
                <div className="skeleton-input"></div>
                <div className="skeleton-input"></div>
                <div className="skeleton-input"></div>
                <div className="skeleton-input"></div>
                <div className="skeleton-input"></div>
                <div className="skeleton-input"></div>
              </div>
              <div className="skeleton-textarea"></div>
              <div className="skeleton-buttons">
                <div className="skeleton-button"></div>
                <div className="skeleton-button"></div>
              </div>
            </div>
            
            {/* Requests Section Skeleton */}
            <div className="skeleton-card">
              <div className="skeleton-header"></div>
              <div className="skeleton-table">
                <div className="skeleton-table-header"></div>
                <div className="skeleton-table-row"></div>
                <div className="skeleton-table-row"></div>
                <div className="skeleton-table-row"></div>
              </div>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (balancesError || holidaysError || rulesError || requestsError) {
    const anyError: any =
      balancesError || holidaysError || rulesError || requestsError;

    const errorMessage = anyError?.response?.status === 429
      ? 'Too many requests. Please try again later.'
      : 'Error loading data. Please try again.';

    const handleRetry = () => {
      window.location.reload();
    };

    return (
      <AppLayout>
        <div className="leave-apply-page">
          <ErrorDisplay 
            message={errorMessage}
            onRetry={handleRetry}
            showRetryButton={true}
          />
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
            <div className="holidays-header">
              <h2>Holidays List</h2>
              <div className="holiday-year-buttons">
                <button
                  className={`year-button ${selectedYear === 2024 ? 'active' : ''}`}
                  onClick={() => setSelectedYear(2024)}
                  disabled={true}
                  title="2024 holidays (disabled)"
                >
                  2024
                </button>
                <button
                  className={`year-button ${selectedYear === 2025 ? 'active' : ''}`}
                  onClick={() => setSelectedYear(2025)}
                  disabled={false}
                >
                  2025
                </button>
                <button
                  className={`year-button ${selectedYear === 2026 ? 'active' : ''}`}
                  onClick={() => setSelectedYear(2026)}
                  disabled={false}
                >
                  2026
                </button>
              </div>
            </div>
            <div className="holidays-table-container">
              <table className="holidays-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Holiday name</th>
                  </tr>
                </thead>
                <tbody>
                  {holidays.length === 0 ? (
                    <tr>
                      <td colSpan={2} style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
                        No holidays found for {selectedYear}
                      </td>
                    </tr>
                  ) : (
                    holidays.map((holiday, idx) => (
                      <tr key={idx}>
                        <td>{format(new Date(holiday.date + 'T00:00:00'), 'dd/MM/yyyy')}</td>
                        <td>{holiday.name}</td>
                      </tr>
                    ))
                  )}
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
                <DatePicker
                  value={formData.startDate}
                  onChange={(newStartDate) => {
                    // Block weekends (Saturday and Sunday)
                    if (isWeekend(newStartDate)) {
                      showWarning('Cannot select Saturday or Sunday as start date. Please select a weekday.');
                      return;
                    }
                    // For permission, update end date to match start date
                    if (formData.leaveType === 'permission') {
                      setFormData({ ...formData, startDate: newStartDate, endDate: newStartDate });
                    } else {
                      setFormData({ ...formData, startDate: newStartDate });
                    }
                  }}
                  min={minStartDate}
                  max={maxStartDate}
                  placeholder="Select start date"
                  disabledDates={(date) => {
                    const dateStr = format(date, 'yyyy-MM-dd');
                    return isWeekend(dateStr);
                  }}
                />
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
                    <DatePicker
                      value={formData.endDate}
                      onChange={(newEndDate) => {
                        // Block weekends (Saturday and Sunday)
                        if (isWeekend(newEndDate)) {
                          showWarning('Cannot select Saturday or Sunday as end date. Please select a weekday.');
                          return;
                        }
                        setFormData({ ...formData, endDate: newEndDate });
                      }}
                      min={formData.startDate || minStartDate}
                      max={maxStartDate}
                      placeholder="Select end date"
                      disabledDates={(date) => {
                        const dateStr = format(date, 'yyyy-MM-dd');
                        return isWeekend(dateStr);
                      }}
                    />
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
                  <label>Doctor Prescription</label>
                  <input
                    ref={doctorNoteInputRef}
                    id="doctor-note-input"
                    className="doctor-note-input"
                    type="file"
                    accept="image/*"
                    onChange={(e) => setDoctorNoteFile(e.target.files?.[0] || null)}
                  />
                  <button
                    type="button"
                    className="doctor-note-button"
                    onClick={() => {
                      doctorNoteInputRef.current?.click();
                    }}
                  >
                    {doctorNoteFile ? 'Change prescription file' : 'Upload prescription'}
                  </button>
                  <div className="doctor-note-meta">
                    {doctorNoteFile && (
                      <span className="doctor-note-filename">{doctorNoteFile.name}</span>
                    )}
                  </div>
                </div>
              )}
              {formData.leaveType === 'permission' && (
                <div className="form-group">
                  <label>Timings</label>
                  <div className="time-inputs">
                    <div className="time-input-wrapper">
                      <div className="custom-time-picker">
                        <select
                          className="time-hour-select"
                          value={(() => {
                            const [hours] = (formData.timeForPermission.start || '10:00').split(':').map(Number);
                            return String(hours);
                          })()}
                          onChange={(e) => {
                            const selectedHour = Number(e.target.value);
                            const [, currentMinutes] = (formData.timeForPermission.start || '10:00').split(':').map(Number);
                            const newStartTime = `${String(selectedHour).padStart(2, '0')}:${String(currentMinutes).padStart(2, '0')}`;
                            
                            // Validate and update
                            handleStartTimeChange(newStartTime);
                          }}
                        >
                          {Array.from({ length: 9 }, (_, i) => i + 10).map(hour => (
                            <option key={hour} value={hour}>
                              {String(hour).padStart(2, '0')}
                            </option>
                          ))}
                        </select>
                        <span className="time-separator">:</span>
                        <select
                          className="time-minute-select"
                          value={(() => {
                            const [, minutes] = (formData.timeForPermission.start || '10:00').split(':').map(Number);
                            return String(minutes);
                          })()}
                          onChange={(e) => {
                            const selectedMinute = Number(e.target.value);
                            const [currentHours] = (formData.timeForPermission.start || '10:00').split(':').map(Number);
                            const newStartTime = `${String(currentHours).padStart(2, '0')}:${String(selectedMinute).padStart(2, '0')}`;
                            
                            // Validate and update
                            handleStartTimeChange(newStartTime);
                          }}
                        >
                          <option value="0">00</option>
                          <option value="15">15</option>
                          <option value="30">30</option>
                          <option value="45">45</option>
                        </select>
                      </div>
                      {/* Hidden input for form validation */}
                      <input
                        type="hidden"
                        value={formData.timeForPermission.start}
                        required
                      />
                    </div>
                    <span style={{ margin: '0 5px', color: '#666', fontSize: '12px' }}>to</span>
                    <div className="time-input-wrapper">
                      <div className="custom-time-picker">
                        <select
                          className="time-hour-select"
                          value={(() => {
                            const [hours] = (formData.timeForPermission.end || '12:00').split(':').map(Number);
                            return String(hours);
                          })()}
                          onChange={(e) => {
                            const selectedHour = Number(e.target.value);
                            const [, currentMinutes] = (formData.timeForPermission.end || '12:00').split(':').map(Number);
                            const newEndTime = `${String(selectedHour).padStart(2, '0')}:${String(currentMinutes).padStart(2, '0')}`;
                            
                            // Validate and update
                            handleEndTimeChange(newEndTime);
                          }}
                        >
                          {Array.from({ length: 10 }, (_, i) => i + 10).map(hour => (
                            <option key={hour} value={hour}>
                              {String(hour).padStart(2, '0')}
                            </option>
                          ))}
                        </select>
                        <span className="time-separator">:</span>
                        <select
                          className="time-minute-select"
                          value={(() => {
                            const [, minutes] = (formData.timeForPermission.end || '12:00').split(':').map(Number);
                            return String(minutes);
                          })()}
                          onChange={(e) => {
                            const selectedMinute = Number(e.target.value);
                            const [currentHours] = (formData.timeForPermission.end || '12:00').split(':').map(Number);
                            const newEndTime = `${String(currentHours).padStart(2, '0')}:${String(selectedMinute).padStart(2, '0')}`;
                            
                            // Validate and update
                            handleEndTimeChange(newEndTime);
                          }}
                        >
                          <option value="0">00</option>
                          <option value="15">15</option>
                          <option value="30">30</option>
                          <option value="45">45</option>
                        </select>
                      </div>
                      {/* Hidden input for form validation */}
                      <input
                        type="hidden"
                        value={formData.timeForPermission.end}
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
                  maxLength={100}
                  rows={2}
                />
              </div>
              <div className="form-actions">
                <button 
                  type="submit" 
                  className="submit-button"
                  disabled={applyMutation.isLoading}
                >
                  {applyMutation.isLoading ? (
                    <>
                      <span className="loading-spinner"></span>
                      Submitting...
                    </>
                  ) : (
                    'Submit'
                  )}
                </button>
                <button 
                  type="button" 
                  onClick={handleClear} 
                  className="clear-button"
                  disabled={applyMutation.isLoading}
                >
                  Reset
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* Recent Leave Requests Section */}
        <div className="recent-requests-section">
          <h2>Recent Leave Requests</h2>
          <div 
            className={`requests-table-container ${myRequests?.requests && myRequests.requests.length > 5 ? 'scrollable' : ''} ${applyMutation.isLoading || deleteMutation.isLoading ? 'updating' : ''}`}
            style={{ 
              pointerEvents: (applyMutation.isLoading || deleteMutation.isLoading) ? 'none' : 'auto',
              opacity: (applyMutation.isLoading || deleteMutation.isLoading) ? 0.8 : 1
            }}
          >
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
                  <td colSpan={10} style={{ textAlign: 'center', padding: '16px' }}>No leaves applied</td>
                </tr>
              ) : (
                [...(myRequests.requests || [])]
                  .sort((a: any, b: any) => {
                    // Sort by start date in ascending order (earliest/upcoming dates first)
                    const dateA = new Date(a.startDate + 'T12:00:00').getTime();
                    const dateB = new Date(b.startDate + 'T12:00:00').getTime();
                    return dateA - dateB; // Ascending order (earliest dates first)
                  })
                  .map((request: any, idx: number) => {
                    const isUpdating = (applyMutation.isLoading && editingId === request.id) || 
                                      (deleteMutation.isLoading && deleteRequestId === request.id) ||
                                      editingRequestId === request.id;
                    return (
                  <tr 
                    key={request.id}
                    className={isUpdating ? 'updating-row' : ''}
                  >
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
                          Rejected
                        </span>
                    ) : request.currentStatus === 'partially_approved' ? (
                      <span className="status-badge status-partial">Partially Approved</span>
                      ) : (
                        <span className="status-badge">{request.currentStatus}</span>
                      )}
                    </td>
                    <td>
                      <div className="action-icons-container">
                        <span 
                          className={`action-icon ${isUpdating || applyMutation.isLoading || deleteMutation.isLoading ? 'disabled' : ''}`} 
                          title="View Details" 
                          onClick={() => !isUpdating && !applyMutation.isLoading && !deleteMutation.isLoading && handleView(request.id)}
                        >
                          <FaEye />
                        </span>
                        {request.canEdit && request.canDelete && request.currentStatus !== 'approved' && request.currentStatus !== 'rejected' && request.currentStatus !== 'partially_approved' && (
                          <>
                            <span 
                              className={`action-icon ${isUpdating || applyMutation.isLoading || deleteMutation.isLoading ? 'disabled' : ''}`} 
                              title={isUpdating ? 'Updating...' : 'Edit'} 
                              onClick={() => !isUpdating && !applyMutation.isLoading && !deleteMutation.isLoading && handleEdit(request.id)}
                            >
                              {isUpdating && editingId === request.id ? (
                                <span className="loading-spinner-small"></span>
                              ) : (
                                <FaPencilAlt />
                              )}
                            </span>
                            <span 
                              className={`action-icon ${isUpdating || applyMutation.isLoading || deleteMutation.isLoading ? 'disabled' : ''}`} 
                              title={isUpdating ? 'Updating...' : 'Delete'} 
                              onClick={() => !isUpdating && !applyMutation.isLoading && !deleteMutation.isLoading && handleDelete(request.id)}
                            >
                              {isUpdating && deleteRequestId === request.id ? (
                                <span className="loading-spinner-small"></span>
                              ) : (
                                <FaTrash />
                              )}
                            </span>
                          </>
                        )}
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
      </div>
      <EmployeeLeaveDetailsModal
        isOpen={viewModalOpen}
        leaveRequest={viewRequest}
        onClose={() => {
          setViewModalOpen(false);
          setViewRequest(null);
        }}
      />
      <ConfirmationDialog
        isOpen={deleteConfirmOpen}
        title="Delete Leave Request"
        message="Are you sure you want to delete this leave request? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
        isLoading={deleteMutation.isLoading}
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
