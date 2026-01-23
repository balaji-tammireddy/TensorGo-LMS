import React from 'react';
import { X, Mail, Briefcase, Building } from 'lucide-react';
import './TeamModal.css';

interface TeamMember {
    id: number;
    empId: string;
    name: string;
    role: string;
    email: string;
    designation: string;
    department: string;
}

interface TeamModalProps {
    isOpen: boolean;
    onClose: () => void;
    members: TeamMember[];
    projectName: string;
}

export const TeamModal: React.FC<TeamModalProps> = ({ isOpen, onClose, members, projectName }) => {
    if (!isOpen) return null;

    return (
        <div className="team-modal-overlay">
            <div className="team-modal-content">
                <div className="team-modal-header">
                    <div className="team-modal-title-group">
                        <h2>Team Members</h2>
                        <span className="team-project-name">{projectName}</span>
                    </div>
                    <button onClick={onClose} className="team-modal-close">
                        <X size={20} />
                    </button>
                </div>

                <div className="team-modal-body">
                    {members.length === 0 ? (
                        <div className="team-empty-state">
                            <p>No team members found.</p>
                        </div>
                    ) : (
                        <div className="team-grid">
                            {members.map(member => {
                                const initials = member.name
                                    ? member.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
                                    : '??';

                                return (
                                    <div key={member.id} className="team-card">
                                        <div className="team-card-header">
                                            <div className="team-avatar">
                                                {initials}
                                            </div>
                                            <div className="team-info">
                                                <h3 className="team-name">{member.name}</h3>
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
        </div>
    );
};
