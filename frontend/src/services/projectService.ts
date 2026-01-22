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
}

export interface ProjectModule {
    id: number;
    project_id: number;
    custom_id: string;
    name: string;
    description: string;
    status: string;
}

export interface ProjectTask {
    id: number;
    module_id: number;
    custom_id: string;
    name: string;
    description: string;
    status: string;
    due_date?: string;
}

export interface ProjectActivity {
    id: number;
    task_id: number;
    custom_id: string;
    name: string;
    description: string;
    status: string;
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

    updateProject: async (id: number, data: Partial<Project>) => {
        const response = await api.put(`/projects/${id}`, data);
        return response.data;
    },

    // Modules
    createModule: async (projectId: number, data: any) => {
        const response = await api.post(`/projects/${projectId}/modules`, data);
        return response.data;
    },

    getModules: async (projectId: number) => {
        const response = await api.get<ProjectModule[]>(`/projects/${projectId}/modules`);
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

    // Access
    revokeAccess: async (level: 'project' | 'module' | 'task', id: number, userId: number) => {
        const response = await api.delete('/projects/access', {
            data: { level, id, userId }
        });
        return response.data;
    }
};
