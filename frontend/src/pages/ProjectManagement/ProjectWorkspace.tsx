import React, { useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from 'react-query';
import { Plus, ChevronLeft, Edit, Layers, ClipboardList, ChevronDown } from 'lucide-react';
import AppLayout from '../../components/layout/AppLayout';
import { projectService } from '../../services/projectService';
// import * as employeeService from '../../services/employeeService';
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

    // FIXED: Solid backgrounds with matching borders for clean "pill" look
    const statusOptions = [
        { value: 'active', label: 'Active', color: '#FFFFFF', bg: '#10B981', border: '#10B981' }, // Emerald-500
        { value: 'on_hold', label: 'On Hold', color: '#FFFFFF', bg: '#F59E0B', border: '#F59E0B' }, // Amber-500
        { value: 'completed', label: 'Completed', color: '#FFFFFF', bg: '#6366F1', border: '#6366F1' }, // Indigo-500
        { value: 'archived', label: 'Archived', color: '#FFFFFF', bg: '#64748B', border: '#64748B' } // Slate-500
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
                    padding: '6px 16px',
                    borderRadius: '20px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center'
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
                        fontSize: '12px',
                        padding: '6px 16px',
                        borderRadius: '20px',
                        transition: 'all 0.2s'
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

    /* 
    const { data: allEmployees } = useQuery(['allEmployees'], () => employeeService.getEmployees(1, 1000).then(res => res.employees));
    */

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

    // Fetch Specific Project Details
    const { data: project, refetch: refetchProject } = useQuery(
        ['project', projectId],
        () => projectService.getProject(projectId),
        { enabled: !!projectId }
    );

    // Queries
    const { data: projectMembers, refetch: refetchProjectMembers } = useQuery(
        ['project-members', projectId],
        () => projectService.getProjectMembers(projectId),
        { enabled: !!projectId }
    );

    // Queries with loading states
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

    // Activities Logic
    const {
        data: activities,
        refetch: refetchActivities,
        isLoading: activitiesLoading,
        isError: activitiesError
    } = useQuery(
        ['activities', selectedTaskId],
        () => projectService.getActivities(selectedTaskId!),
        { enabled: !!selectedTaskId }
    );

    // Permissions Logic
    const isPM = !!project?.is_pm;
    const isSuperAdmin = user?.role === 'super_admin';

    // Check if project is in a read-only state
    // Details can be edited ONLY in active state
    const isProjectReadOnly = project?.status !== 'active';

    //    - STRICT: Super Admin can edit project metadata
    //    - STRICT: Project Manager can also edit project metadata (Name/Description)
    const canManageProject = (isSuperAdmin || isPM) && !isProjectReadOnly;

    // 2. Module/Task/Activity Operational Control:
    //    - STRICT: Only the Project Manager can create/edit/delete/assign (User Request)
    //    - AND ONLY if project is Active
    const canManageResources = isPM && !isProjectReadOnly;
    const canCreateModule = canManageResources;
    const canAddTask = canManageResources;
    const canAddActivity = canManageResources;

    // 3. Status Management:
    //    - STRICT: Super Admin can change status
    const canManageStatus = isSuperAdmin;

    const handleCreate = (type: 'module' | 'task' | 'activity', parentId: number) => {
        // Validate permissions based on type
        if (type === 'module' && !canCreateModule) return;
        if (type === 'task' && !canAddTask) return;

        setCreateType(type);
        setCreateParentId(parentId);
        setIsEdit(false);
    };

    const handleEditProject = async () => {
        if (!canManageProject) return;
        // Refetch project before editing to ensure modal has latest data
        const { data: freshProject } = await refetchProject();
        setCreateType('project');
        setEditData(freshProject || project);
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

    const handleDeleteActivity = async (activityId: number) => {
        setDeleteModal({ isOpen: true, type: 'activity', id: activityId });
    };

    const confirmDelete = async () => {
        if (!deleteModal.id || !deleteModal.type) return;

        const { type, id } = deleteModal;
        setDeleteModal(prev => ({ ...prev, isOpen: false }));

        try {
            if (type === 'module') {
                // Optimistic Update
                queryClient.setQueryData(['modules', projectId], (old: any[] | undefined) =>
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
                queryClient.setQueryData(['tasks', selectedModuleId], (old: any[] | undefined) =>
                    old ? old.filter((t: any) => t.id !== id) : []
                );
                if (selectedTaskId === id) {
                    setSelectedTaskId(null);
                }

                await projectService.deleteTask(id);
                refetchTasks();
            } else if (type === 'activity') {
                // Optimistic Update
                queryClient.setQueryData(['activities', selectedTaskId], (old: any[] | undefined) =>
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
        ({ moduleId, userId, action, userObj: _userObj }: { moduleId: number, userId: number, action: 'add' | 'remove', userObj?: any }) => {
            return projectService.toggleAccess('module', moduleId, userId, action);
        },
        {
            onMutate: async ({ moduleId, userId, action, userObj: _userObj }) => {
                await queryClient.cancelQueries(['modules', projectId]);
                const previousModules = queryClient.getQueryData<any[]>(['modules', projectId]);

                queryClient.setQueryData(['modules', projectId], ((old: any[] | undefined): any[] => {
                    if (!old) return [];
                    return old.map(m => {
                        if (String(m.id) !== String(moduleId)) return m;
                        const targetId = String(userId);
                        const isAssigned = action === 'remove'; // Use explicit action

                        let newAssignedUsers = m.assigned_users || [];

                        if (isAssigned) {
                            newAssignedUsers = newAssignedUsers.filter((u: any) => String(u.id) !== targetId);

                            // CASCADE REVOCATION (Optimistic)
                            queryClient.setQueryData(['tasks', moduleId], ((oldTasks: any[] | undefined): any[] => {
                                if (!oldTasks) return [];
                                return oldTasks.map(t => {
                                    const updatedAssigned = (t.assigned_users || []).filter((u: any) => String(u.id) !== targetId);

                                    // Cascade to activities
                                    queryClient.setQueryData(['activities', t.id], ((oldActs: any[] | undefined): any[] => {
                                        if (!oldActs) return [];
                                        return oldActs.map(a => ({
                                            ...a,
                                            assigned_users: (a.assigned_users || []).filter((u: any) => String(u.id) !== targetId)
                                        }));
                                    }) as any);

                                    return { ...t, assigned_users: updatedAssigned };
                                });
                            }) as any);

                        } else {
                            // Use provided userObj or search fallback
                            if (_userObj) {
                                newAssignedUsers = [...newAssignedUsers, _userObj];
                            } else {
                                const allEmps = queryClient.getQueryData<any[]>(['allEmployees']);
                                const candidate = (allEmps || projectMembers)?.find((u: any) => String(u.id) === targetId);
                                if (candidate) {
                                    newAssignedUsers = [...newAssignedUsers, candidate];
                                }
                            }
                            // Sort: PM first, then alphabetical
                            const projectPMId = String(project?.project_manager_id);
                            newAssignedUsers.sort((a: any, b: any) => {
                                if (String(a.id) === projectPMId) return -1;
                                if (String(b.id) === projectPMId) return 1;
                                return (a.name || '').localeCompare(b.name || '');
                            });
                        }
                        return { ...m, assigned_users: newAssignedUsers };
                    });
                }) as any);

                return { previousModules };
            },
            onSuccess: (data, { moduleId }) => {
                // Force update with server's authoritative response
                if (data.updatedUsers !== undefined) {
                    queryClient.setQueryData(['modules', projectId], ((old: any[] | undefined) => {
                        if (!old) return [];
                        return old.map(m => {
                            if (String(m.id) === String(moduleId)) {
                                return { ...m, assigned_users: data.updatedUsers };
                            }
                            return m;
                        });
                    }) as any);
                } else {
                    console.warn('[MODULE SUCCESS] updatedUsers is undefined!');
                }
            },
            onError: (_err, _newTodo, context: any) => {
                if (context?.previousModules) {
                    queryClient.setQueryData(['modules', projectId], context.previousModules);
                }
            },
            onSettled: () => {
                // Remove immediate invalidation to prevent snap-back deselection
                // queryClient.invalidateQueries(['modules', projectId]);
            }
        }
    );

    const assignTaskUserMutation = useMutation(
        ({ taskId, userId, action, userObj: _userObj }: { taskId: number, userId: number, action: 'add' | 'remove', userObj?: any }) => {
            return projectService.toggleAccess('task', taskId, userId, action);
        },
        {
            onMutate: async ({ taskId, userId, action, userObj: _userObj }) => {
                await queryClient.cancelQueries(['tasks', selectedModuleId]);
                const previousTasks = queryClient.getQueryData<any[]>(['tasks', selectedModuleId]);

                queryClient.setQueryData(['tasks', selectedModuleId], ((old: any[] | undefined): any[] => {
                    if (!old) return [];
                    return old.map(t => {
                        if (String(t.id) !== String(taskId)) return t;
                        const targetId = String(userId);
                        const isAssigned = action === 'remove';

                        let newAssignedUsers = t.assigned_users || [];
                        if (isAssigned) {
                            newAssignedUsers = newAssignedUsers.filter((u: any) => String(u.id) !== targetId);

                            // CASCADE REVOCATION (Optimistic)
                            queryClient.setQueryData(['activities', taskId], ((oldActs: any[] | undefined): any[] => {
                                if (!oldActs) return [];
                                return oldActs.map(a => ({
                                    ...a,
                                    assigned_users: (a.assigned_users || []).filter((u: any) => String(u.id) !== targetId)
                                }));
                            }) as any);

                        } else {
                            // Use provided userObj or search fallback
                            if (_userObj) {
                                newAssignedUsers = [...newAssignedUsers, _userObj];
                            } else {
                                const allEmps = queryClient.getQueryData<any[]>(['allEmployees']);
                                const candidate = (allEmps || projectMembers)?.find((u: any) => String(u.id) === targetId);
                                if (candidate) {
                                    newAssignedUsers = [...newAssignedUsers, candidate];
                                }
                            }
                            // Sort: PM first, then alphabetical
                            const projectPMId = String(project?.project_manager_id);
                            newAssignedUsers.sort((a: any, b: any) => {
                                if (String(a.id) === projectPMId) return -1;
                                if (String(b.id) === projectPMId) return 1;
                                return (a.name || '').localeCompare(b.name || '');
                            });
                        }
                        return { ...t, assigned_users: newAssignedUsers };
                    });
                }) as any);
                return { previousTasks };
            },
            onSuccess: (data, { taskId }) => {
                // Force update with server's authoritative response
                if (data.updatedUsers !== undefined) {
                    queryClient.setQueryData(['tasks', selectedModuleId], ((old: any[] | undefined) => {
                        if (!old) return [];
                        return old.map(t => {
                            if (String(t.id) === String(taskId)) {
                                return { ...t, assigned_users: data.updatedUsers };
                            }
                            return t;
                        });
                    }) as any);
                }
            },
            onError: (_err, _newTodo, context: any) => {
                if (context?.previousTasks) {
                    queryClient.setQueryData(['tasks', selectedModuleId], context.previousTasks);
                }
            },
            onSettled: () => {
                // queryClient.invalidateQueries(['tasks', selectedModuleId]);
            }
        }
    );

    const assignActivityUserMutation = useMutation(
        ({ activityId, userId, action, userObj: _userObj }: { activityId: number, userId: number, action: 'add' | 'remove', userObj?: any }) => {
            return projectService.toggleAccess('activity', activityId, userId, action);
        },
        {
            onMutate: async ({ activityId, userId, action, userObj: _userObj }) => {
                await queryClient.cancelQueries(['activities', selectedTaskId]);
                const previousActivities = queryClient.getQueryData<any[]>(['activities', selectedTaskId]);

                queryClient.setQueryData(['activities', selectedTaskId], ((old: any[] | undefined): any[] => {
                    if (!old) return [];
                    return old.map(a => {
                        if (String(a.id) !== String(activityId)) return a;
                        const targetId = String(userId);
                        const isAssigned = action === 'remove';

                        let newAssignedUsers = a.assigned_users || [];
                        if (isAssigned) {
                            newAssignedUsers = newAssignedUsers.filter((u: any) => String(u.id) !== targetId);
                        } else {
                            // Use provided userObj or search fallback
                            if (_userObj) {
                                newAssignedUsers = [...newAssignedUsers, _userObj];
                            } else {
                                const allEmps = queryClient.getQueryData<any[]>(['allEmployees']);
                                const candidate = (allEmps || projectMembers)?.find((u: any) => String(u.id) === targetId);
                                if (candidate) {
                                    newAssignedUsers = [...newAssignedUsers, candidate];
                                }
                            }
                            // Sort: PM first, then alphabetical
                            const projectPMId = String(project?.project_manager_id);
                            newAssignedUsers.sort((a: any, b: any) => {
                                if (String(a.id) === projectPMId) return -1;
                                if (String(b.id) === projectPMId) return 1;
                                return (a.name || '').localeCompare(b.name || '');
                            });
                        }
                        return { ...a, assigned_users: newAssignedUsers };
                    });
                }) as any);
                return { previousActivities };
            },
            onSuccess: (data, { activityId }) => {
                // Force update with server's authoritative response
                if (data.updatedUsers !== undefined) {
                    queryClient.setQueryData(['activities', selectedTaskId], ((old: any[] | undefined) => {
                        if (!old) return [];
                        return old.map(a => {
                            if (String(a.id) === String(activityId)) {
                                return { ...a, assigned_users: data.updatedUsers };
                            }
                            return a;
                        });
                    }) as any);
                }
            },
            onError: (_err, _newTodo, context: any) => {
                if (context?.previousActivities) {
                    queryClient.setQueryData(['activities', selectedTaskId], context.previousActivities);
                }
            },
            onSettled: () => {
                // queryClient.invalidateQueries(['activities', selectedTaskId]);
            }
        }
    );


    const handleCreateSuccess = () => {
        if (createType === 'project') {
            queryClient.invalidateQueries('projects');
            queryClient.invalidateQueries(['project', projectId]);
            refetchProject();
            refetchProjectMembers();
            // PM change affects ALL resource access, refetch everything
            refetchModules();
            if (selectedModuleId) refetchTasks();
            if (selectedTaskId) refetchActivities();
        }
        if (createType === 'module') refetchModules();
        if (createType === 'task') refetchTasks();
        if (createType === 'activity') refetchActivities();
    };

    // const canManageStatus = canManageProject; // Moved early to permission logic block

    // Optimistic Update Mutation
    const updateStatusMutation = useMutation(
        (newStatus: string) => projectService.updateProject(project!.id, { status: newStatus as any }),
        {
            onMutate: async (newStatus) => {
                await queryClient.cancelQueries('projects');
                await queryClient.cancelQueries(['project', projectId]);

                const previousProjects = queryClient.getQueryData<any[]>('projects');
                const previousProject = queryClient.getQueryData<any>(['project', projectId]);

                if (previousProjects) {
                    queryClient.setQueryData('projects', previousProjects.map(p =>
                        p.id === project?.id ? { ...p, status: newStatus } : p
                    ));
                }

                if (previousProject) {
                    queryClient.setQueryData(['project', projectId], { ...previousProject, status: newStatus });
                }

                return { previousProjects, previousProject };
            },
            onError: (err, _newStatus, context: any) => {
                if (context?.previousProjects) {
                    queryClient.setQueryData('projects', context.previousProjects);
                }
                if (context?.previousProject) {
                    queryClient.setQueryData(['project', projectId], context.previousProject);
                }
                console.error('Failed to update status', err);
            },
            onSettled: () => {
                queryClient.invalidateQueries(['project', projectId]);
                queryClient.invalidateQueries('projects');
                // Only refetch members/resources if they aren't already loading
                // This reduces the "cascade" pressure on the UI
                refetchProject();
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
                            <p className="ws-project-desc" title={project?.description}>
                                {project?.description && project.description.length > 30
                                    ? project.description.slice(0, 30) + '...'
                                    : project?.description}
                            </p>
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
                            {modulesLoading ? (
                                <div className="ws-empty-dashed">
                                    <p className="dashed-title">Loading Modules...</p>
                                </div>
                            ) : modulesError ? (
                                <div className="ws-empty-dashed">
                                    <p className="dashed-title text-danger">Error Loading Modules</p>
                                </div>
                            ) : modules?.length === 0 ? (
                                <div className="ws-empty-dashed">
                                    <div className="dashed-icon"><Layers size={24} /></div>
                                    <p className="dashed-title">
                                        {(isPM || isSuperAdmin) ? "No Modules Found" : "No Modules Assigned"}
                                    </p>
                                    <p className="dashed-desc">
                                        {(isPM || isSuperAdmin) ? "Create a module to start organizing tasks." : "You haven't been assigned to any modules in this project."}
                                    </p>
                                </div>
                            ) : (
                                modules?.map(module => (
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
                                        availableUsers={(() => {
                                            const candidates = projectMembers || [];
                                            const current = module.assigned_users || [];
                                            const pmId = String(project?.project_manager_id || candidates.find((m: any) => m.is_pm)?.id);
                                            const uniqueMap = new Map();
                                            [...candidates, ...current].forEach(u => uniqueMap.set(String(u.id), u));
                                            return Array.from(uniqueMap.values())
                                                .filter((u: any) => String(u.id) !== pmId)
                                                .map((u: any) => ({
                                                    ...u,
                                                    initials: u.initials || (u.name ? u.name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase() : '??')
                                                }));
                                        })()}
                                        onAssignUser={(userId) => {
                                            const availableUsers = (() => {
                                                const candidates = projectMembers || [];
                                                const current = module.assigned_users || [];
                                                const pmId = String(project?.project_manager_id || candidates.find((m: any) => m.is_pm)?.id);
                                                const uniqueMap = new Map();
                                                [...candidates, ...current].forEach(u => uniqueMap.set(String(u.id), u));
                                                return Array.from(uniqueMap.values())
                                                    .filter((u: any) => String(u.id) !== pmId)
                                                    .map((u: any) => ({
                                                        ...u,
                                                        initials: u.initials || (u.name ? u.name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase() : '??')
                                                    }));
                                            })();
                                            const userObj = availableUsers.find((u: any) => String(u.id) === String(userId));
                                            const isAssigned = (module.assigned_users || []).some((u: any) => String(u.id) === String(userId));
                                            assignModuleUserMutation.mutate({ moduleId: module.id, userId, action: isAssigned ? 'remove' : 'add', userObj });
                                        }}
                                    />
                                ))
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
                            ) : tasksLoading ? (
                                <div className="ws-empty-dashed">
                                    <p className="dashed-title">Loading Tasks...</p>
                                </div>
                            ) : tasksError ? (
                                <div className="ws-empty-dashed">
                                    <p className="dashed-title text-danger">Error Loading Tasks</p>
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
                                        isPM={canManageResources}
                                        isCompact={true}
                                        availableUsers={(() => {
                                            const moduleMembers = modules?.find(m => String(m.id) === String(selectedModuleId))?.assigned_users || [];
                                            const current = task.assigned_users || [];
                                            const globalPmId = String(project?.project_manager_id || projectMembers?.find((m: any) => m.is_pm)?.id);
                                            const uniqueMap = new Map();
                                            [...moduleMembers, ...current].forEach(u => uniqueMap.set(String(u.id), u));
                                            return Array.from(uniqueMap.values())
                                                .filter((u: any) => String(u.id) !== globalPmId)
                                                .map((u: any) => ({
                                                    ...u,
                                                    initials: u.initials || (u.name ? u.name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase() : '??')
                                                }));
                                        })()}
                                        onAssignUser={(userId) => {
                                            const moduleMembers = modules?.find(m => String(m.id) === String(selectedModuleId))?.assigned_users || [];
                                            const current = task.assigned_users || [];
                                            const globalPmId = String(project?.project_manager_id || projectMembers?.find((m: any) => m.is_pm)?.id);
                                            const uniqueMap = new Map();
                                            [...moduleMembers, ...current].forEach(u => uniqueMap.set(String(u.id), u));
                                            const availableUsers = Array.from(uniqueMap.values())
                                                .filter((u: any) => String(u.id) !== globalPmId)
                                                .map((u: any) => ({
                                                    ...u,
                                                    initials: u.initials || (u.name ? u.name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase() : '??')
                                                }));
                                            const userObj = availableUsers.find((u: any) => String(u.id) === String(userId));
                                            const isAssigned = (task.assigned_users || []).some((u: any) => String(u.id) === String(userId));
                                            assignTaskUserMutation.mutate({ taskId: task.id, userId, action: isAssigned ? 'remove' : 'add', userObj });
                                        }}
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
                            {selectedTaskId && canAddActivity && (
                                <button
                                    onClick={() => handleCreate('activity', selectedTaskId)}
                                    className="btn-col-add"
                                >
                                    <Plus size={14} /> Add Activity
                                </button>
                            )}
                        </div>
                        <div className="ws-column-body compact-column-body">
                            {!selectedTaskId ? (
                                <div className="ws-empty-dashed">
                                    <div className="dashed-icon"><ClipboardList size={24} /></div>
                                    <p className="dashed-title">Select a Task</p>
                                    <p className="dashed-desc">Choose a task to view its detailed activity trail.</p>
                                </div>
                            ) : activitiesLoading ? (
                                <div className="ws-empty-dashed">
                                    <p className="dashed-title">Loading Activities...</p>
                                </div>
                            ) : activitiesError ? (
                                <div className="ws-empty-dashed">
                                    <p className="dashed-title text-danger">Error Loading Activities</p>
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
                                    const selectedTask = tasks?.find(t => String(t.id) === String(selectedTaskId));
                                    const availableUsers = (() => {
                                        const taskMembers = selectedTask?.assigned_users || [];
                                        const current = activity.assigned_users || [];
                                        const globalPmId = String(project?.project_manager_id || projectMembers?.find((m: any) => m.is_pm)?.id);
                                        const uniqueMap = new Map();
                                        [...taskMembers, ...current].forEach(u => uniqueMap.set(String(u.id), u));
                                        return Array.from(uniqueMap.values())
                                            .filter((u: any) => String(u.id) !== globalPmId)
                                            .map((u: any) => ({
                                                ...u,
                                                initials: u.initials || (u.name ? u.name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase() : '??')
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
                                            onEdit={() => handleEdit('activity', activity)}
                                            onDelete={() => handleDeleteActivity(activity.id)}
                                            isPM={canManageResources}
                                            onAssignUser={(userId) => {
                                                const selectedTask = tasks?.find(t => String(t.id) === String(selectedTaskId));
                                                const taskMembers = selectedTask?.assigned_users || [];
                                                const current = activity.assigned_users || [];
                                                const globalPmId = String(project?.project_manager_id || projectMembers?.find((m: any) => m.is_pm)?.id);
                                                const uniqueMap = new Map();
                                                [...taskMembers, ...current].forEach(u => uniqueMap.set(String(u.id), u));
                                                const availableUsers = Array.from(uniqueMap.values())
                                                    .filter((u: any) => String(u.id) !== globalPmId)
                                                    .map((u: any) => ({
                                                        ...u,
                                                        initials: u.initials || (u.name ? u.name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase() : '??')
                                                    }));
                                                const userObj = availableUsers.find((u: any) => String(u.id) === String(userId));
                                                const isAssigned = (activity.assigned_users || []).some((u: any) => String(u.id) === String(userId));
                                                assignActivityUserMutation.mutate({ activityId: activity.id, userId, action: isAssigned ? 'remove' : 'add', userObj });
                                            }}
                                            availableUsers={availableUsers}
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
