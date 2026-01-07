import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import AppLayout from '../components/layout/AppLayout';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import ConfirmationDialog from '../components/ConfirmationDialog';
import EmployeeLeaveDetailsModal from '../components/EmployeeLeaveDetailsModal';
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
import { format, addDays, eachDayOfInterval } from 'date-fns';
import { FaPencilAlt, FaTrash, FaEye, FaSort, FaSortUp, FaSortDown } from 'react-icons/fa';
import EmptyState from '../components/common/EmptyState';
import './LeaveApplyPage.css';

const LeaveApplyPage: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { showSuccess, showError, showWarning } = useToast();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingRequestId, setEditingRequestId] = useState<number | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteRequestId, setDeleteRequestId] = useState<number | null>(null);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [viewRequest, setViewRequest] = useState<any | null>(null);
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const currentYear = new Date().getFullYear();
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
  const [filterDate, setFilterDate] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' | null }>({
    key: 'startDate',
    direction: 'asc'
  });

  const handleSort = (key: string) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };
  // For sick leave: allow past 3 days (including today) or ONLY tomorrow for future dates
  // For future dates, can ONLY apply for next day (tomorrow), not any other future dates
  const minStartDate = formData.leaveType === 'casual'
    ? format(addDays(new Date(), 3), 'yyyy-MM-dd') // block today + next two days for casual
    : formData.leaveType === 'sick'
      ? format(addDays(new Date(), -3), 'yyyy-MM-dd') // allow past 3 days for sick leave
      : formData.leaveType === 'permission'
        ? format(addDays(new Date(), 1), 'yyyy-MM-dd') // Permission can only be applied from tomorrow
        : todayStr; // LOP can be applied for today

  // For sick leave: max date is tomorrow (only allow tomorrow for future dates)
  const maxStartDate = formData.leaveType === 'sick'
    ? format(addDays(new Date(), 1), 'yyyy-MM-dd') // only allow tomorrow for future sick leave
    : undefined; // no max date for other leave types

  // End date limit: 10 calendar days maximum from start date
  const maxEndDateLimit = useMemo(() => {
    if (!formData.startDate) return maxStartDate;

    // Calculate 10 days from start date (start + 9 days = 10 days total)
    const tenDaysFromStart = format(addDays(new Date(formData.startDate + 'T00:00:00'), 9), 'yyyy-MM-dd');

    if (maxStartDate && tenDaysFromStart > maxStartDate) {
      return maxStartDate;
    }
    return tenDaysFromStart;
  }, [formData.startDate, maxStartDate]);

  // Set default leave type to LOP if user is on notice and current type is causal
  useEffect(() => {
    if (user?.status === 'on_notice' && formData.leaveType === 'casual') {
      setFormData(prev => ({ ...prev, leaveType: 'lop' }));
    }
  }, [user?.status, formData.leaveType]);

  const sanitizeLettersOnly = (value: string) => {
    return value.replace(/[^a-zA-Z\s]/g, '');
  };

  // Check if a date is a weekend (Sunday = 0, Saturday = 6)
  // For interns, Saturday is a working day, so only Sunday is considered a weekend.
  const isWeekend = (dateStr: string): boolean => {
    if (!dateStr) return false;
    const date = new Date(dateStr + 'T00:00:00');
    const dayOfWeek = date.getDay();
    const isSunday = dayOfWeek === 0;
    const isSaturday = dayOfWeek === 6;
    const isIntern = user?.role === 'intern';

    return isSunday || (isSaturday && !isIntern);
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
      showWarning('Start time set to 10:00 AM (Office Hours).');
      roundedStartTime = '10:00';
    } else if (roundedStartTime > '18:00') {
      showWarning('Start time set to 6:00 PM (Office Hours).');
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
        showWarning('Start time cannot be in the past. Moved to next open slot.');
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

    // For permission, we don't allow next-day end times.
    // End time must be on the same day as start time.
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
      showWarning('Permission limited to maximum of 2 hours only.');
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



  // Clear doctor note when not needed
  useEffect(() => {
    if (formData.leaveType !== 'sick') {
      setDoctorNoteFile(null);
      setExistingDoctorNote(null);
    }
  }, [formData.leaveType]);

  // Set default dates on component mount if not editing/viewing
  useEffect(() => {
    if (!editingId && !deleteRequestId && !viewModalOpen && !formData.startDate) {
      // Default to Casual leave logic (Today + 3 days)
      const today = new Date();
      const futureDate = addDays(today, 3);
      const futureDateStr = format(futureDate, 'yyyy-MM-dd');

      setFormData(prev => ({
        ...prev,
        startDate: futureDateStr,
        endDate: futureDateStr
      }));
    }
  }, [editingId, deleteRequestId, viewModalOpen]); // Run once on mount (effectively) when IDs are checked

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

  // Handle end type constraints: "Second half" is only allowed if startType is "second_half"
  useEffect(() => {
    if (formData.startType !== 'second_half' && formData.endType === 'second_half') {
      setFormData(prev => ({
        ...prev,
        endType: 'full'
      }));
    }
  }, [formData.startType, formData.endType]);

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

  // Ensure page is scrollable on mount and clean up on unmount
  useEffect(() => {
    // Save original overflow
    const originalStyle = window.getComputedStyle(document.body).overflow;

    // Force scrollable (auto allows scroll if needed, whereas 'scroll' always shows bars)
    // We use 'auto' to avoid double scrollbars if not needed.
    document.body.style.overflow = 'auto';

    return () => {
      // Restore original overflow on unmount
      document.body.style.overflow = originalStyle === 'hidden' ? '' : originalStyle;
    };
  }, []);

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
      staleTime: 0,
      refetchInterval: 5000, // Reduced to 5 seconds for immediate updates
      cacheTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
      onError: (error: any) => {
        if (error.response?.status === 401 || error.response?.status === 403) {
          window.location.href = '/login';
        }
      }
    }
  );


  const [selectedYear, setSelectedYear] = useState<number>(currentYear);

  const { data: holidaysData = [], isLoading: holidaysLoading, error: holidaysError } = useQuery(
    ['holidays', selectedYear],
    () => leaveService.getHolidays(selectedYear),
    {
      retry: false,
      staleTime: 0, // Always refetch when year changes
      refetchInterval: 5000, // Reduced to 5 seconds for immediate updates
      cacheTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
      keepPreviousData: true, // Keep old year's data while fetching new year
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
      staleTime: 0,
      refetchInterval: 5000, // Reduced to 5 seconds for immediate updates
      cacheTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
      onError: (error: any) => {
        if (error.response?.status === 401 || error.response?.status === 403) {
          window.location.href = '/login';
        }
      }
    }
  );


  // Memoize filtered and sorted requests
  const filteredRequests = useMemo(() => {
    if (!myRequests?.requests) return [];

    return [...myRequests.requests]
      .filter((request: any) => {
        if (!filterDate) return true;

        const filterStr = filterDate;

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
        if (!sortConfig.key || !sortConfig.direction) return 0;

        const valA = a[sortConfig.key] ? new Date(a[sortConfig.key] + 'T00:00:00').getTime() : 0;
        const valB = b[sortConfig.key] ? new Date(b[sortConfig.key] + 'T00:00:00').getTime() : 0;

        if (sortConfig.direction === 'asc') {
          return valA - valB;
        } else {
          return valB - valA;
        }
      });
  }, [myRequests?.requests, filterDate, sortConfig]);

  // Memoize expensive computation
  const requestedDays = useMemo(() => {
    if (!formData.startDate || !formData.endDate) return 0;

    // Safety check: ensure start is not after end
    if (formData.startDate > formData.endDate && formData.leaveType !== 'permission') return 0;

    const start = new Date(`${formData.startDate}T00:00:00`);
    const end = new Date(`${formData.endDate}T00:00:00`);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;

    try {
      const daysArr = eachDayOfInterval({ start, end });
      let total = 0;
      const startHalf = formData.startType !== 'full';
      const endHalf = formData.endType !== 'full';

      // Create a Set of holiday date strings for faster lookup relative to the holidays currently loaded/displayed
      const holidaySet = new Set(holidays.map(h => h.date));

      daysArr.forEach((d, idx) => {
        const dateStr = format(d, 'yyyy-MM-dd');
        const dayOfWeek = d.getDay();
        const isSunday = dayOfWeek === 0;
        const isSaturday = dayOfWeek === 6;
        const isIntern = user?.role === 'intern';
        const isActuallyWeekend = isSunday || (isSaturday && !isIntern);
        const isHoliday = holidaySet.has(dateStr);

        // If NOT LOP, skip weekends and holidays.
        // If LOP, we count everything (weekends and holidays included).
        const isLop = formData.leaveType?.toLowerCase() === 'lop';
        if (!isLop) {
          if (isActuallyWeekend || isHoliday) return;
        }

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
    } catch (e) {
      console.error('Error calculating requested days:', e);
      return 0;
    }
  }, [formData.startDate, formData.endDate, formData.startType, formData.endType, formData.leaveType, holidays]);

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

    try {
      const requestedDaysArray = eachDayOfInterval({ start, end });
      const startHalf = formData.startType !== 'full';
      const endHalf = formData.endType !== 'full';

      // Check each requested day against existing leave requests
      for (const day of requestedDaysArray) {
        const dayStr = format(day, 'yyyy-MM-dd');
        const displayDateStr = format(day, 'dd-MM-yyyy');
        const dayOfWeek = day.getDay();
        const isSunday = dayOfWeek === 0;
        const isSaturday = dayOfWeek === 6;
        const isIntern = user?.role === 'intern';
        const isActuallyWeekend = isSunday || (isSaturday && !isIntern);

        if (isActuallyWeekend) continue; // Skip weekends

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
                  return `Leave already exists for ${displayDateStr} (${statusText} - full day). Cannot apply leave on this date.`;
                }
                // If existing leave is half day
                if (existingDay.type === 'half') {
                  // Block if new request is full day
                  if (!isHalfDay) {
                    const statusText = existingDay.status === 'approved' ? 'approved' :
                      existingDay.status === 'partially_approved' ? 'partially approved' : 'pending';
                    return `Leave already exists for ${displayDateStr} (${statusText} - half day). Cannot apply full day leave on this date.`;
                  }
                  // If both are half days, block to prevent conflicts
                  const statusText = existingDay.status === 'approved' ? 'approved' :
                    existingDay.status === 'partially_approved' ? 'partially approved' : 'pending';
                  return `Leave already exists for ${displayDateStr} (${statusText} - half day). Cannot apply leave on this date.`;
                }
              }
            }
          } else {
            // Fallback: check date range overlap (less precise but better than nothing)
            // If the request has approved or pending status, block the entire date range
            if (request.currentStatus === 'approved' || request.currentStatus === 'pending' || request.currentStatus === 'partially_approved') {
              const statusText = request.currentStatus === 'approved' ? 'approved' :
                request.currentStatus === 'partially_approved' ? 'partially approved' : 'pending';
              const startDateDisplay = format(new Date(request.startDate), 'dd-MM-yyyy');
              const endDateDisplay = format(new Date(request.endDate), 'dd-MM-yyyy');
              return `Leave already applied from ${startDateDisplay} to ${endDateDisplay} (${statusText}). Dates overlap with your request.`;
            }
          }
        }
      }
    } catch (e) {
      console.error('Error checking date overlap:', e);
      return null;
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

        // Optimistically update 'leaveBalances'
        if (!variables.id && variables.data.leaveType !== 'permission' && previousBalances) {
          queryClient.setQueryData('leaveBalances', (old: any) => {
            if (!old) return old;
            // Map leaveType to balance key
            const balanceKey = variables.data.leaveType === 'casual' ? 'casual' :
              variables.data.leaveType === 'sick' ? 'sick' : 'lop';

            return {
              ...old,
              [balanceKey]: (parseFloat(old[balanceKey] as string) || 0) - requestedDays
            };
          });
        }

        // Optimistically update 'myLeaveRequests' list
        queryClient.setQueryData('myLeaveRequests', (old: any) => {
          if (!old) return { requests: [], pagination: { total: 0, page: 1, limit: 10 } };
          const requests = [...(old.requests || [])];

          if (variables.id) {
            // Optimistic Edit
            const index = requests.findIndex((r: any) => r.id === variables.id);
            if (index !== -1) {
              requests[index] = {
                ...requests[index],
                ...variables.data,
                leaveReason: variables.data.reason,
                currentStatus: 'pending'
              };
            }
          } else {
            // Optimistic Create
            const newRequest = {
              id: 'optimistic-' + Date.now(),
              appliedDate: new Date().toISOString().split('T')[0],
              leaveReason: variables.data.reason,
              startDate: variables.data.startDate,
              startType: variables.data.startType,
              endDate: variables.data.endDate,
              endType: variables.data.endType,
              noOfDays: requestedDays,
              leaveType: variables.data.leaveType,
              currentStatus: 'pending',
              canEdit: true,
              canDelete: true,
              leaveDays: [],
              isOptimistic: true
            };
            requests.unshift(newRequest);
          }

          return {
            ...old,
            requests,
            pagination: variables.id ? old.pagination : {
              ...old.pagination,
              total: (old.pagination?.total || 0) + 1
            }
          };
        });

        return { previousRequests, previousBalances };
      },
      onSuccess: (response, variables) => {
        // Replace optimistic record with real one or update existing
        queryClient.setQueryData('myLeaveRequests', (old: any) => {
          if (!old?.requests) return old;
          let requests = [...old.requests];

          if (variables.id) {
            // Update the record we edited
            const index = requests.findIndex((r: any) => r.id === variables.id);
            if (index !== -1) {
              // Merge server response if available, otherwise use original but with real ID if it changed (unlikely for edit)
              requests[index] = response?.request ? { ...requests[index], ...response.request } : requests[index];
            }
          } else {
            // Replace the optimistic record with the real one
            // First find the optimistic one (usually at index 0)
            const optIndex = requests.findIndex((r: any) => r.isOptimistic);
            if (optIndex !== -1 && response?.request) {
              requests[optIndex] = response.request;
            } else if (response?.request) {
              // Fallback: just add the real one and filter out any remaining optimistic ones
              requests = [response.request, ...requests.filter((r: any) => !r.isOptimistic)];
            }
          }
          return { ...old, requests };
        });

        // Invalidate queries in background (non-blocking) for fresh data
        queryClient.invalidateQueries('leaveBalances');
        queryClient.invalidateQueries('myLeaveRequests');

        showSuccess(variables.id ? 'Leave Updated Successfully!' : 'Leave Applied Successfully!');
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
      onError: (error: any, _, context) => {
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
      showSuccess('Leave Deleted successfully!');
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
    onError: (error: any, _, context) => {
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

    // Basic validation
    if (!formData.startDate) {
      showWarning('Please select a start date');
      return;
    }

    if (formData.leaveType !== 'permission' && !formData.endDate) {
      showWarning('Please select an end date');
      return;
    }

    // Check for date overlaps with existing leave requests
    const overlapError = checkDateOverlap();
    if (overlapError) {
      showWarning(overlapError);
      return;
    }

    // 10-day maximum limit check
    if (formData.startDate && formData.endDate && formData.leaveType !== 'permission') {
      const start = new Date(formData.startDate + 'T00:00:00');
      const end = new Date(formData.endDate + 'T00:00:00');
      const diffTime = end.getTime() - start.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include both ends

      if (diffDays > 10) {
        showWarning(`Maximum leave duration is 10 days. You have selected ${diffDays} days.`);
        return;
      }
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



    // Validation: Casual Leave Prior Notice
    if (formData.leaveType === 'casual' && formData.startDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      // Note: Using T12:00:00 in other places to avoid timezone shift, but for diff calculation T00:00:00 is safer if today is also 00:00:00
      // Let's ensure consistency.
      const start = new Date(formData.startDate + 'T00:00:00');
      const msPerDay = 1000 * 60 * 60 * 24;
      const daysUntilStart = Math.ceil((start.getTime() - today.getTime()) / msPerDay);

      if (requestedDays <= 2) {
        if (daysUntilStart < 3) {
          showWarning('Casual leaves of 0.5 to 2.0 days must be applied at least 3 days in advance.');
          return;
        }
      } else if (requestedDays <= 5) {
        if (daysUntilStart < 7) {
          showWarning('Casual leaves of 3.0 to 5.0 days must be applied at least 7 days in advance.');
          return;
        }
      } else {
        if (daysUntilStart < 30) {
          showWarning('Casual leaves of More Than 5.0 days must be applied at least 1 Month in advance.');
          return;
        }
      }
    }

    // Client-side balance guard
    if (balances) {
      // Find the original request if we're editing, to account for "refunded" days
      const originalRequest = editingId ? myRequests?.requests?.find((r: any) => r.id === editingId) : null;
      const isSameType = originalRequest && originalRequest.leaveType === formData.leaveType;
      const originalDays = originalRequest ? Number(originalRequest.noOfDays) : 0;

      if (formData.leaveType === 'casual') {
        const currentBalance = Number(balances.casual || 0);
        const effectiveBalance = isSameType ? (currentBalance + originalDays) : currentBalance;

        if (effectiveBalance <= 0) {
          showWarning('Casual leave balance is zero. You cannot apply casual leave.');
          return;
        }
        if (requestedDays > effectiveBalance) {
          showWarning(`Insufficient casual leave balance. Available: ${effectiveBalance}, Required: ${requestedDays}`);
          return;
        }

        // Check Casual Monthly Limit (Max 10 days per month)
        // Only run this check if we have request history
        if (myRequests?.requests) {
          try {
            const start = new Date(`${formData.startDate}T00:00:00`);
            const end = new Date(`${formData.endDate}T00:00:00`);
            const currentRequestDays = eachDayOfInterval({ start, end });

            // Map months to count of new days
            const newMonthCounts = new Map<string, number>();

            // Calculate days for current request
            const startHalf = formData.startType !== 'full';
            const endHalf = formData.endType !== 'full';

            // Filter out weekends and holidays for Casual leaves
            const holidaySet = new Set(holidays.map(h => h.date));

            currentRequestDays.forEach((day, idx) => {
              const dateStr = format(day, 'yyyy-MM-dd');
              const dayOfWeek = day.getDay();
              const isSunday = dayOfWeek === 0;
              const isSaturday = dayOfWeek === 6;
              const isIntern = user?.role === 'intern';
              const isActuallyWeekend = isSunday || (isSaturday && !isIntern);
              const isHoliday = holidaySet.has(dateStr);

              if (isActuallyWeekend || isHoliday) return;

              const monthKey = format(day, 'yyyy-MM');
              const isFirst = idx === 0;
              const isLate = idx === currentRequestDays.length - 1;
              let val = 1;
              if (isFirst && isLate) val = (startHalf || endHalf) ? 0.5 : 1;
              else if (isFirst && startHalf) val = 0.5;
              else if (isLate && endHalf) val = 0.5;

              newMonthCounts.set(monthKey, (newMonthCounts.get(monthKey) || 0) + val);
            });

            // Check each month involved
            for (const [monthKey, newCount] of newMonthCounts.entries()) {
              // Sum existing approved/pending Casual days for this month
              let existingCount = 0;
              myRequests.requests.forEach((req: any) => {
                // Skip if rejected or if it's the one currently being edited
                if (req.currentStatus === 'rejected' || req.id === editingId) return;
                if (req.leaveType !== 'casual') return;

                // We need to count days falling in this month
                // Use leaveDays if available for accuracy, otherwise rough estimation or skip
                if (req.leaveDays && Array.isArray(req.leaveDays)) {
                  req.leaveDays.forEach((ld: any) => {
                    if (ld.status === 'rejected') return;
                    const ldDate = new Date(ld.date);
                    if (format(ldDate, 'yyyy-MM') === monthKey) {
                      existingCount += (ld.type === 'half' ? 0.5 : 1);
                    }
                  });
                } else {
                  // Fallback roughly
                  const rStart = new Date(req.startDate);
                  const rEnd = new Date(req.endDate);
                  const rDays = eachDayOfInterval({ start: rStart, end: rEnd });
                  rDays.forEach(d => {
                    const dayOfWeek = d.getDay();
                    const isSunday = dayOfWeek === 0;
                    const isSaturday = dayOfWeek === 6;
                    const isIntern = user?.role === 'intern';
                    const isActuallyWeekend = isSunday || (isSaturday && !isIntern);
                    const dateStr = format(d, 'yyyy-MM-dd');

                    if (format(d, 'yyyy-MM') === monthKey && !isActuallyWeekend && !holidaySet.has(dateStr)) {
                      const isFirst = dateStr === req.startDate;
                      const isLast = dateStr === req.endDate;
                      let val = 1;
                      if (isFirst && req.startType !== 'full') val = 0.5;
                      if (isLast && req.endType !== 'full') val = 0.5;
                      existingCount += val;
                    }
                  });
                }
              });

              if (existingCount + newCount > 10) {
                showWarning(`Casual leave limit exceeded for ${monthKey}. Max 10 days allowed per month. You have used ${existingCount} and are requesting ${newCount}.`);
                return;
              }
            }

          } catch (e) {
            console.error('Error checking Casual limit:', e);
          }
        }
      }
      if (formData.leaveType === 'sick') {
        const currentBalance = Number(balances.sick || 0);
        const effectiveBalance = isSameType ? (currentBalance + originalDays) : currentBalance;

        if (effectiveBalance <= 0) {
          showWarning('Sick leave balance is zero. You cannot apply sick leave.');
          return;
        }
        if (requestedDays > effectiveBalance) {
          showWarning(`Insufficient sick leave balance. Available: ${effectiveBalance}, Required: ${requestedDays}`);
          return;
        }
      }
      if (formData.leaveType === 'lop') {
        const currentBalance = Number(balances.lop || 0);
        const effectiveBalance = isSameType ? (currentBalance + originalDays) : currentBalance;

        if (effectiveBalance <= 0) {
          showWarning('LOP balance is zero. You cannot apply LOP leave.');
          return;
        }
        if (requestedDays > effectiveBalance) {
          showWarning(`Insufficient LOP balance. Available: ${effectiveBalance}, Required: ${requestedDays}`);
          return;
        }

        // Check LOP Monthly Limit (Max 5 days per month)
        // Only run this check if we have request history
        if (myRequests?.requests) {
          try {
            const start = new Date(`${formData.startDate}T00:00:00`);
            const end = new Date(`${formData.endDate}T00:00:00`);
            const currentRequestDays = eachDayOfInterval({ start, end });

            // Map months to count of new days
            const newMonthCounts = new Map<string, number>();

            // Calculate days for current request
            const startHalf = formData.startType !== 'full';
            const endHalf = formData.endType !== 'full';

            currentRequestDays.forEach((day, idx) => {
              const monthKey = format(day, 'yyyy-MM');
              const isFirst = idx === 0;
              const isLate = idx === currentRequestDays.length - 1;
              let val = 1;
              if (isFirst && isLate) val = (startHalf || endHalf) ? 0.5 : 1;
              else if (isFirst && startHalf) val = 0.5;
              else if (isLate && endHalf) val = 0.5;

              newMonthCounts.set(monthKey, (newMonthCounts.get(monthKey) || 0) + val);
            });

            // Check each month involved
            for (const [monthKey, newCount] of newMonthCounts.entries()) {
              // Sum existing approved/pending LOP days for this month
              let existingCount = 0;
              myRequests.requests.forEach((req: any) => {
                // Skip if rejected or if it's the one currently being edited
                if (req.currentStatus === 'rejected' || req.id === editingId) return;
                if (req.leaveType !== 'lop') return;

                // We need to count days falling in this month
                // Use leaveDays if available for accuracy, otherwise rough estimation or skip
                if (req.leaveDays && Array.isArray(req.leaveDays)) {
                  req.leaveDays.forEach((ld: any) => {
                    if (ld.status === 'rejected') return;
                    const ldDate = new Date(ld.date);
                    if (format(ldDate, 'yyyy-MM') === monthKey) {
                      existingCount += (ld.type === 'half' ? 0.5 : 1);
                    }
                  });
                } else {
                  // Fallback if leaveDays detailed array is missing (though myRequests usually has it)
                  // If start/end spans this month, roughly count
                  const rStart = new Date(req.startDate);
                  const rEnd = new Date(req.endDate);
                  const rDays = eachDayOfInterval({ start: rStart, end: rEnd });
                  rDays.forEach(d => {
                    if (format(d, 'yyyy-MM') === monthKey) {
                      const isFirst = format(d, 'yyyy-MM-dd') === req.startDate;
                      const isLast = format(d, 'yyyy-MM-dd') === req.endDate;
                      let val = 1;
                      if (isFirst && req.startType !== 'full') val = 0.5;
                      if (isLast && req.endType !== 'full') val = 0.5;
                      // Note: this fallback is imperfect but good enough for client side warnings
                      existingCount += val;
                    }
                  });
                }
              });

              if (existingCount + newCount > 5) {
                showWarning(`LOP limit exceeded for ${monthKey}. Max 5 days allowed per month. You have used ${existingCount} and are requesting ${newCount}.`);
                return;
              }
            }

          } catch (e) {
            console.error('Error checking LOP limit:', e);
            // Proceed to backend check if client check fails
          }
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

      // Validate that permission time is not in the past if start date is today
      const isToday = formData.startDate === todayStr;
      if (isToday) {
        const now = new Date();
        const [startHours, startMinutes] = formData.timeForPermission.start.split(':').map(Number);
        const permissionStartTime = new Date();
        permissionStartTime.setHours(startHours, startMinutes, 0, 0);

        if (permissionStartTime < now) {
          showWarning('Cannot apply permission for past times. Please select a future time.');
          return;
        }
      }

      // Validate permission duration (max 2 hours)
      const [startHours, startMinutes] = formData.timeForPermission.start.split(':').map(Number);
      const [endHours, endMinutes] = formData.timeForPermission.end.split(':').map(Number);
      const startTime = new Date(`2000-01-01T${String(startHours).padStart(2, '0')}:${String(startMinutes).padStart(2, '0')}:00`);
      const endTime = new Date(`2000-01-01T${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}:00`);

      // For permission, we don't allow next-day end times.
      // End time must be on the same day as start time.
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
        leaveDays: request.leaveDays || [],
        empStatus: request.empStatus || null
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

  const handleLeaveTypeChange = (newType: 'casual' | 'sick' | 'lop' | 'permission') => {
    // Calculate default dates
    const today = new Date();
    let defaultStartStr = '';
    let defaultEndStr = '';

    if (newType === 'casual') {
      const futureDate = addDays(today, 3);
      const futureDateStr = format(futureDate, 'yyyy-MM-dd');
      defaultStartStr = futureDateStr;
      defaultEndStr = futureDateStr;
    } else if (newType === 'permission') {
      // Permission defaults to tomorrow
      const futureDate = addDays(today, 1);
      const futureDateStr = format(futureDate, 'yyyy-MM-dd');
      defaultStartStr = futureDateStr;
      defaultEndStr = futureDateStr;
    } else {
      // Sick, LOP defaults to today
      const todayStr = format(today, 'yyyy-MM-dd');
      defaultStartStr = todayStr;
      defaultEndStr = todayStr;
    }

    // Update form data with new type and default dates
    setFormData({
      ...formData, // Keep other fields if needed, but we override dates/types
      leaveType: newType,
      startDate: defaultStartStr,
      startType: 'full',
      endDate: defaultEndStr,
      endType: 'full',
      reason: editingId ? formData.reason : '', // Preserve reason if editing
      timeForPermission: { start: '', end: '' }
    });

    if (editingId) {
      setDoctorNoteFile(null);
      setExistingDoctorNote(null);
    }
  };


  const handleClear = () => {
    // Default to Casual leave logic (Today + 3 days)
    const today = new Date();
    const futureDate = addDays(today, 3);
    const futureDateStr = format(futureDate, 'yyyy-MM-dd');

    setFormData({
      leaveType: 'casual',
      startDate: futureDateStr,
      startType: 'full',
      endDate: futureDateStr,
      endType: 'full',
      reason: '',
      timeForPermission: { start: '', end: '' }
    });
    setDoctorNoteFile(null);
    setEditingId(null);
    setEditingRequestId(null);
  };

  // Initial loading state (only for first-time page load)
  // We use !holidaysData.length instead of (holidaysLoading && holidaysData.length === 0) 
  // because keepPreviousData: true preserves the length during year change.
  if (balancesLoading || (holidaysLoading && !holidaysData.length) || rulesLoading || requestsLoading) {
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
        <h2 className="page-title">
          Welcome, {user?.name || ''}
          {user?.status === 'on_notice' && (
            <span className="status-badge status-on-notice">On Notice</span>
          )}
        </h2>
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
                    <td>{rule.leaveRequired}</td>
                    <td>{rule.priorInformation}</td>
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
                {[currentYear - 1, currentYear, currentYear + 1].map(year => (
                  <button
                    key={year}
                    className={`year-button ${selectedYear === year ? 'active' : ''}`}
                    onClick={() => setSelectedYear(year)}
                  >
                    {year}
                  </button>
                ))}
              </div>
            </div>
            <div className="holidays-table-container">
              {holidaysLoading && holidaysData.length === 0 ? (
                <div className="holiday-local-skeleton">
                  <div className="skeleton-table-row"></div>
                  <div className="skeleton-table-row"></div>
                  <div className="skeleton-table-row"></div>
                  <div className="skeleton-table-row"></div>
                </div>
              ) : holidays.length === 0 ? (
                <EmptyState
                  title={`No Holidays for ${selectedYear}`}
                  description="There are no holidays listed for the selected year."
                />
              ) : (
                <div className={`holidays-table-wrapper ${holidaysLoading ? 'fetching' : ''}`}>
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
                  {holidaysLoading && (
                    <div className="holiday-mini-spinner">
                      <div className="spinner"></div>
                    </div>
                  )}
                </div>
              )}
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
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      className="leave-type-dropdown-trigger"
                      style={{
                        width: '100%',
                        justifyContent: 'space-between',
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
                      <span>{formData.leaveType === 'casual' ? 'Casual' : formData.leaveType === 'sick' ? 'Sick' : formData.leaveType === 'lop' ? 'LOP' : 'Permission'}</span>
                      <ChevronDown style={{ width: '14px', height: '14px', marginLeft: '8px' }} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="leave-type-dropdown-content">
                    {user?.status !== 'on_notice' ? (
                      <>
                        <DropdownMenuItem
                          onClick={() => handleLeaveTypeChange('casual')}
                        >
                          Casual
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => handleLeaveTypeChange('sick')}
                        >
                          Sick
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                      </>
                    ) : (
                      <>
                        <DropdownMenuItem
                          onClick={() => handleLeaveTypeChange('sick')}
                        >
                          Sick
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                      </>
                    )}
                    <DropdownMenuItem
                      onClick={() => handleLeaveTypeChange('lop')}
                    >
                      LOP
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => handleLeaveTypeChange('permission')}
                    >
                      Permission
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="form-group">
                <label>Start Date</label>
                <DatePicker
                  value={formData.startDate}
                  onChange={(newStartDate) => {
                    // Check for weekends
                    const isLop = formData.leaveType?.toLowerCase() === 'lop';
                    const blockedWeekend = !isLop && isWeekend(newStartDate);

                    // Check for holidays
                    const holiday = holidays.find(h => h.date === newStartDate);
                    const blockedHoliday = !isLop && !!holiday;

                    if (blockedWeekend) {

                      const message = 'Please select only working days as start date.';
                      showWarning(message);
                      return;
                    }

                    if (blockedHoliday && holiday) {
                      showWarning(`Cannot select ${holiday.name} (${holiday.date}). If this is for LOP, please select "LOP" as the Leave Type first.`);
                      return;
                    }

                    // For permission, update end date to match start date
                    if (formData.leaveType === 'permission') {
                      setFormData({ ...formData, startDate: newStartDate, endDate: newStartDate });
                    } else if (formData.startType === 'first_half') {
                      // If start type is first half, end date must match start date
                      setFormData({ ...formData, startDate: newStartDate, endDate: newStartDate });
                    } else {
                      // Default behavior: Set end date to start date (user can change it later if allowed)
                      setFormData({ ...formData, startDate: newStartDate, endDate: newStartDate });
                    }
                  }}
                  min={minStartDate}
                  max={maxStartDate}
                  placeholder="dd - mm - yyyy"
                  allowManualEntry={false}
                  isEmployeeVariant={true}
                  disabledDates={(date) => {
                    const dateStr = format(date, 'yyyy-MM-dd');
                    const isLop = formData.leaveType?.toLowerCase() === 'lop';

                    // If LOP, allow everything. If not, block weekends and holidays
                    if (isLop) return false;

                    const isHoliday = holidays.some(h => h.date === dateStr);
                    return isWeekend(dateStr) || isHoliday;
                  }}
                />
              </div>
              {formData.leaveType !== 'permission' && (
                <div className="form-group">
                  <label>Start Type</label>
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        className="leave-type-dropdown-trigger"
                        style={{
                          width: '100%',
                          justifyContent: 'space-between',
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
                        <span>{formData.startType === 'full' ? 'Full day' : formData.startType === 'first_half' ? 'First half' : 'Second half'}</span>
                        <ChevronDown style={{ width: '14px', height: '14px', marginLeft: '8px' }} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="leave-type-dropdown-content">
                      <DropdownMenuItem
                        onClick={() => setFormData({ ...formData, startType: 'full' })}
                      >
                        Full day
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => {
                          // If First Half is selected, strictly set End Date = Start Date and End Type = First Half
                          // This effectively enforces a single half-day leave
                          setFormData({
                            ...formData,
                            startType: 'first_half',
                            endDate: formData.startDate, // Force end date to match start date
                            endType: 'first_half'        // Force end type to match start type
                          });
                        }}
                      >
                        First half
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => {
                          const shouldResetEndDate = formData.endType === 'second_half';
                          setFormData({
                            ...formData,
                            startType: 'second_half',
                            // If end type is also second half, force end date = start date
                            endDate: shouldResetEndDate ? formData.startDate : formData.endDate
                          });
                        }}
                      >
                        Second half
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
              {formData.leaveType !== 'permission' && (
                <>
                  <div className="form-group">
                    <label>End Date</label>
                    <DatePicker
                      value={formData.endDate}
                      onChange={(newEndDate) => {
                        // Check for weekends
                        const isLop = formData.leaveType?.toLowerCase() === 'lop';
                        const blockedWeekend = !isLop && isWeekend(newEndDate);

                        // Check for holidays
                        const holiday = holidays.find(h => h.date === newEndDate);
                        const blockedHoliday = !isLop && !!holiday;

                        if (blockedWeekend) {

                          const message = 'Please select only working days as end date.';
                          showWarning(message);
                          return;
                        }

                        if (blockedHoliday && holiday) {
                          showWarning(`Cannot select ${holiday.name} (${holiday.date}). If this is for LOP, please select "LOP" as the Leave Type first.`);
                          return;
                        }

                        setFormData({ ...formData, endDate: newEndDate });
                      }}
                      min={
                        (formData.startType === 'second_half' && formData.endType !== 'second_half' && formData.startDate)
                          ? format(addDays(new Date(formData.startDate), 1), 'yyyy-MM-dd')
                          : (formData.startDate || minStartDate)
                      }
                      max={maxEndDateLimit}
                      placeholder="dd - mm - yyyy"
                      allowManualEntry={false}
                      isEmployeeVariant={true}
                      disabled={
                        formData.startType === 'first_half' ||
                        (formData.startType === 'second_half' && formData.endType === 'second_half')
                      }
                      disabledDates={(date) => {
                        const dateStr = format(date, 'yyyy-MM-dd');
                        const isLop = formData.leaveType?.toLowerCase() === 'lop';

                        // If LOP, allow everything. If not, block weekends and holidays
                        if (isLop) return false;

                        const isHoliday = holidays.some(h => h.date === dateStr);
                        return isWeekend(dateStr) || isHoliday;
                      }}
                    />
                  </div>
                  <div className="form-group">
                    <label>End Type</label>
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          className="leave-type-dropdown-trigger"
                          disabled={
                            formData.startType === 'first_half'
                          }
                          style={{
                            width: '100%',
                            justifyContent: 'space-between',
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
                          <span>{formData.endType === 'full' ? 'Full day' : formData.endType === 'first_half' ? 'First half' : 'Second half'}</span>
                          <ChevronDown style={{ width: '14px', height: '14px', marginLeft: '8px' }} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="leave-type-dropdown-content">
                        <DropdownMenuItem
                          onClick={() => {
                            let newEndDate = formData.endDate;
                            if (formData.startType === 'second_half' && formData.startDate) {
                              const nextDate = addDays(new Date(formData.startDate), 1);
                              newEndDate = format(nextDate, 'yyyy-MM-dd');
                            }
                            setFormData({ ...formData, endType: 'full', endDate: newEndDate });
                          }}
                        >
                          Full day
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => {
                            let newEndDate = formData.endDate;
                            if (formData.startType === 'second_half' && formData.startDate) {
                              const nextDate = addDays(new Date(formData.startDate), 1);
                              newEndDate = format(nextDate, 'yyyy-MM-dd');
                            } else if (formData.startType === 'full' && formData.startDate === formData.endDate) {
                              // If start is full and we switch to first_half, end date must be next day
                              const nextDate = addDays(new Date(formData.startDate), 1);
                              newEndDate = format(nextDate, 'yyyy-MM-dd');
                            }
                            setFormData({ ...formData, endType: 'first_half', endDate: newEndDate });
                          }}
                        >
                          First half
                        </DropdownMenuItem>
                        {formData.startType === 'second_half' && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => {
                                const shouldResetEndDate = formData.startType === 'second_half';
                                setFormData({
                                  ...formData,
                                  endType: 'second_half',
                                  // If start type is second half, force end date = start date
                                  endDate: shouldResetEndDate ? formData.startDate : formData.endDate
                                });
                              }}
                            >
                              Second half
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
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
                        <DropdownMenu modal={false}>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              className="time-dropdown-trigger"
                              style={{
                                minWidth: '80px',
                                justifyContent: 'space-between',
                                padding: '10px 8px',
                                fontSize: '12px',
                                fontFamily: 'Poppins, sans-serif',
                                border: '1px solid #ddd',
                                borderRadius: '6px',
                                backgroundColor: 'white',
                                color: '#1f2a3d',
                                height: '44px'
                              }}
                            >
                              <span>{String((() => {
                                const [hours] = (formData.timeForPermission.start || '10:00').split(':').map(Number);
                                return hours;
                              })()).padStart(2, '0')}</span>
                              <ChevronDown style={{ width: '14px', height: '14px', marginLeft: '4px' }} />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent className="time-dropdown-content">
                            {Array.from({ length: 9 }, (_, i) => i + 10).map(hour => (
                              <React.Fragment key={hour}>
                                <DropdownMenuItem
                                  onClick={() => {
                                    const selectedHour = hour;
                                    const [, currentMinutes] = (formData.timeForPermission.start || '10:00').split(':').map(Number);
                                    const newStartTime = `${String(selectedHour).padStart(2, '0')}:${String(currentMinutes).padStart(2, '0')}`;
                                    handleStartTimeChange(newStartTime);
                                  }}
                                >
                                  {String(hour).padStart(2, '0')}
                                </DropdownMenuItem>
                                {hour < 18 && <DropdownMenuSeparator />}
                              </React.Fragment>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <span className="time-separator">:</span>
                        <DropdownMenu modal={false}>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              className="time-dropdown-trigger"
                              style={{
                                minWidth: '80px',
                                justifyContent: 'space-between',
                                padding: '10px 8px',
                                fontSize: '12px',
                                fontFamily: 'Poppins, sans-serif',
                                border: '1px solid #ddd',
                                borderRadius: '6px',
                                backgroundColor: 'white',
                                color: '#1f2a3d',
                                height: '44px'
                              }}
                            >
                              <span>{String((() => {
                                const [, minutes] = (formData.timeForPermission.start || '10:00').split(':').map(Number);
                                return minutes;
                              })()).padStart(2, '0')}</span>
                              <ChevronDown style={{ width: '14px', height: '14px', marginLeft: '4px' }} />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent className="time-dropdown-content">
                            <DropdownMenuItem
                              onClick={() => {
                                const selectedMinute = 0;
                                const [currentHours] = (formData.timeForPermission.start || '10:00').split(':').map(Number);
                                const newStartTime = `${String(currentHours).padStart(2, '0')}:${String(selectedMinute).padStart(2, '0')}`;
                                handleStartTimeChange(newStartTime);
                              }}
                            >
                              00
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => {
                                const selectedMinute = 15;
                                const [currentHours] = (formData.timeForPermission.start || '10:00').split(':').map(Number);
                                const newStartTime = `${String(currentHours).padStart(2, '0')}:${String(selectedMinute).padStart(2, '0')}`;
                                handleStartTimeChange(newStartTime);
                              }}
                            >
                              15
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => {
                                const selectedMinute = 30;
                                const [currentHours] = (formData.timeForPermission.start || '10:00').split(':').map(Number);
                                const newStartTime = `${String(currentHours).padStart(2, '0')}:${String(selectedMinute).padStart(2, '0')}`;
                                handleStartTimeChange(newStartTime);
                              }}
                            >
                              30
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => {
                                const selectedMinute = 45;
                                const [currentHours] = (formData.timeForPermission.start || '10:00').split(':').map(Number);
                                const newStartTime = `${String(currentHours).padStart(2, '0')}:${String(selectedMinute).padStart(2, '0')}`;
                                handleStartTimeChange(newStartTime);
                              }}
                            >
                              45
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
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
                        <DropdownMenu modal={false}>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              className="time-dropdown-trigger"
                              style={{
                                minWidth: '80px',
                                justifyContent: 'space-between',
                                padding: '10px 8px',
                                fontSize: '12px',
                                fontFamily: 'Poppins, sans-serif',
                                border: '1px solid #ddd',
                                borderRadius: '6px',
                                backgroundColor: 'white',
                                color: '#1f2a3d',
                                height: '44px'
                              }}
                            >
                              <span>{String((() => {
                                const [hours] = (formData.timeForPermission.end || '12:00').split(':').map(Number);
                                return hours;
                              })()).padStart(2, '0')}</span>
                              <ChevronDown style={{ width: '14px', height: '14px', marginLeft: '4px' }} />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent className="time-dropdown-content">
                            {Array.from({ length: 10 }, (_, i) => i + 10).map(hour => (
                              <React.Fragment key={hour}>
                                <DropdownMenuItem
                                  onClick={() => {
                                    const selectedHour = hour;
                                    const [, currentMinutes] = (formData.timeForPermission.end || '12:00').split(':').map(Number);
                                    const newEndTime = `${String(selectedHour).padStart(2, '0')}:${String(currentMinutes).padStart(2, '0')}`;
                                    handleEndTimeChange(newEndTime);
                                  }}
                                >
                                  {String(hour).padStart(2, '0')}
                                </DropdownMenuItem>
                                {hour < 19 && <DropdownMenuSeparator />}
                              </React.Fragment>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <span className="time-separator">:</span>
                        <DropdownMenu modal={false}>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              className="time-dropdown-trigger"
                              style={{
                                minWidth: '80px',
                                justifyContent: 'space-between',
                                padding: '10px 8px',
                                fontSize: '12px',
                                fontFamily: 'Poppins, sans-serif',
                                border: '1px solid #ddd',
                                borderRadius: '6px',
                                backgroundColor: 'white',
                                color: '#1f2a3d',
                                height: '44px'
                              }}
                            >
                              <span>{String((() => {
                                const [, minutes] = (formData.timeForPermission.end || '12:00').split(':').map(Number);
                                return minutes;
                              })()).padStart(2, '0')}</span>
                              <ChevronDown style={{ width: '14px', height: '14px', marginLeft: '4px' }} />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent className="time-dropdown-content">
                            <DropdownMenuItem
                              onClick={() => {
                                const selectedMinute = 0;
                                const [currentHours] = (formData.timeForPermission.end || '12:00').split(':').map(Number);
                                const newEndTime = `${String(currentHours).padStart(2, '0')}:${String(selectedMinute).padStart(2, '0')}`;
                                handleEndTimeChange(newEndTime);
                              }}
                            >
                              00
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => {
                                const selectedMinute = 15;
                                const [currentHours] = (formData.timeForPermission.end || '12:00').split(':').map(Number);
                                const newEndTime = `${String(currentHours).padStart(2, '0')}:${String(selectedMinute).padStart(2, '0')}`;
                                handleEndTimeChange(newEndTime);
                              }}
                            >
                              15
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => {
                                const selectedMinute = 30;
                                const [currentHours] = (formData.timeForPermission.end || '12:00').split(':').map(Number);
                                const newEndTime = `${String(currentHours).padStart(2, '0')}:${String(selectedMinute).padStart(2, '0')}`;
                                handleEndTimeChange(newEndTime);
                              }}
                            >
                              30
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => {
                                const selectedMinute = 45;
                                const [currentHours] = (formData.timeForPermission.end || '12:00').split(':').map(Number);
                                const newEndTime = `${String(currentHours).padStart(2, '0')}:${String(selectedMinute).padStart(2, '0')}`;
                                handleEndTimeChange(newEndTime);
                              }}
                            >
                              45
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
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
                  required
                  maxLength={100}
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
                  {editingId ? 'Cancel' : 'Reset'}
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* Recent Leave Requests Section */}
        <div className="recent-requests-section">
          <div className="requests-section-header">
            <h2>Recent Leave Requests</h2>
            <div className="filter-date-controls">
              {filterDate && (
                <button
                  className="filter-clear-button"
                  onClick={() => setFilterDate('')}
                  title="Clear filter"
                >
                  Reset
                </button>
              )}
              <DatePicker
                value={filterDate}
                onChange={(date) => setFilterDate(date)}
                placeholder="Filter by date"
                allowManualEntry={true}
                isEmployeeVariant={true}
              />
            </div>
          </div>
          <div
            className={`requests-table-container ${myRequests?.requests && myRequests.requests.length > 3 ? 'scrollable' : ''} ${applyMutation.isLoading || deleteMutation.isLoading ? 'updating' : ''}`}
            style={{
              pointerEvents: (applyMutation.isLoading || deleteMutation.isLoading) ? 'none' : 'auto',
              opacity: (applyMutation.isLoading || deleteMutation.isLoading) ? 0.8 : 1
            }}
          >
            <table className="requests-table">
              <thead>
                <tr>
                  <th>S No</th>
                  <th>Applied Date</th>
                  <th>Leave Reason</th>
                  <th className="sortable-header" onClick={() => handleSort('startDate')}>
                    <div className="header-sort-wrapper">
                      Start date
                      {sortConfig.key === 'startDate' ? (
                        sortConfig.direction === 'asc' ? <FaSortUp className="sort-icon active" /> : <FaSortDown className="sort-icon active" />
                      ) : (
                        <FaSort className="sort-icon" />
                      )}
                    </div>
                  </th>
                  <th className="sortable-header" onClick={() => handleSort('endDate')}>
                    <div className="header-sort-wrapper">
                      End Date
                      {sortConfig.key === 'endDate' ? (
                        sortConfig.direction === 'asc' ? <FaSortUp className="sort-icon active" /> : <FaSortDown className="sort-icon active" />
                      ) : (
                        <FaSort className="sort-icon" />
                      )}
                    </div>
                  </th>
                  <th>No Of Days</th>
                  <th>Leave Type</th>
                  <th>Approved Dates</th>
                  <th>Current Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {(requestsLoading && !myRequests) ? (
                  <tr>
                    <td colSpan={10}>
                      <div className="skeleton-table">
                        <div className="skeleton-table-row"></div>
                        <div className="skeleton-table-row"></div>
                        <div className="skeleton-table-row"></div>
                      </div>
                    </td>
                  </tr>
                ) : filteredRequests.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ padding: 0 }}>
                      <EmptyState
                        title={filterDate ? "No Results Found" : "No Leave History"}
                        description={filterDate ? "Try adjusting your filter to find what you're looking for." : "You haven't applied for any leaves yet."}
                      />
                    </td>
                  </tr>
                ) : (
                  [...(myRequests.requests || [])]
                    .filter((request: any) => {
                      if (!filterDate) return true;

                      const filterStr = filterDate;

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
                      if (!sortConfig.key || !sortConfig.direction) return 0;

                      const valA = a[sortConfig.key] ? new Date(a[sortConfig.key] + 'T00:00:00').getTime() : 0;
                      const valB = b[sortConfig.key] ? new Date(b[sortConfig.key] + 'T00:00:00').getTime() : 0;

                      if (sortConfig.direction === 'asc') {
                        return valA - valB;
                      } else {
                        return valB - valA;
                      }
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
                          <td>{request.appliedDate ? format(new Date(request.appliedDate + 'T12:00:00'), 'dd/MM/yyyy') : '-'}</td>
                          <td>
                            <div className="reason-cell">
                              {request.leaveReason}
                            </div>
                          </td>
                          <td>
                            {request.startDate ? format(new Date(request.startDate + 'T12:00:00'), 'dd/MM/yyyy') : '-'}
                            {request.startDate && request.startType && request.startType !== 'full' ? formatHalfLabel(request.startType) : ''}
                          </td>
                          <td>
                            {request.endDate ? format(new Date(request.endDate + 'T12:00:00'), 'dd/MM/yyyy') : '-'}
                            {request.endDate && request.endType && request.endType !== 'full' ? formatHalfLabel(request.endType) : ''}
                          </td>
                          <td>{request.noOfDays}</td>
                          <td>{request.leaveType === 'lop' ? 'LOP' : request.leaveType.charAt(0).toUpperCase() + request.leaveType.slice(1)}</td>
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
                              <button
                                className={`action-btn edit-btn ${isUpdating || applyMutation.isLoading || deleteMutation.isLoading ? 'disabled' : ''}`}
                                title="View Details"
                                onClick={() => !isUpdating && !applyMutation.isLoading && !deleteMutation.isLoading && handleView(request.id)}
                                disabled={isUpdating || applyMutation.isLoading || deleteMutation.isLoading}
                              >
                                <FaEye />
                              </button>
                              {request.canEdit && request.canDelete && request.currentStatus !== 'approved' && request.currentStatus !== 'rejected' && request.currentStatus !== 'partially_approved' && (
                                <>
                                  <button
                                    className={`action-btn edit-btn ${isUpdating || applyMutation.isLoading || deleteMutation.isLoading ? 'disabled' : ''}`}
                                    title={isUpdating ? 'Updating...' : 'Edit'}
                                    onClick={() => !isUpdating && !applyMutation.isLoading && !deleteMutation.isLoading && handleEdit(request.id)}
                                    disabled={isUpdating || applyMutation.isLoading || deleteMutation.isLoading}
                                  >
                                    {isUpdating && editingId === request.id ? (
                                      <span className="loading-spinner-small"></span>
                                    ) : (
                                      <FaPencilAlt />
                                    )}
                                  </button>
                                  <button
                                    className={`action-btn delete-btn ${isUpdating || applyMutation.isLoading || deleteMutation.isLoading ? 'disabled' : ''}`}
                                    title={isUpdating ? 'Updating...' : 'Delete'}
                                    onClick={() => !isUpdating && !applyMutation.isLoading && !deleteMutation.isLoading && handleDelete(request.id)}
                                    disabled={isUpdating || applyMutation.isLoading || deleteMutation.isLoading}
                                  >
                                    {isUpdating && deleteRequestId === request.id ? (
                                      <span className="loading-spinner-small"></span>
                                    ) : (
                                      <FaTrash />
                                    )}
                                  </button>
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
    </AppLayout >
  );
};

export default LeaveApplyPage;
