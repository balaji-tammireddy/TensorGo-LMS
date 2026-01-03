import React from 'react';
import { useNavigate } from 'react-router-dom';
import './ErrorPage.css';

const NotFoundPage: React.FC = () => {
    const navigate = useNavigate();

    return (
        <div className="error-page">
            <div className="ambient-blob blob-1"></div>
            <div className="ambient-blob blob-2"></div>
            <div className="error-container">
                <div className="error-icon">404</div>
                <h1 className="error-title">Page Not Found</h1>
                <p className="error-message">
                    The page you are looking for might have been removed, had its name changed, or is temporarily unavailable.
                </p>
                <button className="home-button" onClick={() => navigate('/')}>
                    Back to Home
                </button>
            </div>
        </div>
    );
};

export default NotFoundPage;
