import React from 'react';
import { LucideIcon, ClipboardX } from 'lucide-react';
import './EmptyState.css';

interface EmptyStateProps {
    title: string;
    description: string;
    icon?: LucideIcon;
    size?: 'default' | 'small';
}

const EmptyState: React.FC<EmptyStateProps> = ({
    title,
    description,
    icon: Icon = ClipboardX, // Default icon
    size = 'default'
}) => {
    return (
        <div className={`empty-state-container ${size === 'small' ? 'empty-state-small' : ''}`}>
            <div className="empty-state-icon-wrapper">
                <Icon size={size === 'small' ? 24 : 32} strokeWidth={1.5} />
            </div>
            <h3 className="empty-state-title">{title}</h3>
            <p className="empty-state-description">{description}</p>
        </div>
    );
};

export default EmptyState;
