import React, { useState, useRef, useEffect } from 'react';
import { format } from 'date-fns';
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
  placeholder = 'DD-MM-YYYY',
  disabledDates,
  allowManualEntry = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    value ? new Date(value + 'T00:00:00') : undefined
  );

  const [inputValue, setInputValue] = useState(
    value ? format(new Date(value + 'T00:00:00'), 'dd-MM-yyyy') : ''
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<'bottom' | 'top'>('bottom');

  useEffect(() => {
    if (value) {
      const date = new Date(value + 'T00:00:00');
      setSelectedDate(date);
      setInputValue(format(date, 'dd-MM-yyyy'));
    } else {
      setSelectedDate(undefined);
      setInputValue('');
    }
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

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

  const minDate = min ? new Date(min + 'T00:00:00') : undefined;
  const maxDate = max ? new Date(max + 'T00:00:00') : undefined;

  const isDateDisabled = (date: Date) => {
    if (disabledDates && disabledDates(date)) return true;
    if (minDate && date < minDate) return true;
    if (maxDate && date > maxDate) return true;
    return false;
  };

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
        onClick={() => !disabled && !isOpen && setIsOpen(true)}
      >
        <input
          type="text"
          readOnly={!allowManualEntry}
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="date-picker-input-field"
        />
      </div>
      {isOpen && !disabled && (
        <div
          ref={popoverRef}
          className={cn('date-picker-popover', position === 'top' && 'date-picker-popover-top')}
        >
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={handleSelect}
            disabled={isDateDisabled}
            defaultMonth={getDefaultMonth()}
            className="date-picker-calendar"
          />
        </div>
      )}
    </div>
  );
};
