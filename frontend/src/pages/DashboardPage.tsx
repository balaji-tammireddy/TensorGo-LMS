import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from 'react-query';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../components/layout/AppLayout';
import * as dashboardService from '../services/dashboardService';
import './DashboardPage.css';

import { FaInfoCircle, FaChevronDown, FaChevronRight } from 'react-icons/fa';

// User Node Component
const UserNodeContent = ({ node, isOpen, onToggle, hasChildren }: { node: any, isOpen: boolean, onToggle: () => void, hasChildren: boolean }) => {
    const navigate = useNavigate();
    const [detailsExpanded, setDetailsExpanded] = useState(false);
    const [details, setDetails] = useState<any>(null);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [imgError, setImgError] = useState(false);

    const isSuperAdmin = node.role === 'super_admin';

    const handleToggleDetails = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (detailsExpanded) {
            setDetailsExpanded(false);
            return;
        }

        setDetailsExpanded(true);
        if (!details && !loadingDetails) {
            try {
                setLoadingDetails(true);
                const data = await dashboardService.getUserDashboardDetails(node.id);
                setDetails(data);
            } catch (error) {
                console.error("Failed to load details", error);
            } finally {
                setLoadingDetails(false);
            }
        }
    };

    const handleViewProfile = (e: React.MouseEvent) => {
        e.stopPropagation();
        navigate(`/employee-management?empId=${node.emp_id || node.empId}`);
    };

    return (
        <div className={`user-node ${detailsExpanded ? 'expanded' : ''}`} onClick={onToggle} style={{ cursor: hasChildren ? 'pointer' : 'default' }}>
            <div className="node-header">
                {/* Avatar */}
                {node.profile_photo_url && !imgError ? (
                    <img
                        src={node.profile_photo_url.startsWith('http')
                            ? node.profile_photo_url
                            : `http://51.15.227.10:5001/${node.profile_photo_url}`}
                        className="avatar"
                        alt={node.name}
                        onError={() => setImgError(true)}
                    />
                ) : (
                    <div className="avatar-placeholder">
                        {node.name.split(' ').map((n: any) => n[0]).join('').substring(0, 2).toUpperCase()}
                    </div>
                )}

                <div className="node-info">
                    <h4>{node.name}</h4>
                    <span className="node-role">{node.role?.replace('_', ' ')}</span>
                </div>

                {/* Controls */}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {/* Tree Toggle Indicator */}
                    {hasChildren && (
                        <div style={{ color: '#9ca3af' }}>
                            {isOpen ? <FaChevronDown /> : <FaChevronRight />}
                        </div>
                    )}

                    {/* Info Button for Details */}
                    <button
                        onClick={handleToggleDetails}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: detailsExpanded ? '#3c6ff2' : '#9ca3af',
                            cursor: 'pointer',
                            padding: '4px',
                            display: 'flex',
                            alignItems: 'center'
                        }}
                        title="View Stats"
                    >
                        <FaInfoCircle size={16} />
                    </button>
                </div>
            </div>

            {/* Details Section (Balances/History) */}
            {detailsExpanded && (
                <div className="node-details" onClick={(e) => e.stopPropagation()}>
                    {loadingDetails ? (
                        <div style={{ textAlign: 'center', padding: '10px' }}>Loading...</div>
                    ) : details ? (
                        <>
                            {!isSuperAdmin && (
                                <div className="balance-cards-container">
                                    <div className="balance-card">
                                        <div className="balance-label">Casual</div>
                                        <div className="balance-value">
                                            {(() => {
                                                const val = details.balances?.casual_balance || 0;
                                                const num = Math.floor(parseFloat(val));
                                                return num < 10 ? `0${num}` : `${num}`;
                                            })()}
                                        </div>
                                    </div>
                                    <div className="balance-separator"></div>
                                    <div className="balance-card">
                                        <div className="balance-label">Sick</div>
                                        <div className="balance-value">
                                            {(() => {
                                                const val = details.balances?.sick_balance || 0;
                                                const num = Math.floor(parseFloat(val));
                                                return num < 10 ? `0${num}` : `${num}`;
                                            })()}
                                        </div>
                                    </div>
                                    <div className="balance-separator"></div>
                                    <div className="balance-card">
                                        <div className="balance-label">LOP</div>
                                        <div className="balance-value">
                                            {(() => {
                                                const val = details.balances?.lop_balance || 0;
                                                const num = Math.floor(parseFloat(val));
                                                return num < 10 ? `0${num}` : `${num}`;
                                            })()}
                                        </div>
                                    </div>
                                </div>
                            )}

                            <button className="btn-profile" onClick={handleViewProfile}>
                                View Full Details
                            </button>
                        </>
                    ) : (
                        <div style={{ textAlign: 'center', padding: '10px', color: 'red' }}>Failed to load info</div>
                    )}
                </div>
            )}
        </div>
    );
};

// Accordion Tree Component
const RecursiveAccordionTree = ({ nodes }: { nodes: any[] }) => {
    const [activeNodeId, setActiveNodeId] = useState<string | number | null>(null);

    if (!nodes || nodes.length === 0) return null;

    const handleToggle = (id: string | number) => {
        setActiveNodeId((prev) => (prev === id ? null : id));
    };

    return (
        <ul>
            {nodes.map((node) => {
                const hasChildren = node.children && node.children.length > 0;
                const isOpen = activeNodeId === node.id;

                return (
                    <li key={node.id}>
                        <UserNodeContent
                            node={node}
                            isOpen={isOpen}
                            onToggle={() => hasChildren && handleToggle(node.id)}
                            hasChildren={hasChildren}
                        />
                        {isOpen && hasChildren && (
                            <RecursiveAccordionTree nodes={node.children} />
                        )}
                    </li>
                );
            })}
        </ul>
    );
};

const formatStat = (num: number) => {
    if (isNaN(num)) return '00';
    return num < 10 ? `0${num}` : `${num}`;
};

const DashboardPage: React.FC = () => {
    const queryClient = useQueryClient();
    // Fetch stats
    const { data: statsData } = useQuery('dashboardStats', dashboardService.getStats, {
        refetchOnWindowFocus: false,
        staleTime: 30000 // 30 seconds
    });

    // Fetch hierarchy
    const { data: hierarchyData } = useQuery('dashboardHierarchy', dashboardService.getHierarchy, {
        refetchOnWindowFocus: false,
        staleTime: 30000
    });

    // Build tree structure
    const treeData = useMemo(() => {
        if (!hierarchyData || hierarchyData.length === 0) return [];

        const map = new Map();
        const roots: any[] = [];
        const users = hierarchyData.map((u: any) => ({ ...u, children: [] }));

        // Initialize map
        users.forEach((u: any) => map.set(u.id, u));

        // Link children
        users.forEach((user: any) => {
            if (user.reporting_manager_id && map.has(user.reporting_manager_id)) {
                map.get(user.reporting_manager_id).children.push(user);
            } else {
                // If no manager (Super Admin) or manager not in list (inactive?) -> distinct root
                roots.push(user);
            }
        });

        // Ensure Super Admin is always first/top if multiple roots exist
        roots.sort((a, b) => (a.role === 'super_admin' ? -1 : 1));

        return roots;
    }, [hierarchyData]);


    const stats = statsData?.breakdown || {};

    return (
        <AppLayout>
            <div className="dashboard-container">
                <div className="dashboard-header">
                    <div>
                        <h1>Organization Dashboard</h1>
                        <p>Overview of company structure and workforce statistics</p>
                    </div>
                    <button
                        className="dashboard-refresh-btn"
                        onClick={() => { queryClient.invalidateQueries('dashboardStats'); queryClient.invalidateQueries('dashboardHierarchy'); }}
                    >
                        Refresh
                    </button>
                </div>

                {/* Stats Row */}
                {/* Stats Row - Unified Card */}
                <div className="stats-overview-card">
                    <div className="stats-header">
                        <h2>Overview</h2>
                    </div>
                    <div className="stats-content">
                        <div className="stat-column">
                            <span className="stat-label">Total Strength</span>
                            <span className="stat-value">{formatStat(statsData?.total || 0)}</span>
                        </div>
                        <div className="stat-divider"></div>
                        <div className="stat-column">
                            <span className="stat-label">Super Admins</span>
                            <span className="stat-value">{formatStat(stats.super_admin || 0)}</span>
                        </div>
                        <div className="stat-divider"></div>
                        <div className="stat-column">
                            <span className="stat-label">HR</span>
                            <span className="stat-value">{formatStat(stats.hr || 0)}</span>
                        </div>
                        <div className="stat-divider"></div>
                        <div className="stat-column">
                            <span className="stat-label">Managers</span>
                            <span className="stat-value">{formatStat(stats.manager || 0)}</span>
                        </div>
                        <div className="stat-divider"></div>
                        <div className="stat-column">
                            <span className="stat-label">Employees</span>
                            <span className="stat-value">{formatStat(stats.employee || 0)}</span>
                        </div>
                        <div className="stat-divider"></div>
                        <div className="stat-column">
                            <span className="stat-label">Interns</span>
                            <span className="stat-value">{formatStat(stats.intern || 0)}</span>
                        </div>
                    </div>
                </div>

                {/* Hierarchy Tree */}
                <div className="tree-section">
                    <div className="tree">
                        <RecursiveAccordionTree nodes={treeData} />
                    </div>
                </div>
            </div>
        </AppLayout>
    );
};

export default DashboardPage;
