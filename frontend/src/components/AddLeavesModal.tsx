import React, { useState, useEffect } from 'react';
import { FaTimes, FaExchangeAlt } from 'react-icons/fa';
import { useQuery, useMutation, useQueryClient } from 'react-query';
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

  // Debug logging
  useEffect(() => {
    if (isOpen && balances) {
      console.log('AddLeavesModal - Balances:', balances);
      console.log('AddLeavesModal - User role:', user?.role);
      console.log('AddLeavesModal - LOP balance:', balances.lop);
      console.log('AddLeavesModal - Should show conversion:', balances && balances.lop > 0 && (user?.role === 'hr' || user?.role === 'super_admin'));
    }
  }, [isOpen, balances, user?.role]);

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

  const handleCountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    
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
    <div className="modal-overlay" onClick={handleClose}>
      <div className="add-leaves-modal" onClick={(e) => e.stopPropagation()}>
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
          <>
          {/* LOP to Casual Conversion Section - Always available for HR/Super Admin */}
          {(user?.role === 'hr' || user?.role === 'super_admin') && (
            <div style={{ 
              marginBottom: '20px', 
              padding: '15px', 
              backgroundColor: '#e3f2fd', 
              borderRadius: '8px',
              border: '1px solid #90caf9'
            }}>
              <h3 style={{ margin: '0 0 10px 0', fontSize: '16px', color: '#1976d2' }}>
                Convert LOP to Casual
              </h3>
              <p style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#666' }}>
                Current LOP Balance: <strong>{balances?.lop || 0}</strong> days
                {balances && balances.lop < 0 && (
                  <span style={{ color: '#f44336', marginLeft: '10px', fontSize: '12px' }}>
                    (Negative balance)
                  </span>
                )}
                {(!balances || balances.lop <= 0) && (
                  <span style={{ color: '#ff9800', marginLeft: '10px', fontSize: '12px' }}>
                    (Conversion allowed - LOP balance may go negative)
                  </span>
                )}
              </p>
              <ConvertLopToCasualSection 
                employeeId={employeeId}
                employeeName={employeeName}
                currentLopBalance={balances?.lop || 0}
                currentCasualBalance={balances?.casual || 0}
                onClose={onClose}
              />
            </div>
          )}
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="leaveType">Leave Type <span className="required">*</span></label>
              <select
                id="leaveType"
                value={leaveType}
                  onChange={handleLeaveTypeChange}
                  disabled={isLoading || balancesLoading}
                required
              >
                  <option value="casual">Casual (Current: {balances?.casual || 0})</option>
                  <option value="sick">Sick (Current: {balances?.sick || 0})</option>
                  {user?.role === 'super_admin' && (
                    <option value="lop">LOP (Current: {balances?.lop || 0})</option>
                  )}
              </select>
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
          </>
          )}
        </div>
      </div>
    </div>
  );
};

// Separate component for LOP to Casual conversion
interface ConvertLopToCasualSectionProps {
  employeeId: number;
  employeeName: string;
  currentLopBalance: number;
  currentCasualBalance: number;
  onClose: () => void;
}

const ConvertLopToCasualSection: React.FC<ConvertLopToCasualSectionProps> = ({
  employeeId,
  employeeName,
  currentLopBalance,
  currentCasualBalance,
  onClose
}) => {
  const [convertCount, setConvertCount] = useState<string>('');
  const [validationError, setValidationError] = useState<string>('');
  const { showSuccess, showError, showWarning } = useToast();
  const queryClient = useQueryClient();

  const convertMutation = useMutation(
    (count: number) => employeeService.convertLopToCasual(employeeId, count),
    {
      onSuccess: (data) => {
        queryClient.invalidateQueries(['employeeLeaveBalances', employeeId]);
        queryClient.invalidateQueries('employees');
        showSuccess(data.message || `${convertCount} LOP leave(s) converted to casual successfully!`);
        setConvertCount('');
        setValidationError('');
        // Optionally close the modal after successful conversion
        // onClose();
      },
      onError: (error: any) => {
        showError(error.response?.data?.error?.message || 'Failed to convert LOP to casual');
      }
    }
  );

  const handleConvert = () => {
    const countNum = parseFloat(convertCount);
    
    if (isNaN(countNum) || countNum <= 0) {
      setValidationError('Please enter a valid number greater than 0');
      return;
    }

    if (countNum > currentLopBalance) {
      setValidationError(`Cannot convert ${countNum} LOP leaves. Available LOP balance: ${currentLopBalance}`);
      return;
    }

    const newCasualTotal = currentCasualBalance + countNum;
    if (newCasualTotal > 99) {
      setValidationError(`Cannot convert ${countNum} LOP leaves. Current casual balance: ${currentCasualBalance}, Maximum limit: 99. Total would be: ${newCasualTotal}`);
      return;
    }

    setValidationError('');
    convertMutation.mutate(countNum);
  };

  const handleConvertCountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const countNum = parseFloat(value);
    
    setConvertCount(value);
    setValidationError('');

    if (!isNaN(countNum) && countNum > 0) {
      // Allow conversion even if LOP balance is insufficient (will go negative)
      // Only check casual balance limit
      const newCasualTotal = currentCasualBalance + countNum;
      if (newCasualTotal > 99) {
        setValidationError(`Total casual would exceed 99 (current: ${currentCasualBalance} + ${countNum} = ${newCasualTotal})`);
      }
      // Warn if LOP will go negative, but don't block
      if (countNum > currentLopBalance) {
        // Just a warning, not an error - conversion is allowed
        console.warn(`Converting ${countNum} LOP leaves will result in negative LOP balance: ${currentLopBalance - countNum}`);
      }
    }
  };

  // Allow conversion up to 99-day casual limit (no LOP balance restriction)
  const maxConvertible = 99 - currentCasualBalance;

  return (
    <div>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <label htmlFor="convertCount" style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500' }}>
            Convert Amount <span style={{ color: '#f44336' }}>*</span>
          </label>
          <input
            id="convertCount"
            type="number"
            min="0.5"
            max={maxConvertible}
            step="0.5"
            value={convertCount}
            onChange={handleConvertCountChange}
            disabled={convertMutation.isLoading}
            placeholder={`Max: ${maxConvertible}`}
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '14px'
            }}
          />
          {validationError && (
            <div style={{ color: '#f44336', fontSize: '12px', marginTop: '5px' }}>
              {validationError}
            </div>
          )}
          <small style={{ display: 'block', marginTop: '5px', fontSize: '12px', color: '#666' }}>
            Maximum: {maxConvertible} days (Limited by 99-day casual limit only)
            {currentLopBalance <= 0 && (
              <span style={{ display: 'block', marginTop: '3px', color: '#ff9800' }}>
                Note: LOP balance will go negative if converted amount exceeds current balance
              </span>
            )}
          </small>
        </div>
        <button
          onClick={handleConvert}
          disabled={convertMutation.isLoading || !convertCount || parseFloat(convertCount) <= 0 || !!validationError}
          style={{
            padding: '8px 16px',
            backgroundColor: '#1976d2',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: convertMutation.isLoading || !convertCount || parseFloat(convertCount) <= 0 || !!validationError ? 'not-allowed' : 'pointer',
            opacity: convertMutation.isLoading || !convertCount || parseFloat(convertCount) <= 0 || !!validationError ? 0.6 : 1,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '14px',
            fontWeight: '500'
          }}
        >
          <FaExchangeAlt />
          {convertMutation.isLoading ? 'Converting...' : 'Convert'}
        </button>
      </div>
    </div>
  );
};

export default AddLeavesModal;

