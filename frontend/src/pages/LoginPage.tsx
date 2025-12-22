import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './LoginPage.css';

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isInactive, setIsInactive] = useState(false);
  const { login, logout } = useAuth();
  const navigate = useNavigate();

  // Clear any old session data when component mounts
  React.useEffect(() => {
    // Clear any stale data when login page loads
    logout().catch(() => {
      // Ignore errors - just clear local storage
    });
  }, [logout]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsInactive(false);
    setLoading(true);

    try {
      // Trim email and convert to lowercase to avoid case sensitivity issues
      const trimmedEmail = email.trim().toLowerCase();
      const trimmedPassword = password.trim();
      
      await login(trimmedEmail, trimmedPassword);
      navigate('/leave-apply');
    } catch (err: any) {
      console.error('Login error:', err);
      const errorData = err.response?.data?.error;
      const message = errorData?.message || err.message || 'Login failed';

      if (message === 'Account is not active') {
        // Show dedicated inactive account screen and block further access
        setIsInactive(true);
        setError('');
      } else if (errorData?.details && Array.isArray(errorData.details)) {
        // Show validation details if available
        const detailMessages = errorData.details.map((d: any) => {
          const field = d.path?.join('.') || 'field';
          return `${field}: ${d.message}`;
        }).join(', ');
        setError(`${errorData.message || 'Validation failed'}: ${detailMessages}`);
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-container">
        {isInactive ? (
          <>
            <h1>HR Leave Management System</h1>
            <div className="error-message" style={{ marginTop: 16 }}>
              You are no longer active employee of this organisation.
            </div>
            <button
              type="button"
              className="login-button"
              style={{ marginTop: 16 }}
              onClick={() => {
                setIsInactive(false);
                setError('');
                setPassword('');
              }}
            >
              Sign In as Different User
            </button>
          </>
        ) : (
          <>
            <h1>HR Leave Management System</h1>
            <form onSubmit={handleSubmit} className="login-form">
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
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="Enter your password"
                />
              </div>
              {error && <div className="error-message">{error}</div>}
              <button type="submit" disabled={loading} className="login-button">
                {loading ? 'Logging in...' : 'Login'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

export default LoginPage;

