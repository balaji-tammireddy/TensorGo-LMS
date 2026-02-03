import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from 'react-query';
import AppLayout from '../components/layout/AppLayout';
import * as dashboardService from '../services/dashboardService';
import { useAuth } from '../contexts/AuthContext';
// import {
//     FaLaptop,
//     FaComments,
//     FaUserTie,
//     FaCalendarAlt,
//     FaCheckCircle,
//     FaBuilding,
//     FaFileAlt
// } from 'react-icons/fa';
import './DashboardPage.css';

const formatStat = (num: number) => {
    if (isNaN(num)) return '00';
    return num < 10 ? `0${num}` : `${num}`;
};

const DashboardPage: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuth();

    // Fetch stats
    const { data: statsData } = useQuery('dashboardStats', dashboardService.getStats, {
        refetchOnWindowFocus: false,
        staleTime: 30000 // 30 seconds
    });

    const stats = statsData?.breakdown || {};

    const handleStatClick = (role?: string) => {
        if (role) {
            navigate(`/employee-management?role=${role}`);
        } else {
            navigate('/employee-management');
        }
    };

    if (user?.role !== 'super_admin') {
        return null; // ProtectedRoute will handle redirect, but for safety
    }

    return (
        <AppLayout>
            <div className="dashboard-container">
                <div className="dashboard-header">
                    <div>
                        <h1 className="page-title">Organization Dashboard</h1>
                    </div>
                </div>

                {/* Stats Row */}
                <div className="leave-balances-section">
                    <div className="balance-cards-container">
                        <div className="balance-card" onClick={() => handleStatClick()}>
                            <span className="balance-label">Total Strength</span>
                            <span className="balance-value">{formatStat(statsData?.total || 0)}</span>
                        </div>
                        <div className="balance-separator"></div>
                        <div className="balance-card" onClick={() => handleStatClick('super_admin')}>
                            <span className="balance-label">Super Admins</span>
                            <span className="balance-value">{formatStat(stats.super_admin || 0)}</span>
                        </div>
                        <div className="balance-separator"></div>
                        <div className="balance-card" onClick={() => handleStatClick('hr')}>
                            <span className="balance-label">HR</span>
                            <span className="balance-value">{formatStat(stats.hr || 0)}</span>
                        </div>
                        <div className="balance-separator"></div>
                        <div className="balance-card" onClick={() => handleStatClick('manager')}>
                            <span className="balance-label">Managers</span>
                            <span className="balance-value">{formatStat(stats.manager || 0)}</span>
                        </div>
                        <div className="balance-separator"></div>
                        <div className="balance-card" onClick={() => handleStatClick('employee')}>
                            <span className="balance-label">Employees</span>
                            <span className="balance-value">{formatStat(stats.employee || 0)}</span>
                        </div>
                        <div className="balance-separator"></div>
                        <div className="balance-card" onClick={() => handleStatClick('intern')}>
                            <span className="balance-label">Interns</span>
                            <span className="balance-value">{formatStat(stats.intern || 0)}</span>
                        </div>
                    </div>
                </div>
            </div>
        </AppLayout>
    );
};

export default DashboardPage;
