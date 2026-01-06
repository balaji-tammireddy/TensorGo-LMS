import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { forgotPassword, verifyOTP, resetPassword } from '../services/authService';
import { FaEye, FaEyeSlash, FaTimes, FaUserTimes } from 'react-icons/fa';
import './LoginPage.css';

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isInactive, setIsInactive] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { login, logout } = useAuth();
  const { showError, showWarning, showSuccess } = useToast();
  const navigate = useNavigate();

  // Forgot password state
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [forgotPasswordStep, setForgotPasswordStep] = useState<'email' | 'otp' | 'password'>('email');
  const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Clear any old session data when component mounts
  React.useEffect(() => {
    // Clear any stale data when login page loads
    logout().catch(() => {
      // Ignore errors - just clear local storage
    });

    // Prevent body scroll when login page is mounted
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    // Cleanup: restore scroll when component unmounts
    return () => {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    };
  }, [logout]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsInactive(false);
    setLoading(true);

    try {
      // Trim email and convert to lowercase to avoid case sensitivity issues
      const trimmedEmail = email.trim().toLowerCase();
      const trimmedPassword = password.trim();

      const loggedInUser = await login(trimmedEmail, trimmedPassword);
      if (loggedInUser.role === 'super_admin') {
        navigate('/leave-approval');
      } else {
        navigate('/leave-apply');
      }
    } catch (err: any) {
      const status = err.response?.status;
      const errorData = err.response?.data?.error;
      const message = errorData?.message || err.message || 'Login failed';

      if (message === 'Account is not active') {
        // Show dedicated inactive account screen and block further access
        setIsInactive(true);
      } else if (status === 429) {
        // Too many requests (rate limiting)
        showWarning('Too many requests. Try again later.');
      } else if (errorData?.details && Array.isArray(errorData.details)) {
        // Show validation details if available
        const formatFieldName = (path: string[]): string => {
          const field = path[path.length - 1]; // Get the last part (e.g., 'email' from 'body.email')
          return field.charAt(0).toUpperCase() + field.slice(1).replace(/_/g, ' ');
        };

        // Remove duplicates and format messages
        const uniqueMessages = new Map<string, string>();
        errorData.details.forEach((d: any) => {
          const fieldName = formatFieldName(d.path || []);
          const message = d.message || '';
          const key = `${fieldName}:${message}`;
          if (!uniqueMessages.has(key)) {
            uniqueMessages.set(key, `${fieldName}: ${message}`);
          }
        });

        const detailMessages = Array.from(uniqueMessages.values()).join('\n');
        showError(detailMessages || errorData.message || 'Validation failed');
      } else {
        showError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!forgotPasswordEmail.trim()) {
      showError('Please enter your email address');
      return;
    }

    setForgotPasswordLoading(true);
    try {
      await forgotPassword({ email: forgotPasswordEmail.trim() });
      showSuccess('OTP sent to your email (if registered).');
      setForgotPasswordStep('otp');
    } catch (err: any) {
      const errorData = err.response?.data?.error;
      const message = errorData?.message || err.message || 'Failed to send OTP';
      showError(message);
    } finally {
      setForgotPasswordLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (!otp.trim() || otp.trim().length !== 6) {
      showError('Please enter a valid 6-digit OTP');
      return;
    }

    setForgotPasswordLoading(true);
    try {
      await verifyOTP({ email: forgotPasswordEmail.trim(), otp: otp.trim() });
      showSuccess('OTP verified successfully');
      setForgotPasswordStep('password');
    } catch (err: any) {
      const errorData = err.response?.data?.error;
      const message = errorData?.message || err.message || 'Invalid or expired OTP';
      showError(message);
    } finally {
      setForgotPasswordLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!newPassword.trim() || newPassword.length < 6) {
      showError('Password must be at least 6 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      showError('Passwords do not match');
      return;
    }

    setForgotPasswordLoading(true);
    try {
      await resetPassword({
        email: forgotPasswordEmail.trim(),
        otp: otp.trim(),
        newPassword: newPassword.trim()
      });
      showSuccess('Password reset successful. Please login.');
      // Reset forgot password state
      setShowForgotPassword(false);
      setForgotPasswordStep('email');
      setForgotPasswordEmail('');
      setOtp('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      const errorData = err.response?.data?.error;
      const message = errorData?.message || err.message || 'Failed to reset password';
      showError(message);
    } finally {
      setForgotPasswordLoading(false);
    }
  };

  const handleCloseForgotPassword = () => {
    setShowForgotPassword(false);
    setForgotPasswordStep('email');
    setForgotPasswordEmail('');
    setOtp('');
    setNewPassword('');
    setConfirmPassword('');
  };

  return (
    <div className="login-page">
      <div className="ambient-blob blob-1"></div>
      <div className="ambient-blob blob-2"></div>
      <div className="login-container">
        {isInactive ? (
          <>
            <div className="login-header">
              <div className="login-logo">
                <img src="https://hr--lms.s3.us-east-va.io.cloud.ovh.us/login-page/logo.png" alt="TensorGo logo" />
              </div>
            </div>

            <div className="inactive-state-container">
              <div className="inactive-icon-wrapper">
                <FaUserTimes className="inactive-icon" />
              </div>

              <h1 className="inactive-title">Account Inactive</h1>

              <p className="inactive-description">
                You are no longer an active employee of this organization.
                Please contact the HR department if you believe this is an error.
              </p>

              <button
                type="button"
                className="login-button inactive-login-button"
                onClick={() => {
                  setIsInactive(false);
                  setPassword('');
                }}
              >
                Sign In as Different User
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="login-header">
              <div className="login-logo">
                <img src="https://hr--lms.s3.us-east-va.io.cloud.ovh.us/login-page/logo.png" alt="TensorGo logo" />
              </div>
            </div>
            <form onSubmit={handleSubmit} className="login-form">
              <h1>HR Management System</h1>
              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="Enter your email"
                />
              </div>
              <div className="form-group">
                <label>Password</label>
                <div className="password-field">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="Enter your password"
                  />
                  <button
                    type="button"
                    className="toggle-password"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <FaEyeSlash /> : <FaEye />}
                  </button>
                </div>
              </div>
              <button type="submit" disabled={loading} className="login-button">
                {loading ? 'Logging in...' : 'Sign In'}
              </button>
            </form>
            <div className="forgot-password-link">
              <button
                type="button"
                onClick={() => setShowForgotPassword(true)}
                className="forgot-password-button"
              >
                Forgot Password?
              </button>
            </div>
          </>
        )}
      </div>

      {/* Forgot Password Modal */}
      {
        showForgotPassword && (
          <div className="forgot-password-overlay">
            <div className="forgot-password-modal">
              <div className="forgot-password-header">
                <h2>Reset Password</h2>
                <button
                  type="button"
                  className="close-button"
                  onClick={handleCloseForgotPassword}
                  aria-label="Close"
                >
                  <FaTimes />
                </button>
              </div>

              <div className="forgot-password-content">
                {forgotPasswordStep === 'email' && (
                  <>
                    <p className="forgot-password-description">
                      Enter your registered email address. We'll send you an OTP to reset your password.
                    </p>
                    <div className="form-group">
                      <label>Email</label>
                      <input
                        type="email"
                        value={forgotPasswordEmail}
                        onChange={(e) => setForgotPasswordEmail(e.target.value)}
                        placeholder="Enter your email"
                        disabled={forgotPasswordLoading}
                      />
                    </div>
                    <div className="forgot-password-actions">
                      <button
                        type="button"
                        onClick={handleForgotPassword}
                        disabled={forgotPasswordLoading}
                        className="forgot-password-submit-button"
                      >
                        {forgotPasswordLoading ? 'Sending...' : 'Send OTP'}
                      </button>
                    </div>
                  </>
                )}

                {forgotPasswordStep === 'otp' && (
                  <>
                    <p className="forgot-password-description">
                      Enter the 6-digit OTP sent to <strong>{forgotPasswordEmail}</strong>
                    </p>
                    <div className="form-group">
                      <label>OTP</label>
                      <input
                        type="text"
                        value={otp}
                        onChange={(e) => {
                          const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                          setOtp(value);
                        }}
                        maxLength={6}
                        disabled={forgotPasswordLoading}
                        style={{ textAlign: 'center', letterSpacing: '8px', fontFamily: 'monospace', fontSize: '20px' }}
                      />
                    </div>
                    <div className="forgot-password-actions">
                      <button
                        type="button"
                        onClick={() => {
                          setForgotPasswordStep('email');
                          setOtp('');
                        }}
                        className="forgot-password-back-button"
                        disabled={forgotPasswordLoading}
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        onClick={handleVerifyOTP}
                        disabled={forgotPasswordLoading || otp.length !== 6}
                        className="forgot-password-submit-button"
                      >
                        {forgotPasswordLoading ? 'Verifying...' : 'Verify OTP'}
                      </button>
                    </div>
                  </>
                )}

                {forgotPasswordStep === 'password' && (
                  <>
                    <p className="forgot-password-description">
                      Enter your new password
                    </p>
                    <div className="form-group">
                      <label>New Password</label>
                      <div className="password-field">
                        <input
                          type={showNewPassword ? 'text' : 'password'}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Enter new password"
                          disabled={forgotPasswordLoading}
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
                      <label>Confirm Password</label>
                      <div className="password-field">
                        <input
                          type={showConfirmPassword ? 'text' : 'password'}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Confirm new password"
                          disabled={forgotPasswordLoading}
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
                    <div className="forgot-password-actions">
                      <button
                        type="button"
                        onClick={handleCloseForgotPassword}
                        className="forgot-password-back-button"
                        disabled={forgotPasswordLoading}
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        onClick={handleResetPassword}
                        disabled={forgotPasswordLoading || !newPassword || newPassword !== confirmPassword}
                        className="forgot-password-submit-button"
                      >
                        {forgotPasswordLoading ? 'Resetting...' : 'Reset Password'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )
      }
    </div>
  );
};

export default LoginPage;

