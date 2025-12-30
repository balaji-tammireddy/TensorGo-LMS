import React, { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import AppLayout from '../components/layout/AppLayout';
import { useToast } from '../contexts/ToastContext';
import ConfirmationDialog from '../components/ConfirmationDialog';
import AddLeavesModal from '../components/AddLeavesModal';
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
import * as employeeService from '../services/employeeService';
import { getReportingManagers } from '../services/profileService';
import { format } from 'date-fns';
import { FaEye, FaPencilAlt, FaTrash, FaCalendarPlus } from 'react-icons/fa';
import { useAuth } from '../contexts/AuthContext';
import './EmployeeManagementPage.css';

const sanitizeName = (value: string) => {
  return value.replace(/[^a-zA-Z\s]/g, '').slice(0, 25);
};

const sanitizePhone = (value: string) => {
  return value.replace(/[^0-9]/g, '').slice(0, 10);
};

const sanitizeEmpId = (value: string) => {
  return value.replace(/[^0-9]/g, '');
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

const baseEducationLevels = ['PG', 'UG', '12th'];

// Helper function to format education level display
const formatEducationLevel = (level: string): React.ReactNode => {
  if (level === '12th') {
    return <>12<sup>th</sup></>;
  }
  return level;
};

const emptyEmployeeForm = {
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
  status: 'active' as 'active' | 'on_leave' | 'resigned' | 'terminated',
  education: baseEducationLevels.map((level) => ({
    level,
    groupStream: '',
    collegeUniversity: '',
    year: '',
    scorePercentage: ''
  })),
  reportingManagerName: '',
  reportingManagerId: null as number | null
};

const EmployeeManagementPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { showSuccess, showError, showWarning } = useToast();
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState<string | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isViewMode, setIsViewMode] = useState(false);
  const [editingEmployeeId, setEditingEmployeeId] = useState<number | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isSameAddress, setIsSameAddress] = useState(false);
  const [newEmployee, setNewEmployee] = useState<any>(emptyEmployeeForm);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteEmployeeId, setDeleteEmployeeId] = useState<number | null>(null);
  const [addLeavesModalOpen, setAddLeavesModalOpen] = useState(false);
  const [selectedEmployeeForLeaves, setSelectedEmployeeForLeaves] = useState<{ id: number; name: string } | null>(null);

  const { data: managersData } = useQuery(
    ['reporting-managers', newEmployee.role, editingEmployeeId],
    () => getReportingManagers(undefined, newEmployee.role, editingEmployeeId || undefined),
    {
      retry: false,
      enabled: isModalOpen && !!newEmployee.role
    }
  );

  const { data: employeesData, isLoading: employeesLoading, error } = useQuery(
    ['employees', appliedSearch, statusFilter],
    () =>
      employeeService.getEmployees(
        1,
        20,
        appliedSearch,
        undefined,
        statusFilter || undefined
      ),
    {
      retry: false,
      keepPreviousData: true,
      onError: (error: any) => {
        if (error.response?.status === 403 || error.response?.status === 401) {
          window.location.href = '/login';
        }
      }
    }
  );

  // Debounce search input
  useEffect(() => {
    const term = searchInput.trim();
    const timer = setTimeout(() => {
      if (term.length >= 3) {
        setAppliedSearch(term);
      } else if (term.length === 0) {
        setAppliedSearch(undefined);
      }
    }, 500); // 500ms debounce

    return () => clearTimeout(timer);
  }, [searchInput]);

  const hasActiveFilters = Boolean(searchInput || statusFilter);

  const sortedEmployees = React.useMemo(() => {
    if (!employeesData?.employees) return [];
    return [...employeesData.employees].sort((a, b) => {
      // Sort by Employee ID (numeric order)
      const aId = parseInt(a.empId) || 0;
      const bId = parseInt(b.empId) || 0;
      return aId - bId; // ascending order (001, 002, 003, etc.)
    });
  }, [employeesData]);

  const createMutation = useMutation(employeeService.createEmployee, {
    onSuccess: () => {
      queryClient.invalidateQueries('employees');
      setIsModalOpen(false);
      setNewEmployee(emptyEmployeeForm);
      setIsSameAddress(false);
      showSuccess('Employee created successfully!');
    },
    onError: (error: any) => {
      showError(error.response?.data?.error?.message || 'Failed to create employee');
    }
  });

  const updateEmployeeMutation = useMutation(
    (args: { id: number; data: any }) =>
      employeeService.updateEmployee(args.id, args.data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('employees');
        setIsModalOpen(false);
        setNewEmployee(emptyEmployeeForm);
        setIsSameAddress(false);
        setIsEditMode(false);
        setEditingEmployeeId(null);
        showSuccess('Employee updated successfully!');
      },
      onError: (error: any) => {
        showError(error.response?.data?.error?.message || 'Failed to update employee');
      }
    }
  );

  const deleteEmployeeMutation = useMutation(
    (id: number) => employeeService.deleteEmployee(id),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('employees');
        setDeleteConfirmOpen(false);
        setDeleteEmployeeId(null);
        showSuccess('Employee and all related data deleted successfully!');
      },
      onError: (error: any) => {
        showError(error.response?.data?.error?.message || 'Failed to delete employee');
      }
    }
  );

  const addLeavesMutation = useMutation(
    ({ employeeId, leaveType, count }: { employeeId: number; leaveType: 'casual' | 'sick' | 'lop'; count: number }) =>
      employeeService.addLeavesToEmployee(employeeId, leaveType, count),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('employees');
        setAddLeavesModalOpen(false);
        setSelectedEmployeeForLeaves(null);
        showSuccess('Leaves added successfully!');
      },
      onError: (error: any) => {
        showError(error.response?.data?.error?.message || 'Failed to add leaves');
      }
    }
  );

  const handleOpenAddEmployee = () => {
    const today = new Date().toISOString().split('T')[0];
      setNewEmployee({ ...emptyEmployeeForm, dateOfJoining: today });
    setIsSameAddress(false);
    setIsEditMode(false);
    setIsViewMode(false);
    setEditingEmployeeId(null);
    setIsModalOpen(true);
  };

  const handleSameAsCurrentAddress = (checked: boolean) => {
    setIsSameAddress(checked);
    if (checked) {
      setNewEmployee((prev: any) => ({
        ...prev,
        currentAddress: prev.permanentAddress
      }));
    } else {
      setNewEmployee((prev: any) => ({
        ...prev,
        currentAddress: ''
      }));
    }
  };

  const handleCreateEmployee = () => {
    const missingFields: string[] = [];

    const isEmpty = (value: any) =>
      value === undefined ||
      value === null ||
      (typeof value === 'string' && value.trim() === '');

    // Personal information (except Middle Name)
    if (isEmpty(newEmployee.role)) missingFields.push('Role');
    if (isEmpty(newEmployee.firstName)) missingFields.push('First Name');
    if (isEmpty(newEmployee.lastName)) missingFields.push('Last Name');
    if (isEmpty(newEmployee.empId)) {
      missingFields.push('Employee ID');
    } else if (newEmployee.empId.length > 6) {
      showWarning('Employee ID must be maximum 6 characters');
      return;
    }
    if (isEmpty(newEmployee.email)) missingFields.push('Official Email');
    if (isEmpty(newEmployee.contactNumber)) missingFields.push('Contact Number');
    if (isEmpty(newEmployee.altContact)) missingFields.push('Alt Contact');
    if (isEmpty(newEmployee.dateOfBirth)) missingFields.push('Date of Birth');
    
    // Validate age - employee must be at least 18 years old
    if (newEmployee.dateOfBirth) {
      const dob = new Date(newEmployee.dateOfBirth);
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
    
    if (isEmpty(newEmployee.gender)) missingFields.push('Gender');
    if (isEmpty(newEmployee.bloodGroup)) missingFields.push('Blood Group');
    if (isEmpty(newEmployee.maritalStatus)) missingFields.push('Marital Status');
    if (isEmpty(newEmployee.emergencyContactName))
      missingFields.push('Emergency Contact Name');
    if (isEmpty(newEmployee.emergencyContactNo))
      missingFields.push('Emergency Contact No');
    if (isEmpty(newEmployee.emergencyContactRelation))
      missingFields.push('Emergency Contact Relation');

    // Employment information
    if (isEmpty(newEmployee.designation)) missingFields.push('Designation');
    if (isEmpty(newEmployee.department)) missingFields.push('Department');
    if (isEmpty(newEmployee.dateOfJoining)) missingFields.push('Date of Joining');
    // Super admin should not have a reporting manager
    if (!newEmployee.reportingManagerId && newEmployee.role !== 'super_admin')
      missingFields.push('Reporting Manager');

    // Document information
    if (isEmpty(newEmployee.aadharNumber)) missingFields.push('Aadhar Number');
    if (isEmpty(newEmployee.panNumber)) {
      missingFields.push('PAN Number');
    } else {
      const panError = validatePan(newEmployee.panNumber);
      if (panError) {
        showWarning(panError);
        return;
      }
    }

    // Address information
    if (isEmpty(newEmployee.currentAddress)) missingFields.push('Current Address');
    if (isEmpty(newEmployee.permanentAddress))
      missingFields.push('Permanent Address');

    // Education information (PG optional, UG and 12th mandatory)
    if (newEmployee.education && Array.isArray(newEmployee.education)) {
      const currentYear = new Date().getFullYear();
      const maxYear = currentYear + 5;
      let yearValidationError: string | null = null;
      
      for (const edu of newEmployee.education) {
        const levelLabel = edu.level || 'Education';
        if (levelLabel === 'PG') {
          // PG row is optional
          continue;
        }
        if (isEmpty(edu.groupStream))
          missingFields.push(`${levelLabel} - Group/Stream`);
        if (isEmpty(edu.collegeUniversity))
          missingFields.push(`${levelLabel} - College/University`);
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
        if (isEmpty(edu.scorePercentage))
          missingFields.push(`${levelLabel} - Score %`);
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

    if (newEmployee.aadharNumber && newEmployee.aadharNumber.length !== 12) {
      showWarning('Aadhar Number must be exactly 12 digits.');
      return;
    }

    const phoneFields = [
      {
        value: newEmployee.contactNumber as string | undefined,
        label: 'Contact Number'
      },
      {
        value: newEmployee.altContact as string | undefined,
        label: 'Alt Contact'
      },
      {
        value: newEmployee.emergencyContactNo as string | undefined,
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

    const payload = {
      ...newEmployee,
      role: newEmployee.role || 'employee'
    };

    if (isEditMode && editingEmployeeId) {
      updateEmployeeMutation.mutate({ id: editingEmployeeId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const openEmployeeModal = async (employeeId: number, mode: 'edit' | 'view') => {
    try {
      setIsDetailLoading(true);
      const data: any = await employeeService.getEmployeeById(employeeId);

      const educationFromApi = data.education || [];
      const education = baseEducationLevels.map((level) => {
        const existing = educationFromApi.find((edu: any) => edu.level === level);
        return {
          level,
          groupStream: existing?.group_stream || '',
          collegeUniversity: existing?.college_university || '',
          year: existing?.year ? String(existing.year) : '',
          scorePercentage:
            existing?.score_percentage === null ||
            existing?.score_percentage === undefined
              ? ''
              : String(existing.score_percentage)
        };
      });

      const currentAddress = data.current_address || '';
      const permanentAddress = data.permanent_address || '';
      const same =
        !!currentAddress && currentAddress === permanentAddress && currentAddress !== '';

      const today = new Date().toISOString().split('T')[0];

      setNewEmployee({
        ...emptyEmployeeForm,
        empId: data.emp_id || '',
        role: data.role || '',
        email: data.email || '',
        firstName: data.first_name || '',
        middleName: data.middle_name || '',
        lastName: data.last_name || '',
        contactNumber: data.contact_number || '',
        altContact: data.alt_contact || '',
        dateOfBirth: data.date_of_birth ? data.date_of_birth.split('T')[0] : '',
        gender: data.gender || '',
        bloodGroup: data.blood_group || '',
        maritalStatus: data.marital_status || '',
        emergencyContactName: data.emergency_contact_name || '',
        emergencyContactNo: data.emergency_contact_no || '',
        emergencyContactRelation: data.emergency_contact_relation || '',
        designation: data.designation || '',
        department: data.department || '',
        dateOfJoining: data.date_of_joining
          ? data.date_of_joining.split('T')[0]
          : today,
        aadharNumber: data.aadhar_number || '',
        panNumber: data.pan_number || '',
        currentAddress: same ? permanentAddress : currentAddress,
        permanentAddress,
        status: data.status || 'active',
        education,
        // Prefer explicitly stored reporting_manager_name; fall back to joined full name
        // Super admin should not have a reporting manager
        reportingManagerName:
          data.role === 'super_admin' ? '' : (data.reporting_manager_name || data.reporting_manager_full_name || ''),
        reportingManagerId: data.role === 'super_admin' ? null : (data.reporting_manager_id || null)
      });

      setIsSameAddress(same);
      setIsEditMode(mode === 'edit');
      setIsViewMode(mode === 'view');
      setEditingEmployeeId(employeeId);
      setIsModalOpen(true);
    } catch (error: any) {
      showError(error?.response?.data?.error?.message || 'Failed to load employee details');
    } finally {
      setIsDetailLoading(false);
    }
  };

  const handleEditEmployee = (employeeId: number) => openEmployeeModal(employeeId, 'edit');
  const handleViewEmployee = (employeeId: number) => openEmployeeModal(employeeId, 'view');

  const handleDelete = (employeeId: number) => {
    setDeleteEmployeeId(employeeId);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = () => {
    if (deleteEmployeeId) {
      deleteEmployeeMutation.mutate(deleteEmployeeId);
    }
  };

  const handleAddLeaves = (employeeId: number, employeeName: string) => {
    setSelectedEmployeeForLeaves({ id: employeeId, name: employeeName });
    setAddLeavesModalOpen(true);
  };

  const handleAddLeavesSubmit = (leaveType: 'casual' | 'sick' | 'lop', count: number) => {
    if (selectedEmployeeForLeaves) {
      addLeavesMutation.mutate({
        employeeId: selectedEmployeeForLeaves.id,
        leaveType,
        count
      });
    }
  };

  const handleResetFilters = () => {
    setSearchInput('');
    setAppliedSearch(undefined);
    setStatusFilter('');
  };

  const getStatusColor = (status: string) => {
    return status === 'active' ? '#4caf50' : '#f44336';
  };

  if (employeesLoading && !employeesData) {
    return (
      <AppLayout>
        <div className="employee-management-page">
          <div className="skeleton-loader">
            {/* Page Title Skeleton */}
            <div className="skeleton-title"></div>
            
            {/* Search and Filter Bar Skeleton */}
            <div className="skeleton-search-filter">
              <div className="skeleton-input" style={{ width: '300px', height: '40px' }}></div>
              <div className="skeleton-input" style={{ width: '150px', height: '40px' }}></div>
              <div className="skeleton-button" style={{ width: '150px', height: '40px' }}></div>
            </div>
            
            {/* Table Section Skeleton */}
            <div className="skeleton-card">
              <div className="skeleton-table">
                <div className="skeleton-table-header"></div>
                {Array.from({ length: 8 }).map((_, index) => (
                  <div key={index} className="skeleton-table-row" style={{ width: `${92 - index * 1}%` }}></div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (error) {
    const errorMessage = error?.response?.status === 403
              ? 'You do not have permission to view this page. HR access required.'
              : error?.response?.status === 429
              ? 'Too many requests. Please try again later.'
      : 'Error loading data. Please try again.';

    const handleRetry = () => {
      window.location.reload();
    };

    return (
      <AppLayout>
        <div className="employee-management-page">
          <ErrorDisplay 
            message={errorMessage}
            onRetry={handleRetry}
            showRetryButton={error?.response?.status !== 403}
          />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="employee-management-page">
        <h1 className="page-title">Employee Management</h1>

        <div className="search-filter-bar">
          <div className="search-box">
            <input
              type="text"
              placeholder="Search by Name or Emp ID"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const value = e.currentTarget.value.trim();
                  if (value.length < 3) {
                    showWarning('Please type at least 3 characters to search.');
                    return;
                  }
                  setAppliedSearch(value);
                }
              }}
            />
            {searchInput && (
              <button
                type="button"
                className="search-clear"
                onClick={() => {
                  setSearchInput('');
                  setAppliedSearch(undefined);
                }}
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>
          <div className="filter-box">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="outline" 
                  className="leave-type-dropdown-trigger"
                  style={{ 
                    padding: '10px 12px',
                    fontSize: '14px',
                    fontFamily: 'Poppins, sans-serif',
                    border: '1px solid #dcdcdc',
                    borderRadius: '2px',
                    backgroundColor: '#ffffff',
                    color: '#1f2a3d',
                    height: 'auto'
                  }}
                >
                  <span>{statusFilter === '' ? 'All Status' : statusFilter === 'active' ? 'Active' : 'Inactive'}</span>
                  <ChevronDown style={{ width: '14px', height: '14px', marginLeft: '8px' }} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="leave-type-dropdown-content">
                <DropdownMenuItem
                  onClick={() => setStatusFilter('')}
                >
                  All Status
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setStatusFilter('active')}
                >
                  Active
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setStatusFilter('inactive')}
                >
                  Inactive
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <button
            type="button"
            className="add-employee-button"
            onClick={handleOpenAddEmployee}
          >
            Add Employee
          </button>
        </div>

        <div className="employees-section">
          <table className="employees-table">
            <thead>
              <tr>
                <th>SNo</th>
                <th>Emp ID</th>
                <th>Emp Name</th>
                <th>Position</th>
                <th>Joining Date</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedEmployees.length === 0 ? (
                <tr>
                  <td colSpan={7} className="no-results-row">
                    No results found
                  </td>
                </tr>
              ) : (
                sortedEmployees.map((employee, idx) => (
                  <tr key={employee.id}>
                    <td>{idx + 1}</td>
                    <td>{employee.empId}</td>
                    <td>{employee.name}</td>
                    <td>{employee.position}</td>
                    <td>{format(new Date(employee.joiningDate), 'dd/MM/yyyy')}</td>
                    <td>
                      <span
                        className="status-badge"
                        style={{
                          backgroundColor: getStatusColor(employee.status),
                          color: '#ffffff'
                        }}
                      >
                        {employee.status === 'active' ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="actions-cell">
                      <span
                        className="action-icon"
                        title="View"
                        onClick={() => handleViewEmployee(employee.id)}
                      >
                      <FaEye />
                      </span>
                      {/* HR cannot edit super_admin users or their own details */}
                      {!(user?.role === 'hr' && (employee.role === 'super_admin' || employee.id === user.id)) && (
                        <span
                          className="action-icon"
                          title="Edit"
                          onClick={() => handleEditEmployee(employee.id)}
                        >
                        <FaPencilAlt />
                        </span>
                      )}
                      {/* HR and Super Admin can add leaves, but HR cannot add to themselves or super_admin, and Super Admin cannot add to themselves */}
                      {((user?.role === 'hr' && employee.role !== 'super_admin' && employee.id !== user.id) || 
                        (user?.role === 'super_admin' && employee.id !== user.id)) && (
                        <span
                          className="action-icon"
                          title="Add Leaves"
                          onClick={() => handleAddLeaves(employee.id, employee.name)}
                        >
                          <FaCalendarPlus />
                        </span>
                      )}
                      {/* Super Admin can delete employees but not themselves */}
                      {user?.role === 'super_admin' && employee.id !== user.id && (
                        <span
                          className="action-icon"
                          title="Delete"
                          onClick={() => handleDelete(employee.id)}
                          style={{ color: '#f44336' }}
                        >
                          <FaTrash />
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {isModalOpen && (
          <div className="employee-modal-backdrop">
            <div className="employee-modal">
              <div className="employee-modal-header">
                <h2>{isViewMode ? 'View Employee' : isEditMode ? 'Edit Employee' : 'Add Employee'}</h2>
                <button
                  type="button"
                  className="modal-close-button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setIsEditMode(false);
                    setIsViewMode(false);
                    setEditingEmployeeId(null);
                  }}
                >
                  ✕
                </button>
              </div>

              <div className="employee-modal-body">
                {isDetailLoading && (
                  <div style={{ padding: '8px 0', fontSize: 12, color: '#666' }}>
                    Loading details...
                  </div>
                )}
                <div className="employee-modal-section">
                  <h3>Personal Information</h3>
                  <div className="employee-modal-grid">
                    <div className="employee-modal-field employee-id-field">
                      <label>
                        Employee ID<span className="required-indicator">*</span>
                      </label>
                      <input
                        type="text"
                        value={newEmployee.empId || ''}
                        onChange={(e) => {
                          // Limit to 6 characters, alphanumeric only
                          const value = e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase();
                          setNewEmployee({
                            ...newEmployee,
                            empId: value
                          });
                        }}
                        maxLength={6}
                        disabled={isEditMode || isViewMode}
                      />
                    </div>
                    <div className="employee-modal-field employee-role-field">
                      <label>
                        Role<span className="required-indicator">*</span>
                      </label>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button 
                            variant="outline" 
                            className="leave-type-dropdown-trigger"
                            disabled={isViewMode || (isEditMode && user?.role !== 'hr' && user?.role !== 'super_admin')}
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
                              height: 'auto',
                              minHeight: '42px',
                              lineHeight: '1.5'
                            }}
                          >
                            <span>
                              {newEmployee.role === '' ? '' : 
                               newEmployee.role === 'super_admin' ? 'Super Admin' :
                               newEmployee.role === 'hr' ? 'HR' :
                               newEmployee.role.charAt(0).toUpperCase() + newEmployee.role.slice(1)}
                            </span>
                            <ChevronDown style={{ width: '14px', height: '14px', marginLeft: '8px' }} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="leave-type-dropdown-content">
                          {(user?.role === 'super_admin'
                            ? ['employee', 'manager', 'hr', 'super_admin']
                            : user?.role === 'hr'
                            ? ['employee', 'manager', 'hr']
                            : ['employee']
                          ).map((role, index, array) => (
                            <React.Fragment key={role}>
                              <DropdownMenuItem
                                onClick={() => {
                                  const newRole = role;
                                  setNewEmployee({ 
                                    ...newEmployee, 
                                    role: newRole,
                                    reportingManagerId: newRole === 'super_admin' ? null : newEmployee.reportingManagerId,
                                    reportingManagerName: newRole === 'super_admin' ? '' : newEmployee.reportingManagerName
                                  });
                                }}
                              >
                                {role === 'super_admin'
                                  ? 'Super Admin'
                                  : role === 'hr'
                                  ? 'HR'
                                  : role.charAt(0).toUpperCase() + role.slice(1)}
                              </DropdownMenuItem>
                              {index < array.length - 1 && <DropdownMenuSeparator />}
                            </React.Fragment>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <div className="employee-modal-field">
                      <label>
                        First Name<span className="required-indicator">*</span>
                      </label>
                      <input
                        type="text"
                        value={newEmployee.firstName}
                        onChange={(e) =>
                          setNewEmployee({
                            ...newEmployee,
                            firstName: sanitizeName(e.target.value)
                          })
                        }
                        disabled={isViewMode}
                      />
                    </div>
                    <div className="employee-modal-field">
                      <label>Middle Name</label>
                      <input
                        type="text"
                        value={newEmployee.middleName}
                        onChange={(e) =>
                          setNewEmployee({
                            ...newEmployee,
                            middleName: sanitizeName(e.target.value)
                          })
                        }
                        disabled={isViewMode}
                      />
                    </div>
                    <div className="employee-modal-field">
                      <label>
                        Last Name<span className="required-indicator">*</span>
                      </label>
                      <input
                        type="text"
                        value={newEmployee.lastName}
                        onChange={(e) =>
                          setNewEmployee({
                            ...newEmployee,
                            lastName: sanitizeName(e.target.value)
                          })
                        }
                        disabled={isViewMode}
                      />
                    </div>
                    <div className="employee-modal-field">
                      <label>
                        Official Email<span className="required-indicator">*</span>
                      </label>
                      <input
                        type="email"
                        value={newEmployee.email}
                        onChange={(e) =>
                          setNewEmployee({ ...newEmployee, email: e.target.value })
                        }
                        disabled={(isEditMode && user?.role !== 'super_admin') || isViewMode}
                      />
                    </div>
                    <div className="employee-modal-field">
                      <label>
                        Contact Number<span className="required-indicator">*</span>
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={10}
                        value={newEmployee.contactNumber}
                        onChange={(e) => {
                          const input = e.target;
                          const cursorPosition = input.selectionStart || 0;
                          const oldValue = newEmployee.contactNumber || '';
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
                          
                          setNewEmployee({
                            ...newEmployee,
                            contactNumber: newValue
                          });
                          
                          // Restore cursor position after state update
                          setTimeout(() => {
                            const inputElement = input;
                            if (inputElement) {
                              inputElement.setSelectionRange(newCursorPosition, newCursorPosition);
                            }
                          }, 0);
                        }}
                        disabled={isViewMode}
                      />
                    </div>
                    <div className="employee-modal-field">
                      <label>
                        Alt Contact<span className="required-indicator">*</span>
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={10}
                        value={newEmployee.altContact}
                        onChange={(e) => {
                          const input = e.target;
                          const cursorPosition = input.selectionStart || 0;
                          const oldValue = newEmployee.altContact || '';
                          const newValue = sanitizePhone(e.target.value);
                          
                          setNewEmployee({
                            ...newEmployee,
                            altContact: newValue
                          });
                          
                          // Restore cursor position after state update
                          setTimeout(() => {
                            const inputElement = input;
                            if (inputElement) {
                              const newCursorPosition = Math.min(cursorPosition, newValue.length);
                              inputElement.setSelectionRange(newCursorPosition, newCursorPosition);
                            }
                          }, 0);
                        }}
                        disabled={isViewMode}
                      />
                    </div>
                    <div className="employee-modal-field">
                      <label>
                        Date of Birth<span className="required-indicator">*</span>
                      </label>
                      <DatePicker
                        value={newEmployee.dateOfBirth}
                        onChange={(date) =>
                          setNewEmployee({ ...newEmployee, dateOfBirth: date })
                        }
                        disabled={isViewMode}
                        placeholder="Select date of birth"
                        max={new Date().toISOString().split('T')[0]}
                      />
                    </div>
                    <div className="employee-modal-field">
                      <label>
                        Gender<span className="required-indicator">*</span>
                      </label>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button 
                            variant="outline" 
                            className="leave-type-dropdown-trigger"
                            disabled={isViewMode}
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
                              height: 'auto',
                              minHeight: '42px',
                              lineHeight: '1.5'
                            }}
                          >
                            <span>{newEmployee.gender || ''}</span>
                            <ChevronDown style={{ width: '14px', height: '14px', marginLeft: '8px' }} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="leave-type-dropdown-content">
                          <DropdownMenuItem
                            onClick={() => setNewEmployee({ ...newEmployee, gender: 'Male' })}
                          >
                            Male
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setNewEmployee({ ...newEmployee, gender: 'Female' })}
                          >
                            Female
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setNewEmployee({ ...newEmployee, gender: 'Other' })}
                          >
                            Other
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <div className="employee-modal-field">
                      <label>
                        Blood Group<span className="required-indicator">*</span>
                      </label>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button 
                            variant="outline" 
                            className="leave-type-dropdown-trigger"
                            disabled={isViewMode}
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
                              height: 'auto',
                              minHeight: '42px',
                              lineHeight: '1.5'
                            }}
                          >
                            <span>{newEmployee.bloodGroup || ''}</span>
                            <ChevronDown style={{ width: '14px', height: '14px', marginLeft: '8px' }} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="leave-type-dropdown-content">
                          {['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map((bg, index) => (
                            <React.Fragment key={bg}>
                              <DropdownMenuItem
                                onClick={() => setNewEmployee({ ...newEmployee, bloodGroup: bg })}
                              >
                                {bg}
                              </DropdownMenuItem>
                              {index < 7 && <DropdownMenuSeparator />}
                            </React.Fragment>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <div className="employee-modal-field">
                      <label>
                        Marital Status<span className="required-indicator">*</span>
                      </label>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button 
                            variant="outline" 
                            className="leave-type-dropdown-trigger"
                            disabled={isViewMode}
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
                              height: 'auto',
                              minHeight: '42px',
                              lineHeight: '1.5'
                            }}
                          >
                            <span>{newEmployee.maritalStatus || ''}</span>
                            <ChevronDown style={{ width: '14px', height: '14px', marginLeft: '8px' }} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="leave-type-dropdown-content">
                          <DropdownMenuItem
                            onClick={() => setNewEmployee({ ...newEmployee, maritalStatus: 'Single' })}
                          >
                            Single
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setNewEmployee({ ...newEmployee, maritalStatus: 'Married' })}
                          >
                            Married
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setNewEmployee({ ...newEmployee, maritalStatus: 'Divorced' })}
                          >
                            Divorced
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setNewEmployee({ ...newEmployee, maritalStatus: 'Widowed' })}
                          >
                            Widowed
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <div className="employee-modal-field">
                      <label>
                        Emergency Contact Name<span className="required-indicator">*</span>
                      </label>
                      <input
                        type="text"
                        value={newEmployee.emergencyContactName}
                        onChange={(e) =>
                          setNewEmployee({
                            ...newEmployee,
                            emergencyContactName: sanitizeName(e.target.value)
                          })
                        }
                        disabled={isViewMode}
                      />
                    </div>
                    <div className="employee-modal-field">
                      <label>
                        Emergency Contact No<span className="required-indicator">*</span>
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={10}
                        value={newEmployee.emergencyContactNo}
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
                          
                          setNewEmployee({
                            ...newEmployee,
                            emergencyContactNo: newValue
                          });
                          
                          // Restore cursor position after state update
                          setTimeout(() => {
                            const inputElement = input;
                            if (inputElement) {
                              inputElement.setSelectionRange(newCursorPosition, newCursorPosition);
                            }
                          }, 0);
                        }}
                        disabled={isViewMode}
                      />
                    </div>
                    <div className="employee-modal-field">
                      <label>
                        Emergency Contact Relation<span className="required-indicator">*</span>
                      </label>
                      <input
                        type="text"
                        value={newEmployee.emergencyContactRelation}
                        onChange={(e) =>
                          setNewEmployee({
                            ...newEmployee,
                            emergencyContactRelation: sanitizeLettersOnly(e.target.value)
                          })
                        }
                        disabled={isViewMode}
                      />
                    </div>
                  </div>
                </div>

                <div className="employee-modal-section">
                  <h3>Employment Information</h3>
                  <div className="employee-modal-grid">
                    <div className="employee-modal-field">
                      <label>
                        Designation<span className="required-indicator">*</span>
                      </label>
                      <input
                        type="text"
                        value={newEmployee.designation}
                        onChange={(e) =>
                          setNewEmployee({
                            ...newEmployee,
                            designation: sanitizeName(e.target.value)
                          })
                        }
                        disabled={isViewMode}
                      />
                    </div>
                    <div className="employee-modal-field">
                      <label>
                        Department<span className="required-indicator">*</span>
                      </label>
                      <input
                        type="text"
                        value={newEmployee.department}
                        onChange={(e) =>
                          setNewEmployee({
                            ...newEmployee,
                            department: sanitizeName(e.target.value)
                          })
                        }
                        disabled={isViewMode}
                      />
                    </div>
                    <div className="employee-modal-field">
                      <label>
                        Date of Joining<span className="required-indicator">*</span>
                      </label>
                      <DatePicker
                        value={newEmployee.dateOfJoining}
                        onChange={(date) =>
                          setNewEmployee({
                            ...newEmployee,
                            dateOfJoining: date
                          })
                        }
                        disabled={isViewMode || (isEditMode && user?.role !== 'super_admin')}
                        placeholder="Select date of joining"
                      />
                    </div>
                    {isEditMode && (
                      <div className="employee-modal-field">
                        <label>Status</label>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button 
                              variant="outline" 
                              className="leave-type-dropdown-trigger"
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
                                height: 'auto',
                              minHeight: '42px',
                              lineHeight: '1.5'
                              }}
                            >
                              <span>{newEmployee.status === 'active' ? 'Active' : 'Inactive'}</span>
                              <ChevronDown style={{ width: '14px', height: '14px', marginLeft: '8px' }} />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent className="leave-type-dropdown-content">
                            <DropdownMenuItem
                              onClick={() => setNewEmployee({
                                ...newEmployee,
                                status: 'active'
                              })}
                            >
                              Active
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => setNewEmployee({
                                ...newEmployee,
                                status: 'resigned'
                              })}
                            >
                              Inactive
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    )}
                  </div>
                </div>

                <div className="employee-modal-section">
                  <h3>Document Information</h3>
                  <div className="employee-modal-grid">
                    <div className="employee-modal-field">
                      <label>
                        Aadhar Number<span className="required-indicator">*</span>
                      </label>
                      <input
                        type="text"
                        value={formatAadhaar(newEmployee.aadharNumber || '')}
                        onChange={(e) =>
                          setNewEmployee({
                            ...newEmployee,
                            aadharNumber: sanitizeAadhaar(e.target.value)
                          })
                        }
                        placeholder="XXXX XXXX XXXX"
                        disabled={isViewMode}
                      />
                    </div>
                    <div className="employee-modal-field">
                      <label>
                        PAN Number<span className="required-indicator">*</span>
                      </label>
                      <input
                        type="text"
                        value={newEmployee.panNumber}
                        onChange={(e) => {
                          const sanitized = sanitizePan(e.target.value);
                          setNewEmployee({
                            ...newEmployee,
                            panNumber: sanitized
                          });
                        }}
                        onBlur={(e) => {
                          const panError = validatePan(newEmployee.panNumber);
                          if (panError && newEmployee.panNumber) {
                            showWarning(panError);
                          }
                        }}
                        placeholder="ABCDE1234F"
                        maxLength={10}
                        disabled={isViewMode}
                      />
                      {newEmployee.panNumber && newEmployee.panNumber.length < 10 && (
                        <span style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
                          Format: 5 letters, 4 digits, 1 letter
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="employee-modal-section">
                  <h3>Address Details</h3>
                  <div className="employee-modal-field full-width">
                    <label>
                      Permanent Address<span className="required-indicator">*</span>
                    </label>
                    <textarea
                      rows={3}
                      value={newEmployee.permanentAddress}
                      onChange={(e) =>
                        setNewEmployee((prev: any) => ({
                          ...prev,
                          permanentAddress: e.target.value,
                          currentAddress: isSameAddress
                            ? e.target.value
                            : prev.currentAddress
                        }))
                      }
                      disabled={isViewMode}
                    />
                  </div>
                  <div className="employee-modal-field full-width">
                    <label>
                      Current Address<span className="required-indicator">*</span>
                    </label>
                    <textarea
                      rows={3}
                      value={newEmployee.currentAddress}
                      onChange={(e) =>
                        setNewEmployee({
                          ...newEmployee,
                          currentAddress: e.target.value
                        })
                      }
                      disabled={isSameAddress || isViewMode}
                    />
                    <label className="same-address-checkbox">
                      <input
                        type="checkbox"
                        checked={isSameAddress}
                        onChange={(e) => handleSameAsCurrentAddress(e.target.checked)}
                        disabled={isViewMode}
                      />
                      Same as Permanent Address
                    </label>
                  </div>
                </div>

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
                      {newEmployee.education?.map((edu: any, idx: number) => (
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
                                setNewEmployee((prev: any) => {
                                  const next = [...(prev.education || [])];
                                  next[idx] = { ...edu, groupStream: value };
                                  return { ...prev, education: next };
                                });
                              }}
                              disabled={isViewMode}
                            />
                          </td>
                          <td>
                            <input
                              type="text"
                              value={edu.collegeUniversity || ''}
                              onChange={(e) => {
                                const value = sanitizeLettersOnly(e.target.value);
                                setNewEmployee((prev: any) => {
                                  const next = [...(prev.education || [])];
                                  next[idx] = { ...edu, collegeUniversity: value };
                                  return { ...prev, education: next };
                                });
                              }}
                              disabled={isViewMode}
                            />
                          </td>
                          <td>
                            <input
                              type="text"
                              value={edu.year || ''}
                              onChange={(e) => {
                                const value = e.target.value.replace(/[^0-9]/g, '').slice(0, 4);
                                setNewEmployee((prev: any) => {
                                  const next = [...(prev.education || [])];
                                  next[idx] = { ...edu, year: value };
                                  return { ...prev, education: next };
                                });
                              }}
                              onBlur={(e) => {
                                const year = parseInt(e.target.value, 10);
                                const currentYear = new Date().getFullYear();
                                const maxYear = currentYear + 5;
                                if (e.target.value && (isNaN(year) || year < 1950 || year > maxYear)) {
                                  showWarning(`Graduation Year must be between 1950 and ${maxYear}`);
                                }
                              }}
                              disabled={isViewMode}
                            />
                          </td>
                          <td>
                            <input
                              type="text"
                              value={
                                edu.scorePercentage === null || edu.scorePercentage === undefined
                                  ? ''
                                  : String(edu.scorePercentage)
                              }
                              onChange={(e) => {
                                const raw = e.target.value;
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

                                setNewEmployee((prev: any) => {
                                  const next = [...(prev.education || [])];
                                  next[idx] = {
                                    ...edu,
                                    scorePercentage:
                                      display === '' || display === '.' ? null : display
                                  };
                                  return { ...prev, education: next };
                                });
                              }}
                              disabled={isViewMode}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {newEmployee.role !== 'super_admin' && (
                  <div className="employee-modal-section">
                    <h3>Reporting Hierarchy</h3>
                    <div className="employee-modal-field full-width">
                      <label>
                        Reporting Manager<span className="required-indicator">*</span>
                      </label>
                      {!newEmployee.role ? (
                        <Button 
                          variant="outline" 
                          className="leave-type-dropdown-trigger"
                          disabled
                          style={{ 
                            width: '100%', 
                            justifyContent: 'space-between',
                            padding: '6px 8px',
                            fontSize: '12px',
                            fontFamily: 'Poppins, sans-serif',
                            border: '1px solid #ddd',
                            borderRadius: '4px',
                            backgroundColor: 'transparent',
                            color: '#1f2a3d',
                            height: 'auto'
                          }}
                        >
                          <span>Please select role first</span>
                          <ChevronDown style={{ width: '14px', height: '14px', marginLeft: '8px' }} />
                        </Button>
                      ) : (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button 
                              variant="outline" 
                              className="leave-type-dropdown-trigger"
                              disabled={isViewMode}
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
                                height: 'auto',
                              minHeight: '42px',
                              lineHeight: '1.5'
                              }}
                            >
                              <span>
                                {newEmployee.reportingManagerName 
                                  ? `${newEmployee.reportingManagerName} (${managersData?.find((m: any) => m.id === newEmployee.reportingManagerId)?.empId || ''})`
                                  : 'Select Reporting Manager'}
                              </span>
                              <ChevronDown style={{ width: '14px', height: '14px', marginLeft: '8px' }} />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent className="leave-type-dropdown-content">
                            {managersData?.map((manager: any, index: number) => (
                              <React.Fragment key={manager.id}>
                                <DropdownMenuItem
                                  onClick={() => {
                                    setNewEmployee({
                                      ...newEmployee,
                                      reportingManagerId: manager.id,
                                      reportingManagerName: manager.name
                                    });
                                  }}
                                >
                                  {manager.name} ({manager.empId})
                                </DropdownMenuItem>
                                {index < (managersData?.length || 0) - 1 && <DropdownMenuSeparator />}
                              </React.Fragment>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="employee-modal-footer">
                {isViewMode ? (
                  <button
                    type="button"
                    className="modal-cancel-button"
                    onClick={() => {
                      setIsModalOpen(false);
                      setIsEditMode(false);
                      setIsViewMode(false);
                      setEditingEmployeeId(null);
                    }}
                  >
                    Close
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="modal-cancel-button"
                      onClick={() => {
                        setIsModalOpen(false);
                        setIsEditMode(false);
                        setIsViewMode(false);
                        setEditingEmployeeId(null);
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="modal-save-button"
                      onClick={handleCreateEmployee}
                      disabled={createMutation.isLoading || updateEmployeeMutation.isLoading}
                    >
                      {(createMutation.isLoading || updateEmployeeMutation.isLoading) ? (
                        <>
                          <span className="loading-spinner"></span>
                          {isEditMode ? 'Saving...' : 'Saving...'}
                        </>
                      ) : (
                        isEditMode ? 'Save Changes' : 'Save'
                      )}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      <ConfirmationDialog
        isOpen={deleteConfirmOpen}
        title="Delete Employee"
        message="Are you sure you want to delete this employee? This will permanently delete all their data including leave requests, education records, and other related information. This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
        onConfirm={confirmDelete}
        onCancel={() => {
          setDeleteConfirmOpen(false);
          setDeleteEmployeeId(null);
        }}
        isLoading={deleteEmployeeMutation.isLoading}
      />
      <AddLeavesModal
        isOpen={addLeavesModalOpen}
        onClose={() => {
          setAddLeavesModalOpen(false);
          setSelectedEmployeeForLeaves(null);
        }}
        onAdd={handleAddLeavesSubmit}
        employeeId={selectedEmployeeForLeaves?.id || 0}
        employeeName={selectedEmployeeForLeaves?.name || ''}
        isLoading={addLeavesMutation.isLoading}
      />
    </AppLayout>
  );
};

export default EmployeeManagementPage;

