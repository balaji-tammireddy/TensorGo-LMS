import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import AppLayout from '../components/layout/AppLayout';
import * as employeeService from '../services/employeeService';
import { format } from 'date-fns';
import './EmployeeManagementPage.css';

const sanitizeName = (value: string) => {
  return value.replace(/[^a-zA-Z\s]/g, '').slice(0, 25);
};

const sanitizePhone = (value: string) => {
  return value.replace(/[^0-9]/g, '').slice(0, 10);
};

const sanitizeAadhaar = (value: string) => {
  return value.replace(/[^0-9]/g, '').slice(0, 12);
};

const sanitizeLettersOnly = (value: string) => {
  return value.replace(/[^a-zA-Z\s]/g, '');
};

const baseEducationLevels = ['PG', 'UG', '12th'];

const emptyEmployeeForm = {
  empId: '',
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
  reportingManagerName: ''
};

const EmployeeManagementPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState<string | undefined>(undefined);
  const [joiningDateFilter, setJoiningDateFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isViewMode, setIsViewMode] = useState(false);
  const [editingEmployeeId, setEditingEmployeeId] = useState<number | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isSameAddress, setIsSameAddress] = useState(false);
  const [newEmployee, setNewEmployee] = useState<any>(emptyEmployeeForm);

  const { data: employeesData, error } = useQuery(
    ['employees', appliedSearch, joiningDateFilter, statusFilter],
    () =>
      employeeService.getEmployees(
        1,
        20,
        appliedSearch,
        joiningDateFilter || undefined,
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

  const hasActiveFilters = Boolean(searchInput || joiningDateFilter || statusFilter);

  const sortedEmployees = React.useMemo(() => {
    if (!employeesData?.employees) return [];
    return [...employeesData.employees].sort((a, b) => {
      const aDate = new Date(a.joiningDate).getTime();
      const bDate = new Date(b.joiningDate).getTime();
      return aDate - bDate; // oldest first, most recent last
    });
  }, [employeesData]);

  const createMutation = useMutation(employeeService.createEmployee, {
    onSuccess: () => {
      queryClient.invalidateQueries('employees');
      setIsModalOpen(false);
      setNewEmployee(emptyEmployeeForm);
      setIsSameAddress(false);
      alert('Employee created successfully!');
    },
    onError: (error: any) => {
      alert(error.response?.data?.error?.message || 'Failed to create employee');
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
        alert('Employee updated successfully!');
      },
      onError: (error: any) => {
        alert(error.response?.data?.error?.message || 'Failed to update employee');
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
        permanentAddress: prev.currentAddress
      }));
    } else {
      setNewEmployee((prev: any) => ({
        ...prev,
        permanentAddress: ''
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
    if (isEmpty(newEmployee.firstName)) missingFields.push('First Name');
    if (isEmpty(newEmployee.lastName)) missingFields.push('Last Name');
    if (isEmpty(newEmployee.empId)) missingFields.push('Employee ID');
    if (isEmpty(newEmployee.email)) missingFields.push('Official Email');
    if (isEmpty(newEmployee.contactNumber)) missingFields.push('Contact Number');
    if (isEmpty(newEmployee.altContact)) missingFields.push('Alt Contact');
    if (isEmpty(newEmployee.dateOfBirth)) missingFields.push('Date of Birth');
    if (isEmpty(newEmployee.gender)) missingFields.push('Gender');
    if (isEmpty(newEmployee.bloodGroup)) missingFields.push('Blood Group');
    if (isEmpty(newEmployee.maritalStatus)) missingFields.push('Marital Status');
    if (isEmpty(newEmployee.emergencyContactName))
      missingFields.push('Emergency Contact Name');
    if (isEmpty(newEmployee.emergencyContactNo))
      missingFields.push('Emergency Contact No');

    // Employment information
    if (isEmpty(newEmployee.designation)) missingFields.push('Designation');
    if (isEmpty(newEmployee.department)) missingFields.push('Department');
    if (isEmpty(newEmployee.dateOfJoining)) missingFields.push('Date of Joining');
    if (isEmpty(newEmployee.reportingManagerName))
      missingFields.push('Reporting Manager');

    // Document information
    if (isEmpty(newEmployee.aadharNumber)) missingFields.push('Aadhar Number');
    if (isEmpty(newEmployee.panNumber)) missingFields.push('PAN Number');

    // Address information
    if (isEmpty(newEmployee.currentAddress)) missingFields.push('Current Address');
    if (isEmpty(newEmployee.permanentAddress))
      missingFields.push('Permanent Address');

    // Education information
    if (newEmployee.education && Array.isArray(newEmployee.education)) {
      newEmployee.education.forEach((edu: any) => {
        const levelLabel = edu.level || 'Education';
        if (isEmpty(edu.groupStream))
          missingFields.push(`${levelLabel} - Group/Stream`);
        if (isEmpty(edu.collegeUniversity))
          missingFields.push(`${levelLabel} - College/University`);
        if (isEmpty(edu.year)) missingFields.push(`${levelLabel} - Graduation Year`);
        if (isEmpty(edu.scorePercentage))
          missingFields.push(`${levelLabel} - Score %`);
      });
    }

    if (missingFields.length > 0) {
      alert(`Please fill all mandatory fields:\n- ${missingFields.join('\n- ')}`);
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
        alert(`${field.label} must be exactly 10 digits.`);
        return;
      }
    }

    const { reportingManagerName, ...rest } = newEmployee as any;

    const payload = {
      ...rest,
      role: 'employee'
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
        designation: data.designation || '',
        department: data.department || '',
        dateOfJoining: data.date_of_joining
          ? data.date_of_joining.split('T')[0]
          : today,
        aadharNumber: data.aadhar_number || '',
        panNumber: data.pan_number || '',
        currentAddress,
        permanentAddress: same ? currentAddress : permanentAddress,
        status: data.status || 'active',
        education,
        reportingManagerName: data.reporting_manager_name || ''
      });

      setIsSameAddress(same);
      setIsEditMode(mode === 'edit');
      setIsViewMode(mode === 'view');
      setEditingEmployeeId(employeeId);
      setIsModalOpen(true);
    } catch (error: any) {
      alert(error?.response?.data?.error?.message || 'Failed to load employee details');
    } finally {
      setIsDetailLoading(false);
    }
  };

  const handleEditEmployee = (employeeId: number) => openEmployeeModal(employeeId, 'edit');
  const handleViewEmployee = (employeeId: number) => openEmployeeModal(employeeId, 'view');

  const handleResetFilters = () => {
    setSearchInput('');
    setAppliedSearch(undefined);
    setJoiningDateFilter('');
    setStatusFilter('');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return '#4caf50';
      case 'resigned':
        return '#f44336';
      case 'terminated':
        return '#f44336';
      default:
        return '#666';
    }
  };

  if (error) {
    return (
      <AppLayout>
        <div className="employee-management-page">
          <div style={{ padding: '20px', textAlign: 'center', color: 'red' }}>
            {error?.response?.status === 403
              ? 'You do not have permission to view this page. HR access required.'
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
                    alert('Please type at least 3 characters to search.');
                    return;
                  }
                  setAppliedSearch(value);
                }
              }}
            />
            {searchInput && (
              <button
                type="button"
                className="clear-search-button"
                onClick={() => {
                  setSearchInput('');
                  setAppliedSearch(undefined);
                }}
              >
                ✕
              </button>
            )}
          </div>
          <div className="filter-box">
            <input
              type="date"
              value={joiningDateFilter}
              onChange={(e) => setJoiningDateFilter(e.target.value)}
            />
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              className="reset-filters-button"
              onClick={handleResetFilters}
            >
              Reset
            </button>
          )}
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
                        style={{ color: getStatusColor(employee.status) }}
                      >
                        {employee.status === 'active'
                          ? 'Active'
                          : employee.status === 'resigned'
                          ? 'Resigned'
                          : 'Terminated'}
                      </span>
                    </td>
                    <td className="actions-cell">
                      <span
                        className="action-icon"
                        title="View"
                        onClick={() => handleViewEmployee(employee.id)}
                      >
                        👁️
                      </span>
                      <span
                        className="action-icon"
                        title="Edit"
                        onClick={() => handleEditEmployee(employee.id)}
                      >
                        ✏️
                      </span>
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
                    if (createMutation.isLoading || updateEmployeeMutation.isLoading) {
                      return;
                    }
                    setIsModalOpen(false);
                    setIsEditMode(false);
                    setEditingEmployeeId(null);
                  }}
                  disabled={createMutation.isLoading || updateEmployeeMutation.isLoading}
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
                        value={newEmployee.empId}
                        onChange={(e) =>
                          setNewEmployee({ ...newEmployee, empId: e.target.value })
                        }
                        disabled={isEditMode || isViewMode}
                      />
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
                        disabled={isEditMode || isViewMode}
                      />
                    </div>
                    <div className="employee-modal-field">
                      <label>
                        Contact Number<span className="required-indicator">*</span>
                      </label>
                      <input
                        type="text"
                        value={newEmployee.contactNumber}
                        onChange={(e) =>
                          setNewEmployee({
                            ...newEmployee,
                            contactNumber: sanitizePhone(e.target.value)
                          })
                        }
                        disabled={isViewMode}
                      />
                    </div>
                    <div className="employee-modal-field">
                      <label>
                        Alt Contact<span className="required-indicator">*</span>
                      </label>
                      <input
                        type="text"
                        value={newEmployee.altContact}
                        onChange={(e) =>
                          setNewEmployee({
                            ...newEmployee,
                            altContact: sanitizePhone(e.target.value)
                          })
                        }
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
                        value={newEmployee.emergencyContactNo}
                        onChange={(e) =>
                          setNewEmployee({
                            ...newEmployee,
                            emergencyContactNo: sanitizePhone(e.target.value)
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
                          value={newEmployee.status}
                          onChange={(e) =>
                            setNewEmployee({
                              ...newEmployee,
                              status: e.target.value as
                                | 'active'
                                | 'on_leave'
                                | 'resigned'
                                | 'terminated'
                            })
                          }
                        >
                          <option value="active">Active</option>
                          <option value="resigned">Resigned</option>
                          <option value="terminated">Terminated</option>
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
                        value={newEmployee.aadharNumber}
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
                          setNewEmployee({ ...newEmployee, panNumber: e.target.value })
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
                      Current Address<span className="required-indicator">*</span>
                    </label>
                    <textarea
                      rows={3}
                      value={newEmployee.currentAddress}
                      onChange={(e) =>
                        setNewEmployee((prev: any) => ({
                          ...prev,
                          currentAddress: e.target.value,
                          permanentAddress: isSameAddress
                            ? e.target.value
                            : prev.permanentAddress
                        }))
                      }
                      disabled={isViewMode}
                    />
                  </div>
                  <div className="employee-modal-field full-width">
                    <label>
                      Permanent Address<span className="required-indicator">*</span>
                    </label>
                    <textarea
                      rows={3}
                      value={newEmployee.permanentAddress}
                      onChange={(e) =>
                        setNewEmployee({
                          ...newEmployee,
                          permanentAddress: e.target.value
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
                      Same as Current Address
                    </label>
                  </div>
                </div>

                <div className="employee-modal-section">
                  <h3>Education Information</h3>
                  <table className="education-table">
                    <thead>
                      <tr>
                        <th className="education-level-col"></th>
                        <th>
                          Group/Stream<span className="required-indicator">*</span>
                        </th>
                        <th>
                          College/University<span className="required-indicator">*</span>
                        </th>
                        <th>
                          Graduation Year<span className="required-indicator">*</span>
                        </th>
                        <th>
                          Score %<span className="required-indicator">*</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {newEmployee.education?.map((edu: any, idx: number) => (
                        <tr key={edu.level}>
                          <td className="education-level-cell">{edu.level}</td>
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

                <div className="employee-modal-section">
                  <h3>Reporting Hierarchy</h3>
                  <div className="employee-modal-field full-width">
                    <label>
                      Reporting Manager<span className="required-indicator">*</span>
                    </label>
                    <input
                      type="text"
                      value={newEmployee.reportingManagerName || ''}
                      onChange={(e) =>
                        setNewEmployee({
                          ...newEmployee,
                          reportingManagerName: e.target.value
                        })
                      }
                      disabled={isEditMode || isViewMode}
                    />
                  </div>
                </div>
              </div>

              <div className="employee-modal-footer">
                {isViewMode ? (
                  <button
                    type="button"
                    className="modal-cancel-button"
                    onClick={() => {
                      if (createMutation.isLoading || updateEmployeeMutation.isLoading) {
                        return;
                      }
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
                        if (
                          createMutation.isLoading ||
                          updateEmployeeMutation.isLoading
                        ) {
                          return;
                        }
                        setIsModalOpen(false);
                        setIsEditMode(false);
                        setIsViewMode(false);
                        setEditingEmployeeId(null);
                      }}
                      disabled={
                        createMutation.isLoading || updateEmployeeMutation.isLoading
                      }
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="modal-save-button"
                      onClick={handleCreateEmployee}
                      disabled={
                        createMutation.isLoading || updateEmployeeMutation.isLoading
                      }
                    >
                      {isEditMode ? 'Save Changes' : 'Save'}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default EmployeeManagementPage;

