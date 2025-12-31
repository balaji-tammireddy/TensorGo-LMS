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
            link: 'https://drive.google.com/file/d/17VV62wq3nDbEjIsSUxjv2mvY1_r0J1my/view?usp=sharing'
        },
        {
            id: 'communication',
            title: 'Communication Policy',
            icon: <FaComments />,
            link: 'https://drive.google.com/file/d/12gEiPPZaMYDuviGUbCn5Z6YhMxh9DhF3/view?usp=sharing'
        },
        {
            id: 'dress-code',
            title: 'Dress Code Policy',
            icon: <FaUserTie />,
            link: 'https://drive.google.com/file/d/14iH2dyTRW5uHzEpkQEhlP17i0XIlNsH7/view?usp=sharing'
        },
        {
            id: 'leave',
            title: 'Leave Policy',
            icon: <FaCalendarAlt />,
            link: 'https://drive.google.com/file/d/1c8swrM5oyDk_uj8dDqv7pRkNMAY4-pbD/view?usp=sharing'
        },
        {
            id: 'quality',
            title: 'Quality Management Policy',
            icon: <FaCheckCircle />,
            link: 'https://drive.google.com/file/d/149A0PlIW6mzSKj4G4dcTWbaxN7A7mfmh/view?usp=sharing'
        },
        {
            id: 'wfo',
            title: 'WFO Policy',
            icon: <FaBuilding />,
            link: 'https://drive.google.com/file/d/1hn9wzeSyyD74TI4EXw9pQt3MaoFA6GNe/view?usp=sharing'
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
