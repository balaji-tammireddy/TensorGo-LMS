import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from 'react-query';
import { FaArrowLeft, FaSearch, FaTrash, FaChevronDown } from 'react-icons/fa';
import { ChevronDown } from 'lucide-react';
import ConfirmationDialog from '../../components/ConfirmationDialog';
import AppLayout from '../../components/layout/AppLayout';
import { projectService, Project } from '../../services/projectService';
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

export const ProjectListPage: React.FC = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const { showSuccess, showError } = useToast();
    const queryClient = useQueryClient();
    const [deleteConfirm, setDeleteConfirm] = useState<{ id: number, name: string } | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');

    const filterType = searchParams.get('filter') || 'all';

    // Fetch projects - fetch all if SA/HR, or just involvement
    const { data: projects, isLoading } = useQuery(
        ['projects', filterType],
        () => projectService.getProjects(['super_admin', 'hr'].includes(user?.role || '') && filterType === 'all'),
        {
            refetchOnWindowFocus: false,
        }
    );

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
        if (statusFilter !== 'all' && p.status !== statusFilter) return false;
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            return p.name.toLowerCase().includes(term);
        }
        return true;
    });

    const pageTitle = filterType === 'my-projects' ? 'My Projects' : 'Organization Projects';

    return (
        <AppLayout>
            <div className="project-dashboard-v2">
                <div className="dashboard-header-modern">
                    <div className="header-left" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <button onClick={() => navigate('/project-management')} className="btn-icon-action view">
                            <FaArrowLeft size={14} />
                        </button>
                        <div>
                            <h1>{pageTitle}</h1>
                            <p className="subtitle">Detailed overview of projects</p>
                        </div>
                    </div>
                </div>

                <div className="controls-bar">
                    <div className="search-group">
                        <FaSearch className="search-icon" size={14} />
                        <input
                            type="text"
                            placeholder="Search projects..."
                            value={searchTerm}
                            onChange={(e) => {
                                const val = e.target.value.replace(/[^a-zA-Z0-9\s]/g, '');
                                setSearchTerm(val);
                            }}
                        />
                    </div>
                </div>

                <div className="table-container-modern">
                    <table className="modern-table">
                        <thead>
                            <tr>
                                <th style={{ width: '120px' }}>Project ID</th>
                                <th style={{ width: '250px' }}>Project Name</th>
                                <th className="hide-mobile" style={{ width: '200px' }}>Project Manager</th>
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
                                    <td colSpan={5} style={{ padding: '0' }}>
                                        <div style={{ padding: '20px' }}>
                                            {Array.from({ length: 5 }).map((_, idx) => (
                                                <div key={idx} className="shimmer-table"></div>
                                            ))}
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredProjects.length === 0 ? (
                                <tr>
                                    <td colSpan={5}>
                                        <div className="empty-state-container">
                                            <EmptyState
                                                title="No Projects Found"
                                                description={searchTerm ? "Try adjusting your search or filters." : "No projects in this category."}
                                                icon={FaSearch as any}
                                            />
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredProjects.map(project => (
                                    <tr
                                        key={project.id}
                                        className="clickable-row"
                                        onClick={() => navigate(`/project-management/${project.id}`, { state: { from: 'all' } })}
                                    >
                                        <td style={{ fontWeight: '700', color: '#64748B' }}>{project.custom_id}</td>
                                        <td className="project-name-cell">
                                            <div className="name">{project.name}</div>
                                        </td>
                                        <td className="hide-mobile">
                                            <div className="pm-cell">
                                                {project.manager_name}
                                            </div>
                                        </td>
                                        <td>
                                            <span className={`status-badge ${getStatusClass(project.status)}`}>
                                                {project.status.replace('_', ' ')}
                                            </span>
                                        </td>
                                        <td onClick={(e) => e.stopPropagation()}>
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

                <ConfirmationDialog
                    isOpen={!!deleteConfirm}
                    title="Delete Project?"
                    message={`Are you sure you want to delete "${deleteConfirm?.name}"? All associated data will be lost.`}
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
