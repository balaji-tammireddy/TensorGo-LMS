import { Edit, Trash2, Plus, X, UserPlus, UserMinus, Info } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import './WorkspaceCard.css';
import { DescriptionModal } from './DescriptionModal';

interface AssignedUser {
    id: number;
    name: string;
    initials: string;
}

interface WorkspaceCardProps {
    id: number;
    customId: string;
    name: string;
    description?: string;
    assignedUsers?: AssignedUser[];
    isSelected?: boolean;
    onClick: () => void;
    onEdit?: () => void;
    onDelete?: () => void;
    onAddAssignee?: () => void;
    isPM?: boolean;
    isCompact?: boolean;
    availableUsers?: AssignedUser[];
    onAssignUser?: (userId: number) => void;
}

export const WorkspaceCard: React.FC<WorkspaceCardProps> = ({
    customId,
    name,
    description,
    assignedUsers = [],
    isSelected = false,
    onClick,
    onEdit,
    onDelete,
    onAddAssignee,
    isPM = false,
    isCompact = false,
    availableUsers = [],
    onAssignUser
}) => {
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [showInfo, setShowInfo] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const displayUsers = assignedUsers;

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        };

        if (isDropdownOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isDropdownOpen]);

    return (
        <>
            <div
                className={`ws-card ${isSelected ? 'selected' : ''} ${isCompact ? 'ws-card-compact' : ''} ${isDropdownOpen ? 'ws-card-dropdown-open' : ''}`}
                onClick={onClick}
            >
                <div className="ws-card-header">
                    <div className="ws-card-title-group">
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                            <h4 className="ws-card-title">{name}</h4>
                            <button
                                className="ws-action-btn info"
                                onClick={(e) => { e.stopPropagation(); setShowInfo(true); }}
                                title="View Description"
                                style={{
                                    color: '#64748B',
                                    background: 'transparent',
                                    border: 'none',
                                    padding: '0 2px',
                                    marginLeft: '2px', // Minimal gap
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center'
                                }}
                            >
                                <Info size={12} />
                            </button>
                        </div>
                        <span className="ws-card-id">{customId}</span>
                    </div>
                    <div className="ws-card-actions">
                        {isPM && (
                            <>
                                {onEdit && (
                                    <button
                                        className="ws-action-btn edit"
                                        onClick={(e) => { e.stopPropagation(); onEdit(); }}
                                        title="Edit"
                                    >
                                        <Edit size={12} />
                                    </button>
                                )}
                                {onDelete && (
                                    <button
                                        className="ws-action-btn delete"
                                        onClick={(e) => { e.stopPropagation(); onDelete(); }}
                                        title="Delete"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                </div>

                <div className="ws-card-body">
                    {description ? (
                        <p className="ws-card-desc" title={description}>
                            {description.length > 30 ? description.slice(0, 30) + '...' : description}
                        </p>
                    ) : null}
                </div>

                <div className="ws-card-divider" />

                <div className="ws-card-footer">
                    <div className="ws-avatar-group">
                        {displayUsers.map((user, idx) => (
                            <div
                                key={user.id}
                                className={`ws-avatar ${isCompact ? 'compact' : ''}`}
                                style={{ zIndex: displayUsers.length - idx }}
                                title={user.name}
                            >
                                {user.initials}
                            </div>
                        ))}

                        {assignedUsers.length === 0 && !onAddAssignee && (
                            <span className="ws-no-assignees">No users assigned</span>
                        )}
                    </div>
                    {isPM && (onAddAssignee || onAssignUser) && (
                        <div className="ws-footer-actions-container" ref={dropdownRef}>
                            <button
                                className={`ws-add-assignee-btn ${isDropdownOpen ? 'active' : ''}`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (onAssignUser) {
                                        setIsDropdownOpen(!isDropdownOpen);
                                    } else if (onAddAssignee) {
                                        onAddAssignee();
                                    }
                                }}
                                title="Add Assignee"
                            >
                                {isDropdownOpen ? <X size={14} /> : <Plus size={14} />}
                            </button>

                            {isDropdownOpen && (
                                <div className="ws-assign-dropdown" onClick={(e) => e.stopPropagation()}>
                                    <div className="ws-dropdown-header">
                                        <span>Manage Access</span>
                                    </div>
                                    <div className="ws-dropdown-list">
                                        {availableUsers.length === 0 ? (
                                            <div className="ws-dropdown-empty-state">
                                                <div className="empty-state-icon">
                                                    <UserMinus size={18} />
                                                </div>
                                                <span className="empty-state-text">No users available</span>
                                                <span className="empty-state-subtext">All members assigned or none found</span>
                                            </div>
                                        ) : (
                                            availableUsers.map(user => {
                                                const isAssigned = assignedUsers.some(u => String(u.id) === String(user.id));
                                                return (
                                                    <div
                                                        key={user.id}
                                                        className={`ws-dropdown-item ${isAssigned ? 'assigned' : ''}`}
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            onAssignUser?.(user.id);
                                                            // setIsDropdownOpen(false); // Removed to keep open for multiple
                                                        }}
                                                    >
                                                        <div className="ws-item-avatar">{user.initials}</div>
                                                        <span className="ws-item-name">{user.name}</span>
                                                        {isAssigned ? (
                                                            <UserMinus size={14} className="ws-item-icon remove" />
                                                        ) : (
                                                            <UserPlus size={14} className="ws-item-icon add" />
                                                        )}
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <DescriptionModal
                isOpen={showInfo}
                onClose={() => setShowInfo(false)}
                title={name}
                customId={customId}
                description={description || ''}
            />
        </>
    );
};
