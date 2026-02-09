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
import './EmployeeManagementPage.css'; // Use same styles as EmployeeDetailsPage
import './ProfilePage.css';


// Helper function to format education level display
const formatEducationLevel = (level: string): React.ReactNode => {
  if (level === '12th') {
    return <>12<sup>th</sup></>;
  }
  return level;
};

const ProfilePage: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const queryClient = useQueryClient();
  const { showSuccess, showError, showWarning } = useToast();
  const [isEditMode, setIsEditMode] = useState(false);
  const [formData, setFormData] = useState<any>({});
  const [initialFormData, setInitialFormData] = useState<any | null>(null);
  const [isSameAddress, setIsSameAddress] = useState(false);
  const [deletePhotoConfirmOpen, setDeletePhotoConfirmOpen] = useState(false);
  const [showImagePopup, setShowImagePopup] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, boolean>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [photoSignedUrl, setPhotoSignedUrl] = useState<string | null>(null);
  const [pendingPhotoAction, setPendingPhotoAction] = useState<{ type: 'upload' | 'delete', file?: File } | null>(null);
  const [pendingPhotoPreview, setPendingPhotoPreview] = useState<string | null>(null);

  const sanitizeName = (value: string) => {
    const sanitized = value.replace(/[^a-zA-Z\s]/g, '').slice(0, 25);
    return sanitized.toLowerCase().replace(/(?:^|\s)\w/g, (match) => match.toUpperCase());
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

  const sanitizeUAN = (value: string) => {
    return value.replace(/[^0-9]/g, '').slice(0, 12);
  };

  const formatUAN = (value: string) => {
    const digits = sanitizeUAN(value);
    return digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
  };
  const sanitizeLettersOnly = (value: string) => {
    const sanitized = value.replace(/[^a-zA-Z\s]/g, '');
    return sanitized.toLowerCase().replace(/(?:^|\s)\w/g, (match) => match.toUpperCase());
  };

  const sanitizeAddress = (value: string) => {
    return value.toLowerCase().replace(/(?:^|\s|[,./#-])\w/g, (match) => match.toUpperCase());
  };

  const compressImage = (file: File): Promise<File> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 800;
          const MAX_HEIGHT = 800;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              if (blob) {
                const compressedFile = new File([blob], file.name, {
                  type: 'image/jpeg',
                  lastModified: Date.now(),
                });
                resolve(compressedFile);
              } else {
                reject(new Error('Canvas to Blob conversion failed'));
              }
            },
            'image/jpeg',
            0.8 // 80% quality
          );
        };
        img.onerror = (err) => reject(err);
      };
      reader.onerror = (err) => reject(err);
    });
  };

  const { data: profile, isLoading, error } = useQuery(
    'profile',
    profileService.getProfile,
    {
      retry: false,
      staleTime: 0,
      refetchInterval: 5000, // Reduced to 5 seconds for immediate updates
      cacheTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
      keepPreviousData: true, // Keep old data while fetching new
      onError: (error: any) => {
        if (error.response?.status === 401 || error.response?.status === 403) {
          // Handled globally by api.ts interceptor
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

  // Cleanup pending photo preview URL on unmount
  React.useEffect(() => {
    return () => {
      if (pendingPhotoPreview) {
        URL.revokeObjectURL(pendingPhotoPreview);
      }
    };
  }, [pendingPhotoPreview]);

  const updateMutation = useMutation(profileService.updateProfile, {
    onSuccess: (data) => {
      queryClient.invalidateQueries('profile');
      setIsEditMode(false);
      showSuccess(data.message || 'Profile updated successfully!');
    },
    onError: (error: any) => {
      showError(error.response?.data?.error?.message || 'Update failed');
    }
  });

  const uploadPhotoMutation = useMutation(profileService.uploadProfilePhoto, {
    onSuccess: () => {
      queryClient.invalidateQueries('profile');
      // Success message will be shown by the calling function
    },
    onError: (error: any) => {
      showError(error.response?.data?.error?.message || 'Upload failed');
    }
  });

  const deletePhotoMutation = useMutation(profileService.deleteProfilePhoto, {
    onSuccess: () => {
      queryClient.invalidateQueries('profile');
      // Success message will be shown by the calling function
    },
    onError: (error: any) => {
      showError(error.response?.data?.error?.message || 'Delete failed');
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

      const personalInfo = { ...profile.personalInfo };

      // Dynamic bridging for legacy keys
      if (!personalInfo.altContact && (profile.personalInfo as any).alt_contact) {
        personalInfo.altContact = (profile.personalInfo as any).alt_contact;
      }
      if (!personalInfo.altContact && (profile.personalInfo as any).alternateContactNumber) {
        personalInfo.altContact = (profile.personalInfo as any).alternateContactNumber;
      }
      if (!personalInfo.emergencyContactNo && (profile.personalInfo as any).emergency_contact_no) {
        personalInfo.emergencyContactNo = (profile.personalInfo as any).emergency_contact_no;
      }
      if (!personalInfo.emergencyContactNo && (profile.personalInfo as any).emergencyContactNumber) {
        personalInfo.emergencyContactNo = (profile.personalInfo as any).emergencyContactNumber;
      }

      const nextFormData = {
        personalInfo,
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
      setInitialFormData(JSON.parse(JSON.stringify(nextFormData)));
    }
  }, [profile]);

  const handleSave = async () => {
    if (!isEditMode || !initialFormData) return;

    const fieldErrors: Record<string, boolean> = {};

    const isEmpty = (value: any) =>
      value === undefined ||
      value === null ||
      (typeof value === 'string' && value.trim() === '');

    // Age validation
    if (formData.personalInfo?.dateOfBirth) {
      const dob = new Date(formData.personalInfo.dateOfBirth);
      const today = new Date();
      let age = today.getFullYear() - dob.getFullYear();
      const monthDiff = today.getMonth() - dob.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
        age--;
      }
      if (age < 18) {
        showWarning('Must be 18+ years old');
        fieldErrors['dateOfBirth'] = true;
        setFormErrors(fieldErrors);
        return;
      }
    }

    // Validate gap between Date of Birth and Date of Joining (min 18 years)
    if (formData.personalInfo?.dateOfBirth && formData.employmentInfo?.dateOfJoining) {
      const dob = new Date(formData.personalInfo.dateOfBirth);
      const doj = new Date(formData.employmentInfo.dateOfJoining);

      let workAge = doj.getFullYear() - dob.getFullYear();
      const monthDiff = doj.getMonth() - dob.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && doj.getDate() < dob.getDate())) {
        workAge--;
      }

      if (workAge < 18) {
        showWarning('joining date should be atleast 18 yrs from date of birth');
        fieldErrors['dateOfBirth'] = true;
        setFormErrors(fieldErrors);
        return;
      }
    }

    // New Fields Validation
    if (!isEmpty(formData.employmentInfo?.totalExperience)) {
      const exp = parseFloat(formData.employmentInfo.totalExperience);
      if (isNaN(exp) || exp < 0) {
        showWarning('Total Experience must be a valid positive number');
        fieldErrors['totalExperience'] = true;
        setFormErrors(fieldErrors);
        return;
      } else if ((exp * 10) % 5 !== 0) {
        showWarning('Total Experience must be in 0.5 increments (e.g. 1.5, 2.0)');
        fieldErrors['totalExperience'] = true;
        setFormErrors(fieldErrors);
        return;
      }
    }

    if (!isEmpty(formData.employmentInfo?.uanNumber)) {
      if (!/^\d{12}$/.test(formData.employmentInfo.uanNumber)) {
        showWarning('UAN Number must be exactly 12 digits');
        fieldErrors['uanNumber'] = true;
        setFormErrors(fieldErrors);
        return;
      }
    }

    // Education
    if (formData.education && Array.isArray(formData.education)) {
      const currentYear = new Date().getFullYear();
      const maxYear = currentYear + 5;
      let yearValidationError: string | null = null;
      let isEducationValid = true;

      formData.education.forEach((edu: any, index: number) => {
        const levelLabel = edu.level || 'Education';

        const eduFields = [
          { value: edu.groupStream, label: 'Group/Stream', key: 'groupStream' },
          { value: edu.collegeUniversity, label: 'College/University', key: 'collegeUniversity' },
          { value: edu.year, label: 'Graduation Year', key: 'year' },
          { value: edu.scorePercentage, label: 'Score %', key: 'scorePercentage' }
        ];

        const filledFields = eduFields.filter(f => !isEmpty(f.value));

        // All-or-nothing logic removed to allow partial saves

        if (!isEmpty(edu.year)) {
          const year = parseInt(edu.year, 10);
          if (isNaN(year) || year < 1950 || year > maxYear) {
            yearValidationError = `${levelLabel} Graduation Year: 1950 - ${maxYear}`;
            fieldErrors[`edu_${index}_year`] = true;
          }
        }
      });

      if (!isEducationValid) return;
      if (yearValidationError) {
        showWarning(yearValidationError);
        setFormErrors(fieldErrors);
        return;
      }

      // Chronological validation
      const pgYear = parseInt(formData.education.find((e: any) => e.level === 'PG')?.year, 10);
      const ugYear = parseInt(formData.education.find((e: any) => e.level === 'UG')?.year, 10);
      const hscYear = parseInt(formData.education.find((e: any) => e.level === '12th')?.year, 10);

      if (!isNaN(ugYear) && !isNaN(hscYear)) {
        if (hscYear >= ugYear) {
          showWarning('12th Graduation Year must be before UG Graduation Year');
          return;
        }
        if (ugYear - hscYear < 3) {
          showWarning(`Minimum 3 years gap required between 12th and UG Graduation Year`);
          return;
        }
      }

      if (!isNaN(pgYear) && !isNaN(ugYear)) {
        if (ugYear >= pgYear) {
          showWarning('UG Graduation Year must be before PG Graduation Year');
          return;
        }
        if (pgYear - ugYear < 2) {
          showWarning(`Minimum 2 years gap required between UG and PG Graduation Year`);
          return;
        }
      }
    }

    const aadhar = formData.documents?.aadharNumber;
    if (aadhar && String(aadhar).length !== 12) {
      showWarning('Aadhar must be 12 digits');
      fieldErrors['aadharNumber'] = true;
      setFormErrors(fieldErrors);
      return;
    }

    const pan = formData.documents?.panNumber;
    if (pan && String(pan).trim() !== '') {
      const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
      if (!panRegex.test(String(pan).toUpperCase())) {
        showWarning('Invalid PAN format');
        fieldErrors['panNumber'] = true;
        setFormErrors(fieldErrors);
        return;
      }
    }

    const phoneFields = [
      { value: formData.personalInfo?.contactNumber, label: 'Contact Number', key: 'contactNumber' },
      { value: formData.personalInfo?.emergencyContactNo, label: 'Emergency Contact Number', key: 'emergencyContactNo' },
      { value: formData.personalInfo?.altContact, label: 'Alternate Contact Number', key: 'altContact' }
    ];

    for (const field of phoneFields) {
      if (field.value && String(field.value).length !== 10) {
        showWarning(`${field.label} must be 10 digits`);
        fieldErrors[field.key] = true;
        setFormErrors(fieldErrors);
        return;
      }
    }

    const contactNo = formData.personalInfo?.contactNumber;
    const emergencyNo = formData.personalInfo?.emergencyContactNo;
    const altNo = formData.personalInfo?.altContact;

    if (altNo && contactNo === altNo) {
      showWarning('Contact Number and Alternate Contact Number cannot be the same');
      return;
    }
    if (altNo && altNo === emergencyNo) {
      showWarning('Alternate Contact Number and Emergency Contact Number cannot be the same');
      return;
    }
    if (contactNo === emergencyNo && contactNo) {
      showWarning('Contact Number and Emergency Contact Number cannot be the same');
      return;
    }

    const { reportingManagerId, ...submissionData } = formData;
    const hasChanges = JSON.stringify(formData) !== JSON.stringify(initialFormData);

    const mutationPromises = [];

    if (pendingPhotoAction) {
      if (pendingPhotoAction.type === 'upload' && pendingPhotoAction.file) {
        mutationPromises.push(uploadPhotoMutation.mutateAsync(pendingPhotoAction.file));
      } else if (pendingPhotoAction.type === 'delete') {
        mutationPromises.push(deletePhotoMutation.mutateAsync());
      }
    }

    if (hasChanges) {
      mutationPromises.push(updateMutation.mutateAsync(submissionData));
    }

    if (mutationPromises.length === 0) {
      setIsEditMode(false);
      return;
    }

    try {
      await Promise.all(mutationPromises);
      setPendingPhotoAction(null);
      setPendingPhotoPreview(null);
      setIsEditMode(false);
      queryClient.invalidateQueries('profile');
      await refreshUser();
      if (!hasChanges) {
        showSuccess('Profile updated successfully!');
      }
    } catch (error) {
      console.error('Error saving profile:', error);
    }
  };

  const handleChangePhotoClick = () => {
    fileInputRef.current?.click();
  };

  const handlePhotoSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      // Show immediate preview with original file for better UX
      const previewUrl = URL.createObjectURL(file);
      setPendingPhotoPreview(previewUrl);

      // Compress image in background
      const compressedFile = await compressImage(file);
      setPendingPhotoAction({ type: 'upload', file: compressedFile });
    } catch (error) {
      console.error('Image compression failed:', error);
      // Fallback to original file if compression fails
      setPendingPhotoAction({ type: 'upload', file });
    }

    // Reset the input so selecting the same file again will trigger change
    event.target.value = '';
  };

  const handleDeletePhoto = () => {
    setDeletePhotoConfirmOpen(true);
  };

  const confirmDeletePhoto = () => {
    setPendingPhotoAction({ type: 'delete' });
    setPendingPhotoPreview(null);
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

    // Clear pending photo actions
    setPendingPhotoAction(null);
    if (pendingPhotoPreview) {
      URL.revokeObjectURL(pendingPhotoPreview);
      setPendingPhotoPreview(null);
    }

    setIsEditMode(false);
    setFormErrors({});
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
              {isEditMode && (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    className="cancel-button"
                    onClick={handleCancelEdit}
                    disabled={updateMutation.isLoading}
                  >
                    Cancel
                  </button>
                  <button
                    className="save-button"
                    onClick={handleSave}
                    disabled={
                      updateMutation.isLoading ||
                      uploadPhotoMutation.isLoading ||
                      deletePhotoMutation.isLoading ||
                      (JSON.stringify(formData) === JSON.stringify(initialFormData) && !pendingPhotoAction)
                    }
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
                </div>
              )}
            </div>
          </div>

          <div className="profile-picture-section">
            <div className="profile-picture" onClick={() => (pendingPhotoPreview || photoSignedUrl) && setShowImagePopup(true)} style={{ cursor: (pendingPhotoPreview || photoSignedUrl) ? 'pointer' : 'default' }}>
              {pendingPhotoAction?.type === 'delete' ? (
                <div className="profile-placeholder">👤</div>
              ) : pendingPhotoPreview ? (
                <img
                  src={pendingPhotoPreview}
                  alt="Profile Preview"
                  style={{ opacity: 0.8 }}
                />
              ) : photoSignedUrl ? (
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
              {isEditMode && (
                <>
                  <button
                    className="change-photo-button"
                    onClick={handleChangePhotoClick}
                    disabled={uploadPhotoMutation.isLoading}
                  >
                    {pendingPhotoPreview ? 'Change Photo' : (photoSignedUrl || pendingPhotoAction?.type === 'delete') ? 'Change Photo' : 'Upload Photo'}
                  </button>
                  {(photoSignedUrl || pendingPhotoPreview) && pendingPhotoAction?.type !== 'delete' && (
                    <button
                      className="delete-photo-button"
                      onClick={handleDeletePhoto}
                      disabled={deletePhotoMutation.isLoading}
                    >
                      Delete
                    </button>
                  )}
                </>
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

          <div className="employee-modal-section">
            <h3>Personal Information</h3>
            <div className="employee-modal-grid">
              <div className={`employee-modal-field ${formErrors.firstName ? 'has-error' : ''}`}>
                <label>
                  First Name

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
              <div className="employee-modal-field">
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
              <div className={`employee-modal-field ${formErrors.lastName ? 'has-error' : ''}`}>
                <label>
                  Last Name

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
              <div className="employee-modal-field">
                <label>
                  Employee ID

                </label>
                <input type="text" value={formData.personalInfo?.empId || ''} disabled />
              </div>
              <div className={`employee-modal-field ${formErrors.personalEmail ? 'has-error' : ''}`}>
                <label>
                  Personal Email

                </label>
                <input
                  type="email"
                  value={formData.personalInfo?.personalEmail || ''}
                  onChange={(e) => {
                    setFormData({
                      ...formData,
                      personalInfo: { ...formData.personalInfo, personalEmail: e.target.value }
                    });
                  }}
                  disabled={!isEditMode}
                />
              </div>
              <div className={`employee-modal-field ${formErrors.contactNumber ? 'has-error' : ''}`}>
                <label>
                  Contact Number

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
              <div className={`employee-modal-field ${formErrors.altContact ? 'has-error' : ''}`}>
                <label>
                  Alternate Contact Number
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
              <div className={`employee-modal-field ${formErrors.dateOfBirth ? 'has-error' : ''}`}>
                <label>
                  Date of Birth

                </label>
                <DatePicker
                  value={formData.personalInfo?.dateOfBirth || ''}
                  max={new Date().toISOString().split('T')[0]}
                  onChange={(date) => {
                    setFormData({
                      ...formData,
                      personalInfo: { ...formData.personalInfo, dateOfBirth: date }
                    });
                    // Clear error on valid change
                    setFormErrors((prev) => {
                      const next = { ...prev };
                      delete next.dateOfBirth;
                      return next;
                    });
                  }}
                  disabled={!isEditMode}
                  placeholder="DD-MM-YYYY"
                  isEmployeeVariant={true}
                  allowManualEntry={true}
                />
              </div>
              <div className={`employee-modal-field ${formErrors.gender ? 'has-error' : ''}`}>
                <label>Gender</label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      className="leave-type-dropdown-trigger"
                      disabled={!isEditMode}
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
              <div className={`employee-modal-field ${formErrors.bloodGroup ? 'has-error' : ''}`}>
                <label>
                  Blood Group

                </label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      className="leave-type-dropdown-trigger"
                      disabled={!isEditMode}
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
              <div className={`employee-modal-field ${formErrors.maritalStatus ? 'has-error' : ''}`}>
                <label>
                  Marital Status

                </label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      className="leave-type-dropdown-trigger"
                      disabled={!isEditMode}
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
              <div className={`employee-modal-field ${formErrors.emergencyContactName ? 'has-error' : ''}`}>
                <label>
                  Emergency Contact Name

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
              <div className={`employee-modal-field ${formErrors.emergencyContactNo ? 'has-error' : ''}`}>
                <label>
                  Emergency Contact Number

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
              <div className={`employee-modal-field ${formErrors.emergencyContactRelation ? 'has-error' : ''}`}>
                <label>
                  Emergency Contact Relation

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

          <div className="employee-modal-section">
            <h3>Employment Information</h3>



            <div className="employee-modal-grid">
              <div className="employee-modal-field">
                <label>
                  Official Email
                </label>
                <input
                  type="email"
                  value={formData.personalInfo?.email || ''}
                  disabled
                />
              </div>
              <div className={`employee-modal-field ${formErrors.designation ? 'has-error' : ''}`}>
                <label>
                  Designation
                </label>
                <input
                  type="text"
                  maxLength={50}
                  value={formData.employmentInfo?.designation || ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    setFormData({
                      ...formData,
                      employmentInfo: { ...formData.employmentInfo, designation: value }
                    });
                  }}
                  disabled={!isEditMode}
                />
              </div>
              <div className={`employee-modal-field ${formErrors.department ? 'has-error' : ''}`}>
                <label>
                  Department
                </label>
                <input
                  type="text"
                  maxLength={50}
                  value={formData.employmentInfo?.department || ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    setFormData({
                      ...formData,
                      employmentInfo: { ...formData.employmentInfo, department: value }
                    });
                  }}
                  disabled={!isEditMode}
                />
              </div>
              <div className={`employee-modal-field ${formErrors.dateOfJoining ? 'has-error' : ''}`}>
                <label>
                  Date of Joining

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

              {/* New Fields */}
              <div className={`employee-modal-field ${formErrors.totalExperience ? 'has-error' : ''}`}>
                <label>
                  Total Experience (Years)

                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={formData.employmentInfo?.totalExperience || ''}
                  onChange={(e) => {
                    setFormData({
                      ...formData,
                      employmentInfo: { ...formData.employmentInfo, totalExperience: e.target.value }
                    });
                    // Clear error
                    if (e.target.value) {
                      setFormErrors(prev => {
                        const next = { ...prev };
                        delete next.totalExperience;
                        return next;
                      })
                    }
                  }}
                  onBlur={(e) => {
                    if (!e.target.value) {
                      setFormErrors(prev => ({ ...prev, totalExperience: true }));
                    }
                  }}
                  disabled={!isEditMode}
                />
                {formData.employmentInfo?.totalExperience && (parseFloat(formData.employmentInfo.totalExperience) * 10) % 5 !== 0 && (
                  <span style={{ fontSize: '11px', color: 'red', display: 'block', marginTop: '4px' }}>Must be in 0.5 increments</span>
                )}
              </div>

            </div>
          </div>

          <div className="employee-modal-section">
            <h3>Document Information</h3>
            <div className="employee-modal-grid">
              <div className={`employee-modal-field ${formErrors.aadharNumber ? 'has-error' : ''}`}>
                <label>
                  Aadhar Number

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
                  onBlur={() => {
                    const val = formData.documents?.aadharNumber;
                    if (!val || val.trim() === '') {
                      setFormErrors((prev) => ({ ...prev, aadharNumber: true }));
                    } else if (val.replace(/\s/g, '').length < 12) {
                      // Aadhar length check (sanitized)
                      setFormErrors((prev) => ({ ...prev, aadharNumber: true }));
                    } else {
                      setFormErrors((prev) => {
                        const next = { ...prev };
                        delete next.aadharNumber;
                        return next;
                      });
                    }
                  }}
                  placeholder="XXXX XXXX XXXX"
                  disabled={!isEditMode}
                />
              </div>
              <div className={`employee-modal-field ${formErrors.panNumber ? 'has-error' : ''}`}>
                <label>
                  PAN Number

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
                    const panVal = formData.documents?.panNumber || '';
                    if (!panVal || panVal.trim() === '') {
                      setFormErrors((prev) => ({ ...prev, panNumber: true }));
                    } else {
                      const panError = validatePan(panVal);
                      if (panError) {
                        setFormErrors((prev) => ({ ...prev, panNumber: true }));
                      } else {
                        setFormErrors((prev) => {
                          const next = { ...prev };
                          delete next.panNumber;
                          return next;
                        });
                      }
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

              <div className={`employee-modal-field ${formErrors.uanNumber ? 'has-error' : ''}`}>
                <label>
                  UAN Number
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={14}
                  value={formatUAN(formData.employmentInfo?.uanNumber || '')}
                  onChange={(e) => {
                    const sanitized = sanitizeUAN(e.target.value);
                    setFormData({
                      ...formData,
                      employmentInfo: { ...formData.employmentInfo, uanNumber: sanitized }
                    });
                  }}
                  disabled={!isEditMode}
                  placeholder="XXXX XXXX XXXX"
                />
                {formData.employmentInfo?.uanNumber && formData.employmentInfo.uanNumber.length !== 12 && (
                  <span style={{ fontSize: '11px', color: 'red', display: 'block', marginTop: '4px' }}>Must be 12 digits</span>
                )}
              </div>
            </div>
          </div>

          <div className="employee-modal-section">
            <h3>Address Details</h3>
            <div className={`employee-modal-field address-current ${formErrors.permanentAddress ? 'has-error' : ''}`}>
              <label>Permanent Address</label>
              <textarea
                value={formData.address?.permanentAddress || ''}
                onChange={(e) => {
                  const input = e.target;
                  const cursorPosition = input.selectionStart || 0;
                  const value = sanitizeAddress(e.target.value);
                  setFormData((prev: any) => ({
                    ...prev,
                    address: {
                      ...prev.address,
                      permanentAddress: value,
                      currentAddress: isSameAddress ? value : prev.address?.currentAddress
                    }
                  }));

                  // Restore cursor position
                  setTimeout(() => {
                    if (input) {
                      input.setSelectionRange(cursorPosition, cursorPosition);
                    }
                  }, 0);
                }}
                disabled={!isEditMode}
                rows={4}
              />
            </div>
            <div className={`employee-modal-field ${formErrors.currentAddress ? 'has-error' : ''}`}>
              <label>Current Address</label>
              <textarea
                value={formData.address?.currentAddress || ''}
                onChange={(e) => {
                  const input = e.target;
                  const cursorPosition = input.selectionStart || 0;
                  const value = sanitizeAddress(e.target.value);
                  setFormData((prev: any) => ({
                    ...prev,
                    address: { ...prev.address, currentAddress: value }
                  }));

                  // Restore cursor position
                  setTimeout(() => {
                    if (input) {
                      input.setSelectionRange(cursorPosition, cursorPosition);
                    }
                  }, 0);
                }}
                disabled={!isEditMode}
                rows={4}
              />
            </div>
          </div>

          {user?.role !== 'super_admin' && user?.role !== 'hr' && (
            <div className="employee-modal-section">
              <h3>Education Information</h3>
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
                    <tr key={edu.level} className={(formErrors[`edu_${idx}_groupStream`] || formErrors[`edu_${idx}_collegeUniversity`] || formErrors[`edu_${idx}_year`] || formErrors[`edu_${idx}_scorePercentage`]) ? 'has-error' : ''}>
                      <td className="education-level-cell">
                        {formatEducationLevel(edu.level)}
                      </td>
                      <td className={formErrors[`edu_${idx}_groupStream`] ? 'has-error' : ''}>
                        <input
                          type="text"
                          value={edu.groupStream || ''}
                          onChange={(e) => {
                            const value = e.target.value;
                            const newEducation = [...formData.education];
                            newEducation[idx] = { ...edu, groupStream: value };
                            setFormData({ ...formData, education: newEducation });
                          }}
                          disabled={!isEditMode}
                        />
                      </td>
                      <td className={formErrors[`edu_${idx}_collegeUniversity`] ? 'has-error' : ''}>
                        <input
                          type="text"
                          value={edu.collegeUniversity || ''}
                          onChange={(e) => {
                            const value = e.target.value;
                            const newEducation = [...formData.education];
                            newEducation[idx] = { ...edu, collegeUniversity: value };
                            setFormData({ ...formData, education: newEducation });
                          }}
                          disabled={!isEditMode}
                        />
                      </td>
                      <td className={formErrors[`edu_${idx}_year`] ? 'has-error' : ''}>
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
                      <td className={formErrors[`edu_${idx}_scorePercentage`] ? 'has-error' : ''}>
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
                            if (raw === '') {
                              const newEducation = [...formData.education];
                              newEducation[idx] = { ...edu, scorePercentage: null };
                              setFormData({ ...formData, education: newEducation });
                              return;
                            }

                            // Allow only numbers and one decimal point
                            const sanitized = raw.replace(/[^0-9.]/g, '');
                            const parts = sanitized.split('.');
                            if (parts.length > 2) return;

                            const decPart = parts[1] || '';
                            if (decPart.length > 2) return;

                            // Stop if numeric value exceeds 100
                            const numValue = parseFloat(sanitized);
                            if (!isNaN(numValue) && numValue > 100) return;

                            const newEducation = [...formData.education];
                            newEducation[idx] = {
                              ...edu,
                              scorePercentage: sanitized
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
          )}

          {user?.role !== 'super_admin' && (
            <div className="employee-modal-section">
              <h3>Reporting Hierarchy</h3>
              <div className="employee-modal-field">
                <label>Reporting Manager</label>
                <input
                  type="text"
                  value={profile?.reportingManager?.name || ''}
                  disabled
                />
              </div>
            </div>
          )}
        </div>
      </AppLayout >
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
      {
        showImagePopup && photoSignedUrl && (
          <div className="image-popup-overlay" onClick={() => setShowImagePopup(false)}>
            <div className="image-popup-content" onClick={(e) => e.stopPropagation()}>
              <button className="image-popup-close" onClick={() => setShowImagePopup(false)}>×</button>
              <img src={photoSignedUrl} alt="Profile" className="image-popup-image" />
            </div>
          </div>
        )
      }
    </>
  );
};

export default ProfilePage;

