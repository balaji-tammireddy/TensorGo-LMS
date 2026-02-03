import React from 'react';
import Sidebar from './Sidebar';
import { useAuth } from '../../contexts/AuthContext';
import { Link } from 'react-router-dom';
import { X, Info } from 'lucide-react';
import { useState, useEffect } from 'react';
import './AppLayout.css';

interface AppLayoutProps {
  children: React.ReactNode;
}

const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const { user } = useAuth();
  const [showProfileReminder, setShowProfileReminder] = useState(false);

  useEffect(() => {
    // Show reminder if user is logged in, profile is NOT updated, and it's not a super admin
    if (user && !user.isProfileUpdated && user.role !== 'super_admin') {
      setShowProfileReminder(true);
    }
  }, [user]);

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        {/* Persistent Top Banner for Profile Completion */}
        {showProfileReminder && (
          <div className="profile-reminder-banner">
            <div className="profile-reminder-content">
              <div className="profile-reminder-icon">
                <Info size={18} />
              </div>
              <p className="profile-reminder-text">
                Your profile is incomplete. Please update your details to ensure accurate records.
              </p>
            </div>
            <div className="profile-reminder-actions">
              <Link
                to="/profile"
                onClick={() => setShowProfileReminder(false)}
                className="profile-reminder-button"
              >
                Update Now
              </Link>
              <button
                onClick={() => setShowProfileReminder(false)}
                className="profile-reminder-close"
                title="Dismiss"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        )}
        <div className="content-area">
          {children}
        </div>
      </main>
    </div>
  );
};


export default AppLayout;

