import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from 'react-query';
import AppLayout from '../components/layout/AppLayout';
import { format } from 'date-fns';
import { Button } from '../components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { FaEye } from 'react-icons/fa';
import { useToast } from '../contexts/ToastContext';
import * as leaveService from '../services/leaveService';
import * as employeeService from '../services/employeeService';
import EmptyState from '../components/common/EmptyState';
import EmployeeLeaveDetailsModal from '../components/EmployeeLeaveDetailsModal';
import './EmployeeManagementPage.css'; // Reuse existing styles

const EmployeeLeaveHistoryPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { showError } = useToast();
    const [selectedLeaveRequest, setSelectedLeaveRequest] = React.useState<any>(null);
    const [isDetailsModalOpen, setIsDetailsModalOpen] = React.useState(false);

    const employeeId = id ? parseInt(id) : null;

    const { data: employee } = useQuery(
        ['employee', employeeId],
        () => id ? employeeService.getEmployeeById(parseInt(id)) : Promise.reject('No ID'),
        {
            enabled: !!id,
            onSuccess: (data: any) => {
                if ((data.role || data.employee?.role) === 'super_admin') {
                    showError('Super Admins do not have leave records');
                    navigate(`/employee-management/view/${id}`);
                }
            }
        }
    );

    const { data: balances, isLoading: balancesLoading } = useQuery(
        ['employee-leave-balances', employeeId],
        () => leaveService.getEmployeeLeaveBalances(employeeId!),
        {
            enabled: !!employeeId && (employee?.role || employee?.employee?.role) !== 'super_admin',
            retry: false,
            onError: () => showError('Failed to load leave balances')
        }
    );

    const { data: historyData, isLoading: historyLoading } = useQuery(
        ['employee-leave-requests', employeeId],
        () => leaveService.getEmployeeLeaveRequests(employeeId!, 1, 100),
        {
            enabled: !!employeeId && (employee?.role || employee?.employee?.role) !== 'super_admin',
            retry: false,
            onError: () => showError('Failed to load leave history')
        }
    );

    if (!employeeId) return null;

    const getStatusClass = (status: string) => {
        if (status === 'approved') return 'status-approved';
        if (status === 'rejected') return 'status-rejected';
        if (status === 'partially_approved') return 'status-partial';
        return 'status-pending';
    };

    const getStatusLabel = (status: string) => {
        if (status === 'approved') return 'Approved';
        if (status === 'rejected') return 'Rejected';
        if (status === 'partially_approved') return 'Partially Approved';
        return 'Pending';
    };

    return (
        <AppLayout>
            <div className="employee-management-page">
                <div className="page-header" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                    <Button variant="outline" onClick={() => navigate(`/employee-management/view/${id}`)} className="flex items-center gap-2">
                        <ArrowLeft className="h-4 w-4" /> Back to Details
                    </Button>
                </div>

                <div className="employee-details-container" style={{ backgroundColor: 'white', borderRadius: '8px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', height: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

                    {/* Balances Section */}
                    <div className="leave-details-fixed-header" style={{ marginBottom: '40px', flexShrink: 0 }}>
                        <h3 className="modal-section-heading">Leave Balances</h3>
                        {balancesLoading ? <div>Loading balances...</div> : (
                            <div className="modal-leave-balances">
                                <div className="modal-balance-card">
                                    <span className="modal-balance-label">Casual</span>
                                    <span className="modal-balance-value">{balances?.casual || 0}</span>
                                </div>
                                <div className="modal-balance-card">
                                    <span className="modal-balance-label">Sick</span>
                                    <span className="modal-balance-value">{balances?.sick || 0}</span>
                                </div>
                                <div className="modal-balance-card">
                                    <span className="modal-balance-label">LOP</span>
                                    <span className="modal-balance-value">{balances?.lop || 0}</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* History Section */}
                    <div className="leave-history-section" style={{ paddingBottom: '20px', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <h3 className="modal-section-heading" style={{ marginTop: '0', marginBottom: '15px', flexShrink: 0 }}>Leave History</h3>
                        {historyLoading ? <div>Loading history...</div> : (
                            <div className="leave-history-table-container" style={{ flex: 1, overflowY: 'auto', paddingBottom: '5px' }}>
                                {historyData?.requests && historyData.requests.length > 0 ? (
                                    <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '12px', minWidth: '100%' }}>
                                        <thead>
                                            <tr style={{ backgroundColor: '#f8f9fa' }}>
                                                <th style={{ padding: '12px 8px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid #e5e5e5', position: 'sticky', top: 0, zIndex: 10, backgroundColor: '#f8f9fa' }}>Applied Date</th>
                                                <th style={{ padding: '12px 8px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid #e5e5e5', position: 'sticky', top: 0, zIndex: 10, backgroundColor: '#f8f9fa' }}>Leave Type</th>
                                                <th style={{ padding: '12px 8px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid #e5e5e5', position: 'sticky', top: 0, zIndex: 10, backgroundColor: '#f8f9fa' }}>Start Date</th>
                                                <th style={{ padding: '12px 8px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid #e5e5e5', position: 'sticky', top: 0, zIndex: 10, backgroundColor: '#f8f9fa' }}>End Date</th>
                                                <th style={{ padding: '12px 8px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid #e5e5e5', position: 'sticky', top: 0, zIndex: 10, backgroundColor: '#f8f9fa' }}>Days</th>
                                                <th style={{ padding: '12px 8px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid #e5e5e5', position: 'sticky', top: 0, zIndex: 10, backgroundColor: '#f8f9fa' }}>Status</th>
                                                <th style={{ padding: '12px 8px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid #e5e5e5', position: 'sticky', top: 0, zIndex: 10, backgroundColor: '#f8f9fa' }}>Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {historyData.requests.map((request: any) => (
                                                <tr key={request.id} style={{ borderBottom: '1px solid #e5e5e5' }}>
                                                    <td style={{ padding: '10px 8px', borderBottom: '1px solid #e5e5e5', textAlign: 'left' }}>{format(new Date(request.appliedDate), 'dd/MM/yyyy')}</td>
                                                    <td style={{ padding: '10px 8px', borderBottom: '1px solid #e5e5e5', textAlign: 'left' }}>{request.leaveType === 'lop' ? 'LOP' : request.leaveType.charAt(0).toUpperCase() + request.leaveType.slice(1)}</td>
                                                    <td style={{ padding: '10px 8px', borderBottom: '1px solid #e5e5e5', textAlign: 'left' }}>{format(new Date(request.startDate), 'dd/MM/yyyy')}</td>
                                                    <td style={{ padding: '10px 8px', borderBottom: '1px solid #e5e5e5', textAlign: 'left' }}>{format(new Date(request.endDate), 'dd/MM/yyyy')}</td>
                                                    <td style={{ padding: '10px 8px', borderBottom: '1px solid #e5e5e5', textAlign: 'left' }}>{request.noOfDays}</td>
                                                    <td style={{ padding: '10px 8px', borderBottom: '1px solid #e5e5e5', textAlign: 'left' }}>
                                                        <span className={`status-badge ${getStatusClass(request.currentStatus)}`}>
                                                            {getStatusLabel(request.currentStatus)}
                                                        </span>
                                                    </td>

                                                    <td style={{ padding: '10px 8px', borderBottom: '1px solid #e5e5e5', textAlign: 'left' }}>
                                                        <div className="actions-wrapper" style={{ justifyContent: 'flex-start', display: 'flex' }}>
                                                            <button
                                                                className="action-btn view-btn"
                                                                onClick={() => {
                                                                    setSelectedLeaveRequest(request);
                                                                    setIsDetailsModalOpen(true);
                                                                }}
                                                                title="View Details"
                                                            >
                                                                <FaEye />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                ) : (
                                    <EmptyState title="No Leave Details" description="This employee hasn't applied for any leaves yet." />
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
            <EmployeeLeaveDetailsModal
                isOpen={isDetailsModalOpen}
                leaveRequest={selectedLeaveRequest}
                onClose={() => setIsDetailsModalOpen(false)}
            />
        </AppLayout>
    );
};

export default EmployeeLeaveHistoryPage;
