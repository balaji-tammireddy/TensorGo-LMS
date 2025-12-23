import React from 'react';
import { FaExclamationTriangle, FaTimes } from 'react-icons/fa';
import './ConfirmationDialog.css';

interface ConfirmationDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  type?: 'danger' | 'warning' | 'info';
}

const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  type = 'danger'
}) => {
  if (!isOpen) return null;

  return (
    <div className="confirmation-dialog-overlay" onClick={onCancel}>
      <div className="confirmation-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="confirmation-dialog-header">
          <div className="confirmation-dialog-icon-wrapper">
            <FaExclamationTriangle className={`confirmation-dialog-icon icon-${type}`} />
          </div>
          <h3 className="confirmation-dialog-title">{title}</h3>
          <button className="confirmation-dialog-close" onClick={onCancel}>
            <FaTimes />
          </button>
        </div>
        <div className="confirmation-dialog-body">
          <p className="confirmation-dialog-message">{message}</p>
        </div>
        <div className="confirmation-dialog-footer">
          <button
            className="confirmation-dialog-button confirmation-dialog-button-cancel"
            onClick={onCancel}
          >
            {cancelText}
          </button>
          <button
            className={`confirmation-dialog-button confirmation-dialog-button-confirm confirm-${type}`}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationDialog;

