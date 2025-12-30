import React, { useState, memo, useEffect } from 'react';
import { FaExclamationTriangle, FaTimes } from 'react-icons/fa';
import './RejectCommentDialog.css';

interface RejectCommentDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: (comment: string) => void;
  onCancel: () => void;
  type?: 'danger' | 'warning' | 'info';
  isLoading?: boolean;
}

const RejectCommentDialog: React.FC<RejectCommentDialogProps> = memo(({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  type = 'danger',
  isLoading = false
}) => {
  const [comment, setComment] = useState('');

  // Reset comment when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setComment('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (comment.trim()) {
      onConfirm(comment.trim());
      setComment('');
    }
  };

  return (
    <div className="reject-comment-dialog-overlay" onClick={onCancel}>
      <div className="reject-comment-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="reject-comment-dialog-header">
          <div className="reject-comment-dialog-icon-wrapper">
            <FaExclamationTriangle className={`reject-comment-dialog-icon icon-${type}`} />
          </div>
          <h3 className="reject-comment-dialog-title">{title}</h3>
          <button className="reject-comment-dialog-close" onClick={onCancel}>
            <FaTimes />
          </button>
        </div>
        <div className="reject-comment-dialog-body">
          <p className="reject-comment-dialog-message">{message}</p>
          <textarea
            className="reject-comment-textarea"
            placeholder="Enter rejection reason..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={4}
            autoFocus
            disabled={isLoading}
          />
        </div>
        <div className="reject-comment-dialog-footer">
          <button
            className="reject-comment-dialog-button reject-comment-dialog-button-cancel"
            onClick={onCancel}
            disabled={isLoading}
          >
            {cancelText}
          </button>
          <button
            className={`reject-comment-dialog-button reject-comment-dialog-button-confirm confirm-${type}`}
            onClick={handleConfirm}
            disabled={!comment.trim() || isLoading}
          >
            {isLoading ? (
              <>
                <span className="loading-spinner"></span>
                {confirmText}...
              </>
            ) : (
              confirmText
            )}
          </button>
        </div>
      </div>
    </div>
  );
});

RejectCommentDialog.displayName = 'RejectCommentDialog';

export default RejectCommentDialog;

