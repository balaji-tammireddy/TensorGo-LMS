import React, { useState, useEffect, useRef } from 'react';
import { X, ChevronDown, Search, UserX } from 'lucide-react';
import EmptyState from '../../../components/common/EmptyState';
import { useToast } from '../../../contexts/ToastContext';
import { useAuth } from '../../../contexts/AuthContext';
import { projectService } from '../../../services/projectService';
import * as employeeService from '../../../services/employeeService';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu';
import { DatePicker } from '../../../components/ui/date-picker';
import './CreateModal.css';

interface CreateModalProps {
    isOpen: boolean;
    onClose: () => void;
    type: 'project' | 'module' | 'task';
    parentId?: number;
    onSuccess: (data?: any) => void;
    initialData?: any;
    isEdit?: boolean;
    projectManagerId?: number;
}

export const CreateModal: React.FC<CreateModalProps> = ({
    isOpen,
    onClose,
    type,
    parentId,
    onSuccess,
    initialData,
    isEdit = false,
    projectManagerId
}) => {
    const { showSuccess, showError } = useToast();
    const { user } = useAuth();
    const [formData, setFormData] = useState({
        custom_id: '',
        name: '',
        description: '',
        project_manager_id: '',
        due_date: '',
        start_date: '',
        end_date: '',
        time_spent: '',
        work_status: 'in_progress',
        assignee_ids: [] as number[]
    });
    const [loading, setLoading] = useState(false);
    const [managers, setManagers] = useState<any[]>([]);
    const [managerSearch, setManagerSearch] = useState('');
    const nameInputRef = useRef<HTMLInputElement>(null);


    // Multi-select state removal
    // const [assigneeCandidates, setAssigneeCandidates] = useState<any[]>([]);
    // const [loadingCandidates, setLoadingCandidates] = useState(false);

    useEffect(() => {
        if (!isOpen) return;

        // Auto-focus name field on open
        // Small delay to ensure the modal animation/mounting is settled
        const focusTimeout = setTimeout(() => {
            if (nameInputRef.current && !nameInputRef.current.disabled) {
                nameInputRef.current.focus();
                // If there's already text (Edit mode), select it for faster replacement
                if (isEdit) {
                    nameInputRef.current.select();
                }
            }
        }, 150);

        if (isEdit && initialData) {
            setFormData({
                custom_id: initialData.custom_id || '',
                name: initialData.name || '',
                description: initialData.description || '',
                project_manager_id: initialData.project_manager_id != null ? String(initialData.project_manager_id) : '',
                due_date: initialData.due_date ? initialData.due_date.split('T')[0] : '',
                start_date: initialData.start_date ? initialData.start_date.split('T')[0] : '',
                end_date: initialData.end_date ? initialData.end_date.split('T')[0] : '',
                time_spent: initialData.time_spent != null ? String(initialData.time_spent) : '',
                work_status: initialData.work_status || 'in_progress',
                assignee_ids: []
            });
        } else {
            setFormData({
                custom_id: '',
                name: '',
                description: '',
                project_manager_id: (type === 'project' && user?.role !== 'super_admin') ? String(user?.id || '') : '',
                due_date: '',
                start_date: '',
                end_date: '',
                time_spent: '',
                work_status: 'in_progress',
                assignee_ids: []
            });
        }
        setManagerSearch('');

        // Fetch Managers for Project Creation/Edit (Admin/HR only)
        if (type === 'project' && user) {
            // IMMEDIATE: Pre-populate managers list with the current PM if editing
            // to avoid "Select Project Manager" flicker while list loads
            if (isEdit && initialData?.project_manager_id) {
                setManagers([{
                    id: initialData.project_manager_id,
                    name: initialData.manager_name || 'Project Manager',
                    empId: '' // We can leave this empty or pass it if available
                }]);
            }

            // Fetch managers if user has permission to assign (Super Admin, HR, Manager)
            if (['super_admin', 'hr', 'manager'].includes(user.role)) {
                employeeService.getEmployees(1, 1000).then(res => {
                    const eligibleManagers = res.employees.filter((emp: any) =>
                        ['super_admin', 'hr', 'manager'].includes(emp.role) &&
                        !['on_notice', 'resigned', 'terminated', 'inactive'].includes(emp.status)
                    );
                    setManagers(eligibleManagers);
                }).catch(() => { });
            }
        }
        // Removed Access List Fetching
        return () => clearTimeout(focusTimeout);
    }, [isOpen, type, user, isEdit, initialData, parentId]);

    if (!isOpen) return null;

    // Dirty Checking
    const isDirty = (() => {
        if (!isEdit) return true;
        if (!initialData) return false;

        const nameChanged = formData.name !== (initialData.name || '');
        const descChanged = formData.description !== (initialData.description || '');
        const pmChanged = type === 'project' && formData.project_manager_id !== String(initialData.project_manager_id || '');
        const taskDatesChanged = type === 'task' && (formData.start_date !== (initialData.start_date || '') || formData.end_date !== (initialData.end_date || ''));
        const timeSpentChanged = formData.time_spent !== (initialData.time_spent != null ? String(initialData.time_spent) : '');
        const workStatusChanged = formData.work_status !== (initialData.work_status || 'in_progress');

        return nameChanged || descChanged || pmChanged || taskDatesChanged || timeSpentChanged || workStatusChanged;
    })();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Strict Validation for Project Creation
        if (type === 'project' && !formData.project_manager_id) {
            showError('Please select a Project Manager');
            return;
        }

        if (!formData.description || !formData.description.trim()) {
            showError('Description is mandatory');
            return;
        }

        try {
            setLoading(true);
            let result: any;

            // Sanitize payload: Remove empty strings for optional fields like due_date to prevent DB errors
            const basePayload: any = { ...formData };
            if (basePayload.due_date === '') basePayload.due_date = undefined;

            if (type === 'project') {
                const payload = { ...basePayload }; // Use basePayload for project specific modifications
                // The previous check `if (!payload.project_manager_id)` is now handled by the strict validation above.

                if (isEdit && initialData?.id) {
                    const isGlobalAdmin = user?.role === 'super_admin';
                    const isHR = user?.role === 'hr';
                    const isManager = user?.role === 'manager';
                    const isPM = String(initialData.project_manager_id) === String(user?.id);

                    // Access strictly restricted to assigned Project Manager only.
                    const canManageMetadata = isPM;
                    const canManageDetails = isPM;

                    if (!canManageDetails) {
                        throw new Error('You do not have permission to edit this project');
                    }

                    const updateData: any = {
                        name: payload.name,
                        description: payload.description,
                    };

                    // Requirement: Only the PM can change PM or End Date
                    if (canManageMetadata) {
                        updateData.project_manager_id = parseInt(payload.project_manager_id);
                        if (payload.due_date) updateData.end_date = payload.due_date;
                    }

                    result = await projectService.updateProject(initialData.id, updateData);
                } else {
                    result = await projectService.createProject({
                        ...payload,
                        project_manager_id: parseInt(payload.project_manager_id),
                        start_date: undefined,
                        end_date: undefined
                    });
                }
            } else if (type === 'module' && parentId) {
                const payload = { ...basePayload };
                // Access strictly restricted to PM. No global bypass.
                const isAuthorized = projectManagerId === user?.id;
                if (!isAuthorized) throw new Error('You do not have permission to manage modules');

                if (isEdit && initialData?.id) {
                    // Omit assigneeIds to prevent updating access
                    result = await projectService.updateModule(initialData.id, {
                        ...payload,
                        assigneeIds: undefined
                    });
                } else {
                    result = await projectService.createModule(parentId, {
                        ...payload,
                        assigneeIds: undefined
                    });
                }
            } else if (type === 'task' && parentId) {
                const payload = {
                    ...basePayload,
                    start_date: formData.start_date || undefined,
                    end_date: formData.end_date || undefined,
                    time_spent: formData.time_spent ? parseFloat(formData.time_spent) : undefined,
                    work_status: formData.work_status
                };

                if (isEdit && initialData?.id) {
                    // PERMISSION: Only creator or assigned Project Manager
                    const isCreator = String(initialData?.created_by) === String(user?.id);
                    const isPM = projectManagerId === user?.id;

                    if (!isCreator && !isPM) {
                        throw new Error('Access denied: Only the creator or the project manager can edit this task.');
                    }

                    result = await projectService.updateTask(initialData.id, {
                        ...payload,
                        assigneeIds: undefined
                    });
                } else {
                    result = await projectService.createTask(parentId, {
                        ...payload,
                        assigneeIds: undefined
                    });
                }
            }

            showSuccess(`${type.charAt(0).toUpperCase() + type.slice(1)} ${isEdit ? 'updated' : 'created'} successfully`);
            onSuccess(result);
            onClose();
        } catch (err: any) {
            const errorMessage = err.response?.data?.error || err.message || 'Failed to save item';
            showError(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    const getTitle = () => {
        if (isEdit) return `Edit ${toTitleCase(type)}`;
        switch (type) {
            case 'project': return 'Create New Project';
            case 'module': return 'Add Module';
            case 'task': return 'Add Task';
            default: return 'Create';
        }
    };

    const canEditDetails = type === 'project' && isEdit && (String(initialData?.project_manager_id) === String(user?.id));

    // PM Selection & Metadata:
    // Strictly restricted to the Project Manager or during creation (SA/HR/Manager)
    const canManageGlobal = ['super_admin', 'hr', 'manager'].includes(user?.role || '');
    const isManagerSelectDisabled = isEdit ? String(initialData?.project_manager_id) !== String(user?.id) : !canManageGlobal;
    const isMetadataDisabled = isEdit ? String(initialData?.project_manager_id) !== String(user?.id) : !canManageGlobal;

    // Character limits
    const NAME_LIMIT = 20;
    const DESC_LIMIT = 200;

    // Helper for Sentence Case (First letter capitalized)
    const toSentenceCase = (str: string) => {
        if (!str || typeof str !== 'string') return str || '';
        return str.charAt(0).toUpperCase() + str.slice(1);
    };

    // Helper for Title Case (kept for Name/other fields)
    const toTitleCase = (str: string) => {
        if (!str || typeof str !== 'string') return str || '';
        return str.replace(/\b\w/g, (char) => char.toUpperCase());
    };

    const getRoleLabel = (role: string) => {
        switch (role) {
            case 'super_admin': return 'Super Admin';
            case 'hr': return 'HR';
            case 'manager': return 'Manager';
            default: return role;
        }
    };

    // ... (rest of the file)


    const filteredManagers = managers.filter(m =>
        m.name.toLowerCase().includes(managerSearch.toLowerCase()) ||
        m.empId.toLowerCase().includes(managerSearch.toLowerCase())
    );

    const getSelectedManagerLabel = () => {
        if (formData.project_manager_id) {
            // Safe guard for user
            if (user && user.role !== 'super_admin' && String(formData.project_manager_id) === String(user.id)) {
                return `${toTitleCase(user.name || 'Me')}${user.empId ? ` (${user.empId})` : ''}`;
            }
            const selected = managers.find(m => String(m.id) === String(formData.project_manager_id));
            if (selected) {
                return `${toTitleCase(selected.name)}${selected.empId ? ` (${selected.empId})` : ''}`;
            }
            // FALLBACK: If still loading, use initialData PM information
            if (isEdit && type === 'project' && initialData && String(initialData.project_manager_id) === String(formData.project_manager_id)) {
                return toTitleCase(initialData.manager_name || 'Project Manager');
            }
        }
        return 'Select Project Manager';
    };

    return (
        <div className="modal-overlay">
            <div className="modal-container">
                <div className="modal-header">
                    <h2>{getTitle()}</h2>
                    <button onClick={onClose} className="close-button">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="modal-body">
                        {/* Name */}
                        <div className="form-group">
                            <label className="form-label">
                                {type === 'project' ? 'Project Name' : type === 'task' ? 'Task' : 'Name'} <span className="text-danger">*</span>
                            </label>
                            <input
                                ref={nameInputRef}
                                type="text"
                                className={`form-input ${isEdit && type === 'project' && !canEditDetails ? 'disabled' : ''}`}
                                value={formData.name}
                                onChange={e => {
                                    const val = e.target.value;
                                    // Validation: Only letters, numbers and spaces allowed
                                    const isValid = /^[a-zA-Z0-9 ]*$/.test(val);

                                    if (isValid && val.length <= NAME_LIMIT) {
                                        setFormData({ ...formData, name: toTitleCase(val) });
                                    }
                                }}
                                required
                                disabled={isEdit && type === 'project' && !canEditDetails}
                            />
                            <div className="char-counter">
                                {formData.name.length}/{NAME_LIMIT}
                            </div>
                        </div>

                        {/* Description */}
                        <div className="form-group">
                            <label className="form-label">
                                Description <span className="text-danger">*</span>
                            </label>
                            <textarea
                                className={`form-textarea ${isEdit && type === 'project' && !canEditDetails ? 'disabled' : ''}`}
                                rows={5}
                                value={formData.description}
                                onChange={e => {
                                    const val = e.target.value;
                                    if (val.length <= DESC_LIMIT) {
                                        // Only enforce sentence case (first letter capital)
                                        setFormData({ ...formData, description: toSentenceCase(val) });
                                    }
                                }}
                                disabled={isEdit && type === 'project' && !canEditDetails}
                                required
                            />
                            <div className="char-counter">
                                {formData.description.length}/{DESC_LIMIT}
                            </div>
                        </div>

                        {type === 'task' && (() => {
                            const taskStatusOptions = [
                                { value: 'not_started', label: 'Not Started', color: '#64748b', bg: '#f1f5f9' },
                                { value: 'in_progress', label: 'In Progress', color: '#b45309', bg: '#fffbeb' },
                                { value: 'completed', label: 'Completed', color: '#065f46', bg: '#d1fae5' },
                                { value: 'on_hold', label: 'On Hold', color: '#92400e', bg: '#fef3c7' },
                            ];
                            const selectedStatus = taskStatusOptions.find(s => s.value === formData.work_status) || taskStatusOptions[0];
                            return (
                                <div className="form-grid-2">
                                    {/* Date */}
                                    <div className="form-group">
                                        <label className="form-label">Date</label>
                                        <DatePicker
                                            value={formData.start_date}
                                            onChange={date => setFormData({ ...formData, start_date: date, end_date: date })}
                                            placeholder="dd-mm-yyyy"
                                            max={new Date().toISOString().split('T')[0]}
                                        />
                                    </div>

                                    {/* Hours */}
                                    <div className="form-group">
                                        <label className="form-label">Hours</label>
                                        <input
                                            type="number"
                                            className="form-input"
                                            value={formData.time_spent}
                                            min="0"
                                            max="12"
                                            step="0.25"
                                            placeholder="0.00"
                                            onKeyDown={e => {
                                                if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault();
                                                const cur = formData.time_spent.replace('.', '');
                                                if (cur.replace(/\D/g, '').length >= 2 && !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', '.'].includes(e.key) && !e.key.includes('Arrow')) {
                                                    if (e.key !== '.' && !formData.time_spent.includes('.')) e.preventDefault();
                                                }
                                            }}
                                            onChange={e => {
                                                const val = e.target.value;
                                                const num = parseFloat(val);
                                                if (val === '' || (num >= 0 && num <= 12)) {
                                                    setFormData({ ...formData, time_spent: val });
                                                }
                                            }}
                                        />
                                    </div>

                                    {/* Task Status — styled DropdownMenu */}
                                    <div className="form-group" style={{ gridColumn: 'span 2' }}>
                                        <label className="form-label">
                                            Task Status <span className="text-danger">*</span>
                                        </label>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <button
                                                    type="button"
                                                    className="custom-select-trigger"
                                                >
                                                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <span style={{
                                                            display: 'inline-block',
                                                            width: '10px', height: '10px',
                                                            borderRadius: '50%',
                                                            backgroundColor: selectedStatus.color,
                                                            flexShrink: 0
                                                        }} />
                                                        {selectedStatus.label}
                                                    </span>
                                                    <ChevronDown size={16} className="text-gray-400" />
                                                </button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent
                                                align="start"
                                                sideOffset={5}
                                                style={{ width: '100%', minWidth: '280px', zIndex: 99999 }}
                                            >
                                                {taskStatusOptions.map((opt, i) => (
                                                    <React.Fragment key={opt.value}>
                                                        <DropdownMenuItem
                                                            onClick={() => setFormData({ ...formData, work_status: opt.value })}
                                                            style={{
                                                                display: 'flex', alignItems: 'center', gap: '10px',
                                                                padding: '9px 12px', cursor: 'pointer',
                                                                fontWeight: formData.work_status === opt.value ? 600 : 400,
                                                                backgroundColor: formData.work_status === opt.value ? opt.bg : 'transparent',
                                                                color: formData.work_status === opt.value ? opt.color : '#374151',
                                                                borderRadius: '6px', margin: '2px 4px'
                                                            }}
                                                        >
                                                            <span style={{
                                                                display: 'inline-block', width: '10px', height: '10px',
                                                                borderRadius: '50%', backgroundColor: opt.color, flexShrink: 0
                                                            }} />
                                                            {opt.label}
                                                        </DropdownMenuItem>
                                                        {i < taskStatusOptions.length - 1 && <DropdownMenuSeparator />}
                                                    </React.Fragment>
                                                ))}
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </div>
                            );
                        })()}

                        {/* Project Manager Selection */}
                        {type === 'project' && (
                            <div className="form-group">
                                <label className="form-label">
                                    Project Manager <span className="text-danger">*</span>
                                </label>

                                <DropdownMenu onOpenChange={(open) => !open && setManagerSearch('')}>
                                    <DropdownMenuTrigger asChild disabled={isManagerSelectDisabled}>
                                        <button
                                            type="button"
                                            className={`custom-select-trigger ${isManagerSelectDisabled ? 'disabled' : ''}`}
                                            disabled={isManagerSelectDisabled}
                                        >
                                            <span className="selected-val">
                                                {getSelectedManagerLabel()}
                                            </span>
                                            <ChevronDown size={16} className="text-gray-400" />
                                        </button>
                                    </DropdownMenuTrigger>

                                    {!isManagerSelectDisabled && (
                                        <DropdownMenuContent
                                            className="manager-dropdown-content"
                                            side="top"
                                            align="start"
                                            sideOffset={5}
                                            style={{ minWidth: (formData.name && type === 'project') ? '350px' : '300px' }} // Dynamic or stable width
                                        >
                                            <div className="dropdown-search-wrapper">
                                                <Search size={14} className="search-icon" />
                                                <input
                                                    type="text"
                                                    placeholder="Search by name or ID..."
                                                    value={managerSearch}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        // Validation: Allow letters, numbers and spaces
                                                        if (/^[a-zA-Z0-9 ]*$/.test(val)) {
                                                            setManagerSearch(val);
                                                        }
                                                    }}
                                                    className="dropdown-search-input"
                                                    autoFocus
                                                    onKeyDown={(e) => {
                                                        // CRITICAL: Stop propagation for ALL keys to prevent Radix UI's 
                                                        // "type-ahead" logic from stealing focus while user is typing
                                                        e.stopPropagation();
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
                                                        className="clear-search-btn"
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                )}
                                            </div>

                                            <div className="dropdown-items-scroll">
                                                {filteredManagers.length === 0 ? (
                                                    <EmptyState
                                                        title="No managers found"
                                                        description="Try adjusting your search terms"
                                                        icon={UserX}
                                                        size="small"
                                                        className="dropdown-empty-state"
                                                    />
                                                ) : (
                                                    filteredManagers.map((m, index) => (
                                                        <React.Fragment key={m.id}>
                                                            <DropdownMenuItem
                                                                onClick={() => {
                                                                    setFormData({ ...formData, project_manager_id: String(m.id) });
                                                                }}
                                                                className="manager-item"
                                                            >
                                                                <div className="manager-info">
                                                                    <span className="manager-name">
                                                                        {toTitleCase(m.name)}
                                                                        <span className="manager-id">({m.empId})</span>
                                                                    </span>
                                                                    <span className={`role-badge ${m.role}`}>
                                                                        {getRoleLabel(m.role)}
                                                                    </span>
                                                                </div>
                                                            </DropdownMenuItem>
                                                            {index < filteredManagers.length - 1 && <DropdownMenuSeparator />}
                                                        </React.Fragment>
                                                    ))
                                                )}
                                            </div>
                                        </DropdownMenuContent>
                                    )}
                                </DropdownMenu>
                            </div>
                        )}





                        <div className="modal-footer">
                            <button
                                type="button"
                                onClick={onClose}
                                className="btn btn-secondary"
                                disabled={loading}
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="btn btn-primary"
                                disabled={loading || (isEdit && !isDirty)}
                            >
                                {loading ? (isEdit ? 'Updating...' : 'Creating...') : (isEdit ? 'Update' : 'Create')}
                            </button>
                        </div>
                    </div>
                </form>
            </div >
        </div >
    );
};

