import React, { useState, useEffect, useRef } from 'react';
import { FaTimes, FaCloudUploadAlt } from 'react-icons/fa';
import { useQuery } from 'react-query';
import * as employeeService from '../services/employeeService';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import './AddLeavesModal.css';

interface AddLeavesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (formData: FormData) => void;
  employeeId: number;
  employeeName: string;
  employeeStatus?: string;
  isLoading?: boolean;
}

const AddLeavesModal: React.FC<AddLeavesModalProps> = ({
  isOpen,
  onClose,
  onAdd,
  employeeId,
  employeeName,
  employeeStatus,
  isLoading = false
}) => {
  const [count, setCount] = useState<string>('');
  /* comment removed */

  const [file, setFile] = useState<File | null>(null);
  const [validationError, setValidationError] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showWarning } = useToast();
  useAuth();

  // Fetch current leave balances
  const { data: balances, isLoading: balancesLoading } = useQuery(
    ['employeeLeaveBalances', employeeId],
    () => employeeService.getEmployeeLeaveBalances(employeeId),
    {
      enabled: isOpen && !!employeeId,
      retry: false
    }
  );

  // Reset form when modal closes or employee changes
  useEffect(() => {
    if (!isOpen) {
      setCount('');
      /* comment removed */

      setFile(null);
      setValidationError('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [isOpen, employeeId]);

  // Prevent body scrolling when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      // Validate file type (image or pdf)
      const validTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
      if (!validTypes.includes(selectedFile.type)) {
        showWarning('Only images (JPEG, PNG) and PDF files are allowed.');
        e.target.value = '';
        return;
      }
      setFile(selectedFile);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const countNum = parseFloat(count);

    if (isNaN(countNum) || countNum <= 0) {
      setValidationError('Enter a number greater than 0');
      return;
    }

    if (countNum % 1 !== 0 && countNum % 1 !== 0.5) {
      setValidationError('Use whole numbers or .5');
      return;
    }

    // Always casual
    const currentBalance = balances ? balances.casual : 0;
    const newTotal = currentBalance + countNum;

    if (countNum > 12) {
      showWarning('Maximum 12 leaves can be added at once.');
      return;
    }

    if (newTotal > 99) {
      const errorMsg = `Limit exceeded. Max: 99.`;
      setValidationError(errorMsg);
      showWarning(errorMsg);
      return;
    }

    if (!file) {
      setValidationError('Please attach a document.');
      showWarning('Document attachment is mandatory.');
      return;
    }

    setValidationError('');

    const formData = new FormData();
    formData.append('leaveType', 'casual');
    formData.append('count', countNum.toString());
    /* comment removed */

    formData.append('document', file);

    // We also need employeeId, passing it might be handled by caller or here. 
    // Usually standard to pass it in formData if the API expects it in body not path.
    // Assuming API is updated to take it from body or path. Service usually takes ID + payload.
    // Let's stick to onAdd(formData) and let the parent handle the ID passed to service.

    onAdd(formData);
  };

  const handleCountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;
    value = value.replace(/[^0-9.]/g, '');
    const parts = value.split('.');
    if (parts.length > 2) {
      value = parts[0] + '.' + parts.slice(1).join('');
    }
    if (parts.length === 2 && parts[1].length > 1) {
      value = parts[0] + '.' + parts[1].slice(0, 1);
    }

    const countNum = parseFloat(value);
    if (!isNaN(countNum) && countNum > 12) {
      showWarning('Maximum 12 leaves can be added at once.');
      return;
    }
    setCount(value);
    setValidationError('');

    if (!isNaN(countNum) && countNum > 0 && balances) {
      if ((balances.casual + countNum) > 99) {
        setValidationError(`Total exceeds 99.`);
      }
    }
  };

  const handleClose = () => {
    setCount('');
    /* comment removed */

    setFile(null);
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="add-leaves-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add Casual Leaves</h2>
          <button className="close-button" onClick={handleClose} disabled={isLoading}>
            <FaTimes />
          </button>
        </div>
        <div className="modal-body">
          <p className="employee-name">
            Employee: <strong>{employeeName}</strong>
            {employeeStatus === 'on_notice' && (
              <span className="status-badge status-on-notice compact">On Notice</span>
            )}
          </p>
          {balancesLoading ? (
            <div style={{ textAlign: 'center', padding: '20px' }}>Loading balances...</div>
          ) : (
            <form id="add-leaves-form" onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Leave Type</label>
                <div className="static-leave-type">
                  Casual Leave (Current Balance: <strong>{balances?.casual || 0}</strong>)
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="count">Count <span className="required">*</span></label>
                <input
                  id="count"
                  type="text"
                  inputMode="decimal"
                  value={count}
                  onChange={handleCountChange}
                  disabled={isLoading || balancesLoading}
                  required
                  style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                />
                <small className="help-text">Enter number of leaves (e.g. 0.5, 1, 2, etc.)</small>
              </div>

              <div className="form-group">
                <label htmlFor="document">Attach Document <span className="required">*</span></label>
                <div className="file-upload-container">
                  <input
                    type="file"
                    id="document"
                    ref={fileInputRef}
                    accept="image/*,application/pdf"
                    onChange={handleFileChange}
                    className="file-input"
                    required
                  />
                  <label htmlFor="document" className="file-upload-label">
                    <FaCloudUploadAlt className="upload-icon" />
                    <span className="upload-text">{file ? file.name : "Choose PDF or Image"}</span>
                  </label>
                </div>
                {validationError && !file && <div className="error-text">Document is required</div>}
              </div>

              {/* Comment field removed */}

              {validationError && <div className="error-summary" style={{ color: 'red', marginTop: '10px' }}>{validationError}</div>}
            </form>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" className="cancel-button" onClick={handleClose} disabled={isLoading}>
            Cancel
          </button>
          <button
            type="submit"
            form="add-leaves-form"
            className="submit-button"
            disabled={isLoading || balancesLoading || !count || parseFloat(count) <= 0 || !file}
          >
            {isLoading ? 'Adding...' : 'Add Leaves'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddLeavesModal;

