import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import AppLayout from '../components/layout/AppLayout';
import { useToast } from '../contexts/ToastContext';
import { DatePicker } from '../components/ui/date-picker';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { Button } from '../components/ui/button';
import { ChevronDown, ArrowLeft } from 'lucide-react';
import * as employeeService from '../services/employeeService';
import { getReportingManagers } from '../services/profileService';
import { format } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';
import './EmployeeManagementPage.css'; // Reuse existing styles

// Helper functions (copied from EmployeeManagementPage)
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
  let cleaned = value.toUpperCase().replace(/\s+/g, '');
  let formatted = '';
  for (let i = 0; i < cleaned.length && formatted.length < 10; i++) {
    const char = cleaned[i];
    const currentLength = formatted.length;
    if (currentLength < 5) {
      if (/[A-Z]/.test(char)) formatted += char;
    } else if (currentLength < 9) {
      if (/[0-9]/.test(char)) formatted += char;
    } else if (currentLength === 9) {
      if (/[A-Z]/.test(char)) formatted += char;
    }
  }
  return formatted;
};

const validatePan = (pan: string): string | null => {
  if (!pan || pan.trim() === '') return null;
  if (pan.length !== 10) return 'PAN number must be exactly 10 characters long';
  const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
  if (!panRegex.test(pan)) return 'Invalid PAN format. Format: ABCDE1234F (5 letters, 4 digits, 1 letter)';
  return null;
};

const sanitizeLettersOnly = (value: string) => {
  const sanitized = value.replace(/[^a-zA-Z\s]/g, '');
  return sanitized.toLowerCase().replace(/(?:^|\s)\w/g, (match) => match.toUpperCase());
};

const baseEducationLevels = ['PG', 'UG', '12th'];

const getRoleLabel = (role: string) => {
  switch (role) {
    case 'super_admin': return 'Super Admin';
    case 'hr': return 'HR';
    case 'manager': return 'Manager';
    case 'employee': return 'Employee';
    case 'intern': return 'Intern';
    default: return role?.replace(/_/g, ' ') || '-';
  }
};

const formatEducationLevel = (level: string): React.ReactNode => {
  if (level === '12th') return <>12<sup>th</sup></>;
  return level;
};

const emptyEmployeeForm = {
  id: null as number | null,
  empId: '',
  role: '',
  email: '',
  firstName: '',
  middleName: '',
  lastName: '',
  contactNumber: '',
  altContact: '',
  dateOfBirth: '',
  gender: '',
  bloodGroup: '',
  maritalStatus: '',
  emergencyContactName: '',
  emergencyContactNo: '',
  emergencyContactRelation: '',
  designation: '',
  department: '',
  dateOfJoining: '',
  aadharNumber: '',
  panNumber: '',
  currentAddress: '',
  permanentAddress: '',
  status: 'active' as 'active' | 'on_leave' | 'resigned' | 'terminated' | 'on_notice' | 'inactive',
  education: baseEducationLevels.map((level) => ({
    level,
    groupStream: '',
    collegeUniversity: '',
    year: '',
    scorePercentage: ''
  })),
  reportingManagerName: '',
  reportingManagerId: null as number | null,
  subordinateCount: 0
};

const EmployeeDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { showSuccess, showError, showWarning } = useToast();

  const [isEditMode, setIsEditMode] = useState(false);
  const [employeeData, setEmployeeData] = useState<any>(emptyEmployeeForm);
  const [initialData, setInitialData] = useState<any>(emptyEmployeeForm);
  const [formErrors, setFormErrors] = useState<Record<string, boolean>>({});
  const [isSameAddress, setIsSameAddress] = useState(false);
  const [managerSearch, setManagerSearch] = useState('');
  const [appliedManagerSearch, setAppliedManagerSearch] = useState<string | undefined>(undefined);

  // Debounce manager search
  useEffect(() => {
    const term = managerSearch.trim();
    const timer = setTimeout(() => {
      setAppliedManagerSearch(term || undefined);
    }, 300);
    return () => clearTimeout(timer);
  }, [managerSearch]);

  const fetchEmployeeDetails = async () => {
    if (!id) return;
    try {
      const data: any = await employeeService.getEmployeeById(parseInt(id));

      const educationFromApi = data.education || [];
      const education = baseEducationLevels.map((level) => {
        const existing = educationFromApi.find((edu: any) => edu.level === level);
        return {
          level,
          groupStream: existing?.group_stream || '',
          collegeUniversity: existing?.college_university || '',
          year: existing?.year ? String(existing.year) : '',
          scorePercentage: existing?.score_percentage === null || existing?.score_percentage === undefined ? '' : String(existing.score_percentage)
        };
      });

      const currentAddress = data.current_address || '';
      const permanentAddress = data.permanent_address || '';
      const same = !!currentAddress && currentAddress === permanentAddress && currentAddress !== '';
      const today = format(new Date(), 'yyyy-MM-dd');
      const employeeDetail = data.employee || data;

      const fetchedEmployee = {
        ...emptyEmployeeForm,
        id: employeeDetail.id,
        empId: employeeDetail.emp_id || '',
        role: employeeDetail.role || '',
        email: employeeDetail.email || '',
        firstName: employeeDetail.first_name || '',
        middleName: employeeDetail.middle_name || '',
        lastName: employeeDetail.last_name || '',
        contactNumber: employeeDetail.contact_number || employeeDetail.contactNumber || '',
        altContact: employeeDetail.alt_contact || employeeDetail.altContact || '',
        dateOfBirth: employeeDetail.date_of_birth ? (typeof employeeDetail.date_of_birth === 'string' ? employeeDetail.date_of_birth.split('T')[0] : new Date(employeeDetail.date_of_birth).toISOString().split('T')[0]) : '',
        gender: employeeDetail.gender || '',
        bloodGroup: employeeDetail.blood_group || '',
        maritalStatus: employeeDetail.marital_status || '',
        emergencyContactName: employeeDetail.emergency_contact_name || '',
        emergencyContactNo: employeeDetail.emergency_contact_no || '',
        emergencyContactRelation: employeeDetail.emergency_contact_relation || '',
        designation: employeeDetail.designation || '',
        department: employeeDetail.department || '',
        dateOfJoining: employeeDetail.date_of_joining ? (typeof employeeDetail.date_of_joining === 'string' ? employeeDetail.date_of_joining.split('T')[0] : new Date(employeeDetail.date_of_joining).toISOString().split('T')[0]) : today,
        aadharNumber: employeeDetail.aadhar_number || '',
        panNumber: employeeDetail.pan_number || '',
        currentAddress: same ? permanentAddress : currentAddress,
        permanentAddress,
        status: employeeDetail.status || 'active',
        education,
        reportingManagerName: employeeDetail.reporting_manager_full_name || employeeDetail.reporting_manager_name || '',
        reportingManagerId: employeeDetail.reporting_manager_id || null,
        subordinateCount: employeeDetail.subordinate_count ? parseInt(String(employeeDetail.subordinate_count), 10) : 0
      };

      setEmployeeData(fetchedEmployee);
      setInitialData(fetchedEmployee);
      setIsSameAddress(same);
    } catch (error: any) {
      showError(error?.response?.data?.error?.message || 'Failed to load employee details');
      navigate('/employee-management');
    }
  };

  useEffect(() => {
    fetchEmployeeDetails();
  }, [id]);

  const { data: managersData } = useQuery(
    ['reporting-managers', employeeData.role, employeeData.id, appliedManagerSearch],
    () => getReportingManagers(appliedManagerSearch, employeeData.role, employeeData.id || undefined),
    {
      retry: false,
      staleTime: 30000,
      enabled: isEditMode && !!employeeData.role
    }
  );

  const updateEmployeeMutation = useMutation(
    (args: { id: number; data: any }) => employeeService.updateEmployee(args.id, args.data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('employees');
        showSuccess('Employee updated successfully!');
        setIsEditMode(false);
        fetchEmployeeDetails(); // Refresh data
      },
      onError: (error: any) => {
        showError(error.response?.data?.error?.message || 'Update failed');
      }
    }
  );

  const handleSameAsCurrentAddress = (checked: boolean) => {
    setIsSameAddress(checked);
    if (checked) {
      setEmployeeData((prev: any) => ({ ...prev, currentAddress: prev.permanentAddress }));
    } else {
      setEmployeeData((prev: any) => ({ ...prev, currentAddress: '' }));
    }
  };

  const handleSave = () => {
    const missingFields: string[] = [];
    const fieldErrors: Record<string, boolean> = {};

    const isEmpty = (value: any) =>
      value === undefined || value === null || (typeof value === 'string' && value.trim() === '');

    const checkField = (field: string, label: string) => {
      if (isEmpty(employeeData[field])) {
        missingFields.push(label);
        fieldErrors[field] = true;
      }
    };

    // Validation logic (copied from EmployeeManagementPage)
    checkField('role', 'Role');
    checkField('firstName', 'First Name');
    checkField('lastName', 'Last Name');

    if (isEmpty(employeeData.empId)) {
      missingFields.push('Employee ID');
      fieldErrors['empId'] = true;
    } else if (employeeData.empId.length > 20) {
      showWarning('Employee ID max 20 chars');
      fieldErrors['empId'] = true;
      setFormErrors(fieldErrors);
      return;
    }

    if (isEmpty(employeeData.email)) {
      missingFields.push('Official Email');
      fieldErrors['email'] = true;
    } else {
      const email = employeeData.email.toLowerCase();
      if (!email.endsWith('@tensorgo.com') && !email.endsWith('@tensorgo.co.in')) {
        showWarning('Use organization email');
        fieldErrors['email'] = true;
        setFormErrors(fieldErrors);
        return;
      }
    }

    checkField('contactNumber', 'Contact Number');
    checkField('altContact', 'Alternate Contact Number');
    checkField('dateOfBirth', 'Date of Birth');

    if (employeeData.dateOfBirth) {
      const dob = new Date(employeeData.dateOfBirth);
      const today = new Date();
      let age = today.getFullYear() - dob.getFullYear();
      const monthDiff = today.getMonth() - dob.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) age--;
      if (age < 18) {
        showWarning('Must be 18+ years old');
        fieldErrors['dateOfBirth'] = true;
        setFormErrors(fieldErrors);
        return;
      }
    }

    checkField('gender', 'Gender');
    checkField('bloodGroup', 'Blood Group');
    checkField('maritalStatus', 'Marital Status');
    checkField('emergencyContactName', 'Emergency Contact Name');
    checkField('emergencyContactNo', 'Emergency Contact Number');
    checkField('emergencyContactRelation', 'Emergency Contact Relation');
    checkField('designation', 'Designation');
    checkField('department', 'Department');
    checkField('dateOfJoining', 'Date of Joining');

    if (employeeData.dateOfBirth && employeeData.dateOfJoining) {
      const dob = new Date(employeeData.dateOfBirth);
      const doj = new Date(employeeData.dateOfJoining);
      let workAge = doj.getFullYear() - dob.getFullYear();
      const monthDiff = doj.getMonth() - dob.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && doj.getDate() < dob.getDate())) workAge--;

      if (workAge < 18) {
        showWarning('Joining Date must be at least 18 years after Date of Birth');
        fieldErrors['dateOfJoining'] = true;
        setFormErrors(fieldErrors);
        return;
      }
    }

    if (employeeData.role !== 'super_admin' && !employeeData.reportingManagerId) {
      missingFields.push('Reporting Manager');
      fieldErrors['reportingManagerId'] = true;
    }

    checkField('aadharNumber', 'Aadhar Number');
    if (isEmpty(employeeData.panNumber)) {
      missingFields.push('PAN Number');
      fieldErrors['panNumber'] = true;
    } else {
      const panError = validatePan(employeeData.panNumber);
      if (panError) {
        showWarning(panError);
        fieldErrors['panNumber'] = true;
        setFormErrors(fieldErrors);
        return;
      }
    }

    checkField('currentAddress', 'Current Address');
    checkField('permanentAddress', 'Permanent Address');

    // Education Validation
    if (employeeData.education && Array.isArray(employeeData.education)) {
      const currentYear = new Date().getFullYear();
      const maxYear = currentYear + 5;
      let yearValidationError: string | null = null;
      let isPgValid = true;

      employeeData.education.forEach((edu: any, index: number) => {
        const levelLabel = edu.level || 'Education';
        if (levelLabel === 'PG') {
          const pgFields = [
            { value: edu.groupStream, label: 'Group/Stream', key: 'groupStream' },
            { value: edu.collegeUniversity, label: 'College/University', key: 'collegeUniversity' },
            { value: edu.year, label: 'Graduation Year', key: 'year' },
            { value: edu.scorePercentage, label: 'Score %', key: 'scorePercentage' }
          ];
          const filledFields = pgFields.filter(f => !isEmpty(f.value));
          if (filledFields.length > 0 && filledFields.length < pgFields.length) {
            showWarning('Please fill complete details if you want to add PG details');
            pgFields.forEach(f => {
              if (isEmpty(f.value)) fieldErrors[`edu_${index}_${f.key}`] = true;
            });
            setFormErrors(fieldErrors);
            isPgValid = false;
            return;
          }
          if (!isEmpty(edu.year)) {
            const year = parseInt(edu.year, 10);
            if (isNaN(year) || year < 1950 || year > maxYear) {
              yearValidationError = `PG Graduation Year: 1950 - ${maxYear}`;
              fieldErrors[`edu_${index}_year`] = true;
            }
          }
          return;
        }

        if (isEmpty(edu.groupStream)) {
          missingFields.push(`${levelLabel} - Group/Stream`);
          fieldErrors[`edu_${index}_groupStream`] = true;
        }
        if (isEmpty(edu.collegeUniversity)) {
          missingFields.push(`${levelLabel} - College/University`);
          fieldErrors[`edu_${index}_collegeUniversity`] = true;
        }
        if (isEmpty(edu.year)) {
          missingFields.push(`${levelLabel} - Graduation Year`);
          fieldErrors[`edu_${index}_year`] = true;
        } else {
          const year = parseInt(edu.year, 10);
          if (isNaN(year) || year < 1950 || year > maxYear) {
            yearValidationError = `${levelLabel} Graduation Year: 1950 - ${maxYear}`;
            fieldErrors[`edu_${index}_year`] = true;
          }
        }
        if (isEmpty(edu.scorePercentage)) {
          missingFields.push(`${levelLabel} - Score %`);
          fieldErrors[`edu_${index}_scorePercentage`] = true;
        }
      });

      if (!isPgValid) return;
      if (yearValidationError) {
        showWarning(yearValidationError);
        setFormErrors(fieldErrors);
        return;
      }
    }

    setFormErrors(fieldErrors);
    if (missingFields.length > 0) {
      showWarning('Please Fill All Mandatory Details');
      return;
    }

    const sanitizedNewEmployee = Object.keys(employeeData).reduce((acc: any, key) => {
      if (!key.includes('_')) {
        acc[key] = employeeData[key];
      }
      return acc;
    }, {});

    const payload = {
      ...sanitizedNewEmployee,
      role: employeeData.role || 'employee'
    };

    if (employeeData.id) {
      updateEmployeeMutation.mutate({ id: employeeData.id, data: payload });
    }
  };


  if (!employeeData.id) {
    return (
      <AppLayout>
        <div className="employee-management-page">
          <div style={{ padding: '20px', textAlign: 'center' }}>Loading...</div>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="employee-management-page">
        {/* Header */}
        <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Button variant="outline" onClick={() => navigate('/employee-management')} className="flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            {/* View Mode Buttons */}
            {!isEditMode && (
              <>
                <Button variant="outline" onClick={() => navigate(`/employee-management/leaves/${id}`)}>
                  View Leave Details
                </Button>
                {(user?.role === 'super_admin' || user?.role === 'hr') && (
                  <Button
                    onClick={() => setIsEditMode(true)}
                    disabled={user.role === 'hr' && (employeeData.role === 'super_admin' || employeeData.role === 'hr')}
                  >
                    Edit Employee
                  </Button>
                )}
              </>
            )}

            {/* Edit Mode Buttons */}
            {isEditMode && (
              <>
                <Button variant="outline" onClick={() => {
                  setEmployeeData(initialData);
                  setIsEditMode(false);
                  setFormErrors({});
                }}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={updateEmployeeMutation.isLoading || JSON.stringify(employeeData) === JSON.stringify(initialData)}
                >
                  {updateEmployeeMutation.isLoading ? 'Saving...' : 'Save Changes'}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Content - Reusing the Modal Body Structure but in a card/scrollable area */}
        <div className="employee-details-container" style={{ backgroundColor: 'white', borderRadius: '8px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflowY: 'auto', flex: 1, minHeight: 0 }}>
          {/* Personal Information */}
          <div className="employee-modal-section">
            <h3>Personal Information</h3>
            <div className="employee-modal-grid">
              <div className={`employee-modal-field employee-id-field ${formErrors.empId ? 'has-error' : ''}`}>
                <label>Employee ID<span className="required-indicator">*</span></label>
                <input
                  type="text"
                  value={employeeData.empId}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 20).toUpperCase();
                    setEmployeeData({ ...employeeData, empId: value });
                  }}
                  disabled={!isEditMode || (isEditMode && user?.role !== 'super_admin')}
                />
              </div>
              <div className={`employee-modal-field employee-role-field ${formErrors.role ? 'has-error' : ''}`}>
                <label>Role<span className="required-indicator">*</span></label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      className="leave-type-dropdown-trigger"
                      disabled={!isEditMode || (user?.role !== 'hr' && user?.role !== 'super_admin')}
                    >
                      <span>{getRoleLabel(employeeData.role)}</span>
                      <ChevronDown style={{ width: '14px', height: '14px', marginLeft: '8px' }} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="leave-type-dropdown-content">
                    {(user?.role === 'super_admin' ? ['intern', 'employee', 'manager', 'hr', 'super_admin'] : ['intern', 'employee', 'manager', 'hr'])
                      .map((role) => (
                        <DropdownMenuItem key={role} onSelect={() => setEmployeeData({ ...employeeData, role })}>
                          {getRoleLabel(role)}
                        </DropdownMenuItem>
                      ))
                    }
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className={`employee-modal-field ${formErrors.dateOfBirth ? 'has-error' : ''}`}>
                <label>Date of Birth<span className="required-indicator">*</span></label>
                <DatePicker
                  value={employeeData.dateOfBirth}
                  onChange={(date) => setEmployeeData({ ...employeeData, dateOfBirth: date })}
                  disabled={!isEditMode}
                  placeholder="DD-MM-YYYY"
                  max={format(new Date(), 'yyyy-MM-dd')}
                  allowManualEntry={true}
                  isEmployeeVariant={true}
                />
              </div>
              <div className={`employee-modal-field ${formErrors.firstName ? 'has-error' : ''}`}>
                <label>First Name<span className="required-indicator">*</span></label>
                <input
                  type="text"
                  value={employeeData.firstName}
                  onChange={(e) => setEmployeeData({ ...employeeData, firstName: sanitizeName(e.target.value) })}
                  onBlur={() => {
                    if (!employeeData.firstName || employeeData.firstName.trim() === '') {
                      setFormErrors((prev) => ({ ...prev, firstName: true }));
                    } else {
                      setFormErrors((prev) => {
                        const next = { ...prev };
                        delete next.firstName;
                        return next;
                      });
                    }
                  }}
                  disabled={!isEditMode}
                />
              </div>
              <div className="employee-modal-field">
                <label>Middle Name</label>
                <input type="text" value={employeeData.middleName} onChange={(e) => setEmployeeData({ ...employeeData, middleName: sanitizeName(e.target.value) })} disabled={!isEditMode} />
              </div>
              <div className={`employee-modal-field ${formErrors.lastName ? 'has-error' : ''}`}>
                <label>Last Name<span className="required-indicator">*</span></label>
                <input
                  type="text"
                  value={employeeData.lastName}
                  onChange={(e) => setEmployeeData({ ...employeeData, lastName: sanitizeName(e.target.value) })}
                  onBlur={() => {
                    if (!employeeData.lastName || employeeData.lastName.trim() === '') {
                      setFormErrors((prev) => ({ ...prev, lastName: true }));
                    } else {
                      setFormErrors((prev) => {
                        const next = { ...prev };
                        delete next.lastName;
                        return next;
                      });
                    }
                  }}
                  disabled={!isEditMode}
                />
              </div>
              <div className={`employee-modal-field ${formErrors.email ? 'has-error' : ''}`}>
                <label>Official Email<span className="required-indicator">*</span></label>
                <input
                  type="email"
                  value={employeeData.email}
                  onChange={(e) => setEmployeeData({ ...employeeData, email: e.target.value })}
                  onBlur={() => {
                    if (!employeeData.email || employeeData.email.trim() === '') {
                      setFormErrors((prev) => ({ ...prev, email: true }));
                    } else {
                      setFormErrors((prev) => {
                        const next = { ...prev };
                        delete next.email;
                        return next;
                      });
                    }
                  }}
                  disabled={!isEditMode || (isEditMode && user?.role !== 'super_admin')}
                />
              </div>
              <div className={`employee-modal-field ${formErrors.contactNumber ? 'has-error' : ''}`}>
                <label>Contact Number<span className="required-indicator">*</span></label>
                <input
                  type="text"
                  maxLength={10}
                  value={employeeData.contactNumber}
                  onChange={(e) => setEmployeeData({ ...employeeData, contactNumber: sanitizePhone(e.target.value) })}
                  onBlur={() => {
                    const val = employeeData.contactNumber;
                    if (!val || val.trim() === '') {
                      setFormErrors((prev) => ({ ...prev, contactNumber: true }));
                    } else if (val.length < 10) {
                      setFormErrors((prev) => ({ ...prev, contactNumber: true }));
                    } else {
                      setFormErrors((prev) => {
                        const next = { ...prev };
                        delete next.contactNumber;
                        return next;
                      });
                    }
                  }}
                  disabled={!isEditMode}
                />
              </div>
              <div className={`employee-modal-field ${formErrors.altContact ? 'has-error' : ''}`}>
                <label>Alternate Contact<span className="required-indicator">*</span></label>
                <input
                  type="text"
                  maxLength={10}
                  value={employeeData.altContact}
                  onChange={(e) => setEmployeeData({ ...employeeData, altContact: sanitizePhone(e.target.value) })}
                  onBlur={() => {
                    const val = employeeData.altContact;
                    if (!val || val.trim() === '') {
                      setFormErrors((prev) => ({ ...prev, altContact: true }));
                    } else if (val.length < 10) {
                      setFormErrors((prev) => ({ ...prev, altContact: true }));
                    } else {
                      setFormErrors((prev) => {
                        const next = { ...prev };
                        delete next.altContact;
                        return next;
                      });
                    }
                  }}
                  disabled={!isEditMode}
                />
              </div>
              <div className={`employee-modal-field ${formErrors.gender ? 'has-error' : ''}`}>
                <label>Gender<span className="required-indicator">*</span></label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="leave-type-dropdown-trigger" disabled={!isEditMode}>
                      <span>{employeeData.gender || ''}</span>
                      <ChevronDown style={{ width: '14px', height: '14px', marginLeft: '8px' }} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {['Male', 'Female', 'Other'].map(g => (
                      <DropdownMenuItem key={g} onSelect={() => setEmployeeData({ ...employeeData, gender: g })}>{g}</DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className={`employee-modal-field ${formErrors.bloodGroup ? 'has-error' : ''}`}>
                <label>Blood Group<span className="required-indicator">*</span></label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="leave-type-dropdown-trigger" disabled={!isEditMode}>
                      <span>{employeeData.bloodGroup || ''}</span>
                      <ChevronDown style={{ width: '14px', height: '14px', marginLeft: '8px' }} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map(bg => (
                      <DropdownMenuItem key={bg} onSelect={() => setEmployeeData({ ...employeeData, bloodGroup: bg })}>{bg}</DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className={`employee-modal-field ${formErrors.maritalStatus ? 'has-error' : ''}`}>
                <label>Marital Status<span className="required-indicator">*</span></label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="leave-type-dropdown-trigger" disabled={!isEditMode}>
                      <span>{employeeData.maritalStatus || ''}</span>
                      <ChevronDown style={{ width: '14px', height: '14px', marginLeft: '8px' }} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {['Single', 'Married', 'Divorced', 'Widowed'].map(ms => (
                      <DropdownMenuItem key={ms} onSelect={() => setEmployeeData({ ...employeeData, maritalStatus: ms })}>{ms}</DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className={`employee-modal-field ${formErrors.emergencyContactName ? 'has-error' : ''}`}>
                <label>Emergency Contact Name<span className="required-indicator">*</span></label>
                <input
                  type="text"
                  value={employeeData.emergencyContactName}
                  onChange={(e) => setEmployeeData({ ...employeeData, emergencyContactName: sanitizeName(e.target.value) })}
                  onBlur={() => {
                    if (!employeeData.emergencyContactName || employeeData.emergencyContactName.trim() === '') {
                      setFormErrors((prev) => ({ ...prev, emergencyContactName: true }));
                    } else {
                      setFormErrors((prev) => {
                        const next = { ...prev };
                        delete next.emergencyContactName;
                        return next;
                      });
                    }
                  }}
                  disabled={!isEditMode}
                />
              </div>
              <div className={`employee-modal-field ${formErrors.emergencyContactNo ? 'has-error' : ''}`}>
                <label>Emergency Contact No<span className="required-indicator">*</span></label>
                <input
                  type="text"
                  maxLength={10}
                  value={employeeData.emergencyContactNo}
                  onChange={(e) => setEmployeeData({ ...employeeData, emergencyContactNo: sanitizePhone(e.target.value) })}
                  onBlur={() => {
                    const val = employeeData.emergencyContactNo;
                    if (!val || val.trim() === '') {
                      setFormErrors((prev) => ({ ...prev, emergencyContactNo: true }));
                    } else if (val.length < 10) {
                      setFormErrors((prev) => ({ ...prev, emergencyContactNo: true }));
                    } else {
                      setFormErrors((prev) => {
                        const next = { ...prev };
                        delete next.emergencyContactNo;
                        return next;
                      });
                    }
                  }}
                  disabled={!isEditMode}
                />
              </div>
              <div className={`employee-modal-field ${formErrors.emergencyContactRelation ? 'has-error' : ''}`}>
                <label>Relation<span className="required-indicator">*</span></label>
                <input
                  type="text"
                  value={employeeData.emergencyContactRelation}
                  onChange={(e) => setEmployeeData({ ...employeeData, emergencyContactRelation: sanitizeLettersOnly(e.target.value) })}
                  onBlur={() => {
                    if (!employeeData.emergencyContactRelation || employeeData.emergencyContactRelation.trim() === '') {
                      setFormErrors((prev) => ({ ...prev, emergencyContactRelation: true }));
                    } else {
                      setFormErrors((prev) => {
                        const next = { ...prev };
                        delete next.emergencyContactRelation;
                        return next;
                      });
                    }
                  }}
                  disabled={!isEditMode}
                />
              </div>
            </div>
          </div>

          {/* Employment Info */}
          <div className="employee-modal-section">
            <h3>Employment Information</h3>
            <div className="employee-modal-grid">
              <div className={`employee-modal-field ${formErrors.designation ? 'has-error' : ''}`}>
                <label>Designation<span className="required-indicator">*</span></label>
                <input
                  type="text"
                  value={employeeData.designation}
                  onChange={(e) => setEmployeeData({ ...employeeData, designation: sanitizeName(e.target.value) })}
                  onBlur={() => {
                    if (!employeeData.designation || employeeData.designation.trim() === '') {
                      setFormErrors((prev) => ({ ...prev, designation: true }));
                    } else {
                      setFormErrors((prev) => {
                        const next = { ...prev };
                        delete next.designation;
                        return next;
                      });
                    }
                  }}
                  disabled={!isEditMode}
                />
              </div>
              <div className={`employee-modal-field ${formErrors.department ? 'has-error' : ''}`}>
                <label>Department<span className="required-indicator">*</span></label>
                <input
                  type="text"
                  value={employeeData.department}
                  onChange={(e) => setEmployeeData({ ...employeeData, department: sanitizeName(e.target.value) })}
                  onBlur={() => {
                    if (!employeeData.department || employeeData.department.trim() === '') {
                      setFormErrors((prev) => ({ ...prev, department: true }));
                    } else {
                      setFormErrors((prev) => {
                        const next = { ...prev };
                        delete next.department;
                        return next;
                      });
                    }
                  }}
                  disabled={!isEditMode}
                />
              </div>
              <div className={`employee-modal-field ${formErrors.dateOfJoining ? 'has-error' : ''}`}>
                <label>Date of Joining<span className="required-indicator">*</span></label>
                <DatePicker
                  value={employeeData.dateOfJoining}
                  onChange={(date) => setEmployeeData({ ...employeeData, dateOfJoining: date })}
                  disabled={!isEditMode || (isEditMode && user?.role !== 'super_admin')}
                  placeholder="DD-MM-YYYY"
                  allowManualEntry={true}
                  isEmployeeVariant={true}
                />
              </div>
              <div className="employee-modal-field">
                <label>Status</label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="leave-type-dropdown-trigger" disabled={!isEditMode}>
                      <span>{employeeData.status === 'active' ? 'Active' : employeeData.status === 'on_notice' ? 'On Notice' : 'Inactive'}</span>
                      <ChevronDown style={{ width: '14px', height: '14px', marginLeft: '8px' }} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {['active', 'on_notice', 'inactive'].map(s => (
                      <DropdownMenuItem key={s} onSelect={() => setEmployeeData({ ...employeeData, status: s })}>
                        {s === 'active' ? 'Active' : s === 'on_notice' ? 'On Notice' : 'Inactive'}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>

          {/* Document Info */}
          <div className="employee-modal-section">
            <h3>Document Information</h3>
            <div className="employee-modal-grid">
              <div className={`employee-modal-field ${formErrors.aadharNumber ? 'has-error' : ''}`}>
                <label>Aadhar Number<span className="required-indicator">*</span></label>
                <input
                  type="text"
                  value={formatAadhaar(employeeData.aadharNumber)}
                  onChange={(e) => setEmployeeData({ ...employeeData, aadharNumber: sanitizeAadhaar(e.target.value) })}
                  onBlur={() => {
                    if (!employeeData.aadharNumber || employeeData.aadharNumber.trim() === '') {
                      setFormErrors((prev) => ({ ...prev, aadharNumber: true }));
                    } else {
                      setFormErrors((prev) => {
                        const next = { ...prev };
                        delete next.aadharNumber;
                        return next;
                      });
                    }
                  }}
                  disabled={!isEditMode}
                />
              </div>
              <div className={`employee-modal-field ${formErrors.panNumber ? 'has-error' : ''}`}>
                <label>PAN Number<span className="required-indicator">*</span></label>
                <input
                  type="text"
                  maxLength={10}
                  value={employeeData.panNumber}
                  onChange={(e) => setEmployeeData({ ...employeeData, panNumber: sanitizePan(e.target.value) })}
                  onBlur={() => {
                    const panVal = employeeData.panNumber || '';
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
                  disabled={!isEditMode}
                />
              </div>
            </div>
          </div>

          {/* Address Info */}
          <div className="employee-modal-section">
            <h3>Address Details</h3>
            <div className={`employee-modal-field full-width ${formErrors.permanentAddress ? 'has-error' : ''}`}>
              <label>Permanent Address<span className="required-indicator">*</span></label>
              <textarea
                rows={3}
                value={employeeData.permanentAddress}
                onChange={(e) => setEmployeeData((prev: any) => ({ ...prev, permanentAddress: e.target.value, currentAddress: isSameAddress ? e.target.value : prev.currentAddress }))}
                onBlur={() => {
                  if (!employeeData.permanentAddress || employeeData.permanentAddress.trim() === '') {
                    setFormErrors((prev) => ({ ...prev, permanentAddress: true }));
                  } else {
                    setFormErrors((prev) => {
                      const next = { ...prev };
                      delete next.permanentAddress;
                      return next;
                    });
                  }
                }}
                disabled={!isEditMode}
              />
            </div>
            <div className={`employee-modal-field full-width ${formErrors.currentAddress ? 'has-error' : ''}`}>
              <label>Current Address<span className="required-indicator">*</span></label>
              <textarea
                rows={3}
                value={employeeData.currentAddress}
                onChange={(e) => setEmployeeData({ ...employeeData, currentAddress: e.target.value })}
                onBlur={() => {
                  if (!employeeData.currentAddress || employeeData.currentAddress.trim() === '') {
                    setFormErrors((prev) => ({ ...prev, currentAddress: true }));
                  } else {
                    setFormErrors((prev) => {
                      const next = { ...prev };
                      delete next.currentAddress;
                      return next;
                    });
                  }
                }}
                disabled={(isSameAddress && isEditMode) || !isEditMode}
              />
              {isEditMode && (
                <label className="same-address-checkbox">
                  <input type="checkbox" checked={isSameAddress} onChange={(e) => handleSameAsCurrentAddress(e.target.checked)} />
                  Same as Permanent Address
                </label>
              )}
            </div>
          </div>

          {/* Education Info */}
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
                {employeeData.education?.map((edu: any, idx: number) => (
                  <tr key={edu.level} className={(formErrors[`edu_${idx}_groupStream`] || formErrors[`edu_${idx}_collegeUniversity`] || formErrors[`edu_${idx}_year`] || formErrors[`edu_${idx}_scorePercentage`]) ? 'has-error' : ''}>
                    <td className="education-level-cell">
                      {formatEducationLevel(edu.level)}
                      {(edu.level === 'UG' || edu.level === '12th') && <span className="required-indicator">*</span>}
                    </td>
                    <td>
                      <input
                        type="text"
                        value={edu.groupStream || ''}
                        onChange={(e) => {
                          const next = [...employeeData.education];
                          next[idx] = { ...edu, groupStream: sanitizeLettersOnly(e.target.value) };
                          setEmployeeData({ ...employeeData, education: next });
                        }}
                        onBlur={() => {
                          if ((edu.level === 'UG' || edu.level === '12th') && (!edu.groupStream || edu.groupStream.trim() === '')) {
                            setFormErrors((prev) => ({ ...prev, [`edu_${idx}_groupStream`]: true }));
                          } else {
                            setFormErrors((prev) => {
                              const next = { ...prev };
                              delete next[`edu_${idx}_groupStream`];
                              return next;
                            });
                          }
                        }}
                        disabled={!isEditMode}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={edu.collegeUniversity || ''}
                        onChange={(e) => {
                          const next = [...employeeData.education];
                          next[idx] = { ...edu, collegeUniversity: sanitizeLettersOnly(e.target.value) };
                          setEmployeeData({ ...employeeData, education: next });
                        }}
                        onBlur={() => {
                          if ((edu.level === 'UG' || edu.level === '12th') && (!edu.collegeUniversity || edu.collegeUniversity.trim() === '')) {
                            setFormErrors((prev) => ({ ...prev, [`edu_${idx}_collegeUniversity`]: true }));
                          } else {
                            setFormErrors((prev) => {
                              const next = { ...prev };
                              delete next[`edu_${idx}_collegeUniversity`];
                              return next;
                            });
                          }
                        }}
                        disabled={!isEditMode}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        maxLength={4}
                        value={edu.year || ''}
                        onChange={(e) => {
                          const next = [...employeeData.education];
                          next[idx] = { ...edu, year: e.target.value.replace(/[^0-9]/g, '') };
                          setEmployeeData({ ...employeeData, education: next });
                        }}
                        onBlur={(e) => {
                          const yearStr = e.target.value;
                          const year = parseInt(yearStr, 10);
                          const currentYear = new Date().getFullYear();
                          const maxYear = currentYear + 5;

                          if ((edu.level === 'UG' || edu.level === '12th') && (!yearStr || yearStr.trim() === '')) {
                            setFormErrors((prev) => ({ ...prev, [`edu_${idx}_year`]: true }));
                          } else if (yearStr && (isNaN(year) || year < 1950 || year > maxYear)) {
                            setFormErrors((prev) => ({ ...prev, [`edu_${idx}_year`]: true }));
                          } else {
                            setFormErrors((prev) => {
                              const next = { ...prev };
                              delete next[`edu_${idx}_year`];
                              return next;
                            });
                          }
                        }}
                        disabled={!isEditMode}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={edu.scorePercentage || ''}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw === '') {
                            const next = [...employeeData.education];
                            next[idx] = { ...edu, scorePercentage: null };
                            setEmployeeData({ ...employeeData, education: next });
                            return;
                          }

                          const sanitized = raw.replace(/[^0-9.]/g, '');
                          const parts = sanitized.split('.');
                          if (parts.length > 2) return;

                          if (parts[1] && parts[1].length > 2) return;

                          const numValue = parseFloat(sanitized);
                          if (!isNaN(numValue) && numValue > 100) return;

                          const next = [...employeeData.education];
                          next[idx] = { ...edu, scorePercentage: sanitized };
                          setEmployeeData({ ...employeeData, education: next });
                        }}
                        onBlur={() => {
                          if ((edu.level === 'UG' || edu.level === '12th') && (edu.scorePercentage === null || edu.scorePercentage === undefined || String(edu.scorePercentage).trim() === '')) {
                            setFormErrors((prev) => ({ ...prev, [`edu_${idx}_scorePercentage`]: true }));
                          } else {
                            setFormErrors((prev) => {
                              const next = { ...prev };
                              delete next[`edu_${idx}_scorePercentage`];
                              return next;
                            });
                          }
                        }}
                        disabled={!isEditMode}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Reporting Hierarchy */}
          {employeeData.role !== 'super_admin' && (
            <div className="employee-modal-section">
              <h3>Reporting Hierarchy</h3>
              <div className={`employee-modal-field full-width ${formErrors.reportingManagerId ? 'has-error' : ''}`}>
                <label>Reporting Manager<span className="required-indicator">*</span></label>
                <DropdownMenu onOpenChange={(open) => !open && setManagerSearch('')}>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="leave-type-dropdown-trigger" disabled={!isEditMode}>
                      <span>{employeeData.reportingManagerName ? employeeData.reportingManagerName : 'Select Manager'}</span>
                      <ChevronDown style={{ width: '14px', height: '14px', marginLeft: '8px' }} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="leave-type-dropdown-content" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                    <div style={{ padding: '8px', position: 'sticky', top: 0, backgroundColor: 'white', zIndex: 1 }}>
                      <input
                        type="text"
                        placeholder="Search..."
                        value={managerSearch}
                        onChange={e => {
                          // Only allow letters, numbers, and spaces
                          const sanitized = e.target.value.replace(/[^a-zA-Z0-9\s]/g, '');
                          setManagerSearch(sanitized);
                        }}
                        style={{ width: '100%', padding: '8px' }}
                        onClick={e => e.stopPropagation()}
                      />
                    </div>
                    {managersData?.map((manager: any) => (
                      <DropdownMenuItem key={manager.id} onClick={() => setEmployeeData({ ...employeeData, reportingManagerId: manager.id, reportingManagerName: manager.name })}>
                        {manager.name} ({manager.empId}) - {getRoleLabel(manager.role)}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          )}

        </div>
      </div>
    </AppLayout>
  );
};

export default EmployeeDetailsPage;
