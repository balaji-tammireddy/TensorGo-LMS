import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import AppLayout from '../components/layout/AppLayout';
import { useAuth } from '../contexts/AuthContext';
import * as profileService from '../services/profileService';
import { format } from 'date-fns';
import './ProfilePage.css';

const ProfilePage: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isEditMode, setIsEditMode] = useState(false);
  const [formData, setFormData] = useState<any>({});

  const { data: profile, isLoading, error } = useQuery(
    'profile',
    profileService.getProfile,
    {
      retry: false,
      onError: (error: any) => {
        if (error.response?.status === 403 || error.response?.status === 401) {
          window.location.href = '/login';
        }
      }
    }
  );

  const updateMutation = useMutation(profileService.updateProfile, {
    onSuccess: () => {
      queryClient.invalidateQueries('profile');
      setIsEditMode(false);
      alert('Profile updated successfully!');
    },
    onError: (error: any) => {
      alert(error.response?.data?.error?.message || 'Failed to update profile');
    }
  });

  React.useEffect(() => {
    if (profile) {
      setFormData({
        personalInfo: { ...profile.personalInfo },
        employmentInfo: { ...profile.employmentInfo },
        documents: { ...profile.documents },
        address: { ...profile.address },
        education: profile.education || [
          { level: 'PG' },
          { level: 'UG' },
          { level: '12th' }
        ],
        reportingManagerId: profile.reportingManager?.id
      });
    }
  }, [profile]);

  const handleSave = () => {
    updateMutation.mutate(formData);
  };

  const handleSameAsCurrentAddress = (checked: boolean) => {
    if (checked) {
      setFormData({
        ...formData,
        address: {
          ...formData.address,
          permanentAddress: formData.address?.currentAddress
        }
      });
    }
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="profile-page">
          <div style={{ padding: '20px', textAlign: 'center' }}>Loading...</div>
        </div>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout>
        <div className="profile-page">
          <div style={{ padding: '20px', textAlign: 'center', color: 'red' }}>
            Error loading profile. Please try again.
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="profile-page">
        <div className="profile-header">
          <h1 className="page-title">My Profile</h1>
          <div className="header-actions">
            {!isEditMode ? (
              <button className="edit-button" onClick={() => setIsEditMode(true)}>
                Edit Profile
              </button>
            ) : (
              <button className="save-button" onClick={handleSave}>
                Save Changes
              </button>
            )}
          </div>
        </div>

        <div className="profile-picture-section">
          <div className="profile-picture">
            {profile?.profilePhotoUrl ? (
              <img src={profile.profilePhotoUrl} alt="Profile" />
            ) : (
              <div className="profile-placeholder">👤</div>
            )}
          </div>
          {isEditMode && (
            <div className="picture-actions">
              <button className="change-photo-button">Change Photo</button>
              <button className="delete-photo-button">Delete</button>
            </div>
          )}
        </div>

        <div className="profile-section">
          <h2>Personal Information</h2>
          <div className="form-grid">
            <div className="form-group">
              <label>First Name</label>
              <input
                type="text"
                value={formData.personalInfo?.firstName || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  personalInfo: { ...formData.personalInfo, firstName: e.target.value }
                })}
                disabled={!isEditMode}
              />
            </div>
            <div className="form-group">
              <label>Middle Name</label>
              <input
                type="text"
                value={formData.personalInfo?.middleName || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  personalInfo: { ...formData.personalInfo, middleName: e.target.value }
                })}
                disabled={!isEditMode}
              />
            </div>
            <div className="form-group">
              <label>Last Name</label>
              <input
                type="text"
                value={formData.personalInfo?.lastName || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  personalInfo: { ...formData.personalInfo, lastName: e.target.value }
                })}
                disabled={!isEditMode}
              />
            </div>
            <div className="form-group">
              <label>Employee ID</label>
              <input type="text" value={formData.personalInfo?.empId || ''} disabled />
            </div>
            <div className="form-group">
              <label>Official Email</label>
              <input type="email" value={formData.personalInfo?.email || ''} disabled />
            </div>
            <div className="form-group">
              <label>Contact Number</label>
              <input
                type="text"
                value={formData.personalInfo?.contactNumber || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  personalInfo: { ...formData.personalInfo, contactNumber: e.target.value }
                })}
                disabled={!isEditMode}
              />
            </div>
            <div className="form-group">
              <label>Alt Contact</label>
              <input
                type="text"
                value={formData.personalInfo?.altContact || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  personalInfo: { ...formData.personalInfo, altContact: e.target.value }
                })}
                disabled={!isEditMode}
              />
            </div>
            <div className="form-group">
              <label>Date of Birth</label>
              <input
                type="date"
                value={formData.personalInfo?.dateOfBirth || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  personalInfo: { ...formData.personalInfo, dateOfBirth: e.target.value }
                })}
                disabled={!isEditMode}
              />
            </div>
            <div className="form-group">
              <label>Gender</label>
              <select
                value={formData.personalInfo?.gender || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  personalInfo: { ...formData.personalInfo, gender: e.target.value }
                })}
                disabled={!isEditMode}
              >
                <option value="">Select</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div className="form-group">
              <label>Blood Group</label>
              <input
                type="text"
                value={formData.personalInfo?.bloodGroup || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  personalInfo: { ...formData.personalInfo, bloodGroup: e.target.value }
                })}
                disabled={!isEditMode}
              />
            </div>
            <div className="form-group">
              <label>Marital Status</label>
              <input
                type="text"
                value={formData.personalInfo?.maritalStatus || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  personalInfo: { ...formData.personalInfo, maritalStatus: e.target.value }
                })}
                disabled={!isEditMode}
              />
            </div>
            <div className="form-group">
              <label>Emergency Contact Name</label>
              <input
                type="text"
                value={formData.personalInfo?.emergencyContactName || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  personalInfo: { ...formData.personalInfo, emergencyContactName: e.target.value }
                })}
                disabled={!isEditMode}
              />
            </div>
            <div className="form-group">
              <label>Emergency Contact No</label>
              <input
                type="text"
                value={formData.personalInfo?.emergencyContactNo || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  personalInfo: { ...formData.personalInfo, emergencyContactNo: e.target.value }
                })}
                disabled={!isEditMode}
              />
            </div>
          </div>
        </div>

        <div className="profile-section">
          <h2>Employment Information</h2>
          <div className="form-grid">
            <div className="form-group">
              <label>Designation</label>
              <input
                type="text"
                value={formData.employmentInfo?.designation || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  employmentInfo: { ...formData.employmentInfo, designation: e.target.value }
                })}
                disabled={!isEditMode || (user?.role === 'employee')}
              />
            </div>
            <div className="form-group">
              <label>Department</label>
              <input
                type="text"
                value={formData.employmentInfo?.department || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  employmentInfo: { ...formData.employmentInfo, department: e.target.value }
                })}
                disabled={!isEditMode || (user?.role === 'employee')}
              />
            </div>
            <div className="form-group">
              <label>Date of Joining</label>
              <input
                type="date"
                value={formData.employmentInfo?.dateOfJoining || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  employmentInfo: { ...formData.employmentInfo, dateOfJoining: e.target.value }
                })}
                disabled={!isEditMode || (user?.role === 'employee')}
              />
            </div>
          </div>
        </div>

        <div className="profile-section">
          <h2>Document Information</h2>
          <div className="form-grid">
            <div className="form-group">
              <label>Aadhar Number</label>
              <input
                type="text"
                value={formData.documents?.aadharNumber || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  documents: { ...formData.documents, aadharNumber: e.target.value }
                })}
                disabled={!isEditMode}
              />
            </div>
            <div className="form-group">
              <label>PAN Number</label>
              <input
                type="text"
                value={formData.documents?.panNumber || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  documents: { ...formData.documents, panNumber: e.target.value }
                })}
                disabled={!isEditMode}
              />
            </div>
          </div>
        </div>

        <div className="profile-section">
          <h2>Address Details</h2>
          <div className="form-group">
            <label>Current Address</label>
            <textarea
              value={formData.address?.currentAddress || ''}
              onChange={(e) => setFormData({
                ...formData,
                address: { ...formData.address, currentAddress: e.target.value }
              })}
              disabled={!isEditMode}
              rows={4}
            />
          </div>
          <div className="form-group">
            <label>Permanent Address</label>
            <div className="checkbox-group">
              <input
                type="checkbox"
                id="same-address"
                onChange={(e) => handleSameAsCurrentAddress(e.target.checked)}
                disabled={!isEditMode}
              />
              <label htmlFor="same-address">Same as Current Address</label>
            </div>
            <textarea
              value={formData.address?.permanentAddress || ''}
              onChange={(e) => setFormData({
                ...formData,
                address: { ...formData.address, permanentAddress: e.target.value }
              })}
              disabled={!isEditMode}
              rows={4}
            />
          </div>
        </div>

        <div className="profile-section">
          <h2>Education Information</h2>
          <table className="education-table">
            <thead>
              <tr>
                <th></th>
                <th>Group/Stream</th>
                <th>College/University</th>
                <th>Year</th>
                <th>Score %</th>
              </tr>
            </thead>
            <tbody>
              {formData.education?.map((edu: any, idx: number) => (
                <tr key={edu.level}>
                  <td>{edu.level}</td>
                  <td>
                    <input
                      type="text"
                      value={edu.groupStream || ''}
                      onChange={(e) => {
                        const newEducation = [...formData.education];
                        newEducation[idx] = { ...edu, groupStream: e.target.value };
                        setFormData({ ...formData, education: newEducation });
                      }}
                      disabled={!isEditMode}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={edu.collegeUniversity || ''}
                      onChange={(e) => {
                        const newEducation = [...formData.education];
                        newEducation[idx] = { ...edu, collegeUniversity: e.target.value };
                        setFormData({ ...formData, education: newEducation });
                      }}
                      disabled={!isEditMode}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={edu.year || ''}
                      onChange={(e) => {
                        const newEducation = [...formData.education];
                        newEducation[idx] = { ...edu, year: parseInt(e.target.value) || null };
                        setFormData({ ...formData, education: newEducation });
                      }}
                      disabled={!isEditMode}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={edu.scorePercentage || ''}
                      onChange={(e) => {
                        const newEducation = [...formData.education];
                        newEducation[idx] = { ...edu, scorePercentage: parseFloat(e.target.value) || null };
                        setFormData({ ...formData, education: newEducation });
                      }}
                      disabled={!isEditMode}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="profile-section">
          <h2>Reporting Hierarchy</h2>
          <div className="form-group">
            <label>Reporting Manager</label>
            <input
              type="text"
              value={profile?.reportingManager?.name || ''}
              disabled
              placeholder="Search Manager Name..."
            />
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default ProfilePage;

