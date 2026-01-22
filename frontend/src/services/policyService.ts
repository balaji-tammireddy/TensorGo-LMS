import api from './api';

export interface PolicyData {
    id: number;
    title: string;
    s3_key: string;
    public_url: string;
    icon_type: string;
}

export const getPolicies = async (): Promise<PolicyData[]> => {
    const response = await api.get('/policies');
    return response.data;
};

export const createPolicy = async (title: string, file: File): Promise<PolicyData> => {
    const formData = new FormData();
    formData.append('title', title);
    formData.append('file', file);
    const response = await api.post('/policies', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
};

export const updatePolicy = async (id: number | string, file?: File, title?: string): Promise<PolicyData> => {
    const formData = new FormData();
    if (file) formData.append('file', file);
    if (title) formData.append('title', title);
    const response = await api.put(`/policies/${id}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
};

export const deletePolicy = async (id: number | string): Promise<void> => {
    await api.delete(`/policies/${id}`);
};
