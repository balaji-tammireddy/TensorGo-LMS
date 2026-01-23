import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from 'react-query';
import { ChevronLeft, Mail, Briefcase, Building, AlertCircle } from 'lucide-react';
import AppLayout from '../../components/layout/AppLayout';
import { projectService } from '../../services/projectService';
import './ProjectTeamPage.css';

export const ProjectTeamPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const projectId = parseInt(id || '0');

    // Fetch Project Details (for header)
    const { data: projects } = useQuery('projects', projectService.getProjects);
    const project = projects?.find(p => p.id === projectId);

    // Fetch Team Members
    const { data: members, isLoading } = useQuery(
        ['project-members', projectId],
        () => projectService.getProjectMembers(projectId)
    );

    if (isLoading) {
        return (
            <AppLayout>
                <div className="team-page-loading">Loading team details...</div>
            </AppLayout>
        );
    }

    if (!members) {
        return (
            <AppLayout>
                <div className="team-page-error">
                    <p>Failed to load team members.</p>
                </div>
            </AppLayout>
        );
    }

    if (!project) {
        return (
            <AppLayout>
                <div className="team-page-error">
                    <AlertCircle size={48} />
                    <p>Project not found</p>
                    <button className="btn-back-error" onClick={() => navigate('/project-management')}>
                        Go Back
                    </button>
                </div>
            </AppLayout>
        );
    }

    return (
        <AppLayout>
            <div className="team-page-container">
                {/* Header */}
                <div className="team-page-header">
                    <button onClick={() => navigate(`/project-management/${projectId}`)} className="btn-back">
                        <ChevronLeft size={16} /> Back to Project
                    </button>
                    <div className="team-page-title-group">
                        <h1>Project Team</h1>
                        <span className="team-project-name">{project.name} (ID: {project.custom_id})</span>
                    </div>
                </div>

                {/* Team Grid */}
                <div className="team-page-body">
                    {members?.length === 0 ? (
                        <div className="team-empty-state">
                            <p>No team members found.</p>
                        </div>
                    ) : (
                        <div className="team-grid">
                            {members?.map((member: any) => {
                                const initials = member.name
                                    ? member.name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()
                                    : '??';

                                const isPM = member.id === project.project_manager_id;

                                return (
                                    <div key={member.id} className={`team-card ${isPM ? 'pm-card' : ''}`}>
                                        <div className="team-card-header">
                                            <div className="team-avatar">
                                                {initials}
                                            </div>
                                            <div className="team-info">
                                                <h3 className="team-name">
                                                    {member.name}
                                                    {isPM && <span className="team-pm-badge">Project Manager</span>}
                                                </h3>
                                                <span className={`team-role-badge ${member.role}`}>
                                                    {member.role.replace('_', ' ')}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="team-card-details">
                                            <div className="team-detail-row">
                                                <Briefcase size={14} className="detail-icon" />
                                                <span>{member.designation}</span>
                                            </div>
                                            <div className="team-detail-row">
                                                <Building size={14} className="detail-icon" />
                                                <span>{member.department}</span>
                                            </div>
                                            <div className="team-detail-row">
                                                <Mail size={14} className="detail-icon" />
                                                <span className="email">{member.email}</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </AppLayout>
    );
};
