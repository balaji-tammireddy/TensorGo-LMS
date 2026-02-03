import React, { useState } from 'react';
import { useQuery } from 'react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
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

    // State for accordion sections
    const [openSection, setOpenSection] = useState<string | null>('my-projects');

    const handleToggleSection = (section: string) => {
        // Enforce one section always open (optimal space usage)
        if (openSection !== section) {
            setOpenSection(section);
        }
    };

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
        if (status === 'on_hold') return 'status-on-hold';
        if (status === 'completed') return 'status-completed';
        if (status === 'archived') return 'status-archived';
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

    const ProjectListSection = ({
        title,
        projects,
        filterType,
        emptyMsg,
        // sectionId,
        isOpen,
        onToggle
    }: {
        title: string,
        projects: Project[],
        filterType: string,
        emptyMsg: string,
        sectionId: string,
        isOpen: boolean,
        onToggle: () => void
    }) => {
        const displayProjects = projects.slice(0, 4); // Show only top 4
        const hasMore = projects.length > 4;

        return (
            <div className={`section-container ${isOpen ? 'open' : ''}`}>
                <div
                    className="section-header-row clickable"
                    onClick={onToggle}
                    style={{ cursor: 'pointer', userSelect: 'none' }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {isOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                        <h2 className="section-title" style={{ margin: 0 }}>{title}</h2>
                    </div>
                    {hasMore && isOpen && (
                        <button
                            className="btn-view-all"
                            onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/project-management/list?filter=${filterType}`);
                            }}
                        >
                            View All &gt;
                        </button>
                    )}
                </div>

                {isOpen && (
                    <div className="section-content">
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
                    </div>
                )}
            </div>
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

                {/* Projects Content Split */}
                {!isLoading && (
                    <div className="dashboard-content">
                        {/* 1. SECTION: My Projects */}
                        <div className={`dashboard-section ${openSection !== 'my-projects' ? 'collapsed' : ''}`}>
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
                                        sectionId="my-projects"
                                        isOpen={openSection === 'my-projects'}
                                        onToggle={() => handleToggleSection('my-projects')}
                                    />
                                );
                            })()}
                        </div>

                        {/* 2. SECTION: All Projects */}
                        <div className={`dashboard-section ${openSection !== 'all-projects' ? 'collapsed' : ''}`}>
                            {isGlobalAdmin ? (
                                (() => {
                                    const allOtherProjects = projects || [];
                                    return (
                                        <ProjectListSection
                                            title="All Projects"
                                            projects={allOtherProjects}
                                            filterType="all"
                                            emptyMsg="No global projects to display."
                                            sectionId="all-projects"
                                            isOpen={openSection === 'all-projects'}
                                            onToggle={() => handleToggleSection('all-projects')}
                                        />
                                    );
                                })()
                            ) : (
                                <div className="section-container">
                                    <div
                                        className="section-header-row clickable"
                                        onClick={() => handleToggleSection('all-projects')}
                                        style={{ cursor: 'pointer', userSelect: 'none' }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            {openSection === 'all-projects' ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                                            <h2 className="section-title" style={{ margin: 0 }}>All Projects</h2>
                                        </div>
                                    </div>

                                    {openSection === 'all-projects' && (
                                        <EmptyState
                                            title="Access Restricted"
                                            description="You are not authorized to view all projects."
                                            icon={AlertCircle}
                                            size="small"
                                            className="dashboard-empty-state"
                                        />
                                    )}
                                </div>
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
