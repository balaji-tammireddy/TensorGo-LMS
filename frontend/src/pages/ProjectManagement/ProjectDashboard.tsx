import React, { useState } from 'react';
import { useQuery } from 'react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, FolderKanban, Calendar, ClipboardList, Trash2, ExternalLink } from 'lucide-react';
import AppLayout from '../../components/layout/AppLayout';
import { projectService } from '../../services/projectService';
import { CreateModal } from './components/CreateModal';
import { useAuth } from '../../contexts/AuthContext';
import './ProjectDashboard.css';

export const ProjectDashboard: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

    // Fetch projects
    const { data: projects, isLoading, refetch } = useQuery(
        'projects',
        projectService.getProjects
    );

    // Helper to check if user can create (Admin/HR/Manager)
    const canCreate = ['super_admin', 'hr', 'manager'].includes(user?.role || '');

    const getStatusClass = (status: string) => {
        if (status === 'active') return 'status-active';
        if (status === 'completed') return 'status-completed';
        return 'status-other';
    };

    return (
        <AppLayout>
            <div className="project-dashboard">
                {/* Header */}
                <div className="dashboard-header">
                    <div>
                        <h1>Projects</h1>
                    </div>
                    {canCreate && (
                        <button
                            onClick={() => setIsCreateModalOpen(true)}
                            className="btn-create"
                        >
                            <Plus size={16} />
                            New Project
                        </button>
                    )}
                </div>

                {/* Loading State */}
                {isLoading && (
                    <div className="project-loading">Loading projects...</div>
                )}

                {/* Projects Grid */}
                {!isLoading && projects && projects.length > 0 && (
                    <div className="projects-grid">
                        {projects.map(project => (
                            <div
                                key={project.id}
                                className="project-card"
                            >
                                <span className={`status-badge ${getStatusClass(project.status)}`}>
                                    {project.status.replace('_', ' ')}
                                </span>

                                <div className="icon-wrapper">
                                    <FolderKanban size={28} />
                                </div>

                                <h3 className="project-title">
                                    {project.name}
                                </h3>

                                <p className="project-desc">
                                    {project.description || 'No description provided.'}
                                </p>

                                <div className="project-dates">
                                    <div className="date-row">
                                        <Calendar size={14} />
                                        <span>Started: {project.start_date ? new Date(project.start_date).toLocaleDateString() : '-'}</span>
                                    </div>
                                    <div className="date-row">
                                        <Calendar size={14} />
                                        <span>Ended: {project.end_date ? new Date(project.end_date).toLocaleDateString() : '-'}</span>
                                    </div>
                                </div>

                                <div className="card-footer-actions">
                                    <button
                                        onClick={() => navigate(`/project-management/${project.id}`)}
                                        className="btn-view-details"
                                    >
                                        View Details <ClipboardList size={14} />
                                    </button>

                                    {/* Delete button only for authorized users if needed, user requested it in UI */}
                                    <button className="btn-delete-project">
                                        Delete Project <FolderKanban size={14} style={{ transform: 'rotate(180deg)' }} />
                                        {/* Using generic icon for now, Trash would be better but keeping imports minimal implies checking available icons */}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* New Refined Empty State */}
                {!isLoading && (!projects || projects.length === 0) && (
                    <div className="project-empty-state">
                        <div className="empty-state-icon-wrapper">
                            <ClipboardList size={32} strokeWidth={1.5} />
                        </div>
                        <h3 className="empty-state-title">No Projects Found</h3>
                        <p className="empty-state-desc">Get started by creating your first project.</p>
                    </div>
                )}

                <CreateModal
                    isOpen={isCreateModalOpen}
                    onClose={() => setIsCreateModalOpen(false)}
                    type="project"
                    onSuccess={refetch}
                />
            </div>
        </AppLayout>
    );
};
