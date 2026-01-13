import api from './api';

export interface Profile {
  personalInfo: {
    firstName: string;
    middleName?: string;
    lastName?: string;
    empId: string;
    email: string;
    contactNumber?: string;
    altContact?: string;
    dateOfBirth?: string;
    gender?: string;
    bloodGroup?: string;
    maritalStatus?: string;
    emergencyContactName?: string;
    emergencyContactNo?: string;
    emergencyContactRelation?: string;
  };
  employmentInfo: {
    designation?: string;
    department?: string;
    dateOfJoining?: string;
  };
  documents: {
    aadharNumber?: string;
    panNumber?: string;
  };
  address: {
    currentAddress?: string;
    permanentAddress?: string;
  };
  education: Array<{
    level: string;
    groupStream?: string;
    collegeUniversity?: string;
    year?: number;
    scorePercentage?: number;
  }>;
  reportingManager?: {
    id: number;
    name: string;
    empId: string;
  };
  profilePhotoUrl?: string;
  profilePhotoKey?: string; // OVHcloud object key (for signed URL generation)
}

export interface ReportingManager {
  id: number;
  name: string;
  empId: string;
  role: string;
}

export const getProfile = async (): Promise<Profile> => {
  const response = await api.get('/profile');
  return response.data;
};

export const updateProfile = async (data: Partial<Profile>) => {
  const response = await api.put('/profile', data);
  return response.data;
};

export const uploadProfilePhoto = async (file: File) => {
  const formData = new FormData();
  formData.append('photo', file);
  const response = await api.post('/profile/photo', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  });
  return response.data;
};

export const deleteProfilePhoto = async () => {
  const response = await api.delete('/profile/photo');
  return response.data;
};

export const getProfilePhotoSignedUrl = async (userId?: number): Promise<{ signedUrl: string; expiresIn: number | null }> => {
  const params = userId ? `?userId=${userId}` : '';
  const response = await api.get(`/profile/photo/signed-url${params}`);
  return response.data;
};

export const getReportingManagers = async (search?: string, employeeRole?: string, excludeEmployeeId?: number): Promise<ReportingManager[]> => {
  const params = new URLSearchParams();
  if (search) params.append('search', search);
  if (employeeRole) params.append('employeeRole', employeeRole);
  if (excludeEmployeeId) params.append('excludeEmployeeId', excludeEmployeeId.toString());
  const response = await api.get(`/profile/reporting-managers?${params}`);
  return response.data.managers;
};

