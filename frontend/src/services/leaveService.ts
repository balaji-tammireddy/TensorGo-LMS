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
  leaveDays?: Array<{ date: string; type: string; status: string }>;
  approvedDays?: number;
  rejectedDays?: number;
  pendingDays?: number;
  totalDays?: number;
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
  doctorNote?: string;
}

export const getLeaveBalances = async (): Promise<LeaveBalance> => {
  const response = await api.get('/leave/balances');
  return response.data;
};

export const getHolidays = async (): Promise<Holiday[]> => {
  const response = await api.get('/leave/holidays');
  return response.data.holidays;
};

export const getLeaveRules = async (): Promise<LeaveRule[]> => {
  const response = await api.get('/leave/rules');
  return response.data.rules;
};

export const applyLeave = async (data: ApplyLeaveData) => {
  const response = await api.post('/leave/apply', data);
  return response.data;
};

export const getMyLeaveRequests = async (page: number = 1, limit: number = 10, status?: string) => {
  const params = new URLSearchParams({ page: page.toString(), limit: limit.toString() });
  if (status) params.append('status', status);
  const response = await api.get(`/leave/my-requests?${params}`);
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
  const response = await api.put(`/leave/request/${requestId}`, data);
  return response.data;
};

export const deleteLeaveRequest = async (requestId: number) => {
  const response = await api.delete(`/leave/request/${requestId}`);
  return response.data;
};

