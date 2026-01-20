import React, { useRef, useState } from 'react';
import {
    FaLaptop,
    FaComments,
    FaUserTie,
    FaCalendarAlt,
    FaCheckCircle,
    FaBuilding,
    FaExternalLinkAlt,
    FaFileAlt,
    FaEdit,
    FaTrash,
    FaPlus,
    FaSpinner,
    FaTimes,
    FaCloudUploadAlt
} from 'react-icons/fa';
import AppLayout from '../components/layout/AppLayout';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { getPolicies, createPolicy, updatePolicy, deletePolicy } from '../services/policyService';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import ConfirmationDialog from '../components/ConfirmationDialog';
import './ViewPoliciesPage.css';

interface PolicyDisplay {
    id: string | number;
    title: string;
    icon: React.ReactNode;
    link: string;
}

const ViewPoliciesPage: React.FC = () => {
    const { user } = useAuth();
    const { showSuccess, showError } = useToast();
    const queryClient = useQueryClient();
    const fileInputRef = useRef<HTMLInputElement>(null);

    // State
    const [selectedPolicyId, setSelectedPolicyId] = useState<number | string | null>(null);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [newPolicyTitle, setNewPolicyTitle] = useState('');
    const [newPolicyFile, setNewPolicyFile] = useState<File | null>(null);

    // Confirmation Dialog State
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [policyToDelete, setPolicyToDelete] = useState<{ id: number | string, title: string } | null>(null);
    const [hiddenPolicyIds, setHiddenPolicyIds] = useState<string[]>(() => {
        try {
            const saved = localStorage.getItem('hidden_policy_ids');
            return saved ? JSON.parse(saved) : [];
        } catch (e) {
            return [];
        }
    });

    const canManage = user?.role === 'super_admin' || user?.role === 'hr';

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

    const defaultPolicies: PolicyDisplay[] = [
        {
            id: 'asset',
            title: 'Asset Management Policy',
            icon: <FaLaptop />,
            link: 'https://hr--lms.s3.us-east-va.io.cloud.ovh.us/policies/Asset Management Policy.pdf'
        },
        {
            id: 'communication',
            title: 'Communication Policy',
            icon: <FaComments />,
            link: 'https://hr--lms.s3.us-east-va.io.cloud.ovh.us/policies/Communication Policy.pdf'
        },
        {
            id: 'dress-code',
            title: 'Dress Code Policy',
            icon: <FaUserTie />,
            link: 'https://hr--lms.s3.us-east-va.io.cloud.ovh.us/policies/Dress Code Policy.pdf'
        },
        {
            id: 'leave',
            title: 'Leave Policy',
            icon: <FaCalendarAlt />,
            link: 'https://hr--lms.s3.us-east-va.io.cloud.ovh.us/policies/leave-policy.pdf'
        },
        {
            id: 'quality',
            title: 'Quality Management Policy',
            icon: <FaCheckCircle />,
            link: 'https://hr--lms.s3.us-east-va.io.cloud.ovh.us/policies/Quality Management Policy.pdf'
        },
        {
            id: 'work-hour',
            title: 'Work Hour Policy',
            icon: <FaBuilding />,
            link: 'https://hr--lms.s3.us-east-va.io.cloud.ovh.us/policies/Work Hour Policy.pdf'
        }
    ];

    // Queries
    const { data: policies, isLoading: loading } = useQuery(
        ['policies'],
        getPolicies,
        {
            staleTime: 5 * 60 * 1000,
            cacheTime: 5 * 60 * 1000,
            select: (data) => {
                const fetchedPolicies = (data || []).map((p: any) => ({
                    id: p.id,
                    title: p.title,
                    icon: getIconForTitle(p.title),
                    link: p.public_url
                }));

                // Overlay fetched policies on top of defaults where titles match
                // This prevents duplicates and makes defaults "editable" by replacing them
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
                return merged;
            },
            onError: (error) => {
                console.error('Error fetching policies:', error);
            }
        }
    );

    // Mutations
    const createMutation = useMutation(
        (data: { title: string; file: File }) => createPolicy(data.title, data.file),
        {
            onSuccess: () => {
                queryClient.invalidateQueries(['policies']);
                showSuccess('Policy added successfully');
            },
            onError: (error: any) => {
                showError(error.message || 'Failed to add policy');
            },
            onSettled: () => {
                closeAddModal();
            }
        }
    );

    const updateMutation = useMutation(
        ({ id, file }: { id: number | string, file: File }) => updatePolicy(id, file),
        {
            onSuccess: () => {
                queryClient.invalidateQueries(['policies']);
                showSuccess('Policy updated successfully');
            },
            onError: (error: any) => {
                showError(error.message || 'Failed to update policy');
            },
            onSettled: () => {
                setSelectedPolicyId(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        }
    );

    const deleteMutation = useMutation(
        (id: number | string) => deletePolicy(id),
        {
            onSuccess: () => {
                queryClient.invalidateQueries(['policies']);
                showSuccess('Policy deleted successfully');
            },
            onError: (error: any) => {
                showError(error.message || 'Failed to delete policy');
            },
            onSettled: () => {
                setDeleteConfirmOpen(false);
                setPolicyToDelete(null);
            }
        }
    );

    const isProcessing = createMutation.isLoading || updateMutation.isLoading || deleteMutation.isLoading;

    // Handlers
    const handleViewPolicy = (link: string, title: string) => {
        if (link === '#' || !link) {
            alert(`The document for "${title}" is currently being updated. Please check back later.`);
        } else {
            window.open(link, '_blank');
        }
    };

    const handleEditClick = (policyId: number | string) => {
        if (isProcessing) return;

        // No more blocking string IDs - we'll handle them in handleFileChange
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
                setSelectedPolicyId(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
                return;
            }

            // SMART EDIT: If this is a default policy (string ID), we CREATE it in the DB
            // using its title. Once created, our smart merging will replace the default.
            if (typeof selectedPolicyId === 'string' && isNaN(Number(selectedPolicyId))) {
                const defaultPolicy = defaultPolicies.find(p => p.id === selectedPolicyId);
                if (defaultPolicy) {
                    createMutation.mutate({ title: defaultPolicy.title, file });
                    return;
                }
            }

            // Normal update for existing DB policies
            updateMutation.mutate({ id: selectedPolicyId, file });
        } else {
            // If cancelled or no file, reset selection
            setSelectedPolicyId(null);
        }
    };

    const handleDeleteClick = (policyId: number | string, title: string) => {
        if (isProcessing) return;

        setPolicyToDelete({ id: policyId, title });
        setDeleteConfirmOpen(true);
    };

    const confirmDelete = () => {
        if (!policyToDelete) return;

        // If it's a default policy (string ID), we hide it locally
        if (typeof policyToDelete.id === 'string' && isNaN(Number(policyToDelete.id))) {
            const newHidden = [...hiddenPolicyIds, policyToDelete.id];
            setHiddenPolicyIds(newHidden);
            localStorage.setItem('hidden_policy_ids', JSON.stringify(newHidden));
            showSuccess('Policy removed from view');
            setDeleteConfirmOpen(false);
            setPolicyToDelete(null);
            return;
        }

        // Normal delete for DB policies
        deleteMutation.mutate(policyToDelete.id);
    };

    const openAddModal = () => {
        if (isProcessing) return;
        setIsAddModalOpen(true);
        setNewPolicyTitle('');
        setNewPolicyFile(null);
    };

    const closeAddModal = () => {
        if (createMutation.isLoading) return; // Prevent closing while uploading
        setIsAddModalOpen(false);
        setNewPolicyTitle('');
        setNewPolicyFile(null);
    };

    const handleCreateSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newPolicyTitle.trim()) {
            showError('Policy title is required');
            return;
        }
        if (!newPolicyFile) {
            showError('Please select a PDF file');
            return;
        }
        createMutation.mutate({ title: newPolicyTitle, file: newPolicyFile });
    };

    const displayPolicies = (policies || (loading ? [] : defaultPolicies)).filter(
        p => !hiddenPolicyIds.includes(p.id.toString())
    );

    return (
        <AppLayout>
            <div className="vp-container">
                <div className="vp-header">
                    <h1 className="page-title">Company Policies</h1>
                    {canManage && (
                        <button
                            className="vp-add-button"
                            onClick={openAddModal}
                            disabled={isProcessing}
                            style={{ opacity: isProcessing ? 0.6 : 1, cursor: isProcessing ? 'not-allowed' : 'pointer' }}
                        >
                            <FaPlus /> Add Policy
                        </button>
                    )}
                </div>

                {/* Hidden File Input for Edit */}
                <input
                    type="file"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    accept="application/pdf"
                    onChange={handleFileChange}
                />

                {loading ? (
                    <div className="vp-loading">Loading policies...</div>
                ) : (
                    <div className="vp-grid">
                        {displayPolicies.map((policy: PolicyDisplay) => (
                            <div key={policy.id} className="vp-card">
                                {canManage && (
                                    <button
                                        className="vp-delete-icon"
                                        onClick={() => handleDeleteClick(policy.id, policy.title)}
                                        title="Delete Policy"
                                        disabled={isProcessing}
                                    >
                                        <FaTrash />
                                    </button>
                                )}

                                <div className="vp-icon-wrapper">
                                    {policy.icon}
                                </div>
                                <h3 className="vp-policy-name">{policy.title}</h3>

                                <div className="vp-actions">
                                    <button
                                        className="vp-view-button"
                                        onClick={() => handleViewPolicy(policy.link, policy.title)}
                                        disabled={isProcessing}
                                        style={{ opacity: isProcessing ? 0.6 : 1, cursor: isProcessing ? 'not-allowed' : 'pointer' }}
                                    >
                                        View Policy <FaExternalLinkAlt style={{ fontSize: '12px', marginLeft: '8px' }} />
                                    </button>

                                    {canManage && (
                                        <button
                                            className="vp-view-button vp-edit-button"
                                            onClick={() => handleEditClick(policy.id)}
                                            disabled={isProcessing}
                                            style={{
                                                marginLeft: '0px',
                                                opacity: isProcessing ? 0.6 : 1,
                                                cursor: isProcessing ? 'not-allowed' : 'pointer'
                                            }}
                                        >
                                            {updateMutation.isLoading && selectedPolicyId === policy.id ? (
                                                <FaSpinner className="fa-spin" />
                                            ) : (
                                                <>
                                                    Edit <FaEdit style={{ fontSize: '12px', marginLeft: '8px' }} />
                                                </>
                                            )}
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {(!displayPolicies || displayPolicies.length === 0) && !loading && (
                    <div className="vp-no-data">
                        <p>No policies available at the moment.</p>
                    </div>
                )}

                {/* Add Policy Modal */}
                {isAddModalOpen && (
                    <div className="vp-modal-overlay">
                        <div className="vp-modal">
                            <div className="vp-modal-header">
                                <h2 className="vp-modal-title">Add New Policy</h2>
                                <button
                                    className="vp-close-button"
                                    onClick={closeAddModal}
                                    disabled={createMutation.isLoading}
                                >
                                    <FaTimes />
                                </button>
                            </div>
                            <form onSubmit={handleCreateSubmit}>
                                <div className="vp-form-group">
                                    <label className="vp-label">Policy Title</label>
                                    <input
                                        type="text"
                                        className="vp-input"
                                        value={newPolicyTitle}
                                        onChange={(e) => setNewPolicyTitle(e.target.value)}
                                        required
                                        disabled={createMutation.isLoading}
                                    />
                                </div>
                                <div className="vp-form-group">
                                    <label className="vp-label">Policy Document</label>
                                    <div className="vp-file-upload-container">
                                        <input
                                            type="file"
                                            id="policy-file-upload"
                                            className="vp-file-input-hidden"
                                            accept="application/pdf"
                                            onChange={(e) => setNewPolicyFile(e.target.files?.[0] || null)}
                                            required
                                            disabled={createMutation.isLoading}
                                        />
                                        <label htmlFor="policy-file-upload" className="vp-file-upload-label">
                                            <FaCloudUploadAlt className="vp-upload-icon" />
                                            <span className="vp-upload-text">
                                                {newPolicyFile ? newPolicyFile.name : "Choose PDF file"}
                                            </span>
                                        </label>
                                    </div>
                                </div>
                                <div className="vp-modal-footer">
                                    <button
                                        type="button"
                                        className="vp-cancel-button"
                                        onClick={closeAddModal}
                                        disabled={createMutation.isLoading}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="vp-save-button"
                                        disabled={createMutation.isLoading || !newPolicyTitle.trim() || !newPolicyFile}
                                    >
                                        {createMutation.isLoading ? 'Adding...' : 'Add Policy'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Delete Confirmation Dialog */}
                <ConfirmationDialog
                    isOpen={deleteConfirmOpen}
                    title="Delete Policy"
                    message={`Are you sure you want to delete "${policyToDelete?.title}"? This action cannot be undone.`}
                    confirmText="Delete"
                    onConfirm={confirmDelete}
                    onCancel={() => !deleteMutation.isLoading && setDeleteConfirmOpen(false)}
                    isLoading={deleteMutation.isLoading}
                />
            </div>
        </AppLayout>
    );
};

export default ViewPoliciesPage;
