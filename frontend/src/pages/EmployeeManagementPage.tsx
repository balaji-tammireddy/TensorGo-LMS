import React, { useState, useEffect } from 'react';
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
import EmptyState from '../components/common/EmptyState';
import { Button } from '../components/ui/button';
import { ChevronDown } from 'lucide-react';
import * as employeeService from '../services/employeeService';
import { getReportingManagers } from '../services/profileService';
import * as leaveService from '../services/leaveService';
import { format } from 'date-fns';
import { FaEye, FaPencilAlt, FaTrash, FaCalendarPlus, FaSort, FaSortUp, FaSortDown } from 'react-icons/fa';
import { useAuth } from '../contexts/AuthContext';
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

const EmployeeManagementPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { showSuccess, showError, showWarning } = useToast();
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState<string | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
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
  const [selectedEmployeeForLeaves, setSelectedEmployeeForLeaves] = useState<{ id: number; name: string; status: string } | null>(null);
  const [showLeaveHistory, setShowLeaveHistory] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, boolean>>({});
  const [managerSearch, setManagerSearch] = useState('');
  const [appliedManagerSearch, setAppliedManagerSearch] = useState<string | undefined>(undefined);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'empId', direction: 'asc' });

  const handleSort = (key: string) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const { data: managersData } = useQuery(
    ['reporting-managers', newEmployee.role, editingEmployeeId, appliedManagerSearch],
    () => getReportingManagers(appliedManagerSearch, newEmployee.role, editingEmployeeId || undefined),
    {
      retry: false,
      staleTime: 0,
      cacheTime: 5 * 60 * 1000,
      keepPreviousData: true,
      enabled: isModalOpen && !!newEmployee.role
    }
  );

  const { data: leaveHistoryData, isLoading: leaveHistoryLoading, refetch: refetchLeaveHistory } = useQuery(
    ['employee-leave-requests', editingEmployeeId],
    () => leaveService.getEmployeeLeaveRequests(editingEmployeeId!, 1, 100),
    {
      retry: false,
      staleTime: 0,
      refetchInterval: 5000, // Reduced to 5 seconds for immediate updates
      cacheTime: 5 * 60 * 1000,
      keepPreviousData: true,
      enabled: showLeaveHistory && !!editingEmployeeId && (user?.role === 'hr' || user?.role === 'super_admin')
    }
  );

  const { data: employeesData, isLoading: employeesLoading, error } = useQuery(
    ['employees', appliedSearch, statusFilter, roleFilter],
    () =>
      employeeService.getEmployees(
        1,
        20,
        appliedSearch,
        undefined,
        statusFilter || undefined,
        roleFilter || undefined
      ),
    {
      retry: false,
      staleTime: 0,
      refetchInterval: 5000, // Reduced to 5 seconds for immediate updates
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
      if (term.length > 0) {
        setAppliedSearch(term);
      } else {
        setAppliedSearch(undefined);
      }
    }, 500); // 500ms debounce

    return () => clearTimeout(timer);
  }, [searchInput]);

  // Debounce manager search input
  useEffect(() => {
    const term = managerSearch.trim();
    const timer = setTimeout(() => {
      setAppliedManagerSearch(term || undefined);
    }, 300); // 300ms debounce

    return () => clearTimeout(timer);
  }, [managerSearch]);

  // Scroll modal body to top when showing leave history
  useEffect(() => {
    if (showLeaveHistory && isModalOpen) {
      const modalBody = document.querySelector('.employee-modal-body');
      if (modalBody) {
        modalBody.scrollTop = 0;
      }
    }
  }, [showLeaveHistory, isModalOpen]);



  const sortedEmployees = React.useMemo(() => {
    if (!employeesData?.employees) return [];
    return [...employeesData.employees].sort((a, b) => {
      if (sortConfig.key === 'empId') {
        const aId = parseInt(a.empId) || 0;
        const bId = parseInt(b.empId) || 0;
        return sortConfig.direction === 'asc' ? aId - bId : bId - aId;
      } else if (sortConfig.key === 'joiningDate') {
        const aDate = new Date(a.joiningDate + 'T00:00:00').getTime();
        const bDate = new Date(b.joiningDate + 'T00:00:00').getTime();
        return sortConfig.direction === 'asc' ? aDate - bDate : bDate - aDate;
      }
      return 0;
    });
  }, [employeesData, sortConfig]);

  const createMutation = useMutation(employeeService.createEmployee, {
    onSuccess: () => {
      queryClient.invalidateQueries('employees');
      setIsModalOpen(false);
      setNewEmployee(emptyEmployeeForm);
      setIsSameAddress(false);
      showSuccess('Employee created!');
    },
    onError: (error: any) => {
      showError(error.response?.data?.error?.message || 'CreationFailed');
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
        showSuccess('Employee updated!');
      },
      onError: (error: any) => {
        showError(error.response?.data?.error?.message || 'Update failed');
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
        showSuccess('Employee deleted!');
      },
      onError: (error: any) => {
        showError(error.response?.data?.error?.message || 'Delete failed');
      }
    }
  );

  const addLeavesMutation = useMutation(
    ({ employeeId, leaveType, count, comment }: { employeeId: number; leaveType: 'casual' | 'sick' | 'lop'; count: number; comment?: string }) =>
      employeeService.addLeavesToEmployee(employeeId, leaveType, count, comment),
    {
      onSuccess: (_, variables) => {
        queryClient.invalidateQueries('employees');
        queryClient.invalidateQueries(['employeeLeaveBalances', variables.employeeId]);
        queryClient.invalidateQueries('leaveBalances');
        queryClient.invalidateQueries('myLeaveRequests');
        setAddLeavesModalOpen(false);
        setSelectedEmployeeForLeaves(null);
        showSuccess('Leaves added!');
      },
      onError: (error: any) => {
        showError(error.response?.data?.error?.message || 'Failed to add leaves');
      }
    }
  );

  const handleOpenAddEmployee = () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    setNewEmployee({ ...emptyEmployeeForm, dateOfJoining: today });
    setIsSameAddress(false);
    setIsEditMode(false);
    setIsViewMode(false);
    setEditingEmployeeId(null);
    setFormErrors({});
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
    const fieldErrors: Record<string, boolean> = {};

    const isEmpty = (value: any) =>
      value === undefined ||
      value === null ||
      (typeof value === 'string' && value.trim() === '');

    const checkField = (field: string, label: string) => {
      if (isEmpty(newEmployee[field])) {
        missingFields.push(label);
        fieldErrors[field] = true;
      }
    };

    // Personal information (except Middle Name)
    checkField('role', 'Role');
    checkField('firstName', 'First Name');
    checkField('lastName', 'Last Name');

    if (isEmpty(newEmployee.empId)) {
      missingFields.push('Employee ID');
      fieldErrors['empId'] = true;
    } else if (newEmployee.empId.length > 20) {
      showWarning('Employee ID max 20 chars');
      fieldErrors['empId'] = true;
      setFormErrors(fieldErrors);
      return;
    }

    if (isEmpty(newEmployee.email)) {
      missingFields.push('Official Email');
      fieldErrors['email'] = true;
    } else {
      const email = newEmployee.email.toLowerCase();
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

    // Employment information
    checkField('designation', 'Designation');
    checkField('department', 'Department');
    checkField('dateOfJoining', 'Date of Joining');

    // Validate gap between Date of Birth and Date of Joining (min 18 years)
    if (newEmployee.dateOfBirth && newEmployee.dateOfJoining) {
      const dob = new Date(newEmployee.dateOfBirth);
      const doj = new Date(newEmployee.dateOfJoining);

      let workAge = doj.getFullYear() - dob.getFullYear();
      const monthDiff = doj.getMonth() - dob.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && doj.getDate() < dob.getDate())) {
        workAge--;
      }

      if (workAge < 18) {
        showWarning('Joining Date must be at least 18 years after Date of Birth');
        fieldErrors['dateOfJoining'] = true;
        setFormErrors(fieldErrors);
        return;
      }
    }

    // Date of Joining must not be in the future
    if (newEmployee.dateOfJoining) {
      const doj = new Date(newEmployee.dateOfJoining);
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      if (doj > today) {
        showWarning('Date of Joining cannot be in the future');
        fieldErrors['dateOfJoining'] = true;
        setFormErrors(fieldErrors);
        return;
      }
    }

    // Reporting manager is required for all roles except super_admin
    if (newEmployee.role !== 'super_admin' && !newEmployee.reportingManagerId) {
      missingFields.push('Reporting Manager');
      fieldErrors['reportingManagerId'] = true;
    }

    // Document information
    checkField('aadharNumber', 'Aadhar Number');
    if (isEmpty(newEmployee.panNumber)) {
      missingFields.push('PAN Number');
      fieldErrors['panNumber'] = true;
    } else {
      const panError = validatePan(newEmployee.panNumber);
      if (panError) {
        showWarning(panError);
        fieldErrors['panNumber'] = true;
        setFormErrors(fieldErrors);
        return;
      }
    }

    // Address information
    checkField('currentAddress', 'Current Address');
    checkField('permanentAddress', 'Permanent Address');

    // Education information (PG optional, UG and 12th mandatory)
    if (newEmployee.education && Array.isArray(newEmployee.education)) {
      const currentYear = new Date().getFullYear();
      const maxYear = currentYear + 5;
      let yearValidationError: string | null = null;

      let isPgValid = true;
      newEmployee.education.forEach((edu: any, index: number) => {
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
              if (isEmpty(f.value)) {
                fieldErrors[`edu_${index}_${f.key}`] = true;
              }
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

      // Range validation: Minimum 15 years gap between Date of Birth and Graduation Year
      if (newEmployee.dateOfBirth) {
        const birthYear = new Date(newEmployee.dateOfBirth).getFullYear();
        for (let i = 0; i < newEmployee.education.length; i++) {
          const edu = newEmployee.education[i];
          if (edu.year && !isEmpty(edu.year)) {
            const gradYear = parseInt(edu.year, 10);
            if (!isNaN(gradYear) && gradYear - birthYear < 15) {
              showWarning(`Minimum 15 years gap required between Date of Birth and ${edu.level} Graduation Year`);
              fieldErrors[`edu_${i}_year`] = true;
              setFormErrors(fieldErrors);
              return;
            }
          }
        }
      }

      // Chronological validation: 12th < UG < PG
      const pgYear = parseInt(newEmployee.education.find((e: any) => e.level === 'PG')?.year, 10);
      const ugYear = parseInt(newEmployee.education.find((e: any) => e.level === 'UG')?.year, 10);
      const hscYear = parseInt(newEmployee.education.find((e: any) => e.level === '12th')?.year, 10);

      if (!isNaN(ugYear) && !isNaN(hscYear) && hscYear >= ugYear) {
        showWarning('12th Graduation Year must be before UG Graduation Year');
        const hscIndex = newEmployee.education.findIndex((e: any) => e.level === '12th');
        fieldErrors[`edu_${hscIndex}_year`] = true;
        setFormErrors(fieldErrors);
        return;
      }

      if (!isNaN(pgYear) && !isNaN(ugYear) && ugYear >= pgYear) {
        showWarning('UG Graduation Year must be before PG Graduation Year');
        const ugIndex = newEmployee.education.findIndex((e: any) => e.level === 'UG');
        fieldErrors[`edu_${ugIndex}_year`] = true;
        setFormErrors(fieldErrors);
        return;
      }
    }

    setFormErrors(fieldErrors);

    if (missingFields.length > 0) {
      showWarning('Please Fill All Mandatory Details');
      return;
    }

    if (newEmployee.aadharNumber && newEmployee.aadharNumber.length !== 12) {
      showWarning('Aadhar must be 12 digits');
      setFormErrors({ ...fieldErrors, aadharNumber: true });
      return;
    }

    const phoneFields = [
      {
        value: newEmployee.contactNumber,
        label: 'Contact Number',
        key: 'contactNumber'
      },
      {
        value: newEmployee.altContact,
        label: 'Alternate Contact Number',
        key: 'altContact'
      },
      {
        value: newEmployee.emergencyContactNo,
        label: 'Emergency Contact Number',
        key: 'emergencyContactNo'
      }
    ];

    for (const field of phoneFields) {
      const v = field.value || '';
      if (v.length !== 10) {
        showWarning(`${field.label} must be 10 digits`);
        setFormErrors({ ...fieldErrors, [field.key]: true });
        return;
      }
    }

    // Check for duplicate phone numbers
    if (newEmployee.contactNumber === newEmployee.altContact) {
      showWarning('Contact Number and Alternate Contact Number cannot be the same');
      setFormErrors({ ...fieldErrors, altContact: true });
      return;
    }
    if (newEmployee.altContact === newEmployee.emergencyContactNo) {
      showWarning('Alternate Contact Number and Emergency Contact Number cannot be the same');
      setFormErrors({ ...fieldErrors, emergencyContactNo: true });
      return;
    }
    if (newEmployee.contactNumber === newEmployee.emergencyContactNo) {
      showWarning('Contact Number and Emergency Contact Number cannot be the same');
      setFormErrors({ ...fieldErrors, emergencyContactNo: true });
      return;
    }

    // Sanitize payload: remove any snake_case keys that might have leaked in
    const sanitizedNewEmployee = Object.keys(newEmployee).reduce((acc: any, key) => {
      if (!key.includes('_')) {
        acc[key] = newEmployee[key];
      }
      return acc;
    }, {});

    const payload = {
      ...sanitizedNewEmployee,
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
      console.log('Employee data received:', data);

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

      const today = format(new Date(), 'yyyy-MM-dd');

      const employeeDetail = data.employee || data;

      setNewEmployee({
        ...emptyEmployeeForm,
        empId: employeeDetail.emp_id || '',
        role: employeeDetail.role || '',
        email: employeeDetail.email || '',
        firstName: employeeDetail.first_name || '',
        middleName: employeeDetail.middle_name || '',
        lastName: employeeDetail.last_name || '',
        contactNumber: employeeDetail.contact_number || employeeDetail.contactNumber || '',
        altContact: employeeDetail.alt_contact || employeeDetail.altContact || '',
        dateOfBirth: employeeDetail.date_of_birth ? (typeof employeeDetail.date_of_birth === 'string' ? employeeDetail.date_of_birth.split('T')[0] : employeeDetail.date_of_birth.toISOString().split('T')[0]) : '',
        gender: employeeDetail.gender || '',
        bloodGroup: employeeDetail.blood_group || '',
        maritalStatus: employeeDetail.marital_status || '',
        emergencyContactName: employeeDetail.emergency_contact_name || '',
        emergencyContactNo: employeeDetail.emergency_contact_no || '',
        emergencyContactRelation: employeeDetail.emergency_contact_relation || '',
        designation: employeeDetail.designation || '',
        department: employeeDetail.department || '',
        dateOfJoining: employeeDetail.date_of_joining
          ? employeeDetail.date_of_joining.split('T')[0]
          : today,
        aadharNumber: employeeDetail.aadhar_number || '',
        panNumber: employeeDetail.pan_number || '',
        currentAddress: same ? permanentAddress : currentAddress,
        permanentAddress,
        status: employeeDetail.status || 'active',
        education,
        reportingManagerName: employeeDetail.reporting_manager_full_name || employeeDetail.reporting_manager_name || '',
        reportingManagerId: employeeDetail.reporting_manager_id || null,
        subordinateCount: employeeDetail.subordinate_count ? parseInt(String(employeeDetail.subordinate_count), 10) : 0
      });

      setIsSameAddress(same);
      setIsEditMode(mode === 'edit');
      setIsViewMode(mode === 'view');
      setEditingEmployeeId(employeeId);
      setIsModalOpen(true);
    } catch (error: any) {
      showError(error?.response?.data?.error?.message || 'Load failed');
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

  const handleAddLeaves = (employeeId: number, employeeName: string, employeeStatus: string) => {
    setSelectedEmployeeForLeaves({ id: employeeId, name: employeeName, status: employeeStatus });
    setAddLeavesModalOpen(true);
  };

  const handleAddLeavesSubmit = (leaveType: 'casual' | 'sick' | 'lop', count: number, comment?: string) => {
    if (selectedEmployeeForLeaves) {
      addLeavesMutation.mutate({
        employeeId: selectedEmployeeForLeaves.id,
        leaveType,
        count,
        comment
      });
    }
  };



  const getStatusClass = (status: string) => {
    switch (status) {
      case 'active': return 'status-active';
      case 'on_notice': return 'status-on-notice';
      case 'on_leave': return 'status-on-leave';
      case 'resigned': return 'status-resigned';
      case 'terminated': return 'status-terminated';
      default: return 'status-inactive';
    }
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
              placeholder="Search by Name or Emp ID..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value.replace(/[^a-zA-Z0-9 ]/g, ''))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const value = e.currentTarget.value.trim();
                  if (value.length > 0) {
                    setAppliedSearch(value);
                  } else {
                    setAppliedSearch(undefined);
                  }
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
                    height: 'auto',
                    minWidth: '140px',
                    justifyContent: 'space-between',
                    whiteSpace: 'nowrap'
                  }}
                >
                  <span>
                    {statusFilter === '' ? 'All Status' :
                      statusFilter === 'active' ? 'Active' :
                        statusFilter === 'on_notice' ? 'On Notice' :
                          'Inactive'}
                  </span>
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
                  onClick={() => setStatusFilter('on_notice')}
                >
                  On Notice
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

        <div className={`employees-section employees-table-wrapper ${employeesLoading && sortedEmployees.length > 0 ? 'fetching' : ''}`}>
          {employeesLoading && sortedEmployees.length === 0 ? (
            <div className="skeleton-table">
              {Array.from({ length: 5 }).map((_, idx) => (
                <div key={idx} className="skeleton-table-row"></div>
              ))}
            </div>
          ) : (
            <table className="employees-table">
              <thead>
                <tr>
                  <th>S No</th>
                  <th className="sortable-header" onClick={() => handleSort('empId')}>
                    <div className="header-sort-wrapper">
                      Emp ID
                      {sortConfig.key === 'empId' ? (
                        sortConfig.direction === 'asc' ? <FaSortUp className="sort-icon active" /> : <FaSortDown className="sort-icon active" />
                      ) : (
                        <FaSort className="sort-icon" />
                      )}
                    </div>
                  </th>
                  <th>Emp Name</th>
                  <th>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      Role
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            style={{
                              padding: '0 4px',
                              height: '20px',
                              border: roleFilter ? '1px solid #2563eb' : 'none',
                              backgroundColor: roleFilter ? '#eff6ff' : 'transparent',
                              color: roleFilter ? '#2563eb' : 'inherit'
                            }}
                          >
                            <ChevronDown style={{ width: '12px', height: '12px' }} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onClick={() => setRoleFilter('')}>
                            All Roles
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {['super_admin', 'hr', 'manager', 'employee', 'intern'].map((role) => (
                            <DropdownMenuItem key={role} onClick={() => setRoleFilter(role)}>
                              {role === 'super_admin' ? 'Super Admin' :
                                role === 'hr' ? 'HR' :
                                  role.charAt(0).toUpperCase() + role.slice(1)}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </th>
                  <th className="sortable-header" onClick={() => handleSort('joiningDate')}>
                    <div className="header-sort-wrapper">
                      Joining Date
                      {sortConfig.key === 'joiningDate' ? (
                        sortConfig.direction === 'asc' ? <FaSortUp className="sort-icon active" /> : <FaSortDown className="sort-icon active" />
                      ) : (
                        <FaSort className="sort-icon" />
                      )}
                    </div>
                  </th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedEmployees.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: 0 }}>
                      <EmptyState
                        title="No Employees Found"
                        description="Try adjusting your search or filters to find what you're looking for."
                      />
                    </td>
                  </tr>
                ) : (
                  sortedEmployees.map((employee, idx) => (
                    <tr key={employee.id}>
                      <td>{idx + 1}</td>
                      <td>{employee.empId}</td>
                      <td>{employee.name}</td>
                      <td>
                        {getRoleLabel(employee.role)}
                      </td>
                      <td>{format(new Date(employee.joiningDate), 'dd/MM/yyyy')}</td>
                      <td>
                        <span className={`status-badge ${getStatusClass(employee.status)}`}>
                          {employee.status === 'active' ? 'Active' :
                            employee.status === 'on_notice' ? 'On Notice' :
                              'Inactive'}
                        </span>
                      </td>
                      <td>
                        <div className="actions-wrapper">
                          <button
                            className="action-btn view-btn"
                            title="View"
                            onClick={() => handleViewEmployee(employee.id)}
                          >
                            <FaEye />
                          </button>
                          {/* HR cannot edit super_admin or other HR users or their own details */}
                          {!(user?.role === 'hr' && (employee.role === 'super_admin' || employee.role === 'hr')) && (
                            <button
                              className="action-btn edit-btn"
                              title="Edit"
                              onClick={() => handleEditEmployee(employee.id)}
                            >
                              <FaPencilAlt />
                            </button>
                          )}
                          {/* HR and Super Admin can add leaves, but HR cannot add to themselves or super_admin or other HR, and Super Admin cannot add to themselves */}
                          {/* Also hide for inactive/resigned/terminated employees */}
                          {((user?.role === 'hr' && employee.role !== 'super_admin' && employee.role !== 'hr') ||
                            (user?.role === 'super_admin' && employee.id !== user.id && employee.role !== 'super_admin')) &&
                            (employee.status !== 'inactive' && employee.status !== 'terminated' && employee.status !== 'resigned') && (
                              <button
                                className="action-btn add-leaves-btn"
                                title="Add Leaves"
                                onClick={() => handleAddLeaves(employee.id, employee.name, employee.status)}
                              >
                                <FaCalendarPlus />
                              </button>
                            )}
                          {/* Super Admin can delete employees but not themselves */}
                          {user?.role === 'super_admin' && employee.id !== user.id && (
                            <button
                              className="action-btn delete-btn"
                              title="Delete"
                              onClick={() => handleDelete(employee.id)}
                            >
                              <FaTrash />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
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
                    setShowLeaveHistory(false);
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
                {showLeaveHistory ? (
                  <div className="employee-modal-section" style={{ marginTop: 0, marginBottom: 0 }}>
                    <h3 style={{ marginTop: 0 }}>Leave History</h3>
                    {leaveHistoryLoading ? (
                      <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
                        Loading leave history...
                      </div>
                    ) : leaveHistoryData?.requests && leaveHistoryData.requests.length > 0 ? (
                      <div style={{ marginTop: '8px', width: '100%', overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', minWidth: '100%' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid #e5e5e5', backgroundColor: '#f8f9fa', position: 'sticky', top: 0, zIndex: 1 }}>
                              <th style={{ padding: '8px', textAlign: 'left', fontWeight: 600 }}>Applied Date</th>
                              <th style={{ padding: '8px', textAlign: 'left', fontWeight: 600 }}>Leave Type</th>
                              <th style={{ padding: '8px', textAlign: 'left', fontWeight: 600 }}>Start Date</th>
                              <th style={{ padding: '8px', textAlign: 'left', fontWeight: 600 }}>End Date</th>
                              <th style={{ padding: '8px', textAlign: 'left', fontWeight: 600 }}>Days</th>
                              <th style={{ padding: '8px', textAlign: 'left', fontWeight: 600 }}>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {leaveHistoryData.requests.map((request: any) => {
                              const getStatusClass = (status: string) => {
                                if (status === 'approved') return 'status-approved';
                                if (status === 'rejected') return 'status-rejected';
                                if (status === 'partially_approved') return 'status-partial';
                                return 'status-pending';
                              };
                              const getStatusLabel = (status: string) => {
                                if (status === 'approved') return 'Approved';
                                if (status === 'rejected') return 'Rejected';
                                if (status === 'partially_approved') return 'Partially Approved';
                                return 'Pending';
                              };
                              return (
                                <tr key={request.id} style={{ borderBottom: '1px solid #e5e5e5' }}>
                                  <td style={{ padding: '8px' }}>{format(new Date(request.appliedDate + 'T12:00:00'), 'dd/MM/yyyy')}</td>
                                  <td style={{ padding: '8px' }}>{request.leaveType === 'lop' ? 'LOP' : request.leaveType.charAt(0).toUpperCase() + request.leaveType.slice(1)}</td>
                                  <td style={{ padding: '8px' }}>{format(new Date(request.startDate + 'T12:00:00'), 'dd/MM/yyyy')}</td>
                                  <td style={{ padding: '8px' }}>{format(new Date(request.endDate + 'T12:00:00'), 'dd/MM/yyyy')}</td>
                                  <td style={{ padding: '8px' }}>{request.noOfDays}</td>
                                  <td style={{ padding: '8px' }}>
                                    <span className={`status-badge ${getStatusClass(request.currentStatus)}`}>
                                      {getStatusLabel(request.currentStatus)}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <EmptyState
                        title="No Leave History"
                        description="This employee hasn't applied for any leaves yet."
                      />
                    )}
                  </div>
                ) : (
                  <>
                    <div className="employee-modal-section">
                      <h3>Personal Information</h3>
                      <div className="employee-modal-grid">
                        <div className={`employee-modal-field employee-id-field ${formErrors.empId ? 'has-error' : ''}`}>
                          <label>
                            Employee ID<span className="required-indicator">*</span>
                          </label>
                          <input
                            type="text"
                            value={newEmployee.empId || ''}
                            onChange={(e) => {
                              // Limit to 20 characters, alphanumeric and hyphens
                              const value = e.target.value.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 20).toUpperCase();
                              setNewEmployee({
                                ...newEmployee,
                                empId: value
                              });
                            }}
                            maxLength={20}
                            disabled={isViewMode || (isEditMode && user?.role !== 'super_admin')}
                          />
                        </div>
                        <div className={`employee-modal-field employee-role-field ${formErrors.role ? 'has-error' : ''}`}>
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
                                ? ['intern', 'employee', 'manager', 'hr', 'super_admin']
                                : user?.role === 'hr'
                                  ? ['intern', 'employee', 'manager', 'hr']
                                  : ['employee']
                              ).map((role, index, array) => (
                                <React.Fragment key={role}>
                                  <DropdownMenuItem
                                    onSelect={(e) => {
                                      e.preventDefault();

                                      const subCount = newEmployee.subordinateCount ? parseInt(String(newEmployee.subordinateCount), 10) : 0;

                                      if (isEditMode && subCount > 0 && newEmployee.role !== role) {
                                        const name = `${newEmployee.firstName} ${newEmployee.lastName || ''}`.trim();
                                        showWarning(`Please remove the users reporting to ${name} and try again.`);
                                        return;
                                      }

                                      const newRole = role;
                                      setNewEmployee({
                                        ...newEmployee,
                                        role: newRole,
                                        reportingManagerId: null,
                                        reportingManagerName: ''
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
                        <div className={`employee-modal-field ${formErrors.firstName ? 'has-error' : ''}`}>
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
                        <div className={`employee-modal-field ${formErrors.lastName ? 'has-error' : ''}`}>
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
                        <div className={`employee-modal-field ${formErrors.email ? 'has-error' : ''}`}>
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
                        <div className={`employee-modal-field ${formErrors.contactNumber ? 'has-error' : ''}`}>
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
                        <div className={`employee-modal-field ${formErrors.altContact ? 'has-error' : ''}`}>
                          <label>
                            Alternate Contact Number<span className="required-indicator">*</span>
                          </label>
                          <input
                            type="text"
                            inputMode="numeric"
                            maxLength={10}
                            value={newEmployee.altContact}
                            onChange={(e) => {
                              const input = e.target;
                              const cursorPosition = input.selectionStart || 0;
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
                        <div className={`employee-modal-field ${formErrors.dateOfBirth ? 'has-error' : ''}`}>
                          <label>
                            Date of Birth<span className="required-indicator">*</span>
                          </label>
                          <DatePicker
                            value={newEmployee.dateOfBirth}
                            onChange={(date) =>
                              setNewEmployee({ ...newEmployee, dateOfBirth: date })
                            }
                            disabled={isViewMode}
                            placeholder="DD-MM-YYYY"
                            max={format(new Date(), 'yyyy-MM-dd')}
                            allowManualEntry={true}
                            isEmployeeVariant={true}
                          />
                        </div>
                        <div className={`employee-modal-field ${formErrors.gender ? 'has-error' : ''}`}>
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
                        <div className={`employee-modal-field ${formErrors.bloodGroup ? 'has-error' : ''}`}>
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
                        <div className={`employee-modal-field ${formErrors.maritalStatus ? 'has-error' : ''}`}>
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
                        <div className={`employee-modal-field ${formErrors.emergencyContactName ? 'has-error' : ''}`}>
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
                        <div className={`employee-modal-field ${formErrors.emergencyContactNo ? 'has-error' : ''}`}>
                          <label>
                            Emergency Contact Number<span className="required-indicator">*</span>
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
                        <div className={`employee-modal-field ${formErrors.emergencyContactRelation ? 'has-error' : ''}`}>
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
                        <div className={`employee-modal-field ${formErrors.designation ? 'has-error' : ''}`}>
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
                        <div className={`employee-modal-field ${formErrors.department ? 'has-error' : ''}`}>
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
                        <div className={`employee-modal-field ${formErrors.dateOfJoining ? 'has-error' : ''}`}>
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
                            placeholder="DD-MM-YYYY"
                            allowManualEntry={true}
                            isEmployeeVariant={true}
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
                                  <span>
                                    {newEmployee.status === 'active' ? 'Active' :
                                      newEmployee.status === 'on_notice' ? 'On Notice' :
                                        'Inactive'}
                                  </span>
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
                                    status: 'on_notice'
                                  })}
                                >
                                  On Notice
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => setNewEmployee({
                                    ...newEmployee,
                                    status: 'inactive'
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
                        <div className={`employee-modal-field ${formErrors.aadharNumber ? 'has-error' : ''}`}>
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
                        <div className={`employee-modal-field ${formErrors.panNumber ? 'has-error' : ''}`}>
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
                            onBlur={() => {
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
                      <div className={`employee-modal-field full-width ${formErrors.permanentAddress ? 'has-error' : ''}`}>
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
                      <div className={`employee-modal-field full-width ${formErrors.currentAddress ? 'has-error' : ''}`}>
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
                            <tr key={edu.level} className={(formErrors[`edu_${idx}_groupStream`] || formErrors[`edu_${idx}_collegeUniversity`] || formErrors[`edu_${idx}_year`] || formErrors[`edu_${idx}_scorePercentage`]) ? 'has-error' : ''}>
                              <td className="education-level-cell">
                                {formatEducationLevel(edu.level)}
                                {(edu.level === 'UG' || edu.level === '12th') && (
                                  <span className="required-indicator">*</span>
                                )}
                              </td>
                              <td className={formErrors[`edu_${idx}_groupStream`] ? 'has-error' : ''}>
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
                              <td className={formErrors[`edu_${idx}_collegeUniversity`] ? 'has-error' : ''}>
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
                              <td className={formErrors[`edu_${idx}_year`] ? 'has-error' : ''}>
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
                              <td className={formErrors[`edu_${idx}_scorePercentage`] ? 'has-error' : ''}>
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
                        <div className={`employee-modal-field full-width ${formErrors.reportingManagerId ? 'has-error' : ''}`}>
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
                            <DropdownMenu onOpenChange={(open) => !open && setManagerSearch('')}>
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
                              <DropdownMenuContent
                                side="top"
                                align="start"
                                className="leave-type-dropdown-content"
                                style={{ maxHeight: '300px', overflowY: 'auto', minWidth: '250px' }}
                              >
                                <div className="manager-search-wrapper" style={{ padding: '8px', borderBottom: '1px solid #eee', position: 'sticky', top: 0, backgroundColor: 'white', zIndex: 1 }}>
                                  <input
                                    type="text"
                                    placeholder="Search by name or ID..."
                                    value={managerSearch}
                                    onChange={(e) => setManagerSearch(e.target.value)}
                                    autoFocus
                                    style={{
                                      width: '100%',
                                      padding: '8px 12px',
                                      fontSize: '13px',
                                      border: '1px solid #ddd',
                                      borderRadius: '4px',
                                      fontFamily: 'Poppins, sans-serif'
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                </div>
                                {managersData?.length === 0 ? (
                                  <div style={{ padding: '12px', textAlign: 'center', fontSize: '13px', color: '#666' }}>
                                    No managers found
                                  </div>
                                ) : (
                                  managersData?.map((manager: any, index: number) => (
                                    <React.Fragment key={manager.id}>
                                      <DropdownMenuItem
                                        onClick={() => {
                                          setNewEmployee({
                                            ...newEmployee,
                                            reportingManagerId: manager.id,
                                            reportingManagerName: manager.name
                                          });
                                          setManagerSearch(''); // Reset search on select
                                        }}
                                      >
                                        {manager.name} ({manager.empId})
                                      </DropdownMenuItem>
                                      {index < (managersData?.length || 0) - 1 && <DropdownMenuSeparator />}
                                    </React.Fragment>
                                  ))
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="employee-modal-footer">
                {isViewMode ? (
                  <button
                    type="button"
                    className="modal-save-button"
                    onClick={() => {
                      if (!showLeaveHistory) {
                        refetchLeaveHistory();
                      }
                      setShowLeaveHistory(!showLeaveHistory);
                    }}
                  >
                    {showLeaveHistory ? 'Back to Details' : 'Leave History'}
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
                        setShowLeaveHistory(false);
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
        employeeStatus={selectedEmployeeForLeaves?.status || 'active'}
        isLoading={addLeavesMutation.isLoading}
      />
    </AppLayout>
  );
};

export default EmployeeManagementPage;

