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
  onAdd: (leaveType: 'casual' | 'sick' | 'lop', count: number) => void;
  employeeId: number;
  employeeName: string;
  isLoading?: boolean;
}

const AddLeavesModal: React.FC<AddLeavesModalProps> = ({
  isOpen,
  onClose,
  onAdd,
  employeeId,
  employeeName,
  isLoading = false
}) => {
  const [leaveType, setLeaveType] = useState<'casual' | 'sick' | 'lop'>('casual');
  const [count, setCount] = useState<string>('');
  const [validationError, setValidationError] = useState<string>('');
  const { showWarning } = useToast();
  const { user } = useAuth();

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
      setValidationError('');
    }
  }, [isOpen, employeeId]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const countNum = parseFloat(count);
    
    if (isNaN(countNum) || countNum <= 0) {
      setValidationError('Please enter a valid number greater than 0');
      return;
    }

    // Get current balance for the selected leave type
    const currentBalance = balances 
      ? (leaveType === 'casual' ? balances.casual : leaveType === 'sick' ? balances.sick : balances.lop)
      : 0;
    
    const newTotal = currentBalance + countNum;

    // Check if count is 3 digits or more (100+)
    if (countNum >= 100) {
      const errorMsg = 'Cannot enter 3-digit numbers.';
      setValidationError(errorMsg);
      showWarning(errorMsg);
      return;
    }

    // Check if total would exceed 99
    if (newTotal > 99) {
      const errorMsg = `Cannot add ${countNum} leaves. Current ${leaveType} balance: ${currentBalance}, Maximum limit: 99. Total would be: ${newTotal}`;
      setValidationError(errorMsg);
      showWarning(errorMsg);
      return;
    }

    setValidationError('');
    onAdd(leaveType, countNum);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Prevent 'e', 'E', '+', '-' from being entered (allow '.' for decimals)
    if (e.key === 'e' || e.key === 'E' || e.key === '+' || e.key === '-') {
      e.preventDefault();
    }
  };

  const handleCountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;
    
    // Only allow numbers and a single decimal point
    // Remove any non-numeric characters except decimal point (including 'e', 'E', '+', '-')
    value = value.replace(/[^0-9.]/g, '');
    
    // Ensure only one decimal point
    const parts = value.split('.');
    if (parts.length > 2) {
      value = parts[0] + '.' + parts.slice(1).join('');
    }
    
    // Prevent 3-digit numbers (100 and above)
    const countNum = parseFloat(value);
    if (!isNaN(countNum) && countNum >= 100) {
      setValidationError('Cannot enter 3-digit numbers.');
      return;
    }
    
    setCount(value);
    setValidationError(''); // Clear error when user types

    if (!isNaN(countNum) && countNum > 0 && balances) {
      const currentBalance = leaveType === 'casual' ? balances.casual : leaveType === 'sick' ? balances.sick : balances.lop;
      const newTotal = currentBalance + countNum;
      
      if (newTotal > 99) {
        setValidationError(`Total would exceed 99 (current: ${currentBalance} + ${countNum} = ${newTotal})`);
      }
    }
  };

  const handleLeaveTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setLeaveType(e.target.value as 'casual' | 'sick' | 'lop');
    setCount('');
    setValidationError('');
  };

  const currentBalance = balances 
    ? (leaveType === 'casual' ? balances.casual : leaveType === 'sick' ? balances.sick : balances.lop)
    : 0;
  const maxAllowed = 99 - currentBalance;

  const handleClose = () => {
    setLeaveType('casual');
    setCount('');
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="add-leaves-modal">
        <div className="modal-header">
          <h2>Add Leaves</h2>
          <button className="close-button" onClick={handleClose} disabled={isLoading}>
            <FaTimes />
          </button>
        </div>
        <div className="modal-body">
          <p className="employee-name">Employee: <strong>{employeeName}</strong></p>
          {balancesLoading ? (
            <div style={{ textAlign: 'center', padding: '20px' }}>Loading balances...</div>
          ) : (
          <form onSubmit={handleSubmit}>
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
                      height: 'auto'
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
                  <DropdownMenuItem
                    onClick={() => handleLeaveTypeChange({ target: { value: 'casual' } } as any)}
                  >
                    Casual (Current: {balances?.casual || 0})
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => handleLeaveTypeChange({ target: { value: 'sick' } } as any)}
                  >
                    Sick (Current: {balances?.sick || 0})
                  </DropdownMenuItem>
                  {user?.role === 'super_admin' && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => handleLeaveTypeChange({ target: { value: 'lop' } } as any)}
                      >
                        LOP (Current: {balances?.lop || 0})
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="form-group">
              <label htmlFor="count">Count <span className="required">*</span></label>
              <input
                id="count"
                type="number"
                min="0.5"
                  max={Math.min(99, maxAllowed > 0 ? maxAllowed : 0.5)}
                step="0.5"
                value={count}
                  onChange={handleCountChange}
                  onKeyDown={handleKeyDown}
                  disabled={isLoading || balancesLoading}
                placeholder="Enter leave count"
                required
              />
              <small className="help-text">Enter number of leaves (0.5 for half day, 1 for full day, etc.)</small>
                {validationError && (
                  <div style={{ color: '#f44336', fontSize: '12px', marginTop: '5px' }}>
                    {validationError}
                  </div>
                )}
            </div>
            <div className="modal-actions">
              <button type="button" className="cancel-button" onClick={handleClose} disabled={isLoading}>
                Cancel
              </button>
              <button 
                type="submit" 
                className="submit-button" 
                disabled={isLoading || balancesLoading || !count || parseFloat(count) <= 0 || !!validationError}
              >
                {isLoading ? 'Adding...' : 'Add Leaves'}
              </button>
            </div>
          </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default AddLeavesModal;

