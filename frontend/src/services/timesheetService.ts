import api from './api';

export interface TimesheetEntry {
    id?: number;
    project_id: number;
    module_id: number;
    task_id: number;
    activity_id: number;
    log_date: string; // YYYY-MM-DD
    duration: number;
    description: string;
    work_status: string; // 'not_applicable', 'in_progress', 'closed', 'differed', 'review', 'testing', 'fixed'
    log_status?: string; // 'draft', 'submitted', 'approved', 'rejected'
    project_name?: string;
    module_name?: string;
    task_name?: string;
    activity_name?: string;
    rejection_reason?: string;
    manager_comment?: string;
}

export const timesheetService = {
    getWeeklyEntries: async (startDate: string, endDate: string, signal?: AbortSignal) => {
        const response = await api.get<TimesheetEntry[]>(`/timesheets/weekly?start_date=${startDate}&end_date=${endDate}`, { signal });
        return response.data;
    },

    saveEntry: async (entry: TimesheetEntry) => {
        const response = await api.post<TimesheetEntry>('/timesheets/entry', entry);
        return response.data;
    },

    deleteEntry: async (id: number) => {
        const response = await api.delete(`/timesheets/entry/${id}`);
        return response.data;
    },

    // Approval Module
    getTeamStatus: async (startDate: string, endDate: string) => {
        const response = await api.get(`/timesheets/team-status?start_date=${startDate}&end_date=${endDate}`);
        return response.data;
    },

    getMemberEntries: async (targetUserId: number, startDate: string, endDate: string) => {
        const response = await api.get<TimesheetEntry[]>(`/timesheets/member/${targetUserId}?start_date=${startDate}&end_date=${endDate}`);
        return response.data;
    },

    approveTimesheet: async (targetUserId: number, startDate: string, endDate: string) => {
        const response = await api.post('/timesheets/approve', { targetUserId, start_date: startDate, end_date: endDate });
        return response.data;
    },

    rejectEntry: async (entryId: number, reason: string) => {
        const response = await api.post('/timesheets/reject', { entryId, reason });
        return response.data;
    },

    rejectTimesheet: async (targetUserId: number, startDate: string, endDate: string, reason: string) => {
        const response = await api.post('/timesheets/reject-bulk', { targetUserId, start_date: startDate, end_date: endDate, reason });
        return response.data;
    },

    downloadReport: async (filters: any) => {
        // Construct query params
        const params = new URLSearchParams();
        if (filters.startDate) params.append('startDate', filters.startDate);
        if (filters.endDate) params.append('endDate', filters.endDate);
        if (filters.userId) params.append('targetUserId', filters.userId);
        if (filters.projectId) params.append('projectId', filters.projectId);
        if (filters.moduleId) params.append('moduleId', filters.moduleId);

        const response = await api.get(`/timesheets/report?${params.toString()}`);
        return response.data;
    }
};
