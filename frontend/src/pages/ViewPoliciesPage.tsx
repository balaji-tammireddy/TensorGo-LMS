import React, { useEffect, useState } from 'react';
import {
    FaLaptop,
    FaComments,
    FaUserTie,
    FaCalendarAlt,
    FaCheckCircle,
    FaBuilding,
    FaExternalLinkAlt,
    FaFileAlt
} from 'react-icons/fa';
import AppLayout from '../components/layout/AppLayout';
import { getPolicies, PolicyData } from '../services/policyService';
import './ViewPoliciesPage.css';

interface PolicyDisplay {
    id: string | number;
    title: string;
    icon: React.ReactNode;
    link: string;
}

const ViewPoliciesPage: React.FC = () => {
    const [policies, setPolicies] = useState<PolicyDisplay[]>([]);
    const [loading, setLoading] = useState(true);

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

    useEffect(() => {
        const fetchPolicies = async () => {
            try {
                const data: PolicyData[] = await getPolicies();
                if (data && data.length > 0) {
                    const mapped = data.map(p => ({
                        id: p.id,
                        title: p.title,
                        icon: getIconForTitle(p.title),
                        link: p.public_url
                    }));
                    setPolicies(mapped);
                } else {
                    // Fallback to defaults if none in DB
                    setPolicies(defaultPolicies);
                }
            } catch (error) {
                console.error('Error fetching policies:', error);
                setPolicies(defaultPolicies);
            } finally {
                setLoading(false);
            }
        };

        fetchPolicies();
    }, []);

    const defaultPolicies: PolicyDisplay[] = [
        {
            id: 'asset',
            title: 'Asset Management Policy',
            icon: <FaLaptop />,
            link: 'https://hr--lms.s3.us-east-va.io.cloud.ovh.us/policies/asset-management-policy.pdf'
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
            link: 'https://hr--lms.s3.us-east-va.io.cloud.ovh.us/policies/quality-management-policy.pdf'
        },
        {
            id: 'work-hour',
            title: 'Work Hour Policy',
            icon: <FaBuilding />,
            link: 'https://hr--lms.s3.us-east-va.io.cloud.ovh.us/policies/work-hour-policy.pdf'
        }
    ];

    const handleViewPolicy = (link: string, title: string) => {
        if (link === '#' || !link) {
            alert(`The document for "${title}" is currently being updated. Please check back later.`);
        } else {
            window.open(link, '_blank');
        }
    };

    return (
        <AppLayout>
            <div className="vp-container">
                <div className="vp-header">
                    <h1 className="page-title">Company Policies</h1>

                </div>

                {loading ? (
                    <div className="vp-loading">Loading policies...</div>
                ) : (
                    <div className="vp-grid">
                        {policies.map((policy) => (
                            <div key={policy.id} className="vp-card">
                                <div className="vp-icon-wrapper">
                                    {policy.icon}
                                </div>
                                <h3 className="vp-policy-name">{policy.title}</h3>
                                <button
                                    className="vp-view-button"
                                    onClick={() => handleViewPolicy(policy.link, policy.title)}
                                >
                                    View Policy <FaExternalLinkAlt style={{ fontSize: '12px', marginLeft: '8px' }} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {policies.length === 0 && !loading && (
                    <div className="vp-no-data">
                        <p>No policies available at the moment.</p>
                    </div>
                )}
            </div>
        </AppLayout>
    );
};

export default ViewPoliciesPage;
