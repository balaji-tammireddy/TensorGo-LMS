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
    }
};
