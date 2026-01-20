import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from 'react-query';
import AppLayout from '../components/layout/AppLayout';
import * as dashboardService from '../services/dashboardService';
import * as policyService from '../services/policyService';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import {
    FaLaptop,
    FaComments,
    FaUserTie,
    FaCalendarAlt,
    FaCheckCircle,
    FaBuilding,
    FaFileAlt,
    FaExternalLinkAlt,
    FaEdit,
    FaTrash,
    FaPlus,
    FaCloudUploadAlt,
    FaTimes,
    FaSpinner
} from 'react-icons/fa';
import './DashboardPage.css';
import './ViewPoliciesPage.css'; // Reuse policy card styles
import ConfirmationDialog from '../components/ConfirmationDialog';

const formatStat = (num: number) => {
    if (isNaN(num)) return '00';
    return num < 10 ? `0${num}` : `${num}`;
};

const DashboardPage: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { showSuccess, showError } = useToast();
    const queryClient = useQueryClient();
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    // State for Policies
    const [selectedPolicyId, setSelectedPolicyId] = React.useState<number | string | null>(null);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);
    const [policyToDelete, setPolicyToDelete] = React.useState<{ id: number | string, title: string } | null>(null);
    const [hiddenPolicyIds, setHiddenPolicyIds] = React.useState<string[]>(() => {
        try {
            const saved = localStorage.getItem('hidden_policy_ids');
            return saved ? JSON.parse(saved) : [];
        } catch (e) {
            return [];
        }
    });

    const canManage = user?.role === 'super_admin' || user?.role === 'hr';

    // Fetch stats
    const { data: statsData } = useQuery('dashboardStats', dashboardService.getStats, {
        refetchOnWindowFocus: false,
        staleTime: 30000 // 30 seconds
    });

    // Fetch policies
    const { data: policies, isLoading: loadingPolicies } = useQuery(['policies'], () => policyService.getPolicies(), {
        select: (data) => {
            const fetchedPolicies = (data || []).map((p: any) => ({
                id: p.id,
                title: p.title,
                icon: getIconForTitle(p.title),
                link: p.public_url
            }));

            // Smart merging logic
            const merged = [...defaultPolicies];
            fetchedPolicies.forEach(fetched => {
                const index = merged.findIndex(d =>
                    d.title.toLowerCase().replace(/\s+/g, ' ').trim() ===
                    fetched.title.toLowerCase().replace(/\s+/g, ' ').trim()
                );
                if (index !== -1) {
                    merged[index] = fetched;
                } else {
                    merged.push(fetched);
                }
            });
            return merged.filter(p => !hiddenPolicyIds.includes(p.id.toString()));
        }
    });

    const updateMutation = useMutation(
        ({ id, file }: { id: number | string, file: File }) => policyService.updatePolicy(id, file),
        {
            onSuccess: () => {
                queryClient.invalidateQueries(['policies']);
                showSuccess('Policy updated successfully');
            },
            onError: (error: any) => showError(error.message || 'Failed to update policy'),
            onSettled: () => {
                setSelectedPolicyId(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        }
    );

    const createMutation = useMutation(
        ({ title, file }: { title: string, file: File }) => policyService.createPolicy(title, file),
        {
            onSuccess: () => {
                queryClient.invalidateQueries(['policies']);
                showSuccess('Policy uploaded successfully');
            },
            onError: (error: any) => showError(error.message || 'Failed to upload policy')
        }
    );

    const deleteMutation = useMutation(
        (id: number | string) => policyService.deletePolicy(id),
        {
            onSuccess: () => {
                queryClient.invalidateQueries(['policies']);
                showSuccess('Policy deleted successfully');
            },
            onError: (error: any) => showError(error.message || 'Failed to delete policy'),
            onSettled: () => {
                setDeleteConfirmOpen(false);
                setPolicyToDelete(null);
            }
        }
    );

    const isProcessing = updateMutation.isLoading || deleteMutation.isLoading || createMutation.isLoading;

    const handleViewPolicy = (link: string) => {
        if (link && link !== '#') {
            window.open(link, '_blank');
        } else {
            showError('Policy document not available');
        }
    };

    const handleEditClick = (policyId: number | string) => {
        if (isProcessing) return;
        setSelectedPolicyId(policyId);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
            fileInputRef.current.click();
        }
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file && selectedPolicyId) {
            if (file.type !== 'application/pdf') {
                showError('Only PDF files are allowed');
                return;
            }

            if (typeof selectedPolicyId === 'string' && isNaN(Number(selectedPolicyId))) {
                const dp = defaultPolicies.find(p => p.id === selectedPolicyId);
                if (dp) {
                    createMutation.mutate({ title: dp.title, file });
                    return;
                }
            }
            updateMutation.mutate({ id: selectedPolicyId, file });
        }
    };

    const handleDeleteClick = (policyId: number | string, title: string) => {
        if (isProcessing) return;
        setPolicyToDelete({ id: policyId, title });
        setDeleteConfirmOpen(true);
    };

    const confirmDelete = () => {
        if (!policyToDelete) return;
        if (typeof policyToDelete.id === 'string' && isNaN(Number(policyToDelete.id))) {
            const newHidden = [...hiddenPolicyIds, policyToDelete.id];
            setHiddenPolicyIds(newHidden);
            localStorage.setItem('hidden_policy_ids', JSON.stringify(newHidden));
            showSuccess('Policy removed from view');
            setDeleteConfirmOpen(false);
            setPolicyToDelete(null);
            return;
        }
        deleteMutation.mutate(policyToDelete.id);
    };

    const stats = statsData?.breakdown || {};

    const handleStatClick = (role?: string) => {
        if (role) {
            navigate(`/employee-management?role=${role}`);
        } else {
            navigate('/employee-management');
        }
    };

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

                {/* Policies Section */}
                <div className="dashboard-policies-section">
                    <div className="vp-header" style={{ marginBottom: '20px' }}>
                        <h2 className="section-title">Company Policies</h2>
                        {canManage && (
                            <button className="vp-add-button" onClick={() => navigate('/view-policies')}>
                                <FaPlus /> Manage All
                            </button>
                        )}
                    </div>

                    <input
                        type="file"
                        ref={fileInputRef}
                        style={{ display: 'none' }}
                        accept="application/pdf"
                        onChange={handleFileChange}
                    />

                    {loadingPolicies ? (
                        <div className="vp-loading">Loading policies...</div>
                    ) : (
                        <div className="vp-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
                            {policies?.slice(0, 4).map((policy: any) => (
                                <div key={policy.id} className="vp-card">
                                    {canManage && (
                                        <button
                                            className="vp-delete-icon"
                                            onClick={() => handleDeleteClick(policy.id, policy.title)}
                                        >
                                            <FaTrash />
                                        </button>
                                    )}
                                    <div className="vp-icon-wrapper">{policy.icon}</div>
                                    <h3 className="vp-policy-name">{policy.title}</h3>
                                    <div className="vp-actions">
                                        <button className="vp-view-button" onClick={() => handleViewPolicy(policy.link)}>
                                            View <FaExternalLinkAlt style={{ fontSize: '11px', marginLeft: '6px' }} />
                                        </button>
                                        {canManage && (
                                            <button className="vp-view-button vp-edit-button" onClick={() => handleEditClick(policy.id)}>
                                                {updateMutation.isLoading && selectedPolicyId === policy.id ? <FaSpinner className="fa-spin" /> : <>Edit <FaEdit style={{ fontSize: '11px', marginLeft: '6px' }} /></>}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <ConfirmationDialog
                    isOpen={deleteConfirmOpen}
                    title="Delete Policy"
                    message={`Are you sure you want to delete "${policyToDelete?.title}"?`}
                    confirmText="Delete"
                    onConfirm={confirmDelete}
                    onCancel={() => !deleteMutation.isLoading && setDeleteConfirmOpen(false)}
                    isLoading={deleteMutation.isLoading}
                />
            </div>
        </AppLayout>
    );
};

// Reuse helpers from ViewPoliciesPage
const getIconForTitle = (title: string) => {
    const lowerTitle = title.toLowerCase();
    if (lowerTitle.includes('asset')) return <FaLaptop />;
    if (lowerTitle.includes('communication')) return <FaComments />;
    if (lowerTitle.includes('dress')) return <FaUserTie />;
    if (lowerTitle.includes('leave')) return <FaCalendarAlt />;
    if (lowerTitle.includes('quality')) return <FaCheckCircle />;
    if (lowerTitle.includes('wfo') || lowerTitle.includes('office') || lowerTitle.includes('work')) return <FaBuilding />;
    return <FaFileAlt />;
};

const defaultPolicies = [
    { id: 'asset', title: 'Asset Management Policy', link: '#' },
    { id: 'communication', title: 'Communication Policy', link: '#' },
    { id: 'dress-code', title: 'Dress Code Policy', link: '#' },
    { id: 'leave', title: 'Leave Policy', link: '#' }
];

export default DashboardPage;
