import React, { useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from 'react-query';
import { WorkspaceCard } from './components/WorkspaceCard';
import { DeleteConfirmModal } from './components/DeleteConfirmModal';
import { DescriptionModal } from './components/DescriptionModal';
import { Info, Plus, ChevronLeft, Edit, Layers, ClipboardList, ChevronDown } from 'lucide-react';
import AppLayout from '../../components/layout/AppLayout';
import { projectService } from '../../services/projectService';
import * as employeeService from '../../services/employeeService';
import { CreateModal } from './components/CreateModal';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import './ProjectWorkspace.css';

const StatusDropdown = React.memo(({
    currentStatus,
    canManageStatus,
    onStatusChange
}: {
    currentStatus?: string;
    canManageStatus: boolean;
    onStatusChange: (status: string) => void;
}) => {
    if (!currentStatus) return null;

    const statusOptions = [
        { value: 'active', label: 'Active', color: '#FFFFFF', bg: '#10B981', border: '#10B981' },
        { value: 'on_hold', label: 'On Hold', color: '#FFFFFF', bg: '#F59E0B', border: '#F59E0B' },
        { value: 'completed', label: 'Completed', color: '#FFFFFF', bg: '#6366F1', border: '#6366F1' },
        { value: 'archived', label: 'Archived', color: '#FFFFFF', bg: '#64748B', border: '#64748B' }
    ];

    const current = statusOptions.find(s => s.value === currentStatus) || statusOptions[0];

    if (!canManageStatus) {
        return (
            <span
                className="ws-status-badge"
                style={{
                    backgroundColor: current.bg,
                    color: current.color,
                    border: `2px solid ${current.border}`,
                    fontWeight: '700',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    fontSize: '12px',
                    padding: '4px 12px',
                    borderRadius: '20px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: '85px'
                }}
            >
                {current.label}
            </span>
        );
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    className="ws-status-badge"
                    style={{
                        backgroundColor: current.bg,
                        color: current.color,
                        border: `2px solid ${current.border}`,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontWeight: '700',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        fontSize: '11px',
                        padding: '4px 12px',
                        borderRadius: '20px',
                        transition: 'all 0.2s',
                        minWidth: '85px',
                        justifyContent: 'center'
                    }}
                >
                    {current.label}
                    <ChevronDown size={14} strokeWidth={2.5} />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                {statusOptions.map(option => (
                    <DropdownMenuItem
                        key={option.value}
                        onClick={() => onStatusChange(option.value)}
                        className="status-dropdown-item"
                        style={{
                            color: '#374151',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            fontWeight: '500'
                        }}
                    >
                        <span style={{
                            width: '10px',
                            height: '10px',
                            borderRadius: '3px',
                            backgroundColor: option.bg,
                            border: `2px solid ${option.border}`,
                            flexShrink: 0
                        }} />
                        {option.label}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
});

export const ProjectWorkspace: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const projectId = parseInt(id!);
    const navigate = useNavigate();
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const { showSuccess, showError } = useToast();

    const { data: allEmployees } = useQuery(['allEmployees'], () => employeeService.getEmployees(1, 1000).then((res: any) => res.employees));

    const [selectedModuleId, setSelectedModuleId] = useState<number | null>(null);
    const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);

    // Modal State
    const [createType, setCreateType] = useState<'project' | 'module' | 'task' | null>(null);
    const [createParentId, setCreateParentId] = useState<number | null>(null);
    const [isEdit, setIsEdit] = useState(false);
    const [editData, setEditData] = useState<any>(null);
    const [showProjectInfo, setShowProjectInfo] = useState(false);
    const [deleteModal, setDeleteModal] = useState<{
        isOpen: boolean;
        type: 'module' | 'task' | null;
        id: number | null;
    }>({ isOpen: false, type: null, id: null });

    // Queries
    const { data: project, refetch: refetchProject } = useQuery(
        ['project', projectId],
        () => projectService.getProject(projectId),
        { enabled: !!projectId }
    );

    const { data: projectMembers, refetch: refetchProjectMembers } = useQuery(
        ['project-members', projectId],
        () => projectService.getProjectMembers(projectId),
        { enabled: !!projectId }
    );

    const {
        data: modules,
        refetch: refetchModules,
        isLoading: modulesLoading,
        isError: modulesError
    } = useQuery(
        ['modules', projectId],
        () => projectService.getModules(projectId),
        { enabled: !!projectId }
    );

    const {
        data: tasks,
        refetch: refetchTasks,
        isLoading: tasksLoading,
        isError: tasksError
    } = useQuery(
        ['tasks', selectedModuleId],
        () => projectService.getTasks(selectedModuleId!),
        { enabled: !!selectedModuleId }
    );

    // Permissions
    const isProjectManager = !!project?.is_pm || (project?.project_manager_id !== undefined && String(project?.project_manager_id) === String(user?.id));
    const isSuperAdmin = user?.role === 'super_admin';
    const isHR = user?.role === 'hr';
    const isGlobalManager = user?.role === 'manager';
    const isProjectReadOnly = project?.status?.toLowerCase() !== 'active';

    // PM-level access strictly restricted to the assigned Project Manager
    const isPM = isProjectManager;

    const canManageProject = isPM && !isProjectReadOnly;
    const canManageResources = isPM && !isProjectReadOnly;
    const canCreateModule = canManageResources;

    const hasModuleAccess = modules?.find(m => m.id === selectedModuleId)?.assigned_users?.some(u => u.id === user?.id);
    const canAddTask = (canManageResources || hasModuleAccess) && !isProjectReadOnly;
    const canManageStatus = isPM;

    const handleCreate = (type: 'module' | 'task', parentId: number) => {
        if (type === 'module' && !canCreateModule) return;
        if (type === 'task' && !canAddTask) return;

        setCreateType(type);
        setCreateParentId(parentId);
        setIsEdit(false);
    };

    const handleEditProject = async () => {
        if (!canManageProject) return;
        const { data: freshProject } = await refetchProject();
        setCreateType('project' as any);
        setEditData(freshProject || project);
        setIsEdit(true);
    };

    const handleEdit = (type: 'module' | 'task', data: any) => {
        // PERMISSION: creator OR PM (Project-level or Global)
        const isCreator = String(data?.created_by) === String(user?.id);
        const canEdit = type === 'module'
            ? (canManageResources || isCreator)
            : (isCreator || isPM);

        if (!canEdit) {
            showError(`Access denied: Only the creator or an authorized manager can edit this ${type}.`);
            return;
        }

        setCreateType(type);
        setEditData(data);
        setIsEdit(true);
        setCreateParentId(type === 'module' ? projectId : selectedModuleId);
    };

    const handleDeleteModule = (moduleId: number) => {
        setDeleteModal({ isOpen: true, type: 'module', id: moduleId });
    };

    const handleDeleteTask = (taskId: number) => {
        setDeleteModal({ isOpen: true, type: 'task', id: taskId });
    };

    const confirmDelete = async () => {
        if (deleteModal.id === null || !deleteModal.type) return;
        const { type, id } = deleteModal;
        setDeleteModal({ isOpen: false, type: null, id: null });

        try {
            if (type === 'module') {
                await projectService.deleteModule(id);
                showSuccess("Module deleted successfully");
                if (selectedModuleId === id) {
                    setSelectedModuleId(null);
                    setSelectedTaskId(null);
                }
                refetchModules();
            } else if (type === 'task') {
                await projectService.deleteTask(id);
                showSuccess("Task deleted successfully");
                if (selectedTaskId === id) setSelectedTaskId(null);
                refetchTasks();
            }
        } catch (error: any) {
            showError(error.response?.data?.error || `Failed to delete ${type}`);
        }
    };

    const handleCreateSuccess = () => {
        if (createType === ('project' as any)) {
            refetchProject();
            refetchProjectMembers();
            refetchModules();
        } else if (createType === 'module') {
            refetchModules();
        } else if (createType === 'task') {
            refetchTasks();
        }
    };

    const assignModuleUserMutation = useMutation(
        ({ moduleId, userId, action, userObj }: { moduleId: number, userId: number, action: 'add' | 'remove', userObj?: any }) =>
            projectService.toggleAccess('module', moduleId, userId, action),
        {
            onSuccess: () => refetchModules()
        }
    );

    const assignTaskUserMutation = useMutation(
        ({ taskId, userId, action, userObj }: { taskId: number, userId: number, action: 'add' | 'remove', userObj?: any }) =>
            projectService.toggleAccess('task', taskId, userId, action),
        {
            onSuccess: () => refetchTasks()
        }
    );

    const updateStatusMutation = useMutation(
        (newStatus: string) => projectService.updateProject(project!.id, { status: newStatus as any }),
        {
            onSuccess: () => {
                refetchProject();
                queryClient.invalidateQueries('projects');
            }
        }
    );

    const handleStatusChange = useCallback((newStatus: string) => {
        if (!project || !canManageStatus) return;
        updateStatusMutation.mutate(newStatus);
    }, [project, canManageStatus, updateStatusMutation]);

    return (
        <AppLayout>
            <div className="workspace-container">
                <div className="ws-header">
                    <div className="ws-header-left">
                        <button onClick={() => navigate('/project-management')} className="btn-back">
                            <ChevronLeft size={16} /> Back
                        </button>
                        <div className="ws-project-info">
                            <h1 className="ws-project-title">
                                {project?.name || 'Loading...'}
                                <button className="ws-project-info-btn" onClick={() => setShowProjectInfo(true)}>
                                    <Info size={16} />
                                </button>
                                <span className="ws-project-id">ID: {project?.custom_id}</span>
                            </h1>
                        </div>
                    </div>
                    <div className="ws-header-right">
                        <StatusDropdown
                            currentStatus={project?.status}
                            canManageStatus={canManageStatus}
                            onStatusChange={handleStatusChange}
                        />
                        {canManageProject && (
                            <button className="btn-edit-project" onClick={handleEditProject}>
                                <Edit size={14} /> Edit Project
                            </button>
                        )}
                    </div>
                </div>

                <div className="ws-columns-wrapper">
                    {/* Column 1: Modules */}
                    <div className="ws-column">
                        <div className="ws-column-header">
                            <div className="ws-col-title"><Layers size={18} /> MODULES</div>
                            {canCreateModule && (
                                <button onClick={() => handleCreate('module', projectId)} className="btn-col-add">
                                    <Plus size={14} /> Add Module
                                </button>
                            )}
                        </div>
                        <div className="ws-column-body">
                            {modulesLoading ? <p>Loading...</p> : modules?.map(module => (
                                <WorkspaceCard
                                    key={module.id}
                                    id={module.id}
                                    customId={module.custom_id}
                                    name={module.name}
                                    description={module.description}
                                    assignedUsers={module.assigned_users || []}
                                    isSelected={selectedModuleId === module.id}
                                    onClick={() => { setSelectedModuleId(module.id); setSelectedTaskId(null); }}
                                    onEdit={() => handleEdit('module', module)}
                                    onDelete={() => handleDeleteModule(module.id)}
                                    isPM={canManageResources}
                                    isCompact={true}
                                    createdByName={module.created_by_name}
                                    availableUsers={(allEmployees || projectMembers || [])
                                        .filter((u: any) => String(u.id) !== String(project?.project_manager_id))
                                        .map((u: any) => ({
                                            ...u,
                                            initials: u.initials || (u.name ? u.name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase() : '??')
                                        }))}
                                    onAssignUser={(userId) => {
                                        const isAssigned = (module.assigned_users || []).some((u: any) => String(u.id) === String(userId));
                                        assignModuleUserMutation.mutate({ moduleId: module.id, userId, action: isAssigned ? 'remove' : 'add' });
                                    }}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Column 2: Tasks */}
                    <div className="ws-column">
                        <div className="ws-column-header">
                            <div className="ws-col-title"><ClipboardList size={18} /> TASKS</div>
                            {selectedModuleId && canAddTask && (
                                <button onClick={() => handleCreate('task', selectedModuleId)} className="btn-col-add">
                                    <Plus size={14} /> Add Task
                                </button>
                            )}
                        </div>
                        <div className="ws-column-body">
                            {!selectedModuleId ? <p>Select a module</p> : tasksLoading ? <p>Loading...</p> : tasks?.map(task => {
                                // PERMISSION: creator OR PM (Project-level or Global)
                                const canEditTask = (String(task?.created_by) === String(user?.id) || isPM);

                                return (
                                    <WorkspaceCard
                                        key={task.id}
                                        id={task.id}
                                        customId={task.custom_id}
                                        name={task.name}
                                        description={task.description}
                                        startDate={task.start_date}
                                        endDate={task.end_date}
                                        timeSpent={task.time_spent}
                                        workStatus={task.work_status}
                                        assignedUsers={task.assigned_users || []}
                                        isSelected={selectedTaskId === task.id}
                                        onClick={() => setSelectedTaskId(task.id)}
                                        onEdit={() => handleEdit('task', task)}
                                        onDelete={() => handleDeleteTask(task.id)}
                                        isPM={canEditTask}
                                        isCompact={false}
                                        createdByName={task.created_by_name}
                                    />
                                );
                            })}
                        </div>
                    </div>
                </div>

                <CreateModal
                    isOpen={!!createType}
                    onClose={() => { setCreateType(null); setCreateParentId(null); setIsEdit(false); setEditData(null); }}
                    type={createType || 'module'}
                    parentId={createParentId || undefined}
                    onSuccess={handleCreateSuccess}
                    initialData={isEdit ? editData : undefined}
                    isEdit={isEdit}
                    projectManagerId={project?.project_manager_id}
                />

                <DeleteConfirmModal
                    isOpen={deleteModal.isOpen}
                    onClose={() => setDeleteModal({ isOpen: false, type: null, id: null })}
                    onConfirm={confirmDelete}
                    title={`Delete ${deleteModal.type?.charAt(0).toUpperCase()}${deleteModal.type?.slice(1)}`}
                    message={`Are you sure?`}
                />

                <DescriptionModal
                    isOpen={showProjectInfo}
                    onClose={() => setShowProjectInfo(false)}
                    title={project?.name || ''}
                    customId={project?.custom_id || ''}
                    description={project?.description || ''}
                />
            </div>
        </AppLayout>
    );
};
