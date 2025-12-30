import React, { useState, useRef, useEffect } from 'react';
import { format } from 'date-fns';
import { Calendar } from './calendar';
import { cn } from '../../lib/utils';
import './date-picker.css';

interface DatePickerProps {
  value?: string; // YYYY-MM-DD format
  onChange: (date: string) => void;
  min?: string; // YYYY-MM-DD format
  max?: string; // YYYY-MM-DD format
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  disabledDates?: (date: Date) => boolean;
}

export const DatePicker: React.FC<DatePickerProps> = ({
  value,
  onChange,
  min,
  max,
  disabled = false,
  className,
  placeholder = 'Select date',
  disabledDates
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    value ? new Date(value + 'T00:00:00') : undefined
  );
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value) {
      setSelectedDate(new Date(value + 'T00:00:00'));
    } else {
      setSelectedDate(undefined);
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

  const handleSelect = (date: Date | undefined) => {
    if (date) {
      const dateStr = format(date, 'yyyy-MM-dd');
      setSelectedDate(date);
      onChange(dateStr);
      setIsOpen(false);
    }
  };

  const displayValue = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : '';

  const minDate = min ? new Date(min + 'T00:00:00') : undefined;
  const maxDate = max ? new Date(max + 'T00:00:00') : undefined;

  const isDateDisabled = (date: Date) => {
    if (disabledDates && disabledDates(date)) return true;
    if (minDate && date < minDate) return true;
    if (maxDate && date > maxDate) return true;
    return false;
  };

  return (
    <div ref={containerRef} className={cn('date-picker-container', className)}>
      <div
        className={cn(
          'date-picker-input',
          disabled && 'date-picker-input-disabled',
          isOpen && 'date-picker-input-open'
        )}
        onClick={() => !disabled && setIsOpen(!isOpen)}
      >
        <input
          type="text"
          readOnly
          value={displayValue}
          placeholder={placeholder}
          disabled={disabled}
          className="date-picker-input-field"
        />
        <svg
          className="date-picker-icon"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="16" y1="2" x2="16" y2="6"></line>
          <line x1="8" y1="2" x2="8" y2="6"></line>
          <line x1="3" y1="10" x2="21" y2="10"></line>
        </svg>
      </div>
      {isOpen && !disabled && (
        <div className="date-picker-popover">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={handleSelect}
            disabled={isDateDisabled}
            defaultMonth={selectedDate || new Date()}
            className="date-picker-calendar"
          />
        </div>
      )}
    </div>
  );
};

