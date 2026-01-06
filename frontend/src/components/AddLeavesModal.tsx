import React, { useState, useEffect } from 'react';
import { FaTimes } from 'react-icons/fa';
import { useQuery } from 'react-query';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { Button } from './ui/button';
import { ChevronDown } from 'lucide-react';
import * as employeeService from '../services/employeeService';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import './AddLeavesModal.css';

interface AddLeavesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (leaveType: 'casual' | 'sick' | 'lop', count: number, comment?: string) => void;
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
  const [leaveType, setLeaveType] = useState<'casual' | 'sick' | 'lop'>('casual');
  const [count, setCount] = useState<string>('');
  const [comment, setComment] = useState<string>('');
  const [validationError, setValidationError] = useState<string>('');
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
      setLeaveType('casual');
      setCount('');
      setComment('');
      setValidationError('');
    } else if (employeeStatus === 'on_notice' && leaveType === 'casual') {
      setLeaveType('lop');
    }
  }, [isOpen, employeeId, employeeStatus, leaveType]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const countNum = parseFloat(count);

    if (isNaN(countNum) || countNum <= 0) {
      setValidationError('Enter a number greater than 0');
      return;
    }

    // Check if it's an integer or .5
    if (countNum % 1 !== 0 && countNum % 1 !== 0.5) {
      setValidationError('Use whole numbers or .5');
      return;
    }

    // Get current balance for the selected leave type
    const currentBalance = balances
      ? (leaveType === 'casual' ? balances.casual : leaveType === 'sick' ? balances.sick : balances.lop)
      : 0;

    const newTotal = currentBalance + countNum;

    // Check if count is 3 digits or more (100+)
    if (countNum >= 100) {
      const errorMsg = 'Max 2 digits allowed.';
      setValidationError(errorMsg);
      showWarning(errorMsg);
      return;
    }

    // Check if total would exceed 99
    if (newTotal > 99) {
      const errorMsg = `Limit exceeded. Max: 99.`;
      setValidationError(errorMsg);
      showWarning(errorMsg);
      return;
    }

    setValidationError('');
    onAdd(leaveType, countNum, comment);
  };

  const handleCountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;

    // Allow digits and at most one decimal point
    value = value.replace(/[^0-9.]/g, '');
    const parts = value.split('.');
    if (parts.length > 2) {
      value = parts[0] + '.' + parts.slice(1).join('');
    }

    // If there is a decimal part, it must eventually be '5'
    if (parts.length === 2 && parts[1].length > 1) {
      value = parts[0] + '.' + parts[1].slice(0, 1);
    }

    const countNum = parseFloat(value);

    // Prevent 3-digit numbers (100 and above)
    if (!isNaN(countNum) && countNum >= 100) {
      setValidationError('Max 2 digits allowed.');
      return;
    }

    setCount(value);
    setValidationError(''); // Clear error when user types

    if (!isNaN(countNum) && countNum > 0 && balances) {
      const currentBalance = leaveType === 'casual' ? balances.casual : leaveType === 'sick' ? balances.sick : balances.lop;
      const newTotal = currentBalance + countNum;

      if (newTotal > 99) {
        setValidationError(`Total exceeds 99.`);
      }
    }
  };

  const handleLeaveTypeChange = (value: 'casual' | 'sick' | 'lop') => {
    setLeaveType(value);
    setCount('');
    setValidationError('');
  };

  const handleClose = () => {
    setLeaveType('casual');
    setCount('');
    setComment('');
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="add-leaves-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add Leaves</h2>
          <button className="close-button" onClick={handleClose} disabled={isLoading}>
            <FaTimes />
          </button>
        </div>
        <div className="modal-body">
          <p className="employee-name">
            Employee: <strong>{employeeName}</strong>
            {employeeStatus === 'on_notice' && (
              <span className="status-badge status-on-notice">On Notice</span>
            )}
          </p>
          {balancesLoading ? (
            <div style={{ textAlign: 'center', padding: '20px' }}>Loading balances...</div>
          ) : (
            <form id="add-leaves-form" onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="leaveType">Leave Type <span className="required">*</span></label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      className="leave-type-dropdown-trigger"
                      disabled={isLoading || balancesLoading}
                      style={{
                        width: '100%',
                        justifyContent: 'space-between',
                        padding: '6px 8px',
                        fontSize: '12px',
                        fontFamily: 'Poppins, sans-serif',
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                        backgroundColor: 'transparent',
                        color: '#1f2a3d',
                        height: '42px'
                      }}
                    >
                      <span>
                        {leaveType === 'casual' ? `Casual (Current: ${balances?.casual || 0})` :
                          leaveType === 'sick' ? `Sick (Current: ${balances?.sick || 0})` :
                            `LOP (Current: ${balances?.lop || 0})`}
                      </span>
                      <ChevronDown style={{ width: '14px', height: '14px', marginLeft: '8px' }} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="leave-type-dropdown-content">
                    {employeeStatus !== 'on_notice' ? (
                      <>
                        <DropdownMenuItem
                          onClick={() => handleLeaveTypeChange('casual')}
                        >
                          Casual (Current: {balances?.casual || 0})
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => handleLeaveTypeChange('sick')}
                        >
                          Sick (Current: {balances?.sick || 0})
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                      </>
                    ) : (
                      <>
                        <DropdownMenuItem
                          onClick={() => handleLeaveTypeChange('sick')}
                        >
                          Sick (Current: {balances?.sick || 0})
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                      </>
                    )}
                    <DropdownMenuItem
                      onClick={() => handleLeaveTypeChange('lop')}
                    >
                      LOP (Current: {balances?.lop || 0})
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="form-group">
                <label htmlFor="count">Count <span className="required">*</span></label>
                <input
                  id="count"
                  type="text"
                  inputMode="decimal"
                  value={count}
                  onChange={handleCountChange}
                  onKeyDown={(e) => {
                    // Allow digits, decimal point, backspace, delete, tab, and arrow keys
                    const allowedKeys = ['Backspace', 'Delete', 'Tab', 'ArrowLeft', 'ArrowRight', 'Home', 'End', '.'];
                    if (!/[0-9]/.test(e.key) && !allowedKeys.includes(e.key)) {
                      e.preventDefault();
                    }
                  }}
                  disabled={isLoading || balancesLoading}
                  required
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    fontSize: '12px',
                    fontFamily: 'Poppins, sans-serif',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    backgroundColor: 'transparent',
                    color: '#1f2a3d',
                    height: '42px',
                    boxSizing: 'border-box'
                  }}
                />
                <small className="help-text">Enter number of leaves (e.g. 0.5, 1, 2, etc.)</small>
                {validationError && (
                  <div style={{ color: '#f44336', fontSize: '12px', marginTop: '5px' }}>
                    {validationError}
                  </div>
                )}
              </div>
              <div className="form-group">
                <label htmlFor="comment">Comment</label>
                <textarea
                  id="comment"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={3}
                  disabled={isLoading || balancesLoading}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: '14px',
                    fontFamily: 'Poppins, sans-serif',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    resize: 'none',
                    marginTop: '5px',
                    height: '80px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
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
            disabled={isLoading || balancesLoading || !count || parseFloat(count) <= 0 || !!validationError}
          >
            {isLoading ? 'Adding...' : 'Add Leaves'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddLeavesModal;

