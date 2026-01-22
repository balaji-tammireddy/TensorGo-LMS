import React, { useState, useEffect } from 'react';
import { X, ChevronDown, Search, UserX, CheckSquare } from 'lucide-react';
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
    onSuccess: () => void;
    initialData?: any;
    isEdit?: boolean;
}

export const CreateModal: React.FC<CreateModalProps> = ({
    isOpen,
    onClose,
    type,
    parentId,
    onSuccess,
    initialData,
    isEdit = false
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

    // Multi-select state
    const [assigneeCandidates, setAssigneeCandidates] = useState<any[]>([]);
    const [loadingCandidates, setLoadingCandidates] = useState(false);

    useEffect(() => {
        if (!isOpen) return;

        if (isEdit && initialData) {
            setFormData({
                custom_id: initialData.custom_id || '',
                name: initialData.name || '',
                description: initialData.description || '',
                project_manager_id: initialData.project_manager_id ? String(initialData.project_manager_id) : '',
                due_date: initialData.due_date || '',
                assignee_ids: [] // Editing access list not supported here yet, or handled separately
            });
        } else {
            setFormData({
                custom_id: '',
                name: '',
                description: '',
                project_manager_id: '',
                due_date: '',
                assignee_ids: []
            });
        }
        setManagerSearch('');

        // Fetch Managers for Project Creation
        if (type === 'project' && user) {
            if (user.role === 'super_admin') {
                employeeService.getEmployees(1, 1000).then(res => {
                    const eligibleManagers = res.employees.filter((emp: any) =>
                        ['super_admin', 'hr', 'manager'].includes(emp.role) &&
                        !['on_notice', 'resigned', 'terminated', 'inactive'].includes(emp.status)
                    );
                    setManagers(eligibleManagers);
                }).catch(() => { });
            } else if (['hr', 'manager'].includes(user.role)) {
                if (!isEdit) {
                    setFormData(prev => ({ ...prev, project_manager_id: String(user.id) }));
                }
            }
        }

        // Fetch Assignee Candidates for Module/Task/Activity
        if (['module', 'task', 'activity'].includes(type) && parentId && !isEdit) {
            setLoadingCandidates(true);
            let fetchLevel = '';
            // For Module creation, we need Project Members -> fetchLevel = 'project'
            if (type === 'module') fetchLevel = 'project';
            // For Task creation, we need Module Access List -> fetchLevel = 'module'
            if (type === 'task') fetchLevel = 'module';
            // For Activity creation, we need Task Access List -> fetchLevel = 'task'
            if (type === 'activity') fetchLevel = 'task';

            projectService.getAccessList(fetchLevel, parentId)
                .then(setAssigneeCandidates)
                .catch(console.error)
                .finally(() => setLoadingCandidates(false));
        }
    }, [isOpen, type, user, isEdit, initialData, parentId]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const payload = { ...formData };

            if (!/^\d{3}$/.test(payload.custom_id)) {
                throw new Error('ID must be exactly 3 integers (e.g., 101)');
            }

            if (type === 'project') {
                if (!payload.project_manager_id) {
                    throw new Error('Please select a Project Manager');
                }

                if (isEdit && initialData?.id) {
                    const updateData: any = {
                        name: payload.name,
                        description: payload.description
                    };

                    if (user?.role === 'super_admin') {
                        updateData.project_manager_id = parseInt(payload.project_manager_id);
                    }

                    await projectService.updateProject(initialData.id, updateData);
                } else {
                    await projectService.createProject({
                        ...payload,
                        project_manager_id: parseInt(payload.project_manager_id),
                        start_date: undefined,
                        end_date: undefined
                    });
                }
            } else if (type === 'module' && parentId) {
                await projectService.createModule(parentId, payload);
            } else if (type === 'task' && parentId) {
                await projectService.createTask(parentId, payload);
            } else if (type === 'activity' && parentId) {
                // Activity creation stub
            }

            showSuccess(`${type.charAt(0).toUpperCase() + type.slice(1)} ${isEdit ? 'updated' : 'created'} successfully`);
            onSuccess();
            onClose();
        } catch (err: any) {
            showError(err.message || 'Failed to save item');
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

    const isManagerSelectDisabled = user?.role !== 'super_admin';

    // Character limits
    const NAME_LIMIT = 20;
    const DESC_LIMIT = 200;

    // Helper for Title Case
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

    const filteredManagers = managers.filter(m =>
        m.name.toLowerCase().includes(managerSearch.toLowerCase()) ||
        m.empId.toLowerCase().includes(managerSearch.toLowerCase())
    );

    const getSelectedManagerLabel = () => {
        if (formData.project_manager_id) {
            if (user?.role !== 'super_admin' && formData.project_manager_id === String(user?.id)) {
                return `${toTitleCase((user as any).name || 'Me')} (${user?.empId})`;
            }
            const selected = managers.find(m => String(m.id) === formData.project_manager_id);
            if (selected) {
                return `${toTitleCase(selected.name)} (${selected.empId})`;
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
                        {/* Custom ID */}
                        <div className="form-group">
                            <label className="form-label">
                                ID <span className="text-danger">*</span>
                            </label>
                            <input
                                type="text"
                                maxLength={3}
                                className="form-input"
                                value={formData.custom_id}
                                onChange={e => {
                                    const val = e.target.value;
                                    if (/^\d*$/.test(val)) setFormData({ ...formData, custom_id: val });
                                }}
                                required
                                disabled={isEdit}
                                style={isEdit ? { backgroundColor: '#f3f4f6', cursor: 'not-allowed' } : {}}
                            />
                        </div>

                        {/* Name */}
                        <div className="form-group">
                            <label className="form-label">
                                {type === 'project' ? 'Project Name' : 'Name'} <span className="text-danger">*</span>
                            </label>
                            <input
                                type="text"
                                className="form-input"
                                value={formData.name}
                                onChange={e => {
                                    if (e.target.value.length <= NAME_LIMIT) {
                                        setFormData({ ...formData, name: toTitleCase(e.target.value) });
                                    }
                                }}
                                required
                            />
                            <div className="char-counter">
                                {formData.name.length}/{NAME_LIMIT}
                            </div>
                        </div>

                        {/* Description */}
                        <div className="form-group">
                            <label className="form-label">Description</label>
                            <textarea
                                className="form-textarea"
                                rows={5}
                                value={formData.description}
                                onChange={e => {
                                    if (e.target.value.length <= DESC_LIMIT) {
                                        setFormData({ ...formData, description: toTitleCase(e.target.value) });
                                    }
                                }}
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
                                    <DropdownMenuTrigger asChild>
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
                                        >
                                            <div className="dropdown-search-wrapper">
                                                <Search size={14} className="search-icon" />
                                                <input
                                                    type="text"
                                                    placeholder="Search by name or ID..."
                                                    value={managerSearch}
                                                    onChange={(e) => setManagerSearch(e.target.value)}
                                                    className="dropdown-search-input"
                                                    autoFocus
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

                        {type === 'task' && (
                            <div className="form-group">
                                <label className="form-label">Due Date</label>
                                <input
                                    type="date"
                                    className="form-input"
                                    value={formData.due_date}
                                    onChange={e => setFormData({ ...formData, due_date: e.target.value })}
                                />
                            </div>
                        )}

                        {/* Access Assignment (For Module, Task, Activity) */}
                        {['module', 'task', 'activity'].includes(type) && !isEdit && (
                            <div className="form-group">
                                <label className="form-label">
                                    Assign Access <span className="text-muted">(Optional - PM has access by default)</span>
                                </label>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <button type="button" className="custom-select-trigger">
                                            <span className="selected-val">
                                                {formData.assignee_ids.length > 0
                                                    ? `${formData.assignee_ids.length} User${formData.assignee_ids.length > 1 ? 's' : ''} Selected`
                                                    : 'Select Users'}
                                            </span>
                                            <ChevronDown size={16} className="text-gray-400" />
                                        </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent className="manager-dropdown-content" align="start">
                                        <div className="dropdown-items-scroll">
                                            {loadingCandidates ? (
                                                <div className="p-3 text-sm text-gray-500">Loading users...</div>
                                            ) : assigneeCandidates.length === 0 ? (
                                                <div className="p-3 text-sm text-gray-500">No users found with access to parent scope.</div>
                                            ) : (
                                                assigneeCandidates.map(user => (
                                                    <DropdownMenuItem
                                                        key={user.id}
                                                        onSelect={(e) => e.preventDefault()}
                                                        onClick={() => {
                                                            const ids = formData.assignee_ids.includes(user.id)
                                                                ? formData.assignee_ids.filter(id => id !== user.id)
                                                                : [...formData.assignee_ids, user.id];
                                                            setFormData({ ...formData, assignee_ids: ids });
                                                        }}
                                                        className="manager-item"
                                                    >
                                                        <div className="flex items-center gap-2 w-full">
                                                            <div className={`checkbox-custom ${formData.assignee_ids.includes(user.id) ? 'checked' : ''}`}>
                                                                {formData.assignee_ids.includes(user.id) && <CheckSquare size={12} color="white" />}
                                                            </div>
                                                            <div className="manager-info">
                                                                <span className="manager-name">
                                                                    {toTitleCase(user.name)} <span className="manager-id">({user.empId})</span>
                                                                </span>
                                                                <span className={`role-badge ${user.role}`}>{getRoleLabel(user.role)}</span>
                                                            </div>
                                                        </div>
                                                    </DropdownMenuItem>
                                                ))
                                            )}
                                        </div>
                                    </DropdownMenuContent>
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
                            disabled={loading}
                        >
                            {loading ? (isEdit ? 'Updating...' : 'Creating...') : (isEdit ? 'Update' : 'Create')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
