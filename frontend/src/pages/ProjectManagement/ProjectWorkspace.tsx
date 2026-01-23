import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from 'react-query';
import { Plus, ChevronLeft, Edit, Layers, ClipboardList, ChevronDown } from 'lucide-react';
import AppLayout from '../../components/layout/AppLayout';
import { projectService } from '../../services/projectService';
import { CreateModal } from './components/CreateModal';
import { useAuth } from '../../contexts/AuthContext';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import { WorkspaceCard } from './components/WorkspaceCard';
import { DeleteConfirmModal } from './components/DeleteConfirmModal';
import './ProjectWorkspace.css';

export const ProjectWorkspace: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const projectId = parseInt(id!);
    const navigate = useNavigate();
    const { user } = useAuth();
    const queryClient = useQueryClient();

    const [selectedModuleId, setSelectedModuleId] = useState<number | null>(null);
    const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);

    // Modal State
    const [createType, setCreateType] = useState<'project' | 'module' | 'task' | 'activity' | null>(null);
    const [createParentId, setCreateParentId] = useState<number | null>(null);
    const [isEdit, setIsEdit] = useState(false);
    const [editData, setEditData] = useState<any>(null);
    const [deleteModal, setDeleteModal] = useState<{
        isOpen: boolean;
        type: 'module' | 'task' | 'activity' | null;
        id: number | null;
    }>({ isOpen: false, type: null, id: null });

    // Fetch Project Details (Client-side find for now)
    const { data: projects } = useQuery('projects', projectService.getProjects);
    const project = projects?.find(p => p.id === projectId);

    // Queries
    const { data: modules, refetch: refetchModules } = useQuery(
        ['modules', projectId],
        () => projectService.getModules(projectId),
        { enabled: !!projectId }
    );

    const { data: tasks, refetch: refetchTasks } = useQuery(
        ['tasks', selectedModuleId],
        () => projectService.getTasks(selectedModuleId!),
        { enabled: !!selectedModuleId }
    );

    // Activities Logic
    const { data: activities, refetch: refetchActivities } = useQuery(
        ['activities', selectedTaskId],
        () => projectService.getActivities(selectedTaskId!),
        { enabled: !!selectedTaskId }
    );

    const { data: projectMembers } = useQuery(
        ['projectMembers', projectId],
        () => projectService.getAccessList('project', projectId),
        { enabled: !!projectId }
    );

    // Permissions Logic
    const isPM = !!project?.is_pm;
    const isSuperAdmin = user?.role === 'super_admin' || user?.role === 'hr';

    // 1. Project-level: Super Admin or PM can edit/delete/status
    const canManageProject = isSuperAdmin || isPM;

    // 2. Module/Task/Activity Creation: ONLY PM can create these
    const canCreateModule = isPM;
    const canAddTask = isPM;

    const handleCreate = (type: 'module' | 'task' | 'activity', parentId: number) => {
        // Validate permissions based on type
        if (type === 'module' && !canCreateModule) return;
        if (type === 'task' && !canAddTask) return;

        setCreateType(type);
        setCreateParentId(parentId);
        setIsEdit(false);
    };

    const handleEditProject = () => {
        if (!canManageProject) return;
        setCreateType('project');
        setEditData(project);
        setIsEdit(true);
    };

    const handleEdit = (type: 'module' | 'task' | 'activity', data: any) => {
        setCreateType(type);
        setEditData(data);
        setIsEdit(true);
        setCreateParentId(type === 'module' ? projectId : (type === 'task' ? selectedModuleId : selectedTaskId));
    };

    const handleDeleteModule = async (moduleId: number) => {
        setDeleteModal({ isOpen: true, type: 'module', id: moduleId });
    };

    const handleDeleteTask = async (taskId: number) => {
        setDeleteModal({ isOpen: true, type: 'task', id: taskId });
    };

    const confirmDelete = async () => {
        if (!deleteModal.id || !deleteModal.type) return;

        const { type, id } = deleteModal;
        setDeleteModal(prev => ({ ...prev, isOpen: false }));

        try {
            if (type === 'module') {
                // Optimistic Update
                queryClient.setQueryData(['modules', projectId], (old: any) =>
                    old ? old.filter((m: any) => m.id !== id) : []
                );
                if (selectedModuleId === id) {
                    setSelectedModuleId(null);
                    setSelectedTaskId(null);
                }

                await projectService.deleteModule(id);
                refetchModules();
            } else if (type === 'task') {
                // Optimistic Update
                queryClient.setQueryData(['tasks', selectedModuleId], (old: any) =>
                    old ? old.filter((t: any) => t.id !== id) : []
                );
                if (selectedTaskId === id) {
                    setSelectedTaskId(null);
                }

                await projectService.deleteTask(id);
                refetchTasks();
            } else if (type === 'activity') {
                // Optimistic Update
                queryClient.setQueryData(['activities', selectedTaskId], (old: any) =>
                    old ? old.filter((a: any) => a.id !== id) : []
                );

                await projectService.deleteActivity(id);
                refetchActivities();
            }
        } catch (error) {
            console.error(`Failed to delete ${type}:`, error);
            if (type === 'module') refetchModules();
            else if (type === 'task') refetchTasks();
            else if (type === 'activity') refetchActivities();
        }
    };

    const assignModuleUserMutation = useMutation(
        ({ moduleId, userId }: { moduleId: number, userId: number }) => {
            const module = modules?.find(m => m.id === moduleId);
            const currentIds = module?.assigned_users?.map(u => u.id) || [];
            const isAssigned = currentIds.includes(userId) || currentIds.some((id: any) => id == userId);
            const newIds = isAssigned
                ? currentIds.filter(id => id !== userId) // Remove
                : [...currentIds, userId]; // Add

            return projectService.updateModule(moduleId, {
                assigneeIds: Array.from(new Set(newIds))
            });
        },
        {
            onMutate: async ({ moduleId, userId }) => {
                await queryClient.cancelQueries(['modules', projectId]);
                const previousModules = queryClient.getQueryData<any[]>(['modules', projectId]);

                if (previousModules) {
                    queryClient.setQueryData(['modules', projectId], previousModules.map(m => {
                        if (m.id !== moduleId) return m;
                        const currentIds = m.assigned_users?.map((u: any) => u.id) || [];
                        const isAssigned = currentIds.includes(userId) || currentIds.some((id: any) => id == userId);

                        let newAssignedUsers = m.assigned_users || [];
                        if (isAssigned) {
                            newAssignedUsers = newAssignedUsers.filter((u: any) => u.id !== userId);

                            // CASCADE REVOCATION (Optimistic)
                            // 1. Remove from all tasks in this module
                            const cachedTasks = queryClient.getQueryData<any[]>(['tasks', moduleId]);
                            if (cachedTasks) {
                                queryClient.setQueryData(['tasks', moduleId], cachedTasks.map(t => ({
                                    ...t,
                                    assigned_users: (t.assigned_users || []).filter((u: any) => u.id !== userId)
                                })));

                                // 2. Remove from all activities of those tasks
                                cachedTasks.forEach(t => {
                                    const cachedActivities = queryClient.getQueryData<any[]>(['activities', t.id]);
                                    if (cachedActivities) {
                                        queryClient.setQueryData(['activities', t.id], cachedActivities.map(a => ({
                                            ...a,
                                            assigned_users: (a.assigned_users || []).filter((u: any) => u.id !== userId)
                                        })));
                                    }
                                });
                            }

                        } else {
                            const candidate = projectMembers?.find((u: any) => u.id === userId);
                            if (candidate) {
                                newAssignedUsers = [...newAssignedUsers, candidate];
                            }
                        }
                        return { ...m, assigned_users: newAssignedUsers };
                    }));
                }
                return { previousModules };
            },
            onError: (_err, _newTodo, context: any) => {
                if (context?.previousModules) {
                    queryClient.setQueryData(['modules', projectId], context.previousModules);
                }
            },
            onSettled: () => {
                queryClient.invalidateQueries(['modules', projectId]);
            }
        }
    );

    const assignTaskUserMutation = useMutation(
        ({ taskId, userId }: { taskId: number, userId: number }) => {
            const task = tasks?.find(t => t.id === taskId);
            const currentIds = task?.assigned_users?.map(u => u.id) || [];
            const isAssigned = currentIds.includes(userId) || currentIds.some((id: any) => id == userId);
            const newIds = isAssigned
                ? currentIds.filter(id => id !== userId) // Remove
                : [...currentIds, userId]; // Add

            return projectService.updateTask(taskId, {
                assigneeIds: Array.from(new Set(newIds))
            });
        },
        {
            onMutate: async ({ taskId, userId }) => {
                await queryClient.cancelQueries(['tasks', selectedModuleId]);
                const previousTasks = queryClient.getQueryData<any[]>(['tasks', selectedModuleId]);

                if (previousTasks) {
                    queryClient.setQueryData(['tasks', selectedModuleId], previousTasks.map(t => {
                        if (t.id !== taskId) return t;
                        const currentIds = t.assigned_users?.map((u: any) => u.id) || [];
                        const isAssigned = currentIds.includes(userId) || currentIds.some((id: any) => id == userId);

                        let newAssignedUsers = t.assigned_users || [];
                        if (isAssigned) {
                            newAssignedUsers = newAssignedUsers.filter((u: any) => u.id !== userId);

                            // CASCADE REVOCATION (Optimistic)
                            // Remove from all activities in this task
                            const cachedActivities = queryClient.getQueryData<any[]>(['activities', taskId]);
                            if (cachedActivities) {
                                queryClient.setQueryData(['activities', taskId], cachedActivities.map(a => ({
                                    ...a,
                                    assigned_users: (a.assigned_users || []).filter((u: any) => u.id !== userId)
                                })));
                            }

                        } else {
                            // We need to find the user object.
                            // We can search in projectMembers (superset) or the availableUsers logic (more complex to replicate here).
                            // projectMembers is safe enough for display purposes usually.
                            const candidate = projectMembers?.find((u: any) => u.id === userId);
                            if (candidate) {
                                newAssignedUsers = [...newAssignedUsers, candidate];
                            }
                        }
                        return { ...t, assigned_users: newAssignedUsers };
                    }));
                }
                return { previousTasks };
            },
            onError: (_err, _newTodo, context: any) => {
                if (context?.previousTasks) {
                    queryClient.setQueryData(['tasks', selectedModuleId], context.previousTasks);
                }
            },
            onSettled: () => {
                queryClient.invalidateQueries(['tasks', selectedModuleId]);
                // accessing logic might propagate, so maybe refresh modules too?
                // For now just tasks is enough for the immediate feedback.
                // Keeping refetchModules from original?
                // Original had: { onSuccess: () => { refetchTasks(); refetchModules(); } }
                queryClient.invalidateQueries(['modules', projectId]);
            }
        }
    );

    const assignActivityUserMutation = useMutation(
        ({ activityId, userId }: { activityId: number, userId: number }) => {
            const activity = activities?.find(a => a.id === activityId);
            const currentIds = activity?.assigned_users?.map(u => u.id) || [];
            const isAssigned = currentIds.includes(userId) || currentIds.some((id: any) => id == userId);
            const newIds = isAssigned
                ? currentIds.filter(id => id !== userId) // Remove
                : [...currentIds, userId]; // Add

            return projectService.updateActivity(activityId, {
                assigneeIds: Array.from(new Set(newIds))
            });
        },
        {
            onMutate: async ({ activityId, userId }) => {
                await queryClient.cancelQueries(['activities', selectedTaskId]);
                const previousActivities = queryClient.getQueryData<any[]>(['activities', selectedTaskId]);

                if (previousActivities) {
                    queryClient.setQueryData(['activities', selectedTaskId], previousActivities.map(a => {
                        if (a.id !== activityId) return a;
                        const currentIds = a.assigned_users?.map((u: any) => u.id) || [];
                        const isAssigned = currentIds.includes(userId) || currentIds.some((id: any) => id == userId);

                        let newAssignedUsers = a.assigned_users || [];
                        if (isAssigned) {
                            newAssignedUsers = newAssignedUsers.filter((u: any) => u.id !== userId);
                        } else {
                            const candidate = projectMembers?.find((u: any) => u.id === userId);
                            if (candidate) {
                                newAssignedUsers = [...newAssignedUsers, candidate];
                            }
                        }
                        return { ...a, assigned_users: newAssignedUsers };
                    }));
                }
                return { previousActivities };
            },
            onError: (_err, _newTodo, context: any) => {
                if (context?.previousActivities) {
                    queryClient.setQueryData(['activities', selectedTaskId], context.previousActivities);
                }
            },
            onSettled: () => {
                queryClient.invalidateQueries(['activities', selectedTaskId]);
            }
        }
    );


    const handleCreateSuccess = () => {
        if (createType === 'module') refetchModules();
        if (createType === 'task') refetchTasks();
        if (createType === 'activity') refetchActivities();
    };

    const canManageStatus = canManageProject;

    // Optimistic Update Mutation
    const updateStatusMutation = useMutation(
        (newStatus: string) => projectService.updateProject(project!.id, { status: newStatus as any }),
        {
            onMutate: async (newStatus) => {
                await queryClient.cancelQueries('projects');
                const previousProjects = queryClient.getQueryData<any[]>('projects');

                if (previousProjects) {
                    queryClient.setQueryData('projects', previousProjects.map(p =>
                        p.id === project?.id ? { ...p, status: newStatus } : p
                    ));
                }
                return { previousProjects };
            },
            onError: (err, _newStatus, context: any) => {
                if (context?.previousProjects) {
                    queryClient.setQueryData('projects', context.previousProjects);
                }
                console.error('Failed to update status', err);
            },
            onSettled: () => {
                queryClient.invalidateQueries('projects');
            }
        }
    );

    const handleStatusChange = (newStatus: string) => {
        if (!project || !canManageStatus) return;
        updateStatusMutation.mutate(newStatus);
    };

    const StatusDropdown = ({ currentStatus }: { currentStatus?: string }) => {
        if (!currentStatus) return null;

        const statusOptions = [
            { value: 'active', label: 'Active', color: '#10B981', bg: '#ECFDF5' },
            { value: 'on_hold', label: 'On Hold', color: '#B45309', bg: '#FFFBEB' },
            { value: 'completed', label: 'Completed', color: '#374151', bg: '#F3F4F6' },
            { value: 'archived', label: 'Archived', color: '#EF4444', bg: '#FEF2F2' }
        ];

        const current = statusOptions.find(s => s.value === currentStatus) || statusOptions[0];

        if (!canManageStatus) {
            return (
                <span className="ws-status-badge" style={{ backgroundColor: current.bg, color: current.color, border: `1px solid ${current.color}30` }}>
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
                            border: `1px solid ${current.color}30`,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
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
                            onClick={() => handleStatusChange(option.value)}
                            className="status-dropdown-item"
                            style={{ color: option.color }}
                        >
                            <span style={{
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                backgroundColor: option.color,
                                marginRight: '8px'
                            }} />
                            {option.label}
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>
        );
    };

    return (
        <AppLayout>
            <div className="workspace-container">
                {/* Header */}
                <div className="ws-header">
                    <div className="ws-header-left">
                        <button onClick={() => navigate(-1)} className="btn-back">
                            <ChevronLeft size={16} /> Back
                        </button>
                        <div className="ws-project-info">
                            <h1 className="ws-project-title">
                                {project?.name || 'Loading...'}
                                <span className="ws-project-id">ID: {project?.custom_id}</span>
                            </h1>
                            <p className="ws-project-desc">{project?.description}</p>
                        </div>
                    </div>
                    <div className="ws-header-right">
                        <StatusDropdown currentStatus={project?.status} />

                        {canManageProject && (
                            <button className="btn-edit-project" onClick={handleEditProject}>
                                <Edit size={14} /> Edit Project
                            </button>
                        )}
                    </div>
                </div>

                {/* Columns Container */}
                <div className="ws-columns-wrapper">

                    {/* Column 1: Modules */}
                    <div className="ws-column">
                        <div className="ws-column-header">
                            <div className="ws-col-title">
                                <Layers size={18} /> MODULES
                            </div>
                            {canCreateModule && (
                                <button
                                    onClick={() => handleCreate('module', projectId)}
                                    className="btn-col-add"
                                >
                                    <Plus size={14} /> Add Module
                                </button>
                            )}
                        </div>
                        <div className="ws-column-body">
                            {modules?.map(module => (
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
                                    isPM={isPM}
                                    isCompact={true}
                                    // Pass ALL project members as candidates (no filter)
                                    // Pass ALL project members + current assignees to ensure everyone is listed
                                    availableUsers={(() => {
                                        const candidates = projectMembers || [];
                                        const current = module.assigned_users || [];
                                        // Merge and unique by ID
                                        const uniqueMap = new Map();
                                        [...candidates, ...current].forEach(u => uniqueMap.set(u.id, u));
                                        return Array.from(uniqueMap.values())
                                            .filter((u: any) => u.id !== project?.project_manager_id) // Exclude PM
                                            .map((pm: any) => ({
                                                ...pm,
                                                initials: pm.initials || (pm.name ? pm.name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase() : '??')
                                            }));
                                    })()}
                                    onAssignUser={(userId) => assignModuleUserMutation.mutate({ moduleId: module.id, userId })}
                                />
                            ))}
                            {modules?.length === 0 && (
                                <div className="ws-empty-dashed">
                                    <div className="dashed-icon"><Layers size={24} /></div>
                                    <p className="dashed-title">
                                        {(isPM || isSuperAdmin) ? "No Modules Found" : "No Modules Assigned"}
                                    </p>
                                    <p className="dashed-desc">
                                        {(isPM || isSuperAdmin) ? "Create a module to start organizing tasks." : "You haven't been assigned to any modules in this project."}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Column 2: Tasks */}
                    <div className="ws-column">
                        <div className="ws-column-header">
                            <div className="ws-col-title">
                                <ClipboardList size={18} /> TASKS
                            </div>
                            {selectedModuleId && canAddTask && (
                                <button
                                    onClick={() => handleCreate('task', selectedModuleId)}
                                    className="btn-col-add"
                                >
                                    <Plus size={14} /> Add Task
                                </button>
                            )}
                        </div>
                        <div className="ws-column-body">
                            {!selectedModuleId ? (
                                <div className="ws-empty-dashed">
                                    <div className="dashed-icon"><ClipboardList size={24} /></div>
                                    <p className="dashed-title">No Tasks Found</p>
                                    <p className="dashed-desc">Assign and track tasks within this module.</p>
                                </div>
                            ) : tasks?.length === 0 ? (
                                <div className="ws-empty-dashed">
                                    <div className="dashed-icon"><ClipboardList size={24} /></div>
                                    <p className="dashed-title">
                                        {(isPM || isSuperAdmin) ? "No Tasks Found" : "No Tasks Assigned"}
                                    </p>
                                    <p className="dashed-desc">
                                        {(isPM || isSuperAdmin) ? "Assign and track tasks within this module." : "You haven't been assigned to any tasks in this module."}
                                    </p>
                                </div>
                            ) : (
                                tasks?.map(task => (
                                    <WorkspaceCard
                                        key={task.id}
                                        id={task.id}
                                        customId={task.custom_id}
                                        name={task.name}
                                        description={task.description}
                                        assignedUsers={task.assigned_users || []}
                                        isSelected={selectedTaskId === task.id}
                                        onClick={() => setSelectedTaskId(task.id)}
                                        onEdit={() => handleEdit('task', task)}
                                        onDelete={() => handleDeleteTask(task.id)}
                                        isPM={isPM}
                                        isCompact={true}
                                        // Pass ALL module assignees as candidates (no filter)
                                        // Pass ALL module assignees + current task assignees
                                        availableUsers={(() => {
                                            const moduleMembers = (projects?.find(p => p.id === projectId)?.is_pm ?
                                                modules?.find(m => m.id === selectedModuleId)?.assigned_users : []) || [];
                                            const current = task.assigned_users || [];
                                            const uniqueMap = new Map();
                                            [...moduleMembers, ...current].forEach(u => uniqueMap.set(u.id, u));
                                            return Array.from(uniqueMap.values())
                                                .filter((u: any) => u.id !== project?.project_manager_id) // Exclude PM
                                                .map((pm: any) => ({
                                                    ...pm,
                                                    initials: pm.initials || (pm.name ? pm.name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase() : '??')
                                                }));
                                        })()}
                                        onAssignUser={(userId) => assignTaskUserMutation.mutate({ taskId: task.id, userId })}
                                    />
                                ))
                            )}
                        </div>
                    </div>

                    {/* Column 3: Activity */}
                    <div className="ws-column">
                        <div className="ws-column-header">
                            <div className="ws-col-title">
                                <Layers size={18} /> ACTIVITY
                            </div>
                        </div>
                        <div className="ws-column-body compact-column-body">
                            {!selectedTaskId ? (
                                <div className="ws-empty-dashed">
                                    <div className="dashed-icon"><ClipboardList size={24} /></div>
                                    <p className="dashed-title">Select a Task</p>
                                    <p className="dashed-desc">Choose a task to view its detailed activity trail.</p>
                                </div>
                            ) : activities?.length === 0 ? (
                                <div className="ws-empty-dashed">
                                    <div className="dashed-icon"><ClipboardList size={24} /></div>
                                    <p className="dashed-title">
                                        {(isPM || isSuperAdmin) ? "No Activities" : "No Activities Assigned"}
                                    </p>
                                    <p className="dashed-desc">
                                        {(isPM || isSuperAdmin) ? "No activities found for this task." : "You haven't been assigned to any activities in this task."}
                                    </p>
                                </div>
                            ) : (
                                activities?.map(activity => {
                                    const selectedTask = tasks?.find(t => t.id === selectedTaskId);
                                    // Pass ALL task members + current activity assignees
                                    const availableUsers = (() => {
                                        const taskMembers = selectedTask?.assigned_users || [];
                                        const current = activity.assigned_users || [];
                                        const uniqueMap = new Map();
                                        [...taskMembers, ...current].forEach(u => uniqueMap.set(u.id, u));
                                        return Array.from(uniqueMap.values())
                                            .filter((u: any) => u.id !== project?.project_manager_id) // Exclude PM
                                            .map((pm: any) => ({
                                                ...pm,
                                                initials: pm.initials || (pm.name ? pm.name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase() : '??')
                                            }));
                                    })();

                                    return (
                                        <WorkspaceCard
                                            key={activity.id}
                                            id={activity.id}
                                            customId={activity.custom_id}
                                            name={activity.name}
                                            description={activity.description}
                                            assignedUsers={activity.assigned_users || []}
                                            onClick={() => { }}
                                            onAssignUser={(userId) => assignActivityUserMutation.mutate({ activityId: activity.id, userId })}
                                            availableUsers={availableUsers}
                                            isPM={isPM}
                                            isCompact={true}
                                        />
                                    );
                                })
                            )}
                        </div>
                    </div>

                </div>

                {/* Shared Create Modal */}
                <CreateModal
                    isOpen={!!createType}
                    onClose={() => { setCreateType(null); setCreateParentId(null); setIsEdit(false); setEditData(null); }}
                    type={createType || 'module'}
                    parentId={createParentId || undefined}
                    onSuccess={handleCreateSuccess}
                    initialData={isEdit ? (editData || project) : undefined}
                    isEdit={isEdit}
                    projectManagerId={project?.project_manager_id}
                />



                <DeleteConfirmModal
                    isOpen={deleteModal.isOpen}
                    onClose={() => setDeleteModal({ isOpen: false, type: null, id: null })}
                    onConfirm={confirmDelete}
                    title={`Delete ${deleteModal.type?.charAt(0).toUpperCase()}${deleteModal.type?.slice(1)}`}
                    message={`Are you sure you want to delete this ${deleteModal.type}? This action cannot be undone and will delete all nested items.`}
                />
            </div>
        </AppLayout>
    );
};
