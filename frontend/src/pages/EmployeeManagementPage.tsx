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
import { FaSearch, FaEye, FaPencilAlt, FaTrash, FaSort, FaSortUp, FaSortDown, FaExchangeAlt, FaCalendarPlus } from 'react-icons/fa';
import EmployeeLeaveDetailsModal from '../components/EmployeeLeaveDetailsModal';
import { useAuth } from '../contexts/AuthContext';
import { useLocation, useNavigate } from 'react-router-dom';
import './EmployeeManagementPage.css';

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

const sanitizeUAN = (value: string) => {
  return value.replace(/[^0-9]/g, '').slice(0, 12);
};

const formatUAN = (value: string) => {
  const digits = sanitizeUAN(value);
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
  const sanitized = value.replace(/[^a-zA-Z\s]/g, '');
  return sanitized.toLowerCase().replace(/(?:^|\s)\w/g, (match) => match.toUpperCase());
};

const sanitizeAddress = (value: string) => {
  return value.toLowerCase().replace(/(?:^|\s|[,./#-])\w/g, (match) => match.toUpperCase());
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
  id: null as number | null,
  empId: '',
  role: '',
  email: '',
  personalEmail: '',
  totalExperience: '',
  uanNumber: '',
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
  const [roleFilter, setRoleFilter] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('role') || '';
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isViewMode, setIsViewMode] = useState(false);
  const [editingEmployeeId, setEditingEmployeeId] = useState<number | null>(null);
  const [isDetailLoading] = useState(false);
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
  const [initialEmployeeData, setInitialEmployeeData] = useState<any>(null);
  const [selectedLeaveRequest, setSelectedLeaveRequest] = useState<any>(null);
  const [isLeaveDetailsModalOpen, setIsLeaveDetailsModalOpen] = useState(false);
  const location = useLocation();

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
      staleTime: 30000,
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
      staleTime: 10000,
      refetchInterval: 30000,
      cacheTime: 5 * 60 * 1000,
      keepPreviousData: true,
      enabled: showLeaveHistory && !!editingEmployeeId && (user?.role === 'hr' || user?.role === 'super_admin')
    }
  );

  const { data: employeeBalances, isLoading: employeeBalancesLoading, refetch: refetchEmployeeBalances } = useQuery(
    ['employee-leave-balances', editingEmployeeId],
    () => leaveService.getEmployeeLeaveBalances(editingEmployeeId!),
    {
      retry: false,
      staleTime: 10000,
      refetchInterval: 30000,
      cacheTime: 5 * 60 * 1000,
      keepPreviousData: true,
      enabled: showLeaveHistory && !!editingEmployeeId && (user?.role === 'hr' || user?.role === 'super_admin')
    }
  );

  const { data: employeesData, isLoading: employeesLoading, error } = useQuery(
    ['employees', appliedSearch, statusFilter, roleFilter, sortConfig],
    () =>
      employeeService.getEmployees(
        1,
        1000,
        appliedSearch,
        undefined,
        statusFilter || undefined,
        roleFilter || undefined,
        sortConfig.key,
        sortConfig.direction
      ),
    {
      retry: false,
      staleTime: 10000,
      refetchInterval: 30000,
      keepPreviousData: true,
      onError: (error: any) => {
        if (error.response?.status === 401 || error.response?.status === 403) {
          // Handled globally by api.ts interceptor
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
    return employeesData?.employees || [];
  }, [employeesData]);

  const sortedManagers = React.useMemo(() => {
    if (!managersData) return [];

    const rolePriority: Record<string, number> = {
      'super_admin': 0,
      'hr': 1,
      'manager': 2
    };

    return [...managersData].sort((a: any, b: any) => {
      const priorityA = rolePriority[a.role] ?? 3;
      const priorityB = rolePriority[b.role] ?? 3;

      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }

      // Secondary sort: by Employee ID (numeric string comparison)
      return (a.empId || '').localeCompare(b.empId || '', undefined, { numeric: true });
    });
  }, [managersData]);

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
      onMutate: async (newItem: { id: number; data: any }) => {
        // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
        await queryClient.cancelQueries(['employees']);

        // Snapshot the previous values from all employee queries
        const previousQueries: any[] = [];

        // Update all queries that match ['employees', ...]
        queryClient.setQueriesData<any>(
          ['employees'],
          (old: any) => {
            if (!old) return old;

            // Store previous state for rollback
            previousQueries.push({ key: ['employees'], data: old });

            // Check if it's the data structure with employees array
            if (old.employees && Array.isArray(old.employees)) {
              return {
                ...old,
                employees: old.employees.map((emp: any) =>
                  emp.id === newItem.id ? { ...emp, ...newItem.data } : emp
                )
              };
            }

            // Fallback for different data structures
            if (Array.isArray(old)) {
              return old.map((emp: any) =>
                emp.id === newItem.id ? { ...emp, ...newItem.data } : emp
              );
            }

            return old;
          }
        );

        // Return a context object with the snapshotted values
        return { previousQueries };
      },
      onError: (err: any, newItem, context: any) => {
        // If the mutation fails, roll back all queries
        if (context?.previousQueries) {
          context.previousQueries.forEach((query: any) => {
            queryClient.setQueryData(query.key, query.data);
          });
        }
        showError(err.response?.data?.error?.message || 'Update failed');
      },
      onSettled: () => {
        // Always refetch after error or success:
        queryClient.invalidateQueries(['employees']);
      },
      onSuccess: (data, variables) => {
        // Only close modal and show success for full employee updates (not status-only changes)
        const isStatusOnlyUpdate = variables.data && Object.keys(variables.data).length === 1 && 'status' in variables.data;

        if (!isStatusOnlyUpdate) {
          setIsModalOpen(false);
          setNewEmployee(emptyEmployeeForm);
          setIsSameAddress(false);
          setIsEditMode(false);
          setEditingEmployeeId(null);
          showSuccess('Employee updated!');
        }
      },
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
    ({ employeeId, formData }: { employeeId: number; formData: FormData }) =>
      employeeService.addLeavesToEmployee(employeeId, formData),
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
    const initial = { ...emptyEmployeeForm, dateOfJoining: today };
    setNewEmployee(initial);
    setInitialEmployeeData(initial);
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

    // Contact Number is now optional for Add Employee
    // checkField('contactNumber', 'Contact Number');
    // Alternate Contact is optional
    // checkField('altContact', 'Alternate Contact Number');
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

    // Optional Fields for Creation
    // checkField('gender', 'Gender');
    // checkField('bloodGroup', 'Blood Group');
    // checkField('maritalStatus', 'Marital Status');
    // checkField('emergencyContactName', 'Emergency Contact Name');
    // checkField('emergencyContactNo', 'Emergency Contact Number');
    // checkField('emergencyContactRelation', 'Emergency Contact Relation');

    // Employment information
    // Designation and Department are now optional for creation
    // checkField('designation', 'Designation');
    // checkField('department', 'Department');

    // Date of Joining is now optional for Add Employee
    // checkField('dateOfJoining', 'Date of Joining');

    // Date of Joining must not be in the future (only validate if provided)
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

    // Total Experience is now optional for Add Employee (validate only if provided)
    if (!isEmpty(newEmployee.totalExperience)) {
      const exp = parseFloat(newEmployee.totalExperience);
      if (isNaN(exp) || exp < 0) {
        showWarning('Total Experience must be a valid positive number');
        fieldErrors['totalExperience'] = true;
        setFormErrors(fieldErrors);
        return;
      }
      // Check for 0.5 increments
      if ((exp * 10) % 5 !== 0) {
        showWarning('Total Experience must be in 0.5 increments (e.g. 1.5, 2.0)');
        fieldErrors['totalExperience'] = true;
        setFormErrors(fieldErrors);
        return;
      }
    }

    if (!isEmpty(newEmployee.uanNumber)) {
      if (!/^\d{12}$/.test(newEmployee.uanNumber)) {
        showWarning('UAN Number must be exactly 12 digits');
        fieldErrors['uanNumber'] = true;
        setFormErrors(fieldErrors);
        return;
      }
    }

    // Optional Fields Validation (Only if filled)
    if (newEmployee.aadharNumber && newEmployee.aadharNumber.length !== 12) {
      showWarning('Aadhar must be 12 digits');
      setFormErrors({ ...fieldErrors, aadharNumber: true });
      return;
    }

    if (!isEmpty(newEmployee.panNumber)) {
      const panError = validatePan(newEmployee.panNumber);
      if (panError) {
        showWarning(panError);
        fieldErrors['panNumber'] = true;
        setFormErrors(fieldErrors);
        return;
      }
    }

    // Address information (Optional for creation)
    // Removed mandatory check for address

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

        // For creation, education fields are optional if empty
        /* 
        if (isEmpty(edu.groupStream)) {
          missingFields.push(`${levelLabel} - Group/Stream`);
          fieldErrors[`edu_${index}_groupStream`] = true;
        }
        */
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

      if (!isNaN(ugYear) && !isNaN(hscYear)) {
        if (hscYear >= ugYear) {
          showWarning('12th Graduation Year must be before UG Graduation Year');
          const hscIndex = newEmployee.education.findIndex((e: any) => e.level === '12th');
          fieldErrors[`edu_${hscIndex}_year`] = true;
          setFormErrors(fieldErrors);
          return;
        }
        if (ugYear - hscYear < 3) {
          showWarning(`Minimum 3 years gap required between 12th (${hscYear}) and UG (${ugYear}) Graduation Year`);
          const ugIndex = newEmployee.education.findIndex((e: any) => e.level === 'UG');
          fieldErrors[`edu_${ugIndex}_year`] = true;
          setFormErrors(fieldErrors);
          return;
        }
      }

      if (!isNaN(pgYear) && !isNaN(ugYear)) {
        if (ugYear >= pgYear) {
          showWarning('UG Graduation Year must be before PG Graduation Year');
          const ugIndex = newEmployee.education.findIndex((e: any) => e.level === 'UG');
          fieldErrors[`edu_${ugIndex}_year`] = true;
          setFormErrors(fieldErrors);
          return;
        }
        if (pgYear - ugYear < 2) {
          showWarning(`Minimum 2 years gap required between UG (${ugYear}) and PG (${pgYear}) Graduation Year`);
          const pgIndex = newEmployee.education.findIndex((e: any) => e.level === 'PG');
          fieldErrors[`edu_${pgIndex}_year`] = true;
          setFormErrors(fieldErrors);
          return;
        }
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

    // Phone validation - only check if provided (all contact fields are optional for Add Employee)
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
      // Only validate if field has a value
      if (v.length > 0 && v.length !== 10) {
        showWarning(`${field.label} must be 10 digits`);
        setFormErrors({ ...fieldErrors, [field.key]: true });
        return;
      }
    }

    // Check for duplicate phone numbers only if they are provided
    if (newEmployee.contactNumber && newEmployee.altContact && newEmployee.contactNumber === newEmployee.altContact) {
      showWarning('Contact Number and Alternate Contact Number cannot be the same');
      setFormErrors({ ...fieldErrors, altContact: true });
      return;
    }
    // Other phone checks removed/relaxed for creation

    // Sanitize payload: remove any snake_case keys that might have leaked in
    const sanitizedNewEmployee = Object.keys(newEmployee).reduce((acc: any, key) => {
      if (!key.includes('_')) {
        acc[key] = newEmployee[key];
      }
      return acc;
    }, {});

    // Remove leading zeros from empId while saving
    const formattedEmpId = newEmployee.empId ? newEmployee.empId.toString().replace(/^0+/, '') : '';

    const payload = {
      ...sanitizedNewEmployee,
      empId: formattedEmpId || newEmployee.empId, // If it becomes empty (like '000'), fallback to original
      role: newEmployee.role || 'employee'
    };

    if (isEditMode && editingEmployeeId) {
      updateEmployeeMutation.mutate({ id: editingEmployeeId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };



  /* Navigation to details page */
  const navigate = useNavigate();
  const handleViewEmployee = (employeeId: number) => {
    navigate(`/employee-management/view/${employeeId}`);
  };

  // Deep linking for Dashboard
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const deepLinkEmpId = searchParams.get('empId');

    if (deepLinkEmpId && !isModalOpen) {
      const findAndOpen = async () => {
        try {
          const result = await employeeService.getEmployees(1, 1, deepLinkEmpId);
          if (result.employees && result.employees.length > 0) {
            const employee = result.employees[0];
            if (employee.empId === deepLinkEmpId) {
              navigate(`/employee-management/view/${employee.id}`);
            }
          }
        } catch (e) {
          console.error("Deep link failed", e);
        }
      }
      findAndOpen();
    }
  }, [location.search]);

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

  const handleAddLeavesSubmit = (formData: FormData) => {
    if (selectedEmployeeForLeaves) {
      addLeavesMutation.mutate({
        employeeId: selectedEmployeeForLeaves.id,
        formData
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
              placeholder="Search by Emp Name or Emp ID"
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

          <Button
            onClick={handleOpenAddEmployee}
            style={{ marginLeft: 'auto' }}
          >
            Add Employee
          </Button>
        </div>

        <div className={`employees-section employee-table-container ${employeesLoading && sortedEmployees.length > 0 ? 'fetching' : ''}`}>
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
                  <th className="sortable-header" onClick={() => handleSort('empId')}>
                    <div className="header-sort-wrapper">
                      ID
                      {sortConfig.key === 'empId' ? (
                        sortConfig.direction === 'asc' ? <FaSortUp className="sort-icon active" /> : <FaSortDown className="sort-icon active" />
                      ) : (
                        <FaSort className="sort-icon" />
                      )}
                    </div>
                  </th>
                  <th className="sortable-header" onClick={() => handleSort('name')}>
                    <div className="header-sort-wrapper">
                      Name
                      {sortConfig.key === 'name' ? (
                        sortConfig.direction === 'asc' ? <FaSortUp className="sort-icon active" /> : <FaSortDown className="sort-icon active" />
                      ) : (
                        <FaSort className="sort-icon" />
                      )}
                    </div>
                  </th>
                  <th>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <div className="header-sort-wrapper" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '4px' }}>
                          Role
                          <Button
                            variant="ghost"
                            size="sm"
                            style={{
                              padding: '0 4px',
                              height: '20px',
                              border: roleFilter ? '1px solid #2563eb' : 'none',
                              backgroundColor: roleFilter ? '#eff6ff' : 'transparent',
                              color: roleFilter ? '#2563eb' : 'inherit',
                              pointerEvents: 'none'
                            }}
                          >
                            <ChevronDown style={{ width: '12px', height: '12px' }} />
                          </Button>
                        </div>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem onSelect={() => setRoleFilter('')}>
                          All Roles
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {['super_admin', 'hr', 'manager', 'employee', 'intern'].map((role) => (
                          <DropdownMenuItem key={role} onSelect={() => setRoleFilter(role)}>
                            {role === 'super_admin' ? 'Super Admin' :
                              role === 'hr' ? 'HR' :
                                role.charAt(0).toUpperCase() + role.slice(1)}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
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
                  <th>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <div className="header-sort-wrapper" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '4px' }}>
                          Status
                          <Button
                            variant="ghost"
                            size="sm"
                            style={{
                              padding: '0 4px',
                              height: '20px',
                              border: statusFilter ? '1px solid #2563eb' : 'none',
                              backgroundColor: statusFilter ? '#eff6ff' : 'transparent',
                              color: statusFilter ? '#2563eb' : 'inherit',
                              pointerEvents: 'none'
                            }}
                          >
                            <ChevronDown style={{ width: '12px', height: '12px' }} />
                          </Button>
                        </div>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem onSelect={() => setStatusFilter('')}>
                          All Status
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {['active', 'on_notice', 'inactive'].map((status) => (
                          <DropdownMenuItem key={status} onSelect={() => setStatusFilter(status)}>
                            {status === 'active' ? 'Active' :
                              status === 'on_notice' ? 'On Notice' :
                                'Inactive'}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedEmployees.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: 0 }}>
                      <EmptyState
                        title="No Employees Found"
                        description="Try adjusting your search or filters to find what you're looking for."
                      />
                    </td>
                  </tr>
                ) : (
                  sortedEmployees.map((employee) => (
                    <tr key={employee.id} onClick={() => handleViewEmployee(employee.id)} style={{ cursor: 'pointer' }}>

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
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="actions-wrapper">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                className="action-btn view-btn"
                                title="Change Status"
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', padding: 0 }}
                              >
                                <FaExchangeAlt size={14} />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                              <DropdownMenuItem onSelect={() => updateEmployeeMutation.mutate({ id: employee.id, data: { status: 'active' } })}>
                                Active
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onSelect={() => updateEmployeeMutation.mutate({ id: employee.id, data: { status: 'on_notice' } })}>
                                On Notice
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onSelect={() => updateEmployeeMutation.mutate({ id: employee.id, data: { status: 'inactive' } })}>
                                Inactive
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          {/* Add Leaves button (Always visible, disabled if no permission) */}
                          {employee.role !== 'super_admin' && (
                            <button
                              className="action-btn add-leaves-btn"
                              title={
                                !(employee.status !== 'inactive' && employee.status !== 'terminated' && employee.status !== 'resigned')
                                  ? "Cannot add leaves for inactive/resigned employees"
                                  : ((user?.role === 'hr' && employee.role !== 'hr') ||
                                    (user?.role === 'super_admin' && employee.id !== user.id))
                                    ? "Add Leaves"
                                    : "You do not have permission to add leaves for this employee"
                              }
                              onClick={() => handleAddLeaves(employee.id, employee.name, employee.status)}
                              disabled={
                                !(((user?.role === 'hr' && employee.role !== 'hr') ||
                                  (user?.role === 'super_admin' && employee.id !== user.id)) &&
                                  (employee.status !== 'inactive' && employee.status !== 'terminated' && employee.status !== 'resigned'))
                              }
                            >
                              <FaCalendarPlus />
                            </button>
                          )}

                          {/* Delete button (Visible to Super Admin only) */}
                          {user?.role === 'super_admin' && (
                            <button
                              className="action-btn delete-btn"
                              title={employee.id === user.id ? "You cannot delete your own account" : "Delete"}
                              onClick={() => handleDelete(employee.id)}
                              disabled={employee.id === user.id}
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

              <div className={`employee-modal-body ${showLeaveHistory ? 'leave-history-mode' : ''}`}>
                {isDetailLoading && (
                  <div style={{ padding: '8px 0', fontSize: 12, color: '#666' }}>
                    Loading details...
                  </div>
                )}
                {showLeaveHistory ? (
                  <>
                    <div className="leave-details-fixed-header">
                      <h3 className="modal-section-heading">Leave Details</h3>

                      {/* Leave Balances Section */}
                      {employeeBalancesLoading ? (
                        <div className="leave-balances-loading">Loading leave balances...</div>
                      ) : (
                        <div className="modal-leave-balances">
                          <div className="modal-balance-card">
                            <span className="modal-balance-label">Casual</span>
                            <span className="modal-balance-value">{employeeBalances?.casual || 0}</span>
                          </div>
                          <div className="modal-balance-card">
                            <span className="modal-balance-label">Sick</span>
                            <span className="modal-balance-value">{employeeBalances?.sick || 0}</span>
                          </div>
                          <div className="modal-balance-card">
                            <span className="modal-balance-label">LOP</span>
                            <span className="modal-balance-value">{employeeBalances?.lop || 0}</span>
                          </div>
                        </div>
                      )}

                      <h3 className="modal-section-heading" style={{ marginTop: '20px' }}>Leave History</h3>
                    </div>

                    <div className="leave-history-table-container">
                      {leaveHistoryLoading ? (
                        <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
                          Loading leave history...
                        </div>
                      ) : leaveHistoryData?.requests && leaveHistoryData.requests.length > 0 ? (
                        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '12px', minWidth: '100%' }}>
                          <thead>
                            <tr style={{ backgroundColor: '#f8f9fa' }}>
                              <th style={{ padding: '8px', textAlign: 'left', fontWeight: 600, position: 'sticky', top: 0, backgroundColor: '#f8f9fa', zIndex: 10, borderBottom: '1px solid #e5e5e5' }}>Applied Date</th>
                              <th style={{ padding: '8px', textAlign: 'left', fontWeight: 600, position: 'sticky', top: 0, backgroundColor: '#f8f9fa', zIndex: 10, borderBottom: '1px solid #e5e5e5' }}>Leave Type</th>
                              <th style={{ padding: '8px', textAlign: 'left', fontWeight: 600, position: 'sticky', top: 0, backgroundColor: '#f8f9fa', zIndex: 10, borderBottom: '1px solid #e5e5e5' }}>Start Date</th>
                              <th style={{ padding: '8px', textAlign: 'left', fontWeight: 600, position: 'sticky', top: 0, backgroundColor: '#f8f9fa', zIndex: 10, borderBottom: '1px solid #e5e5e5' }}>End Date</th>
                              <th style={{ padding: '8px', textAlign: 'left', fontWeight: 600, position: 'sticky', top: 0, backgroundColor: '#f8f9fa', zIndex: 10, borderBottom: '1px solid #e5e5e5' }}>Days</th>
                              <th style={{ padding: '8px', textAlign: 'left', fontWeight: 600, position: 'sticky', top: 0, backgroundColor: '#f8f9fa', zIndex: 10, borderBottom: '1px solid #e5e5e5' }}>Status</th>
                              <th style={{ padding: '8px', textAlign: 'left', fontWeight: 600, position: 'sticky', top: 0, backgroundColor: '#f8f9fa', zIndex: 10, borderBottom: '1px solid #e5e5e5' }}>Actions</th>
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

                              const handleViewDetails = () => {
                                setSelectedLeaveRequest({
                                  ...request,
                                  empStatus: newEmployee.status,
                                  canEdit: false,
                                  canDelete: false
                                });
                                setIsLeaveDetailsModalOpen(true);
                              };

                              return (
                                <tr key={request.id} style={{ borderBottom: '1px solid #e5e5e5' }}>
                                  <td style={{ padding: '8px', borderBottom: '1px solid #e5e5e5', textAlign: 'left' }}>{format(new Date(request.appliedDate + 'T12:00:00'), 'dd/MM/yyyy')}</td>
                                  <td style={{ padding: '8px', borderBottom: '1px solid #e5e5e5', textAlign: 'left' }}>{request.leaveType === 'lop' ? 'LOP' : request.leaveType.charAt(0).toUpperCase() + request.leaveType.slice(1)}</td>
                                  <td style={{ padding: '8px', borderBottom: '1px solid #e5e5e5', textAlign: 'left' }}>{format(new Date(request.startDate + 'T12:00:00'), 'dd/MM/yyyy')}</td>
                                  <td style={{ padding: '8px', borderBottom: '1px solid #e5e5e5', textAlign: 'left' }}>{format(new Date(request.endDate + 'T12:00:00'), 'dd/MM/yyyy')}</td>
                                  <td style={{ padding: '8px', borderBottom: '1px solid #e5e5e5', textAlign: 'left' }}>{request.noOfDays}</td>
                                  <td style={{ padding: '8px', borderBottom: '1px solid #e5e5e5', textAlign: 'left' }}>
                                    <span className={`status-badge ${getStatusClass(request.currentStatus)}`}>
                                      {getStatusLabel(request.currentStatus)}
                                    </span>
                                  </td>
                                  <td style={{ padding: '8px', borderBottom: '1px solid #e5e5e5', textAlign: 'left' }}>
                                    <div className="actions-wrapper" style={{ justifyContent: 'flex-start' }}>
                                      <button
                                        className="action-btn view-btn"
                                        onClick={handleViewDetails}
                                        title="View Details"
                                      >
                                        <FaEye />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      ) : (
                        <EmptyState
                          title="No Leave Details"
                          description="This employee hasn't applied for any leaves yet."
                        />
                      )}
                    </div>
                  </>
                ) : (
                  <div>
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
                                      const subCount = newEmployee.subordinateCount ? parseInt(String(newEmployee.subordinateCount), 10) : 0;

                                      const highHierarchy = ['super_admin', 'hr', 'manager'];
                                      const lowHierarchy = ['employee', 'intern'];
                                      const isDowngrade = highHierarchy.includes(newEmployee.role) && lowHierarchy.includes(role);

                                      if (isEditMode && subCount > 0 && newEmployee.role !== role && isDowngrade) {
                                        e.preventDefault();
                                        const name = `${newEmployee.firstName} ${newEmployee.lastName || ''}`.trim();
                                        showWarning(`Cannot proceed with downgrading to a role that cannot approve leaves. Please remove the users reporting to ${name} and try again.`);
                                        return;
                                      }

                                      const newRole = role;
                                      setNewEmployee({
                                        ...newEmployee,
                                        role: newRole
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
                            onBlur={() => {
                              if (!newEmployee.firstName || newEmployee.firstName.trim() === '') {
                                setFormErrors((prev) => ({ ...prev, firstName: true }));
                              } else {
                                setFormErrors((prev) => {
                                  const next = { ...prev };
                                  delete next.firstName;
                                  return next;
                                });
                              }
                            }}
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
                            onBlur={() => {
                              if (!newEmployee.lastName || newEmployee.lastName.trim() === '') {
                                setFormErrors((prev) => ({ ...prev, lastName: true }));
                              } else {
                                setFormErrors((prev) => {
                                  const next = { ...prev };
                                  delete next.lastName;
                                  return next;
                                });
                              }
                            }}
                            disabled={isViewMode}
                          />
                        </div>
                        <div className={`employee-modal-field ${formErrors.personalEmail ? 'has-error' : ''}`}>
                          <label>
                            Personal Email
                          </label>
                          <input
                            type="email"
                            value={newEmployee.personalEmail || ''}
                            onChange={(e) =>
                              setNewEmployee({ ...newEmployee, personalEmail: e.target.value })
                            }
                            onBlur={() => {
                              // Basic email format check if needed
                            }}
                            disabled={isViewMode}
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
                            onBlur={() => {
                              const val = newEmployee.contactNumber;
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
                            disabled={isViewMode}
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
                            onBlur={() => {
                              const val = newEmployee.altContact;
                              // Only validate if value is provided
                              if (val && val.trim() !== '') {
                                if (val.length < 10) {
                                  setFormErrors((prev) => ({ ...prev, altContact: true }));
                                } else {
                                  setFormErrors((prev) => {
                                    const next = { ...prev };
                                    delete next.altContact;
                                    return next;
                                  });
                                }
                              } else {
                                // Clear error if field is empty (it's optional)
                                setFormErrors((prev) => {
                                  const next = { ...prev };
                                  delete next.altContact;
                                  return next;
                                });
                              }
                            }}
                            disabled={isViewMode}
                          />
                        </div>

                        <div className={`employee-modal-field ${formErrors.gender ? 'has-error' : ''}`}>
                          <label>
                            Gender
                          </label>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="outline"
                                className="leave-type-dropdown-trigger"
                                disabled={isViewMode}
                              >
                                <span>{newEmployee.gender || ''}</span>
                                <ChevronDown style={{ width: '14px', height: '14px', marginLeft: '8px' }} />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="leave-type-dropdown-content">
                              <DropdownMenuItem
                                onSelect={() => setNewEmployee({ ...newEmployee, gender: 'Male' })}
                              >
                                Male
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onSelect={() => setNewEmployee({ ...newEmployee, gender: 'Female' })}
                              >
                                Female
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onSelect={() => setNewEmployee({ ...newEmployee, gender: 'Other' })}
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
                                disabled={isViewMode}
                              >
                                <span>{newEmployee.bloodGroup || ''}</span>
                                <ChevronDown style={{ width: '14px', height: '14px', marginLeft: '8px' }} />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="leave-type-dropdown-content">
                              {['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map((bg, index) => (
                                <React.Fragment key={bg}>
                                  <DropdownMenuItem
                                    onSelect={() => setNewEmployee({ ...newEmployee, bloodGroup: bg })}
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
                                disabled={isViewMode}
                              >
                                <span>{newEmployee.maritalStatus || ''}</span>
                                <ChevronDown style={{ width: '14px', height: '14px', marginLeft: '8px' }} />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="leave-type-dropdown-content">
                              <DropdownMenuItem
                                onSelect={() => setNewEmployee({ ...newEmployee, maritalStatus: 'Single' })}
                              >
                                Single
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onSelect={() => setNewEmployee({ ...newEmployee, maritalStatus: 'Married' })}
                              >
                                Married
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onSelect={() => setNewEmployee({ ...newEmployee, maritalStatus: 'Divorced' })}
                              >
                                Divorced
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onSelect={() => setNewEmployee({ ...newEmployee, maritalStatus: 'Widowed' })}
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
                            value={newEmployee.emergencyContactName}
                            onChange={(e) =>
                              setNewEmployee({
                                ...newEmployee,
                                emergencyContactName: sanitizeName(e.target.value)
                              })
                            }
                            onBlur={() => {
                              if (!newEmployee.emergencyContactName || newEmployee.emergencyContactName.trim() === '') {
                                setFormErrors((prev) => ({ ...prev, emergencyContactName: true }));
                              } else {
                                setFormErrors((prev) => {
                                  const next = { ...prev };
                                  delete next.emergencyContactName;
                                  return next;
                                });
                              }
                            }}
                            disabled={isViewMode}
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
                            onBlur={() => {
                              const val = newEmployee.emergencyContactNo;
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
                            disabled={isViewMode}
                          />
                        </div>
                        <div className={`employee-modal-field ${formErrors.emergencyContactRelation ? 'has-error' : ''}`}>
                          <label>
                            Emergency Contact Relation
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
                            onBlur={() => {
                              if (!newEmployee.emergencyContactRelation || newEmployee.emergencyContactRelation.trim() === '') {
                                setFormErrors((prev) => ({ ...prev, emergencyContactRelation: true }));
                              } else {
                                setFormErrors((prev) => {
                                  const next = { ...prev };
                                  delete next.emergencyContactRelation;
                                  return next;
                                });
                              }
                            }}
                            disabled={isViewMode}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="employee-modal-section">
                      <h3>Employment Information</h3>



                      <div className="employee-modal-grid">
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
                            onBlur={() => {
                              if (!newEmployee.email || newEmployee.email.trim() === '') {
                                setFormErrors((prev) => ({ ...prev, email: true }));
                              } else {
                                setFormErrors((prev) => {
                                  const next = { ...prev };
                                  delete next.email;
                                  return next;
                                });
                              }
                            }}
                            disabled={(isEditMode && user?.role !== 'super_admin') || isViewMode}
                          />
                        </div>
                        <div className={`employee-modal-field ${formErrors.designation ? 'has-error' : ''}`}>
                          <div className="employee-modal-field">
                            <label>
                              Designation{isEditMode && <span className="required-indicator">*</span>}
                            </label>
                            <input
                              type="text"
                              value={newEmployee.designation}
                              onChange={(e) =>
                                setNewEmployee({
                                  ...newEmployee,
                                  designation: e.target.value
                                })
                              }
                              onBlur={() => {
                                if (!newEmployee.designation || newEmployee.designation.trim() === '') {
                                  setFormErrors((prev) => ({ ...prev, designation: true }));
                                } else {
                                  setFormErrors((prev) => {
                                    const next = { ...prev };
                                    delete next.designation;
                                    return next;
                                  });
                                }
                              }}
                              disabled={isViewMode}
                            />
                          </div>
                        </div>
                        <div className={`employee-modal-field ${formErrors.department ? 'has-error' : ''}`}>
                          <label>
                            Department{isEditMode && <span className="required-indicator">*</span>}
                          </label>
                          <input
                            type="text"
                            value={newEmployee.department}
                            onChange={(e) =>
                              setNewEmployee({
                                ...newEmployee,
                                department: e.target.value
                              })
                            }
                            onBlur={() => {
                              if (!newEmployee.department || newEmployee.department.trim() === '') {
                                setFormErrors((prev) => ({ ...prev, department: true }));
                              } else {
                                setFormErrors((prev) => {
                                  const next = { ...prev };
                                  delete next.department;
                                  return next;
                                });
                              }
                            }}
                            disabled={isViewMode}
                          />
                        </div>
                        <div className={`employee-modal-field ${formErrors.dateOfJoining ? 'has-error' : ''}`}>
                          <label>
                            Date of Joining
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
                        {(isEditMode || isViewMode) && (
                          <div className="employee-modal-field">
                            <label>Status</label>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="outline"
                                  className="leave-type-dropdown-trigger"
                                  disabled={isViewMode}
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
                                  onSelect={() => setNewEmployee({
                                    ...newEmployee,
                                    status: 'active'
                                  })}
                                >
                                  Active
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onSelect={() => setNewEmployee({
                                    ...newEmployee,
                                    status: 'on_notice'
                                  })}
                                >
                                  On Notice
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onSelect={() => setNewEmployee({
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

                        {/* New Fields: Total Experience and UAN */}
                        <div className={`employee-modal-field ${formErrors.totalExperience ? 'has-error' : ''}`}>
                          <label>
                            Total Experience (Years)
                          </label>
                          <input
                            type="number"
                            step="0.5"
                            min="0"
                            value={newEmployee.totalExperience}
                            onChange={(e) => {
                              setNewEmployee({ ...newEmployee, totalExperience: e.target.value });
                            }}
                            onBlur={() => {
                              if (
                                newEmployee.totalExperience === undefined ||
                                newEmployee.totalExperience === null ||
                                (typeof newEmployee.totalExperience === 'string' && newEmployee.totalExperience.trim() === '')
                              ) {
                                setFormErrors((prev) => ({ ...prev, totalExperience: true }));
                              } else {
                                setFormErrors((prev) => {
                                  const next = { ...prev };
                                  delete next.totalExperience;
                                  return next;
                                });
                              }
                            }}
                            disabled={isViewMode}
                          />
                          {newEmployee.totalExperience && (parseFloat(newEmployee.totalExperience) * 10) % 5 !== 0 && (
                            <span style={{ fontSize: '10px', color: 'red' }}>Must be in 0.5 increments</span>
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
                            value={formatAadhaar(newEmployee.aadharNumber || '')}
                            onChange={(e) =>
                              setNewEmployee({
                                ...newEmployee,
                                aadharNumber: sanitizeAadhaar(e.target.value)
                              })
                            }
                            placeholder="XXXX XXXX XXXX"
                            onBlur={() => {
                              if (!newEmployee.aadharNumber || newEmployee.aadharNumber.trim() === '') {
                                setFormErrors((prev) => ({ ...prev, aadharNumber: true }));
                              } else {
                                setFormErrors((prev) => {
                                  const next = { ...prev };
                                  delete next.aadharNumber;
                                  return next;
                                });
                              }
                            }}
                            disabled={isViewMode}
                          />
                        </div>
                        <div className={`employee-modal-field ${formErrors.panNumber ? 'has-error' : ''}`}>
                          <label>
                            PAN Number
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
                              const panVal = newEmployee.panNumber || '';
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
                            disabled={isViewMode}
                          />
                          {newEmployee.panNumber && newEmployee.panNumber.length < 10 && (
                            <span style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
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
                            placeholder="XXXX XXXX XXXX"
                            value={formatUAN(newEmployee.uanNumber || '')}
                            onChange={(e) => {
                              const sanitized = sanitizeUAN(e.target.value);
                              setNewEmployee({ ...newEmployee, uanNumber: sanitized });
                            }}
                            disabled={isViewMode}
                          />
                          {newEmployee.uanNumber && newEmployee.uanNumber.length !== 12 && (
                            <span style={{ fontSize: '10px', color: 'red' }}>Must be 12 digits</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="employee-modal-section">
                      <h3>Address Details</h3>
                      <div className={`employee-modal-field full-width ${formErrors.permanentAddress ? 'has-error' : ''}`}>
                        <label>
                          Permanent Address
                        </label>
                        <textarea
                          rows={3}
                          value={newEmployee.permanentAddress}
                          onChange={(e) => {
                            const input = e.target;
                            const cursorPosition = input.selectionStart || 0;
                            const value = sanitizeAddress(e.target.value);
                            setNewEmployee((prev: any) => ({
                              ...prev,
                              permanentAddress: value,
                              currentAddress: isSameAddress
                                ? value
                                : prev.currentAddress
                            }));

                            // Restore cursor position
                            setTimeout(() => {
                              if (input) {
                                input.setSelectionRange(cursorPosition, cursorPosition);
                              }
                            }, 0);
                          }}
                          onBlur={() => {
                            if (!newEmployee.permanentAddress || newEmployee.permanentAddress.trim() === '') {
                              setFormErrors((prev) => ({ ...prev, permanentAddress: true }));
                            } else {
                              setFormErrors((prev) => {
                                const next = { ...prev };
                                delete next.permanentAddress;
                                return next;
                              });
                            }
                          }}
                          disabled={isViewMode}
                        />
                      </div>
                      <div className={`employee-modal-field full-width ${formErrors.currentAddress ? 'has-error' : ''}`}>
                        <label>
                          Current Address
                        </label>
                        <textarea
                          rows={3}
                          value={newEmployee.currentAddress}
                          onChange={(e) => {
                            const input = e.target;
                            const cursorPosition = input.selectionStart || 0;
                            const value = sanitizeAddress(e.target.value);
                            setNewEmployee({
                              ...newEmployee,
                              currentAddress: value
                            });

                            // Restore cursor position
                            setTimeout(() => {
                              if (input) {
                                input.setSelectionRange(cursorPosition, cursorPosition);
                              }
                            }, 0);
                          }}
                          onBlur={() => {
                            if (!newEmployee.currentAddress || newEmployee.currentAddress.trim() === '') {
                              setFormErrors((prev) => ({ ...prev, currentAddress: true }));
                            } else {
                              setFormErrors((prev) => {
                                const next = { ...prev };
                                delete next.currentAddress;
                                return next;
                              });
                            }
                          }}
                          disabled={(isSameAddress && !isEditMode) || isViewMode}
                        />
                        {!isEditMode && !isViewMode && (
                          <label className="same-address-checkbox">
                            <input
                              type="checkbox"
                              checked={isSameAddress}
                              onChange={(e) => handleSameAsCurrentAddress(e.target.checked)}
                              disabled={isViewMode}
                            />
                            Same as Permanent Address
                          </label>
                        )}
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
                              </td>
                              <td className={formErrors[`edu_${idx}_groupStream`] ? 'has-error' : ''}>
                                <input
                                  type="text"
                                  value={edu.groupStream || ''}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    setNewEmployee((prev: any) => {
                                      const next = [...(prev.education || [])];
                                      next[idx] = { ...edu, groupStream: value };
                                      return { ...prev, education: next };
                                    });
                                  }}
                                  onBlur={() => {
                                    // Education fields are now optional for Add Employee
                                    // Removed mandatory validation for UG and 12th
                                  }}
                                  disabled={isViewMode}
                                />
                              </td>
                              <td className={formErrors[`edu_${idx}_collegeUniversity`] ? 'has-error' : ''}>
                                <input
                                  type="text"
                                  value={edu.collegeUniversity || ''}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    setNewEmployee((prev: any) => {
                                      const next = [...(prev.education || [])];
                                      next[idx] = { ...edu, collegeUniversity: value };
                                      return { ...prev, education: next };
                                    });
                                  }}
                                  onBlur={() => {
                                    // Education fields are now optional for Add Employee
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
                                    const yearStr = e.target.value;
                                    const year = parseInt(yearStr, 10);
                                    const currentYear = new Date().getFullYear();
                                    const maxYear = currentYear + 5;

                                    // Education fields are now optional for Add Employee
                                    // Only validate format if year is provided
                                    if (yearStr && (isNaN(year) || year < 1950 || year > maxYear)) {
                                      setFormErrors((prev) => ({ ...prev, [`edu_${idx}_year`]: true }));
                                    } else {
                                      setFormErrors((prev) => {
                                        const next = { ...prev };
                                        delete next[`edu_${idx}_year`];
                                        return next;
                                      });
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
                                    if (raw === '') {
                                      setNewEmployee((prev: any) => {
                                        const next = [...(prev.education || [])];
                                        next[idx] = { ...edu, scorePercentage: null };
                                        return { ...prev, education: next };
                                      });
                                      return;
                                    }

                                    const sanitized = raw.replace(/[^0-9.]/g, '');
                                    const parts = sanitized.split('.');
                                    if (parts.length > 2) return;

                                    if (parts[1] && parts[1].length > 2) return;

                                    const numValue = parseFloat(sanitized);
                                    if (!isNaN(numValue) && numValue > 100) return;

                                    setNewEmployee((prev: any) => {
                                      const next = [...(prev.education || [])];
                                      next[idx] = { ...edu, scorePercentage: sanitized };
                                      return { ...prev, education: next };
                                    });
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
                                >
                                  <span>
                                    {newEmployee.reportingManagerName
                                      ? (() => {
                                        const manager = sortedManagers?.find((m: any) => m.id === newEmployee.reportingManagerId);
                                        const roleLabel = manager?.role ? getRoleLabel(manager.role) : '';
                                        // Only show role in selected text if it exists and isn't a placeholder
                                        return `${newEmployee.reportingManagerName}${roleLabel && roleLabel !== '-' ? ` (${roleLabel})` : ''}`;
                                      })()
                                      : 'Select Reporting Manager'}
                                  </span>
                                  <ChevronDown style={{ width: '14px', height: '14px', marginLeft: '8px' }} />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent
                                side="bottom"
                                align="start"
                                className="leave-type-dropdown-content"
                                style={{
                                  maxHeight: '300px',
                                  overflowY: 'auto',
                                  width: 'var(--radix-dropdown-menu-trigger-width)',
                                  padding: 0,
                                  backgroundColor: 'white',
                                  border: '1px solid #eee',
                                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                                }}
                              >
                                <div className="manager-search-wrapper" style={{ padding: '8px', borderBottom: '1px solid #eee', position: 'sticky', top: 0, backgroundColor: 'white', zIndex: 10 }}>
                                  <div style={{ position: 'relative' }}>
                                    <input
                                      type="text"
                                      placeholder="Search by name or ID..."
                                      value={managerSearch}
                                      onChange={(e) => {
                                        // Only allow letters, numbers, and spaces
                                        const sanitized = e.target.value.replace(/[^a-zA-Z0-9\s]/g, '');
                                        setManagerSearch(sanitized);
                                      }}
                                      autoFocus
                                      style={{
                                        width: '100%',
                                        padding: '8px 30px 8px 12px',
                                        fontSize: '13px',
                                        border: '1px solid #ddd',
                                        borderRadius: '4px',
                                        fontFamily: 'Poppins, sans-serif',
                                        backgroundColor: '#fff'
                                      }}
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                    {managerSearch && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setManagerSearch('');
                                        }}
                                        style={{
                                          position: 'absolute',
                                          right: '8px',
                                          top: '50%',
                                          transform: 'translateY(-50%)',
                                          background: 'none',
                                          border: 'none',
                                          cursor: 'pointer',
                                          color: '#999',
                                          fontSize: '18px',
                                          padding: 0,
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          width: '20px',
                                          height: '20px',
                                          borderRadius: '50%'
                                        }}
                                        aria-label="Clear search"
                                      >
                                        ×
                                      </button>
                                    )}
                                  </div>
                                </div>
                                {sortedManagers?.length === 0 ? (
                                  <div style={{ padding: '12px', textAlign: 'center', fontSize: '13px', color: '#666' }}>
                                    No managers found
                                  </div>
                                ) : (
                                  sortedManagers?.map((manager: any, index: number) => (
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
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                                          <span>{manager.name} ({manager.empId})</span>
                                          <span style={{
                                            fontSize: '11px',
                                            padding: '2px 8px',
                                            borderRadius: '12px',
                                            backgroundColor: '#eff6ff',
                                            color: '#1d4ed8',
                                            border: '1px solid #dbeafe',
                                            fontWeight: 500,
                                            textAlign: 'center',
                                            minWidth: '90px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                          }}>
                                            {getRoleLabel(manager.role)}
                                          </span>
                                        </div>
                                      </DropdownMenuItem>
                                      {index < (sortedManagers?.length || 0) - 1 && <DropdownMenuSeparator />}
                                    </React.Fragment>
                                  ))
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

              </div>

              <div className="employee-modal-footer">
                {isViewMode ? (
                  <>
                    <button
                      type="button"
                      className="modal-save-button"
                      onClick={() => {
                        if (!showLeaveHistory) {
                          refetchLeaveHistory();
                          refetchEmployeeBalances();
                        }
                        setShowLeaveHistory(!showLeaveHistory);
                      }}
                    >
                      {showLeaveHistory ? 'Back to Details' : 'Leave Details'}
                    </button>
                    {/* Edit Employee Button (HR/Super Admin only) */}
                    {user && (user.role === 'super_admin' || user.role === 'hr') && (
                      <button
                        type="button"
                        className="modal-save-button"
                        style={{ marginLeft: '10px' }}
                        title={
                          newEmployee.id === user.id
                            ? "Please update your own details from the Profile page"
                            : (user.role === 'hr' && (newEmployee.role === 'super_admin' || newEmployee.role === 'hr'))
                              ? "HR cannot edit Super Admin or other HR details"
                              : "Edit Employee"
                        }
                        disabled={newEmployee.id === user.id || (user.role === 'hr' && (newEmployee.role === 'super_admin' || newEmployee.role === 'hr'))}
                        onClick={() => {
                          setInitialEmployeeData(newEmployee);
                          setIsViewMode(false);
                          setIsEditMode(true);
                          // Also hide leave history if showing
                          setShowLeaveHistory(false);
                        }}
                      >
                        <FaPencilAlt style={{ marginRight: '6px' }} /> Edit Employee
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="modal-cancel-button"
                      onClick={() => {
                        if (editingEmployeeId) {
                          // If editing an existing employee, go back to view mode
                          setIsViewMode(true);
                          setIsEditMode(false);
                        } else {
                          // If adding a new employee, close the modal
                          setIsModalOpen(false);
                          setIsEditMode(false);
                          setIsViewMode(false);
                          setEditingEmployeeId(null);
                          setShowLeaveHistory(false);
                        }
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="modal-save-button"
                      onClick={handleCreateEmployee}
                      disabled={
                        createMutation.isLoading ||
                        updateEmployeeMutation.isLoading ||
                        (isEditMode && JSON.stringify(newEmployee) === JSON.stringify(initialEmployeeData))
                      }
                      style={{
                        opacity: (isEditMode && JSON.stringify(newEmployee) === JSON.stringify(initialEmployeeData)) ? 0.5 : 1,
                        cursor: (isEditMode && JSON.stringify(newEmployee) === JSON.stringify(initialEmployeeData)) ? 'not-allowed' : 'pointer'
                      }}
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

      {/* Employee Leave Details Modal */}
      <EmployeeLeaveDetailsModal
        isOpen={isLeaveDetailsModalOpen}
        leaveRequest={selectedLeaveRequest}
        onClose={() => setIsLeaveDetailsModalOpen(false)}
      />
    </AppLayout >
  );
};

export default EmployeeManagementPage;

