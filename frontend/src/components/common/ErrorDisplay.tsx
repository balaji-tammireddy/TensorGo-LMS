import React, { memo } from 'react';
import './ErrorDisplay.css';

interface ErrorDisplayProps {
  message: string;
  onRetry?: () => void;
  showRetryButton?: boolean;
}

const ErrorDisplay: React.FC<ErrorDisplayProps> = memo(({ 
  message, 
  onRetry,
  showRetryButton = false 
}) => {
  return (
    <div className="error-display-container">
      <div className="error-content">
        {/* Animated Error Icon */}
        <div className="error-icon-wrapper">
          <div className="error-icon-circle">
            <svg 
              className="error-icon" 
              viewBox="0 0 24 24" 
              fill="none" 
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
              <path d="M12 8V12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <path d="M12 16H12.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <div className="error-pulse-ring"></div>
        </div>
        
        {/* Error Message */}
        <h3 className="error-title">Oops! Something went wrong</h3>
        <p className="error-message">{message}</p>
        
        {/* Retry Button */}
        {showRetryButton && onRetry && (
          <button className="error-retry-button" onClick={onRetry}>
            <span className="retry-icon">↻</span>
            Try Again
          </button>
        )}
      </div>
    </div>
  );
});

ErrorDisplay.displayName = 'ErrorDisplay';

export default ErrorDisplay;

