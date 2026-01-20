import api from './api';

export interface LeaveBalance {
  casual: number;
  sick: number;
  lop: number;
}

export interface Holiday {
  date: string;
  name: string;
}

export interface LeaveRule {
  leaveRequired: string;
  priorInformation: string;
}

export interface LeaveRequest {
  id: number;
  appliedDate: string;
  leaveReason: string;
  startDate: string;
  endDate: string;
  noOfDays: number;
  leaveType: string;
  currentStatus: string;
  rejectionReason?: string;
  canEdit?: boolean;
  canDelete?: boolean;
  timeForPermission?: { start: string; end: string } | null;
  leaveDays?: Array<{ date: string; type: string; status: string }>;
  approvedDays?: number;
  rejectedDays?: number;
  pendingDays?: number;
  totalDays?: number;
  empStatus?: string;
  empRole?: string;
}

export interface PendingLeaveRequest {
  id: number;
  empId: string;
  empName: string;
  appliedDate: string;
  leaveDate: string;
  leaveType: string;
  noOfDays: number;
  leaveReason: string;
  currentStatus: string;
  timeForPermission?: { start: string; end: string } | null;
  empStatus?: string;
  empRole?: string;
  leaveDays: Array<{ date: string; type: string }>;
}

export interface ApplyLeaveData {
  leaveType: 'casual' | 'sick' | 'lop' | 'permission';
  startDate: string;
  startType: 'full' | 'half';
  endDate: string;
  endType: 'full' | 'half';
  reason: string;
  timeForPermission?: { start?: string; end?: string };
  doctorNote?: string | File; // Can be File for upload or string for existing key/base64
}

export const getLeaveBalances = async (): Promise<LeaveBalance> => {
  const response = await api.get('/leave/balances');
  return response.data;
};

export const getHolidays = async (year?: number): Promise<Holiday[]> => {
  const params = new URLSearchParams();
  if (year) {
    params.append('year', year.toString());
  }
  const queryString = params.toString();
  const url = queryString ? `/leave/holidays?${queryString}` : '/leave/holidays';
  const response = await api.get(url);
  return response.data.holidays;
};

export const getLeaveRules = async (): Promise<LeaveRule[]> => {
  const response = await api.get('/leave/rules');
  return response.data.rules;
};

export const applyLeave = async (data: ApplyLeaveData) => {
  const formData = new FormData();

  // Add all fields except doctorNote
  formData.append('leaveType', data.leaveType);
  formData.append('startDate', data.startDate);
  formData.append('startType', data.startType);
  formData.append('endDate', data.endDate);
  formData.append('endType', data.endType);
  formData.append('reason', data.reason);

  if (data.timeForPermission) {
    if (data.timeForPermission.start) formData.append('timeForPermission[start]', data.timeForPermission.start);
    if (data.timeForPermission.end) formData.append('timeForPermission[end]', data.timeForPermission.end);
  }

  // Handle doctorNote - if it's a File, append it; if it's a string (existing key/base64), append as is
  if (data.doctorNote) {
    if (data.doctorNote instanceof File) {
      formData.append('doctorNote', data.doctorNote);
    } else {
      // Existing key or base64 - send as JSON field
      formData.append('doctorNote', data.doctorNote);
    }
  }

  const response = await api.post('/leave/apply', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  });
  return response.data;
};

export const getMyLeaveRequests = async (page: number = 1, limit: number = 10, status?: string) => {
  const params = new URLSearchParams({ page: page.toString(), limit: limit.toString() });
  if (status) params.append('status', status);
  const response = await api.get(`/leave/my-requests?${params}`);
  return response.data;
};

export const getEmployeeLeaveRequests = async (employeeId: number, page: number = 1, limit: number = 10, status?: string) => {
  const params = new URLSearchParams({ page: page.toString(), limit: limit.toString() });
  if (status) params.append('status', status);
  const response = await api.get(`/leave/employee/${employeeId}/requests?${params}`);
  return response.data;
};

export const getEmployeeLeaveBalances = async (employeeId: number): Promise<LeaveBalance> => {
  const response = await api.get(`/leave/employee/${employeeId}/balances`);
  return response.data;
};

export const getPendingLeaveRequests = async (page: number = 1, limit: number = 10, search?: string, filter?: string) => {
  const params = new URLSearchParams({ page: page.toString(), limit: limit.toString() });
  if (search) params.append('search', search);
  if (filter) params.append('filter', filter);
  const response = await api.get(`/leave/pending?${params}`);
  return response.data;
};

export const approveLeave = async (leaveId: number, comment?: string) => {
  const response = await api.post(`/leave/${leaveId}/approve`, { comment });
  return response.data;
};

export const rejectLeave = async (leaveId: number, comment: string) => {
  const response = await api.post(`/leave/${leaveId}/reject`, { comment });
  return response.data;
};

export const approveLeaveDay = async (leaveId: number, dayId: number, comment?: string) => {
  const response = await api.post(`/leave/${leaveId}/day/${dayId}/approve`, { comment });
  return response.data;
};

export const approveLeaveDays = async (leaveId: number, dayIds: number[], comment?: string) => {
  const response = await api.post(`/leave/${leaveId}/days/approve`, { dayIds, comment });
  return response.data;
};

export const rejectLeaveDay = async (leaveId: number, dayId: number, comment: string) => {
  const response = await api.post(`/leave/${leaveId}/day/${dayId}/reject`, { comment });
  return response.data;
};

export const rejectLeaveDays = async (leaveId: number, dayIds: number[], comment: string) => {
  const response = await api.post(`/leave/${leaveId}/days/reject`, { dayIds, comment });
  return response.data;
};

export const getApprovedLeaves = async (page: number = 1, limit: number = 10) => {
  const params = new URLSearchParams({ page: page.toString(), limit: limit.toString() });
  const response = await api.get(`/leave/approved?${params}`);
  return response.data;
};

export const getLeaveRequest = async (requestId: number) => {
  const response = await api.get(`/leave/request/${requestId}`);
  return response.data;
};

export const updateLeaveRequest = async (requestId: number, data: ApplyLeaveData) => {
  // Check if we have a new file to upload
  const hasNewFile = data.doctorNote instanceof File;

  // If no new file, use JSON for faster transmission
  if (!hasNewFile) {
    const jsonData: any = {
      leaveType: data.leaveType,
      startDate: data.startDate,
      startType: data.startType,
      endDate: data.endDate,
      endType: data.endType,
      reason: data.reason
    };

    if (data.timeForPermission) {
      jsonData.timeForPermission = data.timeForPermission;
    }

    // If doctorNote is a string (existing key), include it
    if (data.doctorNote && typeof data.doctorNote === 'string') {
      jsonData.doctorNote = data.doctorNote;
    }

    const response = await api.put(`/leave/request/${requestId}`, jsonData);
    return response.data;
  }

  // If we have a new file, use FormData
  const formData = new FormData();
  formData.append('leaveType', data.leaveType);
  formData.append('startDate', data.startDate);
  formData.append('startType', data.startType);
  formData.append('endDate', data.endDate);
  formData.append('endType', data.endType);
  formData.append('reason', data.reason);

  if (data.timeForPermission) {
    if (data.timeForPermission.start) formData.append('timeForPermission[start]', data.timeForPermission.start);
    if (data.timeForPermission.end) formData.append('timeForPermission[end]', data.timeForPermission.end);
  }

  if (data.doctorNote instanceof File) {
    formData.append('doctorNote', data.doctorNote);
  }

  const response = await api.put(`/leave/request/${requestId}`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  });
  return response.data;
};

export const getMedicalCertificateSignedUrl = async (requestId: number): Promise<{ signedUrl: string; expiresIn: number | null }> => {
  const response = await api.get(`/leave/request/${requestId}/medical-certificate/signed-url`);
  return response.data;
};

export const deleteLeaveRequest = async (requestId: number) => {
  const response = await api.delete(`/leave/request/${requestId}`);
  return response.data;
};

export const updateLeaveStatus = async (
  requestId: number,
  status: string,
  dayIds?: number[],
  rejectReason?: string,
  leaveReason?: string
) => {
  const response = await api.post(`/leave/${requestId}/update-status`, {
    status,
    dayIds,
    rejectReason,
    leaveReason
  });
  return response.data;
};



/**
 * Create a new holiday
 * Only HR and Super Admin can create holidays
 */
export const createHoliday = async (holidayDate: string, holidayName: string) => {
  const response = await api.post('/leave/holidays', { holidayDate, holidayName });
  return response.data;
};

/**
 * Delete a holiday
 * Only HR and Super Admin can delete holidays
 */
export const deleteHoliday = async (holidayId: number) => {
  const response = await api.delete(`/leave/holidays/${holidayId}`);
  return response.data;
};

export const convertLeaveRequestLopToCasual = async (requestId: number) => {
  const response = await api.post(`/leave/request/${requestId}/convert-lop-to-casual`);
  return response.data;
};
