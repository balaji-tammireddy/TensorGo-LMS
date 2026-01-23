import React, { useState } from 'react';
import { useQuery } from 'react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, AlertCircle } from 'lucide-react';
import ConfirmationDialog from '../../components/ConfirmationDialog';
import AppLayout from '../../components/layout/AppLayout';
import { projectService, Project } from '../../services/projectService';
import { CreateModal } from './components/CreateModal';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import EmptyState from '../../components/common/EmptyState';
import { ProjectCard } from './components/ProjectCard';
import './ProjectDashboard.css';

export const ProjectDashboard: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { showSuccess, showError } = useToast();
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState<{ id: number, name: string } | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // Fetch projects
    const { data: projects, isLoading, refetch } = useQuery(
        'projects',
        projectService.getProjects
    );

    // Helper to check if user can create (Admin/HR/Manager)
    const canCreate = ['super_admin', 'hr', 'manager'].includes(user?.role || '');
    const isGlobalAdmin = ['super_admin', 'hr'].includes(user?.role || '');

    const getStatusClass = (status: string) => {
        if (status === 'active') return 'status-active';
        if (status === 'completed') return 'status-completed';
        return 'status-other';
    };

    const confirmDelete = async () => {
        if (!deleteConfirm) return;

        setIsDeleting(true);
        setDeleteConfirm(null); // Close modal immediately
        try {
            await projectService.deleteProject(deleteConfirm.id);
            showSuccess(`Project "${deleteConfirm.name}" deleted successfully`);
            setDeleteConfirm(null);
            refetch();
        } catch (error: any) {
            console.error('[PROJECT] Delete Error:', error);
            showError(error.response?.data?.error || 'Failed to delete project');
        } finally {
            setIsDeleting(false);
        }
    };

    const ProjectListSection = ({ title, projects, filterType, emptyMsg }: { title: string, projects: Project[], filterType: string, emptyMsg: string }) => {
        const displayProjects = projects.slice(0, 4); // Show only top 4
        const hasMore = projects.length > 4;

        return (
            <>
                <div className="section-header-row">
                    <h2 className="section-title">{title}</h2>
                    {hasMore && (
                        <button
                            className="btn-view-all"
                            onClick={() => navigate(`/project-management/list?filter=${filterType}`)}
                        >
                            View All &gt;
                        </button>
                    )}
                </div>

                {projects.length === 0 ? (
                    <EmptyState
                        title="No Projects"
                        description={emptyMsg}
                        icon={AlertCircle}
                        size="small"
                        className="dashboard-empty-state"
                    />
                ) : (
                    <div className="projects-grid-preview">
                        {displayProjects.map((project: Project) => (
                            <ProjectCard
                                key={project.id}
                                project={project}
                                navigate={navigate}
                                getStatusClass={getStatusClass}
                                onDelete={(id: number, name: string) => setDeleteConfirm({ id, name })}
                                canDelete={user?.role === 'super_admin'}
                            />
                        ))}
                    </div>
                )}
            </>
        );
    };

    return (
        <AppLayout>
            <div className="project-dashboard">
                {/* Header */}
                <div className="dashboard-header">
                    <h1>Project Management</h1>
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

                {/* Projects Content Split (50/50) */}
                {!isLoading && (
                    <div className="dashboard-content">
                        {/* 1. UPPER SECTION: My Projects */}
                        <div className="dashboard-section">
                            {(() => {
                                const isPMView = ['super_admin', 'hr', 'manager'].includes(user?.role || '');
                                const myProjectsList = (projects || []).filter((p: Project) =>
                                    isPMView ? (p.is_pm || p.is_member) : p.is_member
                                );

                                return (
                                    <ProjectListSection
                                        title="My Projects"
                                        projects={myProjectsList}
                                        filterType="my-projects"
                                        emptyMsg="No projects found in this section."
                                    />
                                );
                            })()}
                        </div>

                        {/* 2. LOWER SECTION: All Projects */}
                        <div className="dashboard-section">
                            {isGlobalAdmin ? (
                                (() => {
                                    const allOtherProjects = projects || [];
                                    return (
                                        <ProjectListSection
                                            title="All Projects"
                                            projects={allOtherProjects}
                                            filterType="all"
                                            emptyMsg="No global projects to display."
                                        />
                                    );
                                })()
                            ) : (
                                <>
                                    <div className="section-header-row">
                                        <h2 className="section-title">All Projects</h2>
                                    </div>
                                    <EmptyState
                                        title="Access Restricted"
                                        description="You are not authorized to view all projects."
                                        icon={AlertCircle}
                                        size="small"
                                        className="dashboard-empty-state"
                                    />
                                </>
                            )}
                        </div>
                    </div>
                )}

                <CreateModal
                    isOpen={isCreateModalOpen}
                    onClose={() => setIsCreateModalOpen(false)}
                    type="project"
                    onSuccess={refetch}
                />


                <ConfirmationDialog
                    isOpen={!!deleteConfirm}
                    title="Delete Project?"
                    message={`Are you sure you want to delete ${deleteConfirm?.name}?\nThis will permanently remove all associated modules, tasks, and activities. This action cannot be undone.`}
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
