import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import api from '../services/api';
import { FaEye, FaEyeSlash } from 'react-icons/fa';
import './LoginPage.css';

const ChangePasswordPage: React.FC = () => {
  const { user, logout } = useAuth();
  const { showSuccess, showError, showWarning } = useToast();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      showWarning('Passwords do not match.');
      return;
    }

    if (newPassword.length < 6) {
      showWarning('Password too short (min 6 chars).');
      return;
    }

    try {
      setLoading(true);
      await api.post('/auth/change-password', { oldPassword, newPassword });
      showSuccess('Password updated. Please login again.');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');

      // Force re-login so new token & flags are picked up
      setTimeout(() => {
        logout();
        window.location.href = '/login';
      }, 1500);
    } catch (err: any) {
      const message =
        err.response?.data?.error?.message || err.message || 'Update failed.';
      showError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <h1>Change Password</h1>
        <p className="login-subtitle">
          {user?.mustChangePassword
            ? 'For security, please set a new password before using the portal.'
            : 'Update your account password.'}
        </p>
        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label>Current Password</label>
            <div className="password-field">
              <input
                type={showOldPassword ? 'text' : 'password'}
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                required
                placeholder="Enter your current password"
              />
              <button
                type="button"
                className="toggle-password"
                onClick={() => setShowOldPassword((prev) => !prev)}
                aria-label={showOldPassword ? 'Hide password' : 'Show password'}
              >
                {showOldPassword ? <FaEyeSlash /> : <FaEye />}
              </button>
            </div>
          </div>
          <div className="form-group">
            <label>New Password</label>
            <div className="password-field">
              <input
                type={showNewPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                placeholder="Enter a new password"
              />
              <button
                type="button"
                className="toggle-password"
                onClick={() => setShowNewPassword((prev) => !prev)}
                aria-label={showNewPassword ? 'Hide password' : 'Show password'}
              >
                {showNewPassword ? <FaEyeSlash /> : <FaEye />}
              </button>
            </div>
          </div>
          <div className="form-group">
            <label>Confirm New Password</label>
            <div className="password-field">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                placeholder="Confirm new password"
              />
              <button
                type="button"
                className="toggle-password"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
              >
                {showConfirmPassword ? <FaEyeSlash /> : <FaEye />}
              </button>
            </div>
          </div>
          <button type="submit" disabled={loading} className="login-button">
            {loading ? 'Updating...' : 'Change Password'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChangePasswordPage;


