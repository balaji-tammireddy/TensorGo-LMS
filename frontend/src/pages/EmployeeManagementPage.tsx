import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import AppLayout from '../components/layout/AppLayout';
import { useToast } from '../contexts/ToastContext';
import ConfirmationDialog from '../components/ConfirmationDialog';
import * as employeeService from '../services/employeeService';
import { getReportingManagers } from '../services/profileService';
import { format } from 'date-fns';
import { FaEye, FaPencilAlt, FaTrash } from 'react-icons/fa';
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
  return value.toUpperCase().replace(/\s+/g, '').slice(0, 10);
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

  const { data: managersData } = useQuery(
    ['reporting-managers', newEmployee.role],
    () => getReportingManagers(undefined, newEmployee.role),
    {
      retry: false,
      enabled: isModalOpen && !!newEmployee.role
    }
  );

  const { data: employeesData, error } = useQuery(
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

  const handleOpenAddEmployee = async () => {
    const today = new Date().toISOString().split('T')[0];
    try {
      // Fetch next employee ID
      const nextId = await employeeService.getNextEmployeeId();
      setNewEmployee({ ...emptyEmployeeForm, dateOfJoining: today, empId: nextId });
    } catch (error: any) {
      // If fetching fails, still open modal with empty form
      console.error('Failed to fetch next employee ID:', error);
      setNewEmployee({ ...emptyEmployeeForm, dateOfJoining: today });
    }
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
    if (isEmpty(newEmployee.empId)) missingFields.push('Employee ID');
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
    if (isEmpty(newEmployee.panNumber)) missingFields.push('PAN Number');

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

  const handleResetFilters = () => {
    setSearchInput('');
    setAppliedSearch(undefined);
    setStatusFilter('');
  };

  const getStatusColor = (status: string) => {
    return status === 'active' ? '#4caf50' : '#f44336';
  };

  if (error) {
    return (
      <AppLayout>
        <div className="employee-management-page">
          <div style={{ padding: '20px', textAlign: 'center', color: 'red' }}>
            {error?.response?.status === 403
              ? 'You do not have permission to view this page. HR access required.'
              : error?.response?.status === 429
              ? 'Too many requests. Please try again later.'
              : 'Error loading data. Please try again.'}
          </div>
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
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
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
                <th></th>
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
                      {user?.role === 'super_admin' && (
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
                        inputMode="numeric"
                        value={newEmployee.empId || ''}
                        disabled={true}
                        readOnly
                        style={{ backgroundColor: '#f5f5f5', cursor: 'not-allowed' }}
                        placeholder="Auto-generated"
                      />
                    </div>
                    <div className="employee-modal-field employee-role-field">
                      <label>
                        Role<span className="required-indicator">*</span>
                      </label>
                      <select
                        value={newEmployee.role}
                        onChange={(e) => {
                          const newRole = e.target.value;
                          // When role changes to/from super_admin, reset reporting manager
                          // Super admin should not have a reporting manager
                          setNewEmployee({ 
                            ...newEmployee, 
                            role: newRole,
                            reportingManagerId: newRole === 'super_admin' ? null : newEmployee.reportingManagerId,
                            reportingManagerName: newRole === 'super_admin' ? '' : newEmployee.reportingManagerName
                          });
                        }}
                        disabled={isViewMode || (isEditMode && user?.role !== 'hr' && user?.role !== 'super_admin')}
                      >
                        <option value="">Select role</option>
                        {(user?.role === 'super_admin'
                          ? ['employee', 'manager', 'hr', 'super_admin']
                          : user?.role === 'hr'
                          ? ['employee', 'manager', 'hr']
                          : ['employee']
                        ).map((role) => (
                          <option key={role} value={role}>
                            {role === 'super_admin'
                              ? 'Super Admin'
                              : role === 'hr'
                              ? 'HR'
                              : role.charAt(0).toUpperCase() + role.slice(1)}
                          </option>
                        ))}
                      </select>
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
                      <input
                        type="date"
                        value={newEmployee.dateOfBirth}
                        onChange={(e) =>
                          setNewEmployee({ ...newEmployee, dateOfBirth: e.target.value })
                        }
                        disabled={isViewMode}
                      />
                    </div>
                    <div className="employee-modal-field">
                      <label>
                        Gender<span className="required-indicator">*</span>
                      </label>
                      <select
                        value={newEmployee.gender}
                        onChange={(e) =>
                          setNewEmployee({ ...newEmployee, gender: e.target.value })
                        }
                        disabled={isViewMode}
                      >
                        <option value="">Select</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <div className="employee-modal-field">
                      <label>
                        Blood Group<span className="required-indicator">*</span>
                      </label>
                      <select
                        value={newEmployee.bloodGroup}
                        onChange={(e) =>
                          setNewEmployee({ ...newEmployee, bloodGroup: e.target.value })
                        }
                        disabled={isViewMode}
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
                    <div className="employee-modal-field">
                      <label>
                        Marital Status<span className="required-indicator">*</span>
                      </label>
                      <select
                        value={newEmployee.maritalStatus}
                        onChange={(e) =>
                          setNewEmployee({
                            ...newEmployee,
                            maritalStatus: e.target.value
                          })
                        }
                        disabled={isViewMode}
                      >
                        <option value="">Select</option>
                        <option value="Single">Single</option>
                        <option value="Married">Married</option>
                        <option value="Divorced">Divorced</option>
                      </select>
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
                      <input
                        type="date"
                        value={newEmployee.dateOfJoining}
                        onChange={(e) =>
                          setNewEmployee({
                            ...newEmployee,
                            dateOfJoining: e.target.value
                          })
                        }
                        disabled={isEditMode || isViewMode}
                      />
                    </div>
                    {isEditMode && (
                      <div className="employee-modal-field">
                        <label>Status</label>
                        <select
                          value={newEmployee.status === 'active' ? 'active' : 'inactive'}
                          onChange={(e) =>
                            setNewEmployee({
                              ...newEmployee,
                              status: e.target.value === 'active' ? 'active' : 'resigned'
                            })
                          }
                        >
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                        </select>
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
                        onChange={(e) =>
                          setNewEmployee({
                            ...newEmployee,
                            panNumber: sanitizePan(e.target.value)
                          })
                        }
                        disabled={isViewMode}
                      />
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
                              placeholder="YYYY"
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
                        <select disabled>
                          <option value="">Please select role first</option>
                        </select>
                      ) : (
                        <select
                          value={newEmployee.reportingManagerId || ''}
                          onChange={(e) => {
                            const managerId = e.target.value ? parseInt(e.target.value) : null;
                            const selectedManager = managersData?.find((m: any) => m.id === managerId);
                            setNewEmployee({
                              ...newEmployee,
                              reportingManagerId: managerId,
                              reportingManagerName: selectedManager?.name || ''
                            });
                          }}
                          disabled={isViewMode}
                        >
                          <option value="">Select Reporting Manager</option>
                          {managersData?.map((manager: any) => (
                            <option key={manager.id} value={manager.id}>
                              {manager.name} ({manager.empId})
                            </option>
                          ))}
                        </select>
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
      />
    </AppLayout>
  );
};

export default EmployeeManagementPage;

