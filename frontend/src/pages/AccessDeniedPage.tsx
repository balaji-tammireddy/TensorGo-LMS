import React from 'react';
import { useNavigate } from 'react-router-dom';
import './ErrorPage.css';

const AccessDeniedPage: React.FC = () => {
    const navigate = useNavigate();

    return (
        <div className="error-page">
            <div className="ambient-blob blob-1"></div>
            <div className="ambient-blob blob-2"></div>
            <div className="error-container">
                <div className="error-icon">403</div>
                <h1 className="error-title">Access Denied</h1>
                <p className="error-message">
                    You don't have permission to access this page. Please contact your administrator if you think this is a mistake.
                </p>
                <button className="home-button" onClick={() => navigate('/')}>
                    Back to Home
                </button>
            </div>
        </div>
    );
};

export default AccessDeniedPage;
