import api from './api';

export const getStats = async () => {
    const response = await api.get('/dashboard/stats');
    return response.data.data;
};

export const getHierarchy = async () => {
    const response = await api.get('/dashboard/hierarchy');
    return response.data.data;
};

export const getUserDashboardDetails = async (userId: number) => {
    // If user is super_admin (assumed id check or role check if passed), 
    // the backend will return 0 or we can handle it here, but generally backend handles logic.
    const response = await api.get(`/dashboard/user-details/${userId}`);
    return response.data.data;
};

export const getAnalytics = async () => {
    const response = await api.get('/dashboard/analytics');
    return response.data.data;
};
