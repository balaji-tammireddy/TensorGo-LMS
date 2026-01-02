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
