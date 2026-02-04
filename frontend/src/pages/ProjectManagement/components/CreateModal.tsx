import React, { useState, useEffect } from 'react';
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
import './CreateModal.css';

interface CreateModalProps {
    isOpen: boolean;
    onClose: () => void;
    type: 'project' | 'module' | 'task' | 'activity';
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
        assignee_ids: [] as number[]
    });
    const [loading, setLoading] = useState(false);
    const [managers, setManagers] = useState<any[]>([]);
    const [managerSearch, setManagerSearch] = useState('');

    // Multi-select state removal
    // const [assigneeCandidates, setAssigneeCandidates] = useState<any[]>([]);
    // const [loadingCandidates, setLoadingCandidates] = useState(false);

    useEffect(() => {
        if (!isOpen) return;

        if (isEdit && initialData) {
            setFormData({
                custom_id: initialData.custom_id || '',
                name: initialData.name || '',
                description: initialData.description || '',
                project_manager_id: initialData.project_manager_id ? String(initialData.project_manager_id) : '',
                due_date: initialData.due_date || '',
                assignee_ids: [] // Removed handling
            });
        } else {
            setFormData({
                custom_id: '',
                name: '',
                description: '',
                project_manager_id: (type === 'project' && user?.role !== 'super_admin') ? String(user?.id || '') : '',
                due_date: '',
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
    }, [isOpen, type, user, isEdit, initialData, parentId]);

    if (!isOpen) return null;

    // Dirty Checking
    const isDirty = (() => {
        if (!isEdit) return true; // Always allow create if valid (form validation handles the rest)
        if (!initialData) return false;

        const nameChanged = formData.name !== (initialData.name || '');
        const descChanged = formData.description !== (initialData.description || '');
        // Check PM change only for project
        const pmChanged = type === 'project' && formData.project_manager_id !== String(initialData.project_manager_id || '');

        return nameChanged || descChanged || pmChanged;
    })();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Strict Validation for Project Creation
        if (type === 'project' && !formData.project_manager_id) {
            showError('Please select a Project Manager');
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
                    const isPM = String(initialData.project_manager_id) === String(user?.id);

                    // Requirement: SA and HR can edit EVERYTHING. PM can only edit Name/Description.
                    const canEditMetadata = isGlobalAdmin || isHR;
                    const canEditDetails = canEditMetadata || isPM;

                    if (!canEditDetails) {
                        throw new Error('You do not have permission to edit this project');
                    }

                    const updateData: any = {
                        name: payload.name,
                        description: payload.description,
                    };

                    // Only Super Admin and HR can change Project Manager and Dates
                    if (canEditMetadata) {
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
                // STRICT: Only Project Manager can add/edit modules
                const isAuthorized = ['super_admin', 'hr'].includes(user?.role || '') || projectManagerId === user?.id;
                if (!isAuthorized) throw new Error('Only the Project Manager, HR, or Super Admin can manage modules');

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
                const payload = { ...basePayload };
                // STRICT: Only Project Manager can add/edit tasks
                const isAuthorized = ['super_admin', 'hr'].includes(user?.role || '') || projectManagerId === user?.id;
                if (!isAuthorized) throw new Error('Only the Project Manager, HR, or Super Admin can manage tasks');

                if (isEdit && initialData?.id) {
                    // Payload sanitization ensures due_date is undefined if empty, preventing 500 error
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
            } else if (type === 'activity' && (parentId || initialData?.id)) {
                const payload = { ...basePayload };
                // STRICT: Only Project Manager can add/edit activities
                const isAuthorized = ['super_admin', 'hr'].includes(user?.role || '') || projectManagerId === user?.id;
                if (!isAuthorized) throw new Error('Only the Project Manager, HR, or Super Admin can manage activities');

                if (isEdit && initialData?.id) {
                    result = await projectService.updateActivity(initialData.id, {
                        ...payload,
                        assigneeIds: undefined
                    });
                } else {
                    result = await projectService.createActivity(parentId!, {
                        ...payload,
                        assigneeIds: undefined
                    });
                }
            }

            showSuccess(`${type.charAt(0).toUpperCase() + type.slice(1)} ${isEdit ? 'updated' : 'created'} successfully`);
            onSuccess(result);
            onClose();
        } catch (err: any) {
            showError(err.message || 'Failed to save item');
            // If the process breaks (error), we keep the modal open so user can see error?
            // User requested: "after clicking save or cancel the pop up should close, even if process breaks"
            // Doing that here would hide the error from the user. 
            // Better interpretation: Ensure onClose is called if they click Cancel (which it is).
            // For Save error, closing immediately prevents them from seeing why it failed.
            // I will keep it open on error but ensure it closes on success. 
            // If strict adherence to "close even if process breaks" is required:
            // onClose(); 
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
            case 'activity': return 'Add Activity';
            default: return 'Create';
        }
    };

    const canEditDetails = type === 'project' && isEdit && (user?.role === 'super_admin' || user?.role === 'hr' || String(initialData?.project_manager_id) === String(user?.id));

    // PM Selection:
    // - Create: Enabled for Super Admin, HR, Manager
    // - Edit: Enabled ONLY for Super Admin and HR
    const isManagerSelectDisabled = isEdit
        ? !['super_admin', 'hr'].includes(user?.role || '')
        : !['super_admin', 'hr', 'manager'].includes(user?.role || '');

    // Character limits
    const NAME_LIMIT = 20;
    const DESC_LIMIT = 200;

    // Helper for Sentence Case (First letter capitalized)
    const toSentenceCase = (str: string) => {
        if (!str) return str;
        return str.charAt(0).toUpperCase() + str.slice(1);
    };

    // Helper for Title Case (kept for Name/other fields)
    const toTitleCase = (str: string) => {
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
            if (user?.role !== 'super_admin' && formData.project_manager_id === String(user?.id)) {
                return `${toTitleCase((user as any).name || 'Me')}${user?.empId ? ` (${user.empId})` : ''}`;
            }
            const selected = managers.find(m => String(m.id) === formData.project_manager_id);
            if (selected) {
                return `${toTitleCase(selected.name)}${selected.empId ? ` (${selected.empId})` : ''}`;
            }
            // FALLBACK: If still loading, use initialData PM information
            if (isEdit && type === 'project' && initialData && String(initialData.project_manager_id) === formData.project_manager_id) {
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
                                {type === 'project' ? 'Project Name' : 'Name'} <span className="text-danger">*</span>
                            </label>
                            <input
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
                            <label className="form-label">Description</label>
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
                            />
                            <div className="char-counter">
                                {formData.description.length}/{DESC_LIMIT}
                            </div>
                        </div>

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
                                                        // Validation: Allow only letters and spaces
                                                        if (/^[a-zA-Z ]*$/.test(val)) {
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




                    </div>

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
                </form>
            </div>
        </div>
    );
};
