import React, { createContext, useContext, useState, useCallback } from 'react';
import { FaCheckCircle, FaInfoCircle, FaExclamationCircle, FaTimes } from 'react-icons/fa';
import './ToastContext.css';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType, duration?: number) => void;
  showSuccess: (message: string, duration?: number) => void;
  showError: (message: string, duration?: number) => void;
  showInfo: (message: string, duration?: number) => void;
  showWarning: (message: string, duration?: number) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = 'info', duration: number = 6000) => {
      const id = Math.random().toString(36).substring(7);
      const newToast: Toast = { id, message, type, duration };

      setToasts((prev) => [...prev, newToast]);

      setTimeout(() => {
        removeToast(id);
      }, duration);
    },
    [removeToast]
  );

  const showSuccess = useCallback(
    (message: string, duration?: number) => showToast(message, 'success', duration || 10000),
    [showToast]
  );

  const showError = useCallback(
    (message: string, duration?: number) => showToast(message, 'error', duration || 15000),
    [showToast]
  );

  const showInfo = useCallback(
    (message: string, duration?: number) => showToast(message, 'info', duration || 10000),
    [showToast]
  );

  const showWarning = useCallback(
    (message: string, duration?: number) => showToast(message, 'warning', duration || 15000),
    [showToast]
  );

  const getToastIcon = (type: ToastType) => {
    switch (type) {
      case 'success':
        return <FaCheckCircle className="toast-icon" />;
      case 'error':
        return <FaExclamationCircle className="toast-icon" />;
      case 'warning':
        return <FaExclamationCircle className="toast-icon" />;
      default:
        return <FaInfoCircle className="toast-icon" />;
    }
  };

  return (
    <ToastContext.Provider value={{ showToast, showSuccess, showError, showInfo, showWarning }}>
      {children}
      <div className="toast-container">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast toast-${toast.type}`}
            onClick={() => removeToast(toast.id)}
          >
            {getToastIcon(toast.type)}
            <span className="toast-message" style={{ whiteSpace: 'pre-line' }}>{toast.message}</span>
            <button
              className="toast-close"
              onClick={(e) => {
                e.stopPropagation();
                removeToast(toast.id);
              }}
            >
              <FaTimes />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

