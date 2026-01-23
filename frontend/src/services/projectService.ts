import api from './api';

export interface Project {
    id: number;
    custom_id: string;
    name: string;
    description: string;
    project_manager_id: number;
    status: 'active' | 'completed' | 'archived' | 'on_hold';
    start_date?: string;
    end_date?: string;
    created_at: string;
    is_pm?: boolean;
    is_member?: boolean;
    manager_name?: string;
}

export interface ProjectModule {
    id: number;
    project_id: number;
    custom_id: string;
    name: string;
    description: string;
    status: string;
    assigned_users?: { id: number; name: string; initials: string; }[];
}

export interface ProjectTask {
    id: number;
    module_id: number;
    custom_id: string;
    name: string;
    description: string;
    status: string;
    due_date?: string;
    is_assigned?: boolean;
    assigned_users?: { id: number; name: string; initials: string; }[];
}

export interface ProjectActivity {
    id: number;
    task_id: number;
    custom_id: string;
    name: string;
    description: string;
    status: string;
    assigned_users?: { id: number; name: string; initials: string; }[];
}

export const projectService = {
    // Projects
    createProject: async (data: any) => {
        const response = await api.post('/projects', data);
        return response.data;
    },

    getProjects: async () => {
        const response = await api.get<Project[]>('/projects');
        return response.data;
    },

    getProjectMembers: async (projectId: number) => {
        const response = await api.get(`/projects/${projectId}/access-list?level=project`);
        return response.data;
    },

    updateProject: async (id: number, data: Partial<Project>) => {
        const response = await api.put(`/projects/${id}`, data);
        return response.data;
    },

    deleteProject: (id: number) => api.delete(`/projects/${id}`),

    // Modules
    createModule: async (projectId: number, data: any) => {
        const response = await api.post(`/projects/${projectId}/modules`, data);
        return response.data;
    },

    getModules: async (projectId: number) => {
        const response = await api.get<ProjectModule[]>(`/projects/${projectId}/modules`);
        return response.data;
    },

    updateModule: async (moduleId: number, data: any) => {
        const response = await api.put(`/projects/modules/${moduleId}`, data);
        return response.data;
    },

    deleteModule: async (moduleId: number) => {
        const response = await api.delete(`/projects/modules/${moduleId}`);
        return response.data;
    },

    // Tasks
    createTask: async (moduleId: number, data: any) => {
        const response = await api.post(`/projects/modules/${moduleId}/tasks`, data);
        return response.data;
    },

    getTasks: async (moduleId: number) => {
        const response = await api.get<ProjectTask[]>(`/projects/modules/${moduleId}/tasks`);
        return response.data;
    },

    updateTask: async (taskId: number, data: any) => {
        const response = await api.put(`/projects/tasks/${taskId}`, data);
        return response.data;
    },

    // Activities
    createActivity: async (taskId: number, data: any) => {
        const response = await api.post(`/projects/tasks/${taskId}/activities`, data);
        return response.data;
    },

    getActivities: async (taskId: number) => {
        const response = await api.get<ProjectActivity[]>(`/projects/tasks/${taskId}/activities`);
        return response.data;
    },

    updateActivity: async (activityId: number, data: any) => {
        const response = await api.put(`/projects/activities/${activityId}`, data);
        return response.data;
    },

    deleteTask: async (taskId: number) => {
        const response = await api.delete(`/projects/tasks/${taskId}`);
        return response.data;
    },

    deleteActivity: async (activityId: number) => {
        const response = await api.delete(`/projects/activities/${activityId}`);
        return response.data;
    },

    // Access
    deleteAccess: (level: string, id: number, userId: number) =>
        api.delete('/projects/access', { data: { level, id, userId } }),

    getAccessList: (level: string, id: number) =>
        api.get<any[]>(`/projects/access/${level}/${id}`).then(res => res.data),

    toggleAccess: async (level: 'module' | 'task' | 'activity', targetId: number, userId: number, action: 'add' | 'remove') => {
        const response = await api.post('/projects/access/toggle', { level, targetId, userId, action });
        return response.data;
    },
};
