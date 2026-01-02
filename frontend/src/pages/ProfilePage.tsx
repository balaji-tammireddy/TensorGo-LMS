import React, { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import AppLayout from '../components/layout/AppLayout';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import ConfirmationDialog from '../components/ConfirmationDialog';
import ErrorDisplay from '../components/common/ErrorDisplay';
import { DatePicker } from '../components/ui/date-picker';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { Button } from '../components/ui/button';
import { ChevronDown } from 'lucide-react';
import * as profileService from '../services/profileService';
import './ProfilePage.css';

// Helper function to format education level display
const formatEducationLevel = (level: string): React.ReactNode => {
  if (level === '12th') {
    return <>12<sup>th</sup></>;
  }
  return level;
};

const ProfilePage: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { showSuccess, showError, showWarning } = useToast();
  const [isEditMode, setIsEditMode] = useState(false);
  const [formData, setFormData] = useState<any>({});
  const [initialFormData, setInitialFormData] = useState<any | null>(null);
  const [isSameAddress, setIsSameAddress] = useState(false);
  const [deletePhotoConfirmOpen, setDeletePhotoConfirmOpen] = useState(false);
  const [showImagePopup, setShowImagePopup] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [photoSignedUrl, setPhotoSignedUrl] = useState<string | null>(null);

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
    // Remove all spaces and convert to uppercase
    let cleaned = value.toUpperCase().replace(/\s+/g, '');

    // Enforce PAN format: 5 letters, 4 digits, 1 letter
    let formatted = '';
    for (let i = 0; i < cleaned.length && formatted.length < 10; i++) {
      const char = cleaned[i];
      const currentLength = formatted.length;

      if (currentLength < 5) {
        // First 5 characters must be letters
        if (/[A-Z]/.test(char)) {
          formatted += char;
        }
      } else if (currentLength < 9) {
        // Next 4 characters must be digits
        if (/[0-9]/.test(char)) {
          formatted += char;
        }
      } else if (currentLength === 9) {
        // Last character must be a letter
        if (/[A-Z]/.test(char)) {
          formatted += char;
        }
      }
    }

    return formatted;
  };

  const validatePan = (pan: string): string | null => {
    if (!pan || pan.trim() === '') {
      return null; // Empty is allowed (optional field)
    }

    if (pan.length !== 10) {
      return 'PAN number must be exactly 10 characters long';
    }

    const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
    if (!panRegex.test(pan)) {
      return 'Invalid PAN format. Format: ABCDE1234F (5 letters, 4 digits, 1 letter)';
    }

    return null;
  };
  const sanitizeLettersOnly = (value: string) => {
    return value.replace(/[^a-zA-Z\s]/g, '');
  };

  const { data: profile, isLoading, error } = useQuery(
    'profile',
    profileService.getProfile,
    {
      retry: false,
      staleTime: 0,
      refetchInterval: 60000, // Polling every 1 minute
      cacheTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
      keepPreviousData: true, // Keep old data while fetching new
      onError: (error: any) => {
        if (error.response?.status === 403 || error.response?.status === 401) {
          window.location.href = '/login';
        }
      }
    }
  );

  // Fetch public URL when profile has a photoKey (OVHcloud only)
  React.useEffect(() => {
    const fetchPublicUrl = async () => {
      console.log('Profile data:', profile);
      console.log('Profile photoKey:', profile?.profilePhotoKey);

      // Only fetch public URL if profile has an OVHcloud key
      if (profile?.profilePhotoKey) {
        try {
          console.log('Fetching public URL for profilePhotoKey:', profile.profilePhotoKey);
          const { signedUrl } = await profileService.getProfilePhotoSignedUrl();
          console.log('✅ Profile photo URL received:', signedUrl);
          setPhotoSignedUrl(signedUrl);
          // No refresh needed - public URLs are permanent
        } catch (err) {
          console.error('❌ Failed to get public URL:', err);
          setPhotoSignedUrl(null);
        }
      } else {
        console.warn('⚠️ No profilePhotoKey found in profile:', profile);
        setPhotoSignedUrl(null);
      }
    };

    if (profile) {
      fetchPublicUrl();
    }
  }, [profile]);

  const updateMutation = useMutation(profileService.updateProfile, {
    onSuccess: (_data, variables: any) => {
      queryClient.invalidateQueries('profile');
      setFormData(variables);
      setInitialFormData(variables);
      setIsEditMode(false);
    },
    onError: (error: any) => {
      showError(error.response?.data?.error?.message || 'Failed to update profile');
    }
  });

  const uploadPhotoMutation = useMutation(profileService.uploadProfilePhoto, {
    onSuccess: () => {
      queryClient.invalidateQueries('profile');
      showSuccess('Profile photo updated successfully!');
    },
    onError: (error: any) => {
      showError(error.response?.data?.error?.message || 'Failed to upload profile photo');
    }
  });

  const deletePhotoMutation = useMutation(profileService.deleteProfilePhoto, {
    onSuccess: () => {
      queryClient.invalidateQueries('profile');
      showSuccess('Profile photo deleted successfully!');
    },
    onError: (error: any) => {
      showError(error.response?.data?.error?.message || 'Failed to delete profile photo');
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

    // Validate age - employee must be at least 18 years old
    if (formData.personalInfo?.dateOfBirth) {
      const dob = new Date(formData.personalInfo.dateOfBirth);
      const today = new Date();
      let age = today.getFullYear() - dob.getFullYear();
      const monthDiff = today.getMonth() - dob.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
        age--;
      }
      if (age < 18) {
        showWarning('Employee must be at least 18 years old');
        return;
      }
    }

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
    if (isEmpty(formData.documents?.panNumber)) {
      missingFields.push('PAN Number');
    } else {
      const panError = validatePan(formData.documents.panNumber);
      if (panError) {
        showWarning(panError);
        return;
      }
    }

    // Address information
    if (isEmpty(formData.address?.currentAddress)) missingFields.push('Current Address');
    if (isEmpty(formData.address?.permanentAddress)) missingFields.push('Permanent Address');

    // Education information (PG optional, UG and 12th mandatory)
    if (formData.education && Array.isArray(formData.education)) {
      const currentYear = new Date().getFullYear();
      const maxYear = currentYear + 5;
      let yearValidationError: string | null = null;

      for (const edu of formData.education) {
        const levelLabel = edu.level || 'Education';
        if (levelLabel === 'PG') {
          // PG row is optional
          continue;
        }
        if (isEmpty(edu.groupStream)) missingFields.push(`${levelLabel} - Group/Stream`);
        if (isEmpty(edu.collegeUniversity)) missingFields.push(`${levelLabel} - College/University`);
        if (isEmpty(edu.year)) {
          missingFields.push(`${levelLabel} - Graduation Year`);
        } else {
          // Validate year range (1950 to 5 years from current year)
          const year = parseInt(edu.year, 10);
          if (isNaN(year) || year < 1950 || year > maxYear) {
            if (!yearValidationError) {
              yearValidationError = `Graduation Year must be between 1950 and ${maxYear}`;
            }
          }
        }
        if (isEmpty(edu.scorePercentage)) missingFields.push(`${levelLabel} - Score %`);
      }

      // Show year validation error once if any invalid year found
      if (yearValidationError) {
        showWarning(yearValidationError);
        return;
      }
    }

    if (missingFields.length > 0) {
      showWarning('Please fill all the mandatory fields.');
      return;
    }

    const aadhar = formData.documents?.aadharNumber as string | undefined;
    if (aadhar && aadhar.length !== 12) {
      showWarning('Aadhar Number must be exactly 12 digits.');
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
        showWarning(`${field.label} must be exactly 10 digits.`);
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
    setDeletePhotoConfirmOpen(true);
  };

  const confirmDeletePhoto = () => {
    deletePhotoMutation.mutate();
    setDeletePhotoConfirmOpen(false);
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

  // Initial loading state (only for first-time page load)
  if (isLoading && !profile) {
    return (
      <AppLayout>
        <div className="profile-page">
          <div className="skeleton-loader">
            {/* Header Skeleton */}
            <div className="skeleton-profile-header">
              <div className="skeleton-title"></div>
              <div className="skeleton-button" style={{ width: '120px', height: '40px' }}></div>
            </div>

            {/* Profile Picture Section Skeleton */}
            <div className="skeleton-profile-picture-section">
              <div className="skeleton-profile-photo"></div>
              <div className="skeleton-buttons">
                <div className="skeleton-button" style={{ width: '130px' }}></div>
                <div className="skeleton-button" style={{ width: '100px' }}></div>
              </div>
            </div>

            {/* Form Sections Skeleton */}
            <div className="skeleton-card">
              <div className="skeleton-header"></div>
              <div className="skeleton-form-grid">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="skeleton-input"></div>
                ))}
              </div>
            </div>

            <div className="skeleton-card">
              <div className="skeleton-header"></div>
              <div className="skeleton-form-grid">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="skeleton-input"></div>
                ))}
              </div>
            </div>

            <div className="skeleton-card">
              <div className="skeleton-header"></div>
              <div className="skeleton-form-grid">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="skeleton-input"></div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (error) {
    const errorMessage = error?.response?.status === 429
      ? 'Too many requests. Please try again later.'
      : 'Error loading profile. Please try again.';

    const handleRetry = () => {
      window.location.reload();
    };

    return (
      <>
        <AppLayout>
          <div className="profile-page">
            <ErrorDisplay
              message={errorMessage}
              onRetry={handleRetry}
              showRetryButton={true}
            />
          </div>
        </AppLayout>
      </>
    );
  }

  return (
    <>
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
                  disabled={updateMutation.isLoading || uploadPhotoMutation.isLoading || deletePhotoMutation.isLoading}
                >
                  {updateMutation.isLoading ? (
                    <>
                      <span className="loading-spinner"></span>
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </button>
              )}
            </div>
          </div>

          <div className="profile-picture-section">
            <div className="profile-picture" onClick={() => photoSignedUrl && setShowImagePopup(true)} style={{ cursor: photoSignedUrl ? 'pointer' : 'default' }}>
              {photoSignedUrl ? (
                <img
                  src={photoSignedUrl}
                  alt="Profile"
                  onLoad={() => {
                    console.log('✅ Profile image loaded successfully. URL:', photoSignedUrl);
                  }}
                  onError={async (e) => {
                    console.error('❌ Failed to load profile image. URL:', photoSignedUrl, 'Error:', e);
                    console.error('Image element:', e.target);
                    // If image fails to load, try refreshing the URL
                    if (profile?.profilePhotoKey) {
                      try {
                        const { signedUrl } = await profileService.getProfilePhotoSignedUrl();
                        console.log('🔄 Refreshing profile photo URL:', signedUrl);
                        setPhotoSignedUrl(signedUrl);
                      } catch (err) {
                        console.error('❌ Failed to refresh profile photo URL:', err);
                        setPhotoSignedUrl(null);
                      }
                    } else {
                      console.warn('⚠️ No profilePhotoKey found, cannot refresh');
                      setPhotoSignedUrl(null);
                    }
                  }}
                />
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
              {photoSignedUrl && (
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
                    const input = e.target;
                    const cursorPosition = input.selectionStart || 0;
                    const inputValue = e.target.value;
                    const newValue = sanitizePhone(inputValue);

                    // Calculate new cursor position accounting for removed characters
                    let newCursorPosition = cursorPosition;
                    if (inputValue.length > newValue.length) {
                      // Characters were removed, adjust cursor position
                      const removedCount = inputValue.length - newValue.length;
                      newCursorPosition = Math.max(0, cursorPosition - removedCount);
                    } else {
                      // Normal typing, keep cursor position
                      newCursorPosition = Math.min(cursorPosition, newValue.length);
                    }

                    setFormData({
                      ...formData,
                      personalInfo: { ...formData.personalInfo, contactNumber: newValue }
                    });

                    // Restore cursor position after state update
                    setTimeout(() => {
                      const inputElement = input;
                      if (inputElement) {
                        inputElement.setSelectionRange(newCursorPosition, newCursorPosition);
                      }
                    }, 0);
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
                    const input = e.target;
                    const cursorPosition = input.selectionStart || 0;
                    const inputValue = e.target.value;
                    const newValue = sanitizePhone(inputValue);

                    // Calculate new cursor position accounting for removed characters
                    let newCursorPosition = cursorPosition;
                    if (inputValue.length > newValue.length) {
                      // Characters were removed, adjust cursor position
                      const removedCount = inputValue.length - newValue.length;
                      newCursorPosition = Math.max(0, cursorPosition - removedCount);
                    } else {
                      // Normal typing, keep cursor position
                      newCursorPosition = Math.min(cursorPosition, newValue.length);
                    }

                    setFormData({
                      ...formData,
                      personalInfo: { ...formData.personalInfo, altContact: newValue }
                    });

                    // Restore cursor position after state update
                    setTimeout(() => {
                      const inputElement = input;
                      if (inputElement) {
                        inputElement.setSelectionRange(newCursorPosition, newCursorPosition);
                      }
                    }, 0);
                  }}
                  disabled={!isEditMode}
                />
              </div>
              <div className="form-group">
                <label>
                  Date of Birth
                  {isEditMode && <span className="required-indicator">*</span>}
                </label>
                <DatePicker
                  value={formData.personalInfo?.dateOfBirth || ''}
                  max={new Date().toISOString().split('T')[0]}
                  onChange={(date) => setFormData({
                    ...formData,
                    personalInfo: { ...formData.personalInfo, dateOfBirth: date }
                  })}
                  disabled={!isEditMode}
                  placeholder="DD-MM-YYYY"
                  isEmployeeVariant={true}
                  allowManualEntry={true}
                />
              </div>
              <div className="form-group">
                <label>
                  Gender
                  {isEditMode && <span className="required-indicator">*</span>}
                </label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      className="leave-type-dropdown-trigger"
                      disabled={!isEditMode}
                      style={{
                        width: '100%',
                        justifyContent: 'space-between',
                        padding: '10px 12px',
                        fontSize: '14px',
                        fontFamily: 'Poppins, sans-serif',
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                        backgroundColor: 'transparent',
                        color: '#1f2a3d',
                        height: 'auto'
                      }}
                    >
                      <span>{formData.personalInfo?.gender || ''}</span>
                      <ChevronDown style={{ width: '14px', height: '14px', marginLeft: '8px' }} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="leave-type-dropdown-content">
                    <DropdownMenuItem
                      onClick={() => setFormData({
                        ...formData,
                        personalInfo: { ...formData.personalInfo, gender: 'Male' }
                      })}
                    >
                      Male
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setFormData({
                        ...formData,
                        personalInfo: { ...formData.personalInfo, gender: 'Female' }
                      })}
                    >
                      Female
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setFormData({
                        ...formData,
                        personalInfo: { ...formData.personalInfo, gender: 'Other' }
                      })}
                    >
                      Other
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="form-group">
                <label>
                  Blood Group
                  {isEditMode && <span className="required-indicator">*</span>}
                </label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      className="leave-type-dropdown-trigger"
                      disabled={!isEditMode}
                      style={{
                        width: '100%',
                        justifyContent: 'space-between',
                        padding: '10px 12px',
                        fontSize: '14px',
                        fontFamily: 'Poppins, sans-serif',
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                        backgroundColor: 'transparent',
                        color: '#1f2a3d',
                        height: 'auto'
                      }}
                    >
                      <span>{formData.personalInfo?.bloodGroup || ''}</span>
                      <ChevronDown style={{ width: '14px', height: '14px', marginLeft: '8px' }} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="leave-type-dropdown-content">
                    {['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map((bg, index) => (
                      <React.Fragment key={bg}>
                        <DropdownMenuItem
                          onClick={() => setFormData({
                            ...formData,
                            personalInfo: { ...formData.personalInfo, bloodGroup: bg }
                          })}
                        >
                          {bg}
                        </DropdownMenuItem>
                        {index < 7 && <DropdownMenuSeparator />}
                      </React.Fragment>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="form-group">
                <label>
                  Marital Status
                  {isEditMode && <span className="required-indicator">*</span>}
                </label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      className="leave-type-dropdown-trigger"
                      disabled={!isEditMode}
                      style={{
                        width: '100%',
                        justifyContent: 'space-between',
                        padding: '10px 12px',
                        fontSize: '14px',
                        fontFamily: 'Poppins, sans-serif',
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                        backgroundColor: 'transparent',
                        color: '#1f2a3d',
                        height: 'auto'
                      }}
                    >
                      <span>{formData.personalInfo?.maritalStatus || ''}</span>
                      <ChevronDown style={{ width: '14px', height: '14px', marginLeft: '8px' }} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="leave-type-dropdown-content">
                    <DropdownMenuItem
                      onClick={() => setFormData({
                        ...formData,
                        personalInfo: { ...formData.personalInfo, maritalStatus: 'Single' }
                      })}
                    >
                      Single
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setFormData({
                        ...formData,
                        personalInfo: { ...formData.personalInfo, maritalStatus: 'Married' }
                      })}
                    >
                      Married
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setFormData({
                        ...formData,
                        personalInfo: { ...formData.personalInfo, maritalStatus: 'Divorced' }
                      })}
                    >
                      Divorced
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setFormData({
                        ...formData,
                        personalInfo: { ...formData.personalInfo, maritalStatus: 'Widowed' }
                      })}
                    >
                      Widowed
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
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
                    const input = e.target;
                    const cursorPosition = input.selectionStart || 0;
                    const inputValue = e.target.value;
                    const newValue = sanitizePhone(inputValue);

                    // Calculate new cursor position accounting for removed characters
                    let newCursorPosition = cursorPosition;
                    if (inputValue.length > newValue.length) {
                      // Characters were removed, adjust cursor position
                      const removedCount = inputValue.length - newValue.length;
                      newCursorPosition = Math.max(0, cursorPosition - removedCount);
                    } else {
                      // Normal typing, keep cursor position
                      newCursorPosition = Math.min(cursorPosition, newValue.length);
                    }

                    setFormData({
                      ...formData,
                      personalInfo: { ...formData.personalInfo, emergencyContactNo: newValue }
                    });

                    // Restore cursor position after state update
                    setTimeout(() => {
                      const inputElement = input;
                      if (inputElement) {
                        inputElement.setSelectionRange(newCursorPosition, newCursorPosition);
                      }
                    }, 0);
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
                <DatePicker
                  value={formData.employmentInfo?.dateOfJoining || ''}
                  onChange={(date) => setFormData({
                    ...formData,
                    employmentInfo: { ...formData.employmentInfo, dateOfJoining: date }
                  })}
                  disabled
                  placeholder="Select date of joining"
                  isEmployeeVariant={true}
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
                  placeholder="XXXX XXXX XXXX"
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
                  onChange={(e) => {
                    const sanitized = sanitizePan(e.target.value);
                    setFormData({
                      ...formData,
                      documents: { ...formData.documents, panNumber: sanitized }
                    });
                  }}
                  onBlur={() => {
                    const panError = validatePan(formData.documents?.panNumber || '');
                    if (panError && formData.documents?.panNumber) {
                      showWarning(panError);
                    }
                  }}
                  placeholder="ABCDE1234F"
                  maxLength={10}
                  disabled={!isEditMode}
                />
                {formData.documents?.panNumber && formData.documents.panNumber.length < 10 && (
                  <span style={{ fontSize: '11px', color: '#666', marginTop: '4px', display: 'block' }}>
                    Format: 5 letters, 4 digits, 1 letter
                  </span>
                )}
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
                  <th>Group/Stream</th>
                  <th>College/University</th>
                  <th>Graduation Year</th>
                  <th>Score %</th>
                </tr>
              </thead>
              <tbody>
                {formData.education?.map((edu: any, idx: number) => (
                  <tr key={edu.level}>
                    <td className="education-level-cell">
                      {formatEducationLevel(edu.level)}
                      {(edu.level === 'UG' || edu.level === '12th') && (
                        <span className="required-indicator">*</span>
                      )}
                    </td>
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
                        onBlur={(e) => {
                          const year = parseInt(e.target.value, 10);
                          const currentYear = new Date().getFullYear();
                          const maxYear = currentYear + 5;
                          if (e.target.value && (isNaN(year) || year < 1950 || year > maxYear)) {
                            showWarning(`Graduation Year must be between 1950 and ${maxYear}`);
                          }
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
      <ConfirmationDialog
        isOpen={deletePhotoConfirmOpen}
        title="Delete Profile Photo"
        message="Are you sure you want to delete your profile photo? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
        isLoading={deletePhotoMutation.isLoading}
        onConfirm={confirmDeletePhoto}
        onCancel={() => setDeletePhotoConfirmOpen(false)}
      />
      {showImagePopup && photoSignedUrl && (
        <div className="image-popup-overlay" onClick={() => setShowImagePopup(false)}>
          <div className="image-popup-content" onClick={(e) => e.stopPropagation()}>
            <button className="image-popup-close" onClick={() => setShowImagePopup(false)}>×</button>
            <img src={photoSignedUrl} alt="Profile" className="image-popup-image" />
          </div>
        </div>
      )}
    </>
  );
};

export default ProfilePage;

