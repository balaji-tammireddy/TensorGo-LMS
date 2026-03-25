import React from 'react';
import { Trash2, Info } from 'lucide-react';
import { Project } from '../../../services/projectService';
import { DescriptionModal } from './DescriptionModal';
import { useState } from 'react';

interface ProjectCardProps {
    project: Project;
    navigate: (path: string) => void;
    getStatusClass: (status: string) => string;
    onDelete?: (id: number, name: string) => void;
    canDelete?: boolean;
}

export const ProjectCard: React.FC<ProjectCardProps> = ({
    project,
    navigate,
    getStatusClass,
    onDelete,
    canDelete
}) => {
    const [showInfo, setShowInfo] = useState(false);

    return (
        <>
            <div className="project-card">
                <div className="card-header">
                    <div className="header-main">
                        <div className="title-group">
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                                <h3 className="project-title" title={project.name}>{project.name}</h3>
                                <button
                                    className="btn-info-icon"
                                    onClick={(e) => { e.stopPropagation(); setShowInfo(true); }}
                                    title="View Description"
                                    style={{
                                        color: '#64748B',
                                        background: 'transparent',
                                        border: 'none',
                                        cursor: 'pointer',
                                        padding: '0 2px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        marginLeft: '2px' // Minimal gap if needed, or 0 for 'no gap'
                                    }}
                                >
                                    <Info size={14} />
                                </button>
                            </div>
                            <span className="project-id">{project.custom_id || `#${project.id}`}</span>
                        </div>
                    </div>
                    <div className="header-right">
                        <span className={`status-badge ${getStatusClass(project.status)}`}>
                            {project.status.replace('_', ' ')}
                        </span>
                        {canDelete && onDelete && (
                            <button
                                className="btn-delete-card"
                                onClick={() => onDelete(project.id, project.name)}
                                title="Delete Project"
                            >
                                <Trash2 size={14} />
                            </button>
                        )}
                    </div>
                </div>

                <div className="card-body">
                    <p className="project-desc" title={project.description}>
                        {(project.description || '').length > 30
                            ? (project.description || '').slice(0, 30) + '...'
                            : (project.description || 'No description provided.')}
                    </p>
                </div>

                <div className="card-footer">
                    <div className="project-dates">
                        <div className="date-row">
                            <span className="date-label">Manager:</span>
                            <span className="date-val" title={project.manager_name}>{project.manager_name || 'Unassigned'}</span>
                        </div>
                        <div className="date-row">
                            <span className="date-label">Created:</span>
                            <span className="date-val">{new Date(project.created_at).toLocaleDateString()}</span>
                        </div>
                    </div>

                    <div className="card-actions">
                        <button
                            onClick={() => navigate(`/project-management/${project.id}`)}
                            className="btn-view-details"
                        >
                            View
                        </button>
                    </div>
                </div>
            </div>

            <DescriptionModal
                isOpen={showInfo}
                onClose={() => setShowInfo(false)}
                title={project.name}
                customId={project.custom_id || `#${project.id}`}
                description={project.description}
            />
        </>
    );
};
