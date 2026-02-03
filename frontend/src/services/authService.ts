import api from './api';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface User {
  id: number;
  empId: string;
  name: string;
  role: string;
  email: string;
  status: string;
  mustChangePassword?: boolean;
  isProfileUpdated?: boolean;
}

export interface LoginResponse {
  accessToken: string;
  user: User;
}

export const login = async (credentials: LoginCredentials): Promise<LoginResponse> => {
  const response = await api.post('/auth/login', credentials);
  return response.data;
};

export const logout = async (): Promise<void> => {
  await api.post('/auth/logout');
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
};

export interface ForgotPasswordRequest {
  email: string;
}

export interface VerifyOTPRequest {
  email: string;
  otp: string;
}

export interface ResetPasswordRequest {
  email: string;
  otp: string;
  newPassword: string;
}

export const forgotPassword = async (data: ForgotPasswordRequest): Promise<{ message: string }> => {
  const response = await api.post('/auth/forgot-password', data);
  return response.data;
};

export const verifyOTP = async (data: VerifyOTPRequest): Promise<{ message: string }> => {
  const response = await api.post('/auth/verify-otp', data);
  return response.data;
};

export const resetPassword = async (data: ResetPasswordRequest): Promise<{ message: string }> => {
  const response = await api.post('/auth/reset-password', data);
  return response.data;
};

export const checkAuth = async (): Promise<LoginResponse> => {
  const response = await api.post('/auth/refresh', {});
  return response.data;
};

