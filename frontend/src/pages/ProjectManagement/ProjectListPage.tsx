import React, { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery } from 'react-query';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import ConfirmationDialog from '../../components/ConfirmationDialog';
import AppLayout from '../../components/layout/AppLayout';
import { projectService, Project } from '../../services/projectService';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { ProjectCard } from './components/ProjectCard';
import './ProjectDashboard.css'; // Reuse dashboard styles including card styles

export const ProjectListPage: React.FC = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const { showSuccess, showError } = useToast();
    const [deleteConfirm, setDeleteConfirm] = useState<{ id: number, name: string } | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const filterType = searchParams.get('filter') || 'all';

    // Fetch projects
    const { data: projects, refetch } = useQuery(
        'projects',
        projectService.getProjects
    );

    const getStatusClass = (status: string) => {
        if (status === 'active') return 'status-active';
        if (status === 'completed') return 'status-completed';
        return 'status-other';
    };


    const confirmDelete = async () => {
        if (!deleteConfirm) return;
        setIsDeleting(true);
        setDeleteConfirm(null);
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

    const getFilteredProjects = () => {
        if (!projects) return [];
        const isPMView = ['super_admin', 'hr', 'manager'].includes(user?.role || '');
        const isGlobalAdmin = ['super_admin', 'hr'].includes(user?.role || '');

        if (filterType === 'my-projects') {
            return projects.filter((p: Project) => isPMView ? (p.is_pm || p.is_member) : p.is_member);
        } else {
            // "All Projects" logic
            // For Global Admin (Super Admin/HR), show everything
            if (isGlobalAdmin) return projects;
            // For others, show projects they are member of but NOT the PM (matching "All Projects" intent)
            // Actually, for regular users, "All Projects" usually means "Projects in organization" 
            // but they can only see what they are assigned to.
            // Let's stick to the definition: Organization-wide for admins, member-but-not-pm for others.
            return projects.filter((p: Project) => p.is_member && !p.is_pm);
        }
    };

    const filteredProjects = getFilteredProjects();
    const pageTitle = filterType === 'my-projects' ? 'My Projects' : 'All Projects';

    return (
        <AppLayout>
            <div className="project-dashboard" style={{ overflow: 'hidden' }}>
                <div className="dashboard-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <button
                            onClick={() => navigate('/project-management')}
                            style={{
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center'
                            }}
                        >
                            <ArrowLeft size={20} color="#64748b" />
                        </button>
                        <h1>{pageTitle}</h1>
                    </div>
                </div>

                <div className="dashboard-content">
                    <div className="dashboard-section" style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        minHeight: 0,
                        overflow: 'hidden' /* Ensure container clips content */
                    }}>
                        <div
                            className="custom-vertical-scroll"
                            style={{
                                flex: 1, /* Use flex to fill available space reliably */
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, 340px)',
                                justifyContent: 'center',
                                gap: '20px',
                                padding: '10px 10px 20px 10px',
                                height: '100%',
                                overflowY: 'scroll' /* Ensure this is set via style or class preference */
                            }}>
                            {filteredProjects.map((project: Project) => (
                                <ProjectCard
                                    key={project.id}
                                    project={project}
                                    navigate={navigate}
                                    getStatusClass={getStatusClass}
                                    onDelete={(id: number, name: string) => setDeleteConfirm({ id, name })}
                                    canDelete={user?.role === 'super_admin'}
                                />
                            ))}

                            {filteredProjects.length === 0 && (
                                <div style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gridColumn: '1 / -1',
                                    height: '100%',
                                    color: '#94a3b8'
                                }}>
                                    <AlertCircle size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
                                    <p>No projects found in this list.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>


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
