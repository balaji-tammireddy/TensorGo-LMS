import React, { useState, useRef, useEffect } from 'react';
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
}

export const DatePicker: React.FC<DatePickerProps> = ({
  value,
  onChange,
  min,
  max,
  disabled = false,
  className,
<<<<<<< HEAD
  placeholder = 'DD-MM-YYYY',
  disabledDates,
  allowManualEntry = false
=======
  placeholder = 'dd-mm-yyyy',
  disabledDates
>>>>>>> 86ee2ab305ed9bd9fe8048f4c4c21479573c12e0
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    value ? new Date(value + 'T00:00:00') : undefined
  );

<<<<<<< HEAD
  const [inputValue, setInputValue] = useState(
    value ? format(new Date(value + 'T00:00:00'), 'dd-MM-yyyy') : ''
  );

=======
>>>>>>> 86ee2ab305ed9bd9fe8048f4c4c21479573c12e0
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverCoords, setPopoverCoords] = useState({ top: 0, left: 0, width: 0 });
  const [position, setPosition] = useState<'bottom' | 'top'>('bottom');

  useEffect(() => {
    if (value) {
      const date = new Date(value + 'T00:00:00');
      setSelectedDate(date);
<<<<<<< HEAD
      setInputValue(format(date, 'dd-MM-yyyy'));
=======
      setInputValue(format(date, 'dd - MM - yyyy'));
>>>>>>> 86ee2ab305ed9bd9fe8048f4c4c21479573c12e0
    } else {
      setSelectedDate(undefined);
      setInputValue('');
    }
  }, [value]);

  const updatePopoverPosition = () => {
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const scrollY = window.scrollY;
    const scrollX = window.scrollX;

    const popoverHeight = 310; // Approximate max height of calendar + padding
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    let newPosition: 'top' | 'bottom' = 'bottom';
    let top = 0;

    if (spaceBelow < popoverHeight && spaceAbove > spaceBelow) {
      newPosition = 'top';
      top = rect.top + scrollY - popoverHeight - 8;
    } else {
      newPosition = 'bottom';
      top = rect.bottom + scrollY + 8;
    }

    setPosition(newPosition);
    setPopoverCoords({
      top,
      left: rect.left + scrollX,
      width: rect.width
    });
  };

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
      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('scroll', updatePopoverPosition, true);
      window.addEventListener('resize', updatePopoverPosition);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', updatePopoverPosition, true);
      window.removeEventListener('resize', updatePopoverPosition);
    };
  }, [isOpen]);

<<<<<<< HEAD
  useEffect(() => {
    if (isOpen && containerRef.current) {
      const updatePosition = () => {
        if (!containerRef.current) return;
        const containerRect = containerRef.current.getBoundingClientRect();
        const popoverHeight = 300;

        let scrollableContainer: HTMLElement | null = containerRef.current;
        while (scrollableContainer) {
          const style = window.getComputedStyle(scrollableContainer);
          if (style.overflowY === 'auto' || style.overflowY === 'scroll' ||
            style.overflow === 'auto' || style.overflow === 'scroll') {
            break;
          }
          scrollableContainer = scrollableContainer.parentElement;
        }

        const containerBounds = scrollableContainer
          ? scrollableContainer.getBoundingClientRect()
          : { top: 0, bottom: window.innerHeight, left: 0, right: window.innerWidth };

        const spaceBelow = containerBounds.bottom - containerRect.bottom - 8;
        const spaceAbove = containerRect.top - containerBounds.top - 8;

        if (spaceBelow < popoverHeight && spaceAbove > spaceBelow) {
          setPosition('top');
        } else {
          setPosition('bottom');
        }
      };

      updatePosition();
      const timeoutId = setTimeout(updatePosition, 10);

      const scrollableContainer = containerRef.current.closest('[style*="overflow"], .employee-modal-body, .leave-details-modal-body');
      const scrollTarget = scrollableContainer || window;

      scrollTarget.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);

      return () => {
        clearTimeout(timeoutId);
        scrollTarget.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      };
    }
  }, [isOpen]);
=======
  const handleSelect = (date: Date | undefined) => {
    if (date) {
      const dateStrYMD = format(date, 'yyyy-MM-dd');
      const dateStrDMY = format(date, 'dd - MM - yyyy');
      setSelectedDate(date);
      setInputValue(dateStrDMY);
      onChange(dateStrYMD);
      setIsOpen(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value;

    // Auto-masking: Add " - " (space-hyphen-space) as the user types
    const isDeleting = (e.nativeEvent as any).inputType === 'deleteContentBackward';
    if (!isDeleting) {
      // Remove everything except digits
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

    setInputValue(val);

    // Attempt to parse various formats (ignoring spaces)
    const cleanVal = val.replace(/\s/g, '');
    let parsedDate: Date | undefined;

    // Check for DD-MM-YYYY
    if (/^\d{2}-\d{2}-\d{4}$/.test(cleanVal)) {
      const d = parse(cleanVal, 'dd-MM-yyyy', new Date());
      if (isValid(d)) parsedDate = d;
    }
    // Check for DDMMYYYY
    else if (/^\d{8}$/.test(cleanVal)) {
      const d = parse(cleanVal, 'ddMMyyyy', new Date());
      if (isValid(d)) parsedDate = d;
    }

    if (parsedDate) {
      if (!isDateDisabled(parsedDate)) {
        const dateStr = format(parsedDate, 'yyyy-MM-dd');
        setSelectedDate(parsedDate);
        onChange(dateStr);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      // Force an update on Enter if valid
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
      } else if (selectedDate) {
        // Just close if we already have a valid selection
        setIsOpen(false);
      }
    }
  };
>>>>>>> 86ee2ab305ed9bd9fe8048f4c4c21479573c12e0

  const minDate = min ? new Date(min + 'T00:00:00') : undefined;
  const maxDate = max ? new Date(max + 'T00:00:00') : undefined;

  const isDateDisabled = (date: Date) => {
    if (disabledDates && disabledDates(date)) return true;
    if (minDate && date < minDate) return true;
    if (maxDate && date > maxDate) return true;
    return false;
  };

<<<<<<< HEAD
  const parseAndValidateDate = (val: string) => {
    const dateRegex = /^(\d{2})-(\d{2})-(\d{4})$/;
    const match = val.match(dateRegex);

    if (match) {
      const day = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1;
      const year = parseInt(match[3], 10);
      const date = new Date(year, month, day);

      if (!isNaN(date.getTime()) &&
        date.getDate() === day &&
        date.getMonth() === month &&
        date.getFullYear() === year &&
        !isDateDisabled(date)) {
        return date;
      }
    }
    return null;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!allowManualEntry) return;

    let val = e.target.value.replace(/[^0-9]/g, '');

    // Auto-format: Add hyphens
    if (val.length > 2) {
      val = val.slice(0, 2) + '-' + val.slice(2);
    }
    if (val.length > 5) {
      val = val.slice(0, 5) + '-' + val.slice(5, 9);
    }

    setInputValue(val);

    const validDate = parseAndValidateDate(val);
    if (validDate) {
      setSelectedDate(validDate);
      onChange(format(validDate, 'yyyy-MM-dd'));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const validDate = parseAndValidateDate(inputValue);
      if (validDate) {
        setSelectedDate(validDate);
        setInputValue(format(validDate, 'dd-MM-yyyy'));
        onChange(format(validDate, 'yyyy-MM-dd'));
        setIsOpen(false);
      }
    }
  };

  const handleSelect = (date: Date | undefined) => {
    if (date) {
      setSelectedDate(date);
      setInputValue(format(date, 'dd-MM-yyyy'));
      onChange(format(date, 'yyyy-MM-dd'));
      setIsOpen(false);
    }
  };

=======
>>>>>>> 86ee2ab305ed9bd9fe8048f4c4c21479573c12e0
  const getDefaultMonth = () => {
    if (selectedDate) return selectedDate;
    if (minDate) return minDate;
    if (maxDate && new Date() > maxDate) return maxDate;
    return new Date();
  };

  return (
    <div ref={containerRef} className={cn('date-picker-container', className)}>
      <div
        className={cn(
          'date-picker-input',
          disabled && 'date-picker-input-disabled',
          isOpen && 'date-picker-input-open'
        )}
<<<<<<< HEAD
        onClick={() => !disabled && !isOpen && setIsOpen(true)}
      >
        <input
          type="text"
          readOnly={!allowManualEntry}
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
=======
      >
        <input
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onClick={() => !disabled && setIsOpen(true)}
>>>>>>> 86ee2ab305ed9bd9fe8048f4c4c21479573c12e0
          placeholder={placeholder}
          disabled={disabled}
          className="date-picker-input-field"
        />
        <div
          className="date-picker-icon-container"
          onClick={() => !disabled && setIsOpen(!isOpen)}
        >
          <CalendarIcon />
        </div>
      </div>
<<<<<<< HEAD
      {isOpen && !disabled && (
=======
      {isOpen && !disabled && createPortal(
>>>>>>> 86ee2ab305ed9bd9fe8048f4c4c21479573c12e0
        <div
          ref={popoverRef}
          className={cn('date-picker-popover-portal', position === 'top' && 'date-picker-popover-top')}
          style={{
            top: popoverCoords.top,
            left: popoverCoords.left,
            width: popoverCoords.width,
            position: 'absolute',
            zIndex: 9999
          }}
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
<<<<<<< HEAD
=======

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

>>>>>>> 86ee2ab305ed9bd9fe8048f4c4c21479573c12e0
