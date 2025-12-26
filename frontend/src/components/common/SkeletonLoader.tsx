import React from 'react';
import './SkeletonLoader.css';

interface SkeletonLoaderProps {
  variant?: 'page' | 'table' | 'form' | 'profile' | 'card' | 'custom';
  rows?: number;
  showHeader?: boolean;
}

const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({ 
  variant = 'page', 
  rows = 3,
  showHeader = true 
}) => {
  if (variant === 'custom') {
    return null; // For custom implementations
  }

  if (variant === 'table') {
    return (
      <div className="skeleton-loader">
        {showHeader && <div className="skeleton-table-header"></div>}
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="skeleton-table-row" style={{ width: `${85 + index * 5}%` }}></div>
        ))}
      </div>
    );
  }

  if (variant === 'form') {
    return (
      <div className="skeleton-loader">
        {showHeader && <div className="skeleton-header"></div>}
        <div className="skeleton-form-grid">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="skeleton-input"></div>
          ))}
        </div>
        <div className="skeleton-textarea"></div>
        <div className="skeleton-buttons">
          <div className="skeleton-button"></div>
          <div className="skeleton-button"></div>
        </div>
      </div>
    );
  }

  if (variant === 'profile') {
    return (
      <div className="skeleton-loader">
        <div className="skeleton-title"></div>
        <div className="skeleton-profile-container">
          <div className="skeleton-profile-photo"></div>
          <div className="skeleton-profile-info">
            <div className="skeleton-header"></div>
            <div className="skeleton-input"></div>
            <div className="skeleton-input"></div>
            <div className="skeleton-input"></div>
            <div className="skeleton-input"></div>
          </div>
        </div>
      </div>
    );
  }

  if (variant === 'card') {
    return (
      <div className="skeleton-loader">
        <div className="skeleton-card">
          {showHeader && <div className="skeleton-header"></div>}
          <div className="skeleton-content">
            {Array.from({ length: rows }).map((_, index) => (
              <div key={index} className="skeleton-line" style={{ width: `${90 - index * 5}%` }}></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Default 'page' variant
  return (
    <div className="skeleton-loader">
      <div className="skeleton-title"></div>
      <div className="skeleton-content">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="skeleton-line" style={{ width: `${95 - index * 3}%` }}></div>
        ))}
      </div>
    </div>
  );
};

export default SkeletonLoader;

