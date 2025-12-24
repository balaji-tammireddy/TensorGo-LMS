import api from './api';

export interface Employee {
  id: number;
  empId: string;
  name: string;
  position: string;
  joiningDate: string;
  status: string;
  role: string;
}

export interface EmployeeListResponse {
  employees: Employee[];
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
}

export const getEmployees = async (
  page: number = 1,
  limit: number = 20,
  search?: string,
  joiningDate?: string,
  status?: string
): Promise<EmployeeListResponse> => {
  const params = new URLSearchParams({ page: page.toString(), limit: limit.toString() });
  if (search) params.append('search', search);
  if (joiningDate) params.append('joiningDate', joiningDate);
  if (status) params.append('status', status);
  const response = await api.get(`/employees?${params}`);
  return response.data;
};

export const getEmployeeById = async (id: number) => {
  const response = await api.get(`/employees/${id}`);
  return response.data.employee;
};

export const createEmployee = async (data: any) => {
  const response = await api.post('/employees', data);
  return response.data;
};

export const updateEmployee = async (id: number, data: any) => {
  const response = await api.put(`/employees/${id}`, data);
  return response.data;
};

export const deleteEmployee = async (id: number) => {
  const response = await api.delete(`/employees/${id}`);
  return response.data;
};

export const addLeavesToEmployee = async (employeeId: number, leaveType: 'casual' | 'sick' | 'lop', count: number) => {
  const response = await api.post(`/employees/${employeeId}/leaves`, { leaveType, count });
  return response.data;
};

export const getNextEmployeeId = async (): Promise<string> => {
  const response = await api.get('/employees/next-id');
  return response.data.nextEmployeeId;
};

export const getEmployeeLeaveBalances = async (employeeId: number) => {
  const response = await api.get(`/employees/${employeeId}/leave-balances`);
  return response.data;
};

