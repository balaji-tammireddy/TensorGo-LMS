import React, { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import AppLayout from '../components/layout/AppLayout';
import { useAuth } from '../contexts/AuthContext';
import * as profileService from '../services/profileService';
import './ProfilePage.css';

const ProfilePage: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isEditMode, setIsEditMode] = useState(false);
  const [formData, setFormData] = useState<any>({});
  const [initialFormData, setInitialFormData] = useState<any | null>(null);
  const [isSameAddress, setIsSameAddress] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const sanitizeName = (value: string) => {
    return value.replace(/[^a-zA-Z\s]/g, '').slice(0, 25);
  };

  const sanitizePhone = (value: string) => {
    return value.replace(/[^0-9]/g, '').slice(0, 10);
  };

  const sanitizeAadhaar = (value: string) => {
    return value.replace(/[^0-9]/g, '').slice(0, 12);
  };

  const formatAadhaar = (value: string) => {
    const digits = sanitizeAadhaar(value);
    return digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
  };

  const sanitizePan = (value: string) => {
    return value.toUpperCase().replace(/\s+/g, '').slice(0, 10);
  };
  const sanitizeLettersOnly = (value: string) => {
    return value.replace(/[^a-zA-Z\s]/g, '');
  };

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
    onSuccess: (_data, variables: any) => {
      queryClient.invalidateQueries('profile');
      setFormData(variables);
      setInitialFormData(variables);
      setIsEditMode(false);
    },
    onError: (error: any) => {
      alert(error.response?.data?.error?.message || 'Failed to update profile');
    }
  });

  const uploadPhotoMutation = useMutation(profileService.uploadProfilePhoto, {
    onSuccess: () => {
      queryClient.invalidateQueries('profile');
      alert('Profile photo updated successfully!');
    },
    onError: (error: any) => {
      alert(error.response?.data?.error?.message || 'Failed to upload profile photo');
    }
  });

  const deletePhotoMutation = useMutation(profileService.deleteProfilePhoto, {
    onSuccess: () => {
      queryClient.invalidateQueries('profile');
      alert('Profile photo deleted successfully!');
    },
    onError: (error: any) => {
      alert(error.response?.data?.error?.message || 'Failed to delete profile photo');
    }
  });

  React.useEffect(() => {
    if (profile) {
      const baseLevels = ['PG', 'UG', '12th'];
      const educationFromApi = profile.education || [];
      const mergedEducation = baseLevels.map((level) => {
        const existing = educationFromApi.find((edu: any) => edu.level === level);
        return existing || { level };
      });

      const initialAddress = { ...profile.address };
      const isInitiallySame =
        !!initialAddress.currentAddress &&
        initialAddress.currentAddress === initialAddress.permanentAddress;

      setIsSameAddress(isInitiallySame);

      const nextFormData = {
        personalInfo: { ...profile.personalInfo },
        employmentInfo: { ...profile.employmentInfo },
        documents: { ...profile.documents },
        address: {
          ...initialAddress,
          permanentAddress: isInitiallySame ? initialAddress.currentAddress : initialAddress.permanentAddress
        },
        education: mergedEducation,
        reportingManagerId: profile.reportingManager?.id
      };

      setFormData(nextFormData);
      setInitialFormData(nextFormData);
    }
  }, [profile]);

  const handleSave = () => {
    if (!isEditMode || !initialFormData) return;

    const missingFields: string[] = [];

    const isEmpty = (value: any) =>
      value === undefined ||
      value === null ||
      (typeof value === 'string' && value.trim() === '');

    // Personal information (except Middle Name)
    if (isEmpty(formData.personalInfo?.firstName)) missingFields.push('First Name');
    if (isEmpty(formData.personalInfo?.lastName)) missingFields.push('Last Name');
    if (isEmpty(formData.personalInfo?.empId)) missingFields.push('Employee ID');
    if (isEmpty(formData.personalInfo?.email)) missingFields.push('Official Email');
    if (isEmpty(formData.personalInfo?.contactNumber)) missingFields.push('Contact Number');
    if (isEmpty(formData.personalInfo?.altContact)) missingFields.push('Alt Contact');
    if (isEmpty(formData.personalInfo?.dateOfBirth)) missingFields.push('Date of Birth');
    if (isEmpty(formData.personalInfo?.gender)) missingFields.push('Gender');
    if (isEmpty(formData.personalInfo?.bloodGroup)) missingFields.push('Blood Group');
    if (isEmpty(formData.personalInfo?.maritalStatus)) missingFields.push('Marital Status');
    if (isEmpty(formData.personalInfo?.emergencyContactName)) missingFields.push('Emergency Contact Name');
    if (isEmpty(formData.personalInfo?.emergencyContactNo)) missingFields.push('Emergency Contact No');
    if (isEmpty(formData.personalInfo?.emergencyContactRelation)) missingFields.push('Emergency Contact Relation');

    // Employment information
    if (isEmpty(formData.employmentInfo?.designation)) missingFields.push('Designation');
    if (isEmpty(formData.employmentInfo?.department)) missingFields.push('Department');
    if (isEmpty(formData.employmentInfo?.dateOfJoining)) missingFields.push('Date of Joining');

    // Document information
    if (isEmpty(formData.documents?.aadharNumber)) missingFields.push('Aadhar Number');
    if (isEmpty(formData.documents?.panNumber)) missingFields.push('PAN Number');

    // Address information
    if (isEmpty(formData.address?.currentAddress)) missingFields.push('Current Address');
    if (isEmpty(formData.address?.permanentAddress)) missingFields.push('Permanent Address');

    // Education information (PG optional, UG and 12th mandatory)
    if (formData.education && Array.isArray(formData.education)) {
      formData.education.forEach((edu: any) => {
        const levelLabel = edu.level || 'Education';
        if (levelLabel === 'PG') {
          // PG row is optional
          return;
        }
        if (isEmpty(edu.groupStream)) missingFields.push(`${levelLabel} - Group/Stream`);
        if (isEmpty(edu.collegeUniversity)) missingFields.push(`${levelLabel} - College/University`);
        if (isEmpty(edu.year)) missingFields.push(`${levelLabel} - Graduation Year`);
        if (isEmpty(edu.scorePercentage)) missingFields.push(`${levelLabel} - Score %`);
      });
    }

    if (missingFields.length > 0) {
      alert('Please fill all the mandatory fields.');
      return;
    }

    const aadhar = formData.documents?.aadharNumber as string | undefined;
    if (aadhar && aadhar.length !== 12) {
      alert('Aadhar Number must be exactly 12 digits.');
      return;
    }

    const phoneFields = [
      {
        value: formData.personalInfo?.contactNumber as string | undefined,
        label: 'Contact Number'
      },
      {
        value: formData.personalInfo?.altContact as string | undefined,
        label: 'Alt Contact'
      },
      {
        value: formData.personalInfo?.emergencyContactNo as string | undefined,
        label: 'Emergency Contact No'
      }
    ];

    for (const field of phoneFields) {
      const v = field.value || '';
      if (v.length !== 10) {
        alert(`${field.label} must be exactly 10 digits.`);
        return;
      }
    }

    const hasChanges = JSON.stringify(formData) !== JSON.stringify(initialFormData);
    if (!hasChanges) {
      setIsEditMode(false);
      return;
    }

    updateMutation.mutate(formData);
  };

  const handleChangePhotoClick = () => {
    fileInputRef.current?.click();
  };

  const handlePhotoSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    uploadPhotoMutation.mutate(file);
    // Reset the input so selecting the same file again will trigger change
    event.target.value = '';
  };

  const handleDeletePhoto = () => {
    if (!window.confirm('Are you sure you want to delete your profile photo?')) {
      return;
    }
    deletePhotoMutation.mutate();
  };

  const handleCancelEdit = () => {
    if (!isEditMode) return;

    if (initialFormData) {
      setFormData(initialFormData);
      const addr = initialFormData.address || {};
      const same =
        !!addr.currentAddress && addr.currentAddress === addr.permanentAddress;
      setIsSameAddress(same);
    }

    setIsEditMode(false);
  };

  const hasChanges =
    isEditMode &&
    initialFormData &&
    JSON.stringify(formData) !== JSON.stringify(initialFormData);

  const handleSameAsCurrentAddress = (checked: boolean) => {
    setIsSameAddress(checked);
    if (checked) {
      setFormData((prev: any) => ({
        ...prev,
        address: {
          ...prev.address,
          currentAddress: prev.address?.permanentAddress
        }
      }));
    } else {
      setFormData((prev: any) => ({
        ...prev,
        address: {
          ...prev.address,
          currentAddress: ''
        }
      }));
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
            {error?.response?.status === 429
              ? 'Too many requests. Please try again later.'
              : 'Error loading profile. Please try again.'}
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
            {!isEditMode && (
              <button
                className="edit-button"
                onClick={() => setIsEditMode(true)}
              >
                Edit Profile
              </button>
            )}
            {isEditMode && !hasChanges && (
              <button
                className="cancel-button"
                onClick={handleCancelEdit}
                disabled={updateMutation.isLoading}
              >
                Cancel
              </button>
            )}
            {isEditMode && hasChanges && (
              <button
                className="save-button"
                onClick={handleSave}
                disabled={updateMutation.isLoading}
              >
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
          <div className="picture-actions">
            <button
              className="change-photo-button"
              onClick={handleChangePhotoClick}
              disabled={uploadPhotoMutation.isLoading}
            >
              Change Photo
            </button>
            {profile?.profilePhotoUrl && (
              <button
                className="delete-photo-button"
                onClick={handleDeletePhoto}
                disabled={deletePhotoMutation.isLoading}
              >
                Delete
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handlePhotoSelected}
            />
          </div>
        </div>

        <div className="profile-section">
          <h2>Personal Information</h2>
          <div className="form-grid">
            <div className="form-group">
              <label>
                First Name
                {isEditMode && <span className="required-indicator">*</span>}
              </label>
              <input
                type="text"
                value={formData.personalInfo?.firstName || ''}
                maxLength={25}
                onChange={(e) => {
                  const value = sanitizeName(e.target.value);
                  setFormData({
                    ...formData,
                    personalInfo: { ...formData.personalInfo, firstName: value }
                  });
                }}
                disabled={!isEditMode}
              />
            </div>
            <div className="form-group">
              <label>Middle Name</label>
              <input
                type="text"
                value={formData.personalInfo?.middleName || ''}
                maxLength={25}
                onChange={(e) => {
                  const value = sanitizeName(e.target.value);
                  setFormData({
                    ...formData,
                    personalInfo: { ...formData.personalInfo, middleName: value }
                  });
                }}
                disabled={!isEditMode}
              />
            </div>
            <div className="form-group">
              <label>
                Last Name
                {isEditMode && <span className="required-indicator">*</span>}
              </label>
              <input
                type="text"
                value={formData.personalInfo?.lastName || ''}
                maxLength={25}
                onChange={(e) => {
                  const value = sanitizeName(e.target.value);
                  setFormData({
                    ...formData,
                    personalInfo: { ...formData.personalInfo, lastName: value }
                  });
                }}
                disabled={!isEditMode}
              />
            </div>
            <div className="form-group">
              <label>
                Employee ID
                {isEditMode && <span className="required-indicator">*</span>}
              </label>
              <input type="text" value={formData.personalInfo?.empId || ''} disabled />
            </div>
            <div className="form-group">
              <label>
                Official Email
                {isEditMode && <span className="required-indicator">*</span>}
              </label>
              <input type="email" value={formData.personalInfo?.email || ''} disabled />
            </div>
            <div className="form-group">
              <label>
                Contact Number
                {isEditMode && <span className="required-indicator">*</span>}
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={10}
                value={formData.personalInfo?.contactNumber || ''}
                onChange={(e) => {
                  const value = sanitizePhone(e.target.value);
                  setFormData({
                    ...formData,
                    personalInfo: { ...formData.personalInfo, contactNumber: value }
                  });
                }}
                disabled={!isEditMode}
              />
            </div>
            <div className="form-group">
              <label>
                Alt Contact
                {isEditMode && <span className="required-indicator">*</span>}
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={10}
                value={formData.personalInfo?.altContact || ''}
                onChange={(e) => {
                  const value = sanitizePhone(e.target.value);
                  setFormData({
                    ...formData,
                    personalInfo: { ...formData.personalInfo, altContact: value }
                  });
                }}
                disabled={!isEditMode}
              />
            </div>
            <div className="form-group">
              <label>
                Date of Birth
                {isEditMode && <span className="required-indicator">*</span>}
              </label>
              <input
                type="date"
                value={formData.personalInfo?.dateOfBirth || ''}
                max={new Date().toISOString().split('T')[0]}
                onChange={(e) => setFormData({
                  ...formData,
                  personalInfo: { ...formData.personalInfo, dateOfBirth: e.target.value }
                })}
                disabled={!isEditMode}
              />
            </div>
            <div className="form-group">
              <label>
                Gender
                {isEditMode && <span className="required-indicator">*</span>}
              </label>
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
              <label>
                Blood Group
                {isEditMode && <span className="required-indicator">*</span>}
              </label>
              <select
                value={formData.personalInfo?.bloodGroup || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  personalInfo: { ...formData.personalInfo, bloodGroup: e.target.value }
                })}
                disabled={!isEditMode}
              >
                <option value="">Select</option>
                <option value="A+">A+</option>
                <option value="A-">A-</option>
                <option value="B+">B+</option>
                <option value="B-">B-</option>
                <option value="O+">O+</option>
                <option value="O-">O-</option>
                <option value="AB+">AB+</option>
                <option value="AB-">AB-</option>
              </select>
            </div>
            <div className="form-group">
              <label>
                Marital Status
                {isEditMode && <span className="required-indicator">*</span>}
              </label>
              <select
                value={formData.personalInfo?.maritalStatus || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  personalInfo: { ...formData.personalInfo, maritalStatus: e.target.value }
                })}
                disabled={!isEditMode}
              >
                <option value="">Select</option>
                <option value="Single">Single</option>
                <option value="Married">Married</option>
                <option value="Divorced">Divorced</option>
              </select>
            </div>
            <div className="form-group">
              <label>
                Emergency Contact Name
                {isEditMode && <span className="required-indicator">*</span>}
              </label>
              <input
                type="text"
                value={formData.personalInfo?.emergencyContactName || ''}
                maxLength={25}
                onChange={(e) => {
                  const value = sanitizeName(e.target.value);
                  setFormData({
                    ...formData,
                    personalInfo: { ...formData.personalInfo, emergencyContactName: value }
                  });
                }}
                disabled={!isEditMode}
              />
            </div>
            <div className="form-group">
              <label>
                Emergency Contact No
                {isEditMode && <span className="required-indicator">*</span>}
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={10}
                value={formData.personalInfo?.emergencyContactNo || ''}
                onChange={(e) => {
                  const value = sanitizePhone(e.target.value);
                  setFormData({
                    ...formData,
                    personalInfo: { ...formData.personalInfo, emergencyContactNo: value }
                  });
                }}
                disabled={!isEditMode}
              />
            </div>
            <div className="form-group">
              <label>
                Emergency Contact Relation
                {isEditMode && <span className="required-indicator">*</span>}
              </label>
              <input
                type="text"
                value={formData.personalInfo?.emergencyContactRelation || ''}
                maxLength={25}
                onChange={(e) => {
                  const value = sanitizeLettersOnly(e.target.value);
                  setFormData({
                    ...formData,
                    personalInfo: { ...formData.personalInfo, emergencyContactRelation: value }
                  });
                }}
                disabled={!isEditMode}
              />
            </div>
          </div>
        </div>

        <div className="profile-section">
          <h2>Employment Information</h2>
          <div className="form-grid">
            <div className="form-group">
              <label>
                Designation
                {isEditMode && <span className="required-indicator">*</span>}
              </label>
              <input
                type="text"
                maxLength={25}
                value={formData.employmentInfo?.designation || ''}
                onChange={(e) => {
                  const value = sanitizeName(e.target.value);
                  setFormData({
                    ...formData,
                    employmentInfo: { ...formData.employmentInfo, designation: value }
                  });
                }}
                disabled={!isEditMode || (user?.role === 'employee')}
              />
            </div>
            <div className="form-group">
              <label>
                Department
                {isEditMode && <span className="required-indicator">*</span>}
              </label>
              <input
                type="text"
                maxLength={25}
                value={formData.employmentInfo?.department || ''}
                onChange={(e) => {
                  const value = sanitizeName(e.target.value);
                  setFormData({
                    ...formData,
                    employmentInfo: { ...formData.employmentInfo, department: value }
                  });
                }}
                disabled={!isEditMode || (user?.role === 'employee')}
              />
            </div>
            <div className="form-group">
              <label>
                Date of Joining
                {isEditMode && <span className="required-indicator">*</span>}
              </label>
              <input
                type="date"
                value={formData.employmentInfo?.dateOfJoining || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  employmentInfo: { ...formData.employmentInfo, dateOfJoining: e.target.value }
                })}
                disabled
              />
            </div>
          </div>
        </div>

        <div className="profile-section">
          <h2>Document Information</h2>
          <div className="form-grid">
            <div className="form-group">
              <label>
                Aadhar Number
                {isEditMode && <span className="required-indicator">*</span>}
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={formatAadhaar(formData.documents?.aadharNumber || '')}
                onChange={(e) => {
                  const raw = sanitizeAadhaar(e.target.value);
                  setFormData({
                    ...formData,
                    documents: { ...formData.documents, aadharNumber: raw }
                  });
                }}
                disabled={!isEditMode}
              />
            </div>
            <div className="form-group">
              <label>
                PAN Number
                {isEditMode && <span className="required-indicator">*</span>}
              </label>
              <input
                type="text"
              value={formData.documents?.panNumber || ''}
              onChange={(e) => setFormData({
                ...formData,
                documents: { ...formData.documents, panNumber: sanitizePan(e.target.value) }
              })}
                disabled={!isEditMode}
              />
            </div>
          </div>
        </div>

        <div className="profile-section">
          <h2>Address Details</h2>
          <div className="form-group address-current">
            <label>
              Permanent Address
              {isEditMode && <span className="required-indicator">*</span>}
            </label>
            <textarea
              value={formData.address?.permanentAddress || ''}
              onChange={(e) => {
                const value = e.target.value;
                setFormData((prev: any) => ({
                  ...prev,
                  address: {
                    ...prev.address,
                    permanentAddress: value,
                    currentAddress: isSameAddress ? value : prev.address?.currentAddress
                  }
                }));
              }}
              disabled={!isEditMode}
              rows={4}
            />
          </div>
          <div className="form-group">
            <label>
              Current Address
              {isEditMode && <span className="required-indicator">*</span>}
            </label>
            <textarea
              value={formData.address?.currentAddress || ''}
              onChange={(e) => {
                const value = e.target.value;
                setFormData((prev: any) => ({
                  ...prev,
                  address: { ...prev.address, currentAddress: value }
                }));
              }}
              disabled={!isEditMode || isSameAddress}
              rows={4}
            />
            <div className="checkbox-group">
              <input
                type="checkbox"
                id="same-address"
                checked={isSameAddress}
                onChange={(e) => handleSameAsCurrentAddress(e.target.checked)}
                disabled={!isEditMode}
              />
              <label htmlFor="same-address">Same as Permanent Address</label>
            </div>
          </div>
        </div>

        <div className="profile-section">
          <h2>Education Information</h2>
          <table className="education-table">
            <thead>
              <tr>
                <th className="education-level-col"></th>
                <th>
                  Group/Stream
                  {isEditMode && <span className="required-indicator">*</span>}
                </th>
                <th>
                  College/University
                  {isEditMode && <span className="required-indicator">*</span>}
                </th>
                <th>
                  Graduation Year
                  {isEditMode && <span className="required-indicator">*</span>}
                </th>
                <th>
                  Score %
                  {isEditMode && <span className="required-indicator">*</span>}
                </th>
              </tr>
            </thead>
            <tbody>
              {formData.education?.map((edu: any, idx: number) => (
                <tr key={edu.level}>
                  <td className="education-level-cell">{edu.level}</td>
                  <td>
                    <input
                      type="text"
                      value={edu.groupStream || ''}
                      onChange={(e) => {
                        const value = sanitizeLettersOnly(e.target.value);
                        const newEducation = [...formData.education];
                        newEducation[idx] = { ...edu, groupStream: value };
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
                        const value = sanitizeLettersOnly(e.target.value);
                        const newEducation = [...formData.education];
                        newEducation[idx] = { ...edu, collegeUniversity: value };
                        setFormData({ ...formData, education: newEducation });
                      }}
                      disabled={!isEditMode}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={4}
                      value={edu.year || ''}
                      onChange={(e) => {
                        const value = e.target.value.replace(/[^0-9]/g, '').slice(0, 4);
                        const newEducation = [...formData.education];
                        newEducation[idx] = { ...edu, year: value };
                        setFormData({ ...formData, education: newEducation });
                      }}
                      disabled={!isEditMode}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={
                        edu.scorePercentage === null || edu.scorePercentage === undefined
                          ? ''
                          : String(edu.scorePercentage)
                      }
                      onChange={(e) => {
                        const raw = e.target.value;
                        // Allow one optional decimal point and up to 2 digits after it
                        const sanitized = raw.replace(/[^0-9.]/g, '');
                        const [intPartRaw, decPartRaw = ''] = sanitized.split('.');
                        const intPart = intPartRaw.replace(/^0+(?=\d)/, '');
                        const decPart = decPartRaw.slice(0, 2);

                        let display = intPart;
                        if (sanitized.includes('.')) {
                          display += '.';
                        }
                        if (decPart) {
                          display = `${intPart}.${decPart}`;
                        }

                        let num: number | null = null;
                        if (display !== '' && display !== '.') {
                          num = parseFloat(display);
                          if (!isNaN(num) && num > 100) {
                            num = 100;
                            display = '100';
                          }
                        }

                        const newEducation = [...formData.education];
                        newEducation[idx] = {
                          ...edu,
                          scorePercentage: display === '' || display === '.' ? null : display
                        };
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
            />
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default ProfilePage;

