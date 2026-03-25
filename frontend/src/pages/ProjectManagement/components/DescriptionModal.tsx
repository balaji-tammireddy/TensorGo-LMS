import React from 'react';
import { Info, X } from 'lucide-react';
import './DescriptionModal.css';

interface DescriptionModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    customId?: string;
    description: string;
}

export const DescriptionModal: React.FC<DescriptionModalProps> = ({
    isOpen,
    onClose,
    title,
    customId,
    description
}) => {
    if (!isOpen) return null;

    return (
        <div className="dm-overlay" onClick={onClose}>
            <div className="dm-content" onClick={e => e.stopPropagation()}>
                <button className="dm-close-btn" onClick={onClose} aria-label="Close">
                    <X size={20} />
                </button>

                <div className="dm-header">
                    <div className="dm-icon-wrapper">
                        <Info size={24} strokeWidth={2.5} />
                    </div>
                    <div className="dm-title-group">
                        <h3 className="dm-title">{title}</h3>
                        {customId && <span className="dm-id">{customId}</span>}
                    </div>
                </div>

                <div className="dm-scroll-area">
                    <p className="dm-description">
                        {description || 'No description provided.'}
                    </p>
                </div>
            </div>
        </div>
    );
};
