import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from 'react-query';
import { Plus, ChevronLeft, Edit, Layers, CheckSquare, ClipboardList, FileText, Folder, ChevronDown } from 'lucide-react';
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
    const [createType, setCreateType] = useState<'module' | 'task' | 'activity' | null>(null);
    const [createParentId, setCreateParentId] = useState<number | null>(null);
    const [isEdit, setIsEdit] = useState(false);

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

    // Activities placeholder
    const { data: activities } = useQuery(
        ['activities', selectedTaskId],
        () => { return []; },
        { enabled: !!selectedTaskId }
    );

    // Permissions
    const canEdit = ['super_admin', 'hr', 'manager'].includes(user?.role || '');

    const handleCreate = (type: 'module' | 'task' | 'activity', parentId: number) => {
        setCreateType(type);
        setCreateParentId(parentId);
        setIsEdit(false);
    };

    const handleEditProject = () => {
        setCreateType('project');
        setIsEdit(true);
    };

    const handleCreateSuccess = () => {
        if (createType === 'module') refetchModules();
        if (createType === 'task') refetchTasks();
    };

    const canManageStatus = (user?.role === 'super_admin' || user?.role === 'manager');

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
            onError: (err, newStatus, context: any) => {
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
                        {canEdit && (
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
                            {canEdit && (
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
                                <div
                                    key={module.id}
                                    onClick={() => { setSelectedModuleId(module.id); setSelectedTaskId(null); }}
                                    className={`ws-card ${selectedModuleId === module.id ? 'selected' : ''}`}
                                >
                                    <h4 className="ws-card-title">{module.name}</h4>
                                    <p className="ws-card-desc">{module.description || 'No description'}</p>
                                    <div className="ws-card-footer">
                                        Created by: Aggregator (Admin)
                                    </div>
                                </div>
                            ))}
                            {modules?.length === 0 && (
                                <div className="ws-empty-dashed">
                                    <div className="dashed-icon"><Layers size={24} /></div>
                                    <p className="dashed-title">No Modules Found</p>
                                    <p className="dashed-desc">Create a module to start organizing tasks.</p>
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
                            {selectedModuleId && canEdit && (
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
                                    <p className="dashed-title">No Tasks Found</p>
                                    <p className="dashed-desc">Assign and track tasks within this module.</p>
                                </div>
                            ) : (
                                tasks?.map(task => (
                                    <div
                                        key={task.id}
                                        onClick={() => setSelectedTaskId(task.id)}
                                        className={`ws-card ${selectedTaskId === task.id ? 'selected' : ''}`}
                                    >
                                        <h4 className="ws-card-title">{task.name}</h4>
                                        <p className="ws-card-desc">{task.description || 'No description'}</p>
                                        <div className="ws-card-footer">
                                            Status: {task.status.replace('_', ' ')}
                                        </div>
                                    </div>
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
                            {selectedTaskId && canEdit && (
                                <button className="btn-col-add">
                                    <Plus size={14} /> Add Activity
                                </button>
                            )}
                        </div>
                        <div className="ws-column-body">
                            {!selectedTaskId ? (
                                <div className="ws-empty-dashed">
                                    <div className="dashed-icon"><ClipboardList size={24} /></div>
                                    <p className="dashed-title">Select a Task</p>
                                    <p className="dashed-desc">Choose a task to view its detailed activity trail.</p>
                                </div>
                            ) : (
                                <div className="ws-empty-dashed">
                                    <div className="dashed-icon"><ClipboardList size={24} /></div>
                                    <p className="dashed-title">No Activities</p>
                                    <p className="dashed-desc">No activities found for this task.</p>
                                </div>
                            )}
                        </div>
                    </div>

                </div>

                {/* Shared Create Modal */}
                <CreateModal
                    isOpen={!!createType}
                    onClose={() => { setCreateType(null); setCreateParentId(null); setIsEdit(false); }}
                    type={createType || 'module'}
                    parentId={createParentId || undefined}
                    onSuccess={handleCreateSuccess}
                    initialData={isEdit ? project : undefined}
                    isEdit={isEdit}
                />
            </div>
        </AppLayout>
    );
};
