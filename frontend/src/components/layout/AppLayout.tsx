import React from 'react';
import Sidebar from './Sidebar';
import { useAuth } from '../../contexts/AuthContext';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { useState, useEffect } from 'react';
import './AppLayout.css';

interface AppLayoutProps {
  children: React.ReactNode;
}

const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const { user } = useAuth();
  const [showProfileReminder, setShowProfileReminder] = useState(false);

  useEffect(() => {
    // Show reminder if user is logged in, profile is NOT updated, and it's not a super admin (optional)
    if (user && !user.isProfileUpdated && user.role !== 'super_admin') {
      // Check if user has dismissed it this session? 
      // User requirement: "The user can close this and proceed... Non-blocking"
      // It implies it might reappear on next session/reload.
      // We'll use local state 'showProfileReminder' initialized to false?
      // No, initialized to true if condition met.
      setShowProfileReminder(true);
    }
  }, [user]);

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        {children}
      </main>

      {/* Non-blocking Profile Completion Reminder */}
      {showProfileReminder && (
        <div className="profile-reminder-popup" style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          backgroundColor: '#fff',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          borderRadius: '8px',
          padding: '16px',
          width: '320px',
          zIndex: 1000,
          borderLeft: '4px solid #f59e0b',
          animation: 'slideIn 0.3s ease-out'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '8px' }}>
            <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#1e293b' }}>Complete Your Profile</h4>
            <button
              onClick={() => setShowProfileReminder(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#64748b' }}
            >
              <X size={16} />
            </button>
          </div>
          <p style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#475569', lineHeight: '1.4' }}>
            Your profile is incomplete. Please update your details to ensure accurate records.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Link
              to="/profile"
              onClick={() => setShowProfileReminder(false)}
              style={{
                fontSize: '14px',
                color: '#2563eb',
                fontWeight: 500,
                textDecoration: 'none',
                padding: '6px 12px',
                borderRadius: '4px',
                backgroundColor: '#eff6ff'
              }}
            >
              Update Now
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};

export default AppLayout;

