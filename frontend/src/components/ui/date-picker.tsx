import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { format, parse, isValid } from 'date-fns';
import { Calendar } from './calendar';
import { cn } from '../../lib/utils';
import './date-picker.css';

interface DatePickerProps {
  value?: string; // YYYY-MM-DD format from parent
  onChange: (date: string) => void;
  min?: string; // YYYY-MM-DD format
  max?: string; // YYYY-MM-DD format
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  disabledDates?: (date: Date) => boolean;
  allowManualEntry?: boolean;
  isEmployeeVariant?: boolean; // Toggle specific behavior for Add Employee
  displayFormat?: string;
}

export const DatePicker: React.FC<DatePickerProps> = ({
  value,
  onChange,
  min,
  max,
  disabled = false,
  className,
  placeholder,
  disabledDates,
  allowManualEntry = false,
  isEmployeeVariant = false,
  displayFormat
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    value ? new Date(value + 'T00:00:00') : undefined
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverCoords, setPopoverCoords] = useState({ top: 0, left: 0, width: 0 });
  const [position, setPosition] = useState<'bottom' | 'top'>('bottom');

  const effectivePlaceholder = placeholder || (isEmployeeVariant ? 'dd - mm - yyyy' : 'Select date');

  const updatePopoverPosition = useCallback(() => {
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const scrollY = window.pageYOffset || document.documentElement.scrollTop;
    const scrollX = window.pageXOffset || document.documentElement.scrollLeft;

    const popoverHeight = 320;
    const popoverMinWidth = 280; // Matches CSS min-width
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const windowWidth = window.innerWidth;

    // Vertical positioning
    let newPosition: 'top' | 'bottom' = 'bottom';
    let topValue = 0;

    if (spaceBelow < popoverHeight && spaceAbove > spaceBelow) {
      newPosition = 'top';
      topValue = rect.top + scrollY - 8;
    } else {
      newPosition = 'bottom';
      topValue = rect.bottom + scrollY + 4;
    }

    // Horizontal positioning (Auto-detect overflow)
    const effectiveWidth = Math.max(rect.width, popoverMinWidth);
    let leftValue = rect.left + scrollX;

    // Check if extending right would overflow window
    if (rect.left + effectiveWidth > windowWidth) {
      // Align to right edge of trigger instead
      leftValue = (rect.right + scrollX) - effectiveWidth;

      // Ensure we don't go off-screen to the left
      if (leftValue < 10) leftValue = 10;
    }

    setPosition(newPosition);
    setPopoverCoords({
      top: topValue,
      left: leftValue,
      width: rect.width
    });
  }, []);

  // Body Scroll Locking
  useEffect(() => {
    if (isOpen) {
      const originalStyle = window.getComputedStyle(document.body).overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalStyle;
      };
    }
  }, [isOpen]);

  useEffect(() => {
    if (value) {
      const date = new Date(value + 'T00:00:00');
      setSelectedDate(date);
      const defaultFormat = isEmployeeVariant ? 'dd - MM - yyyy' : 'yyyy-MM-dd';
      // Update input value formatting to use displayFormat if provided, otherwise fallback to existing logic.
      setInputValue(format(date, displayFormat || defaultFormat));
    } else {
      setSelectedDate(undefined);
      setInputValue('');
    }
  }, [value, isEmployeeVariant, displayFormat]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current && !containerRef.current.contains(event.target as Node) &&
        popoverRef.current && !popoverRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      updatePopoverPosition();
      const timeoutId = setTimeout(updatePopoverPosition, 50);

      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('scroll', updatePopoverPosition, true);
      window.addEventListener('resize', updatePopoverPosition);

      return () => {
        clearTimeout(timeoutId);
        document.removeEventListener('mousedown', handleClickOutside);
        window.removeEventListener('scroll', updatePopoverPosition, true);
        window.removeEventListener('resize', updatePopoverPosition);
      };
    }
  }, [isOpen, updatePopoverPosition]);

  const minDate = min ? new Date(min + 'T00:00:00') : undefined;
  const maxDate = max ? new Date(max + 'T00:00:00') : undefined;

  const isDateDisabled = (date: Date) => {
    if (disabledDates && disabledDates(date)) return true;
    if (minDate && date < minDate) return true;
    if (maxDate && date > maxDate) return true;
    return false;
  };

  const handleSelect = (date: Date | undefined) => {
    if (date) {
      const dateStrYMD = format(date, 'yyyy-MM-dd');
      const defaultFormat = isEmployeeVariant ? 'dd - MM - yyyy' : 'yyyy-MM-dd';
      const dateStrDisplay = format(date, displayFormat || defaultFormat);
      setSelectedDate(date);
      setInputValue(dateStrDisplay);
      onChange(dateStrYMD);
      setIsOpen(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!allowManualEntry) return;

    let val = e.target.value;

    if (isEmployeeVariant) {
      const isDeleting = (e.nativeEvent as any).inputType === 'deleteContentBackward';
      if (!isDeleting) {
        const digits = val.replace(/\D/g, '');
        if (digits.length > 0) {
          if (digits.length <= 2) {
            val = digits;
          } else if (digits.length <= 4) {
            val = `${digits.slice(0, 2)} - ${digits.slice(2)}`;
          } else {
            val = `${digits.slice(0, 2)} - ${digits.slice(2, 4)} - ${digits.slice(4, 8)}`;
          }
        }
      }
    }

    setInputValue(val);

    let parsedDate: Date | undefined;
    if (isEmployeeVariant) {
      const cleanVal = val.replace(/\s/g, '');
      if (/^\d{2}-\d{2}-\d{4}$/.test(cleanVal)) {
        const d = parse(cleanVal, 'dd-MM-yyyy', new Date());
        if (isValid(d)) parsedDate = d;
      } else if (/^\d{8}$/.test(cleanVal)) {
        const d = parse(cleanVal, 'ddMMyyyy', new Date());
        if (isValid(d)) parsedDate = d;
      }
    } else {
      if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
        const d = new Date(val + 'T00:00:00');
        if (isValid(d)) parsedDate = d;
      }
    }

    if (val === '') {
      setSelectedDate(undefined);
      onChange('');
      return;
    }

    if (parsedDate && !isDateDisabled(parsedDate)) {
      setSelectedDate(parsedDate);
      onChange(format(parsedDate, 'yyyy-MM-dd'));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (isEmployeeVariant) {
        const cleanVal = inputValue.replace(/\s/g, '');
        let finalDate: Date | undefined;
        if (/^\d{2}-\d{2}-\d{4}$/.test(cleanVal)) {
          finalDate = parse(cleanVal, 'dd-MM-yyyy', new Date());
        } else if (/^\d{8}$/.test(cleanVal)) {
          finalDate = parse(cleanVal, 'ddMMyyyy', new Date());
        }
        if (finalDate && isValid(finalDate) && !isDateDisabled(finalDate)) {
          const dateStr = format(finalDate, 'yyyy-MM-dd');
          setSelectedDate(finalDate);
          setInputValue(format(finalDate, 'dd - MM - yyyy'));
          onChange(dateStr);
          setIsOpen(false);
        }
      } else if (selectedDate) {
        setIsOpen(false);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const getDefaultMonth = () => {
    if (selectedDate) return selectedDate;
    if (minDate) return minDate;
    if (maxDate && new Date() > maxDate) return maxDate;
    return new Date();
  };

  const toggleOpen = (e: React.MouseEvent) => {
    if (disabled) return;

    // If manual entry is allowed and user clicks the input, only open, don't toggle
    if (allowManualEntry && isOpen && (e.target as HTMLElement).tagName === 'INPUT') {
      return;
    }
    setIsOpen(!isOpen);
  };

  return (
    <div ref={containerRef} className={cn('date-picker-container', className)}>
      <div
        className={cn(
          'date-picker-input',
          disabled && 'date-picker-input-disabled',
          isOpen && 'date-picker-input-open'
        )}
        onClick={toggleOpen}
        style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}
      >
        <input
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={effectivePlaceholder}
          disabled={disabled}
          readOnly={!allowManualEntry}
          className="date-picker-input-field"
          style={{ pointerEvents: allowManualEntry ? 'auto' : 'none' }}
        />
        {isEmployeeVariant && (
          <div className="date-picker-icon-container">
            <CalendarIcon />
          </div>
        )}
      </div>
      {isOpen && !disabled && createPortal(
        <div
          ref={popoverRef}
          className={cn('date-picker-popover-portal', position === 'top' && 'date-picker-popover-top')}
          style={{
            top: `${popoverCoords.top}px`,
            left: `${popoverCoords.left}px`,
            width: `${popoverCoords.width}px`,
            position: 'absolute',
            zIndex: 9999,
            pointerEvents: 'auto'
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={handleSelect}
            disabled={isDateDisabled}
            defaultMonth={getDefaultMonth()}
            className="date-picker-calendar"
          />
        </div>,
        document.body
      )}
    </div>
  );
};

const CalendarIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);
