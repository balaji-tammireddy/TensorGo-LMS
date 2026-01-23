
import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import './DeleteConfirmModal.css';

interface DeleteConfirmModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    isLoading?: boolean;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    isLoading = false
}) => {
    if (!isOpen) return null;

    return (
        <div className="dcm-overlay" onClick={onClose}>
            <div className="dcm-content" onClick={e => e.stopPropagation()}>
                <button className="dcm-close-btn" onClick={onClose}>
                    <X size={20} />
                </button>

                <div className="dcm-icon-wrapper">
                    <div className="dcm-icon">
                        <AlertTriangle size={32} />
                    </div>
                </div>

                <div className="dcm-body">
                    <h3 className="dcm-title">{title}</h3>
                    <p className="dcm-message">{message}</p>
                </div>

                <div className="dcm-footer">
                    <button
                        className="dcm-cancel-btn"
                        onClick={onClose}
                        disabled={isLoading}
                    >
                        Cancel
                    </button>
                    <button
                        className="dcm-delete-btn"
                        onClick={onConfirm}
                        disabled={isLoading}
                    >
                        {isLoading ? 'Deleting...' : 'Delete'}
                    </button>
                </div>
            </div>
        </div>
    );
};
