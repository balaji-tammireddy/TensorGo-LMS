import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from 'react-query';
import { useNavigate } from 'react-router-dom';
import { FaPlus, FaSearch, FaTrash, FaTimes, FaChevronDown } from 'react-icons/fa';
import { ChevronDown } from 'lucide-react';
import ConfirmationDialog from '../../components/ConfirmationDialog';
import AppLayout from '../../components/layout/AppLayout';
import { projectService, Project } from '../../services/projectService';
import { CreateModal } from './components/CreateModal';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import EmptyState from '../../components/common/EmptyState';
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
} from '../../components/ui/dropdown-menu';
import './ProjectDashboard.css';

export const ProjectDashboard: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const { showSuccess, showError } = useToast();
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState<{ id: number, name: string } | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // Filters and Search
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [pmFilter, setPmFilter] = useState('all');
    const [viewMode, setViewMode] = useState<'my' | 'all'>('my');

    // Fetch projects
    const { data: projects, isLoading } = useQuery(
        ['projects', viewMode],
        () => projectService.getProjects(viewMode === 'all'),
        {
            refetchOnWindowFocus: false,
            staleTime: 60000,
        }
    );

    const isGlobalViewer = ['super_admin', 'hr'].includes(user?.role || '');
    const canCreate = ['super_admin', 'hr', 'manager'].includes(user?.role || '');

    useEffect(() => {
        if (isGlobalViewer) {
            setViewMode('my');
        }
    }, [isGlobalViewer]);

    // Unique PMs for header filter
    const uniquePMs = useMemo(() => {
        if (!projects) return [];
        const pms = projects
            .map(p => p.manager_name)
            .filter((name): name is string => !!name);
        return Array.from(new Set(pms)).sort();
    }, [projects]);

    const getStatusClass = (status: string) => {
        switch (status) {
            case 'active': return 'status-badge-active';
            case 'completed': return 'status-badge-completed';
            case 'archived': return 'status-badge-archived';
            case 'on_hold': return 'status-badge-hold';
            default: return 'status-badge-other';
        }
    };

    const confirmDelete = async () => {
        if (!deleteConfirm) return;
        setIsDeleting(true);
        try {
            await projectService.deleteProject(deleteConfirm.id);
            showSuccess(`Project "${deleteConfirm.name}" deleted successfully`);
            queryClient.invalidateQueries('projects');
            setDeleteConfirm(null);
        } catch (error: any) {
            showError(error.response?.data?.error || 'Failed to delete project');
        } finally {
            setIsDeleting(false);
        }
    };

    const filteredProjects = (projects || []).filter(p => {
        if (isGlobalViewer && viewMode === 'my' && !p.is_pm && !p.is_member) return false;
        if (statusFilter !== 'all' && p.status !== statusFilter) return false;
        if (pmFilter !== 'all' && p.manager_name !== pmFilter) return false;
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            return p.name.toLowerCase().includes(term);
        }
        return true;
    });

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value.replace(/[^a-zA-Z\s]/g, '');
        setSearchTerm(val);
    };

    const handleSearchReset = () => {
        setSearchTerm('');
    };

    return (
        <AppLayout>
            <div className="project-dashboard-v2">
                <div className="dashboard-header-modern">
                    <div className="header-left">
                        <h1>Project Management</h1>
                    </div>
                    <div className="header-actions">
                        {canCreate && (
                            <button onClick={() => setIsCreateModalOpen(true)} className="btn-primary-glow">
                                <FaPlus size={14} />
                                <span>New Project</span>
                            </button>
                        )}
                    </div>
                </div>

                <div className="controls-bar">
                    <div className="search-group">
                        <FaSearch className="search-icon" size={14} />
                        <input
                            type="text"
                            placeholder="Search projects..."
                            value={searchTerm}
                            onChange={handleSearchChange}
                        />
                        {searchTerm && (
                            <button className="search-reset" onClick={handleSearchReset}>
                                <FaTimes size={12} />
                            </button>
                        )}
                    </div>

                    <div className="filter-group">
                        <div className="toggle-group">
                            {isGlobalViewer && (
                                <>
                                    <button
                                        className={viewMode === 'my' ? 'active' : ''}
                                        onClick={() => setViewMode('my')}
                                    >
                                        My Projects
                                    </button>
                                    <button
                                        className={viewMode === 'all' ? 'active' : ''}
                                        onClick={() => setViewMode('all')}
                                    >
                                        All Projects
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                <div className="table-container-modern">
                    <table className="modern-table">
                        <thead>
                            <tr>
                                <th style={{ width: '120px' }}>Project ID</th>
                                <th style={{ width: '250px' }}>Project Name</th>
                                <th className="hide-mobile" style={{ width: '300px' }}>Description</th>
                                <th style={{ width: '200px' }}>
                                    Project Manager
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <button className={`header-filter-btn ${pmFilter !== 'all' ? 'active' : ''}`}>
                                                <FaChevronDown size={10} />
                                            </button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent>
                                            <DropdownMenuItem
                                                onSelect={() => setPmFilter('all')}
                                                className={pmFilter === 'all' ? 'active-filter-item' : ''}
                                            >
                                                All Managers
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            {uniquePMs.map(pm => (
                                                <DropdownMenuItem
                                                    key={pm}
                                                    onSelect={() => setPmFilter(pm)}
                                                    className={pmFilter === pm ? 'active-filter-item' : ''}
                                                >
                                                    {pm}
                                                </DropdownMenuItem>
                                            ))}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </th>
                                <th style={{ width: '150px' }}>
                                    Status
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <button className={`header-filter-btn ${statusFilter !== 'all' ? 'active' : ''}`}>
                                                <FaChevronDown size={10} />
                                            </button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent>
                                            <DropdownMenuItem
                                                onSelect={() => setStatusFilter('all')}
                                                className={statusFilter === 'all' ? 'active-filter-item' : ''}
                                            >
                                                All Statuses
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem onSelect={() => setStatusFilter('active')} className={statusFilter === 'active' ? 'active-filter-item' : ''}>Active</DropdownMenuItem>
                                            <DropdownMenuItem onSelect={() => setStatusFilter('completed')} className={statusFilter === 'completed' ? 'active-filter-item' : ''}>Completed</DropdownMenuItem>
                                            <DropdownMenuItem onSelect={() => setStatusFilter('on_hold')} className={statusFilter === 'on_hold' ? 'active-filter-item' : ''}>On Hold</DropdownMenuItem>
                                            <DropdownMenuItem onSelect={() => setStatusFilter('archived')} className={statusFilter === 'archived' ? 'active-filter-item' : ''}>Archived</DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </th>
                                <th style={{ width: '100px' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr>
                                    <td colSpan={6} style={{ padding: '0' }}>
                                        <div style={{ padding: '20px' }}>
                                            {Array.from({ length: 5 }).map((_, idx) => (
                                                <div key={idx} className="shimmer-table"></div>
                                            ))}
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredProjects.length === 0 ? (
                                <tr>
                                    <td colSpan={6}>
                                        <div className="empty-state-container">
                                            <EmptyState
                                                title="No Projects Found"
                                                description={searchTerm ? "Try adjusting your search or filters." : "Get started by creating your first project."}
                                                icon={FaSearch as any}
                                            />
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredProjects.map((project) => (
                                    <tr
                                        key={project.id}
                                        onClick={() => navigate(`/project-management/${project.id}`)}
                                        className="clickable-row"
                                    >
                                        <td style={{ fontWeight: '700', color: '#64748B' }}>{project.custom_id}</td>
                                        <td>
                                            <div className="project-name-cell">
                                                <span className="name">{project.name}</span>
                                            </div>
                                        </td>
                                        <td className="hide-mobile">
                                            <span className="description-text">
                                                {project.description || <span style={{ color: '#94A3B8' }}>No description</span>}
                                            </span>
                                        </td>
                                        <td>
                                            <div className="pm-cell">
                                                <span>{project.manager_name}</span>
                                            </div>
                                        </td>
                                        <td>
                                            <span className={`status-badge ${getStatusClass(project.status || 'active')}`}>
                                                {(project.status || 'active').replace('_', ' ')}
                                            </span>
                                        </td>
                                        <td onClick={e => e.stopPropagation()}>
                                            <div className="action-btns">
                                                {user?.role === 'super_admin' && (
                                                    <button
                                                        className="btn-icon-action delete"
                                                        onClick={() => setDeleteConfirm({ id: project.id, name: project.name })}
                                                        title="Delete Project"
                                                    >
                                                        <FaTrash size={12} />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {!isLoading && filteredProjects.length > 0 && (
                    <div className="table-footer-stats">
                        Showing {filteredProjects.length} projects
                    </div>
                )}

                <CreateModal
                    isOpen={isCreateModalOpen}
                    onClose={() => setIsCreateModalOpen(false)}
                    type="project"
                    onSuccess={() => queryClient.invalidateQueries('projects')}
                />

                <ConfirmationDialog
                    isOpen={!!deleteConfirm}
                    title="Delete Project?"
                    message={`Are you sure you want to delete "${deleteConfirm?.name}"? All associated data will be permanently removed.`}
                    confirmText="Delete"
                    cancelText="Cancel"
                    type="danger"
                    onConfirm={confirmDelete}
                    onCancel={() => setDeleteConfirm(null)}
                    isLoading={isDeleting}
                />
            </div>
        </AppLayout>
    );
};
