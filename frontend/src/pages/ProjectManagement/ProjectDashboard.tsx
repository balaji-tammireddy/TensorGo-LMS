import React, { useState } from 'react';
import { useQuery, useQueryClient } from 'react-query';
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


const ProjectListSection = ({
    title,
    projects,
    emptyMsg,
    isOpen,
    onToggle,
    navigate,
    user,
    getStatusClass,
    setDeleteConfirm
}: {
    title: string,
    projects: Project[],
    emptyMsg: string,
    isOpen: boolean,
    onToggle?: () => void,
    navigate: (path: string) => void,
    user: any,
    getStatusClass: (status: string) => string,
    setDeleteConfirm: (val: { id: number, name: string } | null) => void
}) => {
    const scrollRef = React.useRef<HTMLDivElement>(null);
    const displayProjects = projects;

    const handleScroll = (direction: 'left' | 'right') => {
        if (scrollRef.current) {
            const scrollAmount = 364; // card width (340) + gap (24)
            scrollRef.current.scrollBy({
                left: direction === 'left' ? -scrollAmount : scrollAmount,
                behavior: 'smooth'
            });
        }
    };

    return (
        <div className={`section-container ${isOpen ? 'open' : ''}`}>
            <div
                className={`section-header-row ${onToggle ? 'clickable' : ''}`}
                onClick={onToggle}
                style={{ cursor: onToggle ? 'pointer' : 'default', userSelect: 'none' }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {onToggle && (isOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />)}
                    <h2 className="section-title" style={{ margin: 0 }}>{title}</h2>
                </div>
                {isOpen && projects.length > 0 && (
                    <div className="header-scroll-actions" onClick={e => e.stopPropagation()}>
                        <button
                            className="header-scroll-btn"
                            onClick={() => handleScroll('left')}
                            title="Scroll Left"
                        >
                            <ChevronDown size={18} style={{ transform: 'rotate(90deg)' }} />
                        </button>
                        <button
                            className="header-scroll-btn"
                            onClick={() => handleScroll('right')}
                            title="Scroll Right"
                        >
                            <ChevronDown size={18} style={{ transform: 'rotate(-90deg)' }} />
                        </button>
                    </div>
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
                        <div className="projects-grid-preview" ref={scrollRef}>
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
                    {projects.length > 0 && (
                        <div className="section-footer-row">
                            <span className="project-count-badge">
                                {projects.length} {projects.length === 1 ? 'Project' : 'Projects'}
                            </span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};



export const ProjectDashboard: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const { showSuccess, showError } = useToast();
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState<{ id: number, name: string } | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // State for accordion sections
    const [openSection, setOpenSection] = useState<string | null>('my-projects');

    const handleToggleSection = (section: string) => {
        if (openSection === section) {
            // If clicking the already open section, open the other one
            setOpenSection(section === 'my-projects' ? 'all-projects' : 'my-projects');
        } else {
            setOpenSection(section);
        }
    };

    // Fetch projects
    const { data: projects, isLoading } = useQuery(
        'projects',
        projectService.getProjects,
        {
            refetchOnWindowFocus: false,
            staleTime: 60000, // 1 minute
        }
    );
    // Helper to check if user can create (Admin/HR/Manager)
    const canCreate = ['super_admin', 'hr', 'manager'].includes(user?.role || '');
    const isGlobalViewer = ['super_admin', 'hr'].includes(user?.role || '');

    const getStatusClass = (status: string) => {
        if (status === 'active') return 'status-active';
        if (status === 'completed') return 'status-completed';
        if (status === 'archived') return 'status-archived';
        if (status === 'on_hold') return 'status-on-hold';
        return 'status-other';
    };

    const confirmDelete = async () => {
        if (!deleteConfirm) return;

        setIsDeleting(true);
        try {
            await projectService.deleteProject(deleteConfirm.id);
            showSuccess(`Project "${deleteConfirm.name}" deleted successfully`);

            // Optimistic Update: Remove from list immediately
            queryClient.setQueryData<Project[]>('projects', (old) => {
                return (old || []).filter(p => p.id !== deleteConfirm.id);
            });

            setDeleteConfirm(null);
            // Optionally invalidate to ensure sync, but local update is enough for "no reload" feel
            // queryClient.invalidateQueries('projects');
        } catch (error: any) {
            console.error('[PROJECT] Delete Error:', error);
            showError(error.response?.data?.error || 'Failed to delete project');
        } finally {
            setIsDeleting(false);
        }
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

                {/* Projects Content Split */}
                {!isLoading && (
                    <div className="dashboard-content">
                        {/* 1. SECTION: My Projects */}
                        <div className={`dashboard-section ${(!isGlobalViewer || openSection === 'my-projects') ? 'open' : 'collapsed'}`}>
                            {(() => {
                                const myProjectsList = isGlobalViewer
                                    ? (projects || []).filter(p => p.is_pm || p.is_member)
                                    : (projects || []);

                                return (
                                    <ProjectListSection
                                        title="My Projects"
                                        projects={myProjectsList}
                                        emptyMsg="No projects found in this section."
                                        isOpen={!isGlobalViewer || openSection === 'my-projects'}
                                        onToggle={isGlobalViewer ? () => handleToggleSection('my-projects') : undefined}
                                        navigate={navigate}
                                        user={user}
                                        getStatusClass={getStatusClass}
                                        setDeleteConfirm={setDeleteConfirm}
                                    />
                                );
                            })()}
                        </div>

                        {/* 2. SECTION: All Projects */}
                        {isGlobalViewer && (
                            <div className={`dashboard-section ${openSection !== 'all-projects' ? 'collapsed' : ''}`}>
                                {(() => {
                                    // Show ALL projects (user request: "all project should show all of them")
                                    const allProjects = projects || [];
                                    return (
                                        <ProjectListSection
                                            title="All Projects"
                                            projects={allProjects}
                                            emptyMsg="No global projects to display."
                                            isOpen={openSection === 'all-projects'}
                                            onToggle={() => handleToggleSection('all-projects')}
                                            navigate={navigate}
                                            user={user}
                                            getStatusClass={getStatusClass}
                                            setDeleteConfirm={setDeleteConfirm}
                                        />
                                    );
                                })()}
                            </div>
                        )}
                    </div>
                )}

                <CreateModal
                    isOpen={isCreateModalOpen}
                    onClose={() => setIsCreateModalOpen(false)}
                    type="project"
                    onSuccess={(newProject?: any) => {
                        if (newProject && newProject.id) {
                            // Enrich newProject with manager name if missing (CreateModal returns raw API response usually)
                            // Since we don't know the manager name easily here without searching, 
                            // we can fallback to user's name if they created it for themselves, or leave it blank/loading.
                            // Ideally CreateModal sends back enriched data or we rely on the list to fetch it eventually.
                            // But since we removed invalidateQueries, we need it NOW.
                            // Let's rely on the fact that for "My Projects", if I created it, I am likely the PM or member.

                            // Better approach: In CreateModal, assume result has manager_name or we might miss it.
                            // If missing, UI might show blank.
                            // Let's invalidQueries in the background (silent refetch) to fix data eventually,
                            // but setQueryData immediately for responsiveness.

                            queryClient.setQueryData<Project[]>('projects', (old) => {
                                if (!old) return [newProject];
                                return [newProject, ...old];
                            });
                        }
                    }}
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
