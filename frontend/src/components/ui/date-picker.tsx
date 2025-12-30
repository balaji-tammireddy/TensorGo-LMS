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
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<'bottom' | 'top'>('bottom');

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

  // Calculate position to prevent clipping
  useEffect(() => {
    if (isOpen && containerRef.current) {
      const updatePosition = () => {
        if (!containerRef.current) return;
        
        const containerRect = containerRef.current.getBoundingClientRect();
        const popoverHeight = 300; // Approximate calendar height
        
        // Find the scrollable container (modal body or window)
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
        
        const spaceBelow = containerBounds.bottom - containerRect.bottom - 8; // 8px offset
        const spaceAbove = containerRect.top - containerBounds.top - 8; // 8px offset
        
        // Check if we need to position above
        if (spaceBelow < popoverHeight && spaceAbove > spaceBelow) {
          setPosition('top');
        } else {
          setPosition('bottom');
        }
      };

      // Initial calculation
      updatePosition();

      // Recalculate after a short delay to ensure popover is rendered
      const timeoutId = setTimeout(updatePosition, 10);

      // Recalculate on scroll and resize
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

  // Scroll into view when opening if needed
  useEffect(() => {
    if (isOpen && containerRef.current && popoverRef.current) {
      const scrollIntoView = () => {
        if (!containerRef.current || !popoverRef.current) return;
        
        const containerRect = containerRef.current.getBoundingClientRect();
        const popoverRect = popoverRef.current.getBoundingClientRect();
        
        // Find the scrollable container
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
          : { top: 0, bottom: window.innerHeight };
        
        const spaceBelow = containerBounds.bottom - containerRect.bottom - 8;
        const spaceAbove = containerRect.top - containerBounds.top - 8;
        
        // If popover is clipped, scroll the container into view
        if (position === 'bottom' && spaceBelow < popoverRect.height) {
          containerRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
        } else if (position === 'top' && spaceAbove < popoverRect.height) {
          containerRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
        }
      };
      
      // Delay to ensure popover is rendered
      const timeoutId = setTimeout(scrollIntoView, 50);
      return () => clearTimeout(timeoutId);
    }
  }, [isOpen, position]);

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

  // Determine which month to show when calendar opens
  // Priority: selectedDate > minDate > today
  const getDefaultMonth = () => {
    if (selectedDate) return selectedDate;
    if (minDate) return minDate;
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

