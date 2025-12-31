import React from 'react';
import {
    FaLaptop,
    FaComments,
    FaUserTie,
    FaCalendarAlt,
    FaCheckCircle,
    FaBuilding,
    FaExternalLinkAlt
} from 'react-icons/fa';
import AppLayout from '../components/layout/AppLayout';
import './ViewPoliciesPage.css';

interface Policy {
    id: string;
    title: string;
    icon: React.ReactNode;
    link: string;
}

const ViewPoliciesPage: React.FC = () => {
    // Define the policies requested
    const policies: Policy[] = [
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
            link: 'https://hr--lms.s3.us-east-va.io.cloud.ovh.us/policies/communication-policy.pdf'
        },
        {
            id: 'dress-code',
            title: 'Dress Code Policy',
            icon: <FaUserTie />,
            link: 'https://hr--lms.s3.us-east-va.io.cloud.ovh.us/policies/dress-code-policy.pdf'
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
            id: 'wfo',
            title: 'WFO Policy',
            icon: <FaBuilding />,
            link: 'https://hr--lms.s3.us-east-va.io.cloud.ovh.us/policies/wfo-policy.pdf'
        }
    ];

    const handleViewPolicy = (link: string, title: string) => {
        if (link === '#') {
            alert(`The document for "${title}" is currently being updated. Please check back later.`);
        } else {
            window.open(link, '_blank');
        }
    };

    return (
        <AppLayout>
            <div className="vp-container">
                <h1 className="vp-title">Company Policies</h1>

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
                                View Policy <FaExternalLinkAlt style={{ fontSize: '12px' }} />
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </AppLayout>
    );
};

export default ViewPoliciesPage;
