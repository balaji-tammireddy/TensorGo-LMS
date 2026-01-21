import api from './api';

export interface LeaveType {
    id: number;
    code: string;
    name: string;
    description: string;
    is_active: boolean;
    roles?: string[];
}

export interface LeavePolicyConfig {
    id: number;
    role: string;
    leave_type_id: number;
    leave_type_code?: string;
    leave_type_name?: string;
    annual_credit: string;
    annual_max: string;
    carry_forward_limit: string;
    max_leave_per_month: string;
    anniversary_3_year_bonus: string;
    anniversary_5_year_bonus: string;
    effective_from?: string;
}

export const getLeaveTypes = async () => {
    const response = await api.get('/leave-rules/types');
    return response.data;
};

export const createLeaveType = async (code: string, name: string, description: string, roles?: string[]) => {
    const response = await api.post('/leave-rules/types', { code, name, description, roles });
    return response.data;
};

export const updateLeaveType = async (id: number, data: { name: string; description: string; is_active: boolean; roles: string[] }) => {
    const response = await api.put(`/leave-rules/types/${id}`, data);
    return response.data;
};

export const deleteLeaveType = async (id: number) => {
    const response = await api.delete(`/leave-rules/types/${id}`);
    return response.data;
};

export const getPolicies = async () => {
    const response = await api.get('/leave-rules/policies');
    return response.data; // Returns grouped object
};

export const updatePolicy = async (id: number, updates: Partial<LeavePolicyConfig>) => {
    const response = await api.put(`/leave-rules/policies/${id}`, updates);
    return response.data;
};
