import React, { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight, CheckCircle, XCircle, Search, Download, Clock, FileText, ChevronsUpDown, ChevronUp, ChevronDown } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import { timesheetService, TimesheetEntry } from '../../services/timesheetService';
import AppLayout from '../../components/layout/AppLayout';
import { Button } from '../../components/ui/button';

import { TimesheetReportModal } from '../../components/timesheet/TimesheetReportModal';
import './TimesheetApprovalPage.css';

interface TeamMemberStatus {
    id: number;
    name: string;
    emp_id: string;
    designation: string;
    reporting_manager_id: number;
    total_hours: number;
    status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'pending_submission';
    is_late: boolean;
    is_resubmission: boolean;
}

export const TimesheetApprovalPage: React.FC = () => {
    const { user } = useAuth();
    const { showSuccess, showError } = useToast();

    // -- Date Logic --
    // Default week logic:
    // Before Sunday 9 PM -> Default to Previous Week
    // After Sunday 9 PM -> Default to Current Week (just submitted)
    const [currentDate, setCurrentDate] = useState(() => {
        const now = new Date();
        const d = new Date(now);
        // Strictly show previous week for approvals
        d.setDate(d.getDate() - 7);
        return d;
    });

    // Helpers
    const formatDate = (date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const getWeekRange = (date: Date) => {
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Monday
        const monday = new Date(date);
        monday.setDate(diff);
        const saturday = new Date(monday);
        saturday.setDate(monday.getDate() + 5); // Monday to Saturday
        return { start: monday, end: saturday };
    };

    const weekRange = useMemo(() => getWeekRange(currentDate), [currentDate]);

    // -- State --
    const [teamMembers, setTeamMembers] = useState<TeamMemberStatus[]>([]);
    const [filteredMembers, setFilteredMembers] = useState<TeamMemberStatus[]>([]);
    const [searchQuery, setSearchQuery] = useState('');

    const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
    const [memberEntries, setMemberEntries] = useState<TimesheetEntry[]>([]);

    // -- Actions State --
    const [rejectModalOpen, setRejectModalOpen] = useState(false);
    const [entryToReject, setEntryToReject] = useState<number | null>(null);
    const [rejectionReason, setRejectionReason] = useState('');

    const [processingAction, setProcessingAction] = useState(false);
    const [isLoadingEntries, setIsLoadingEntries] = useState(false);

    const [reportModalOpen, setReportModalOpen] = useState(false);

    // -- Table Filters & Sorting State --
    const [globalTableSearch, setGlobalTableSearch] = useState('');
    const [tableFilters, setTableFilters] = useState({
        work_status: '',
        log_status: ''
    });

    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' | null }>({
        key: 'log_date',
        direction: 'asc'
    });

    const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
    const [activeActionMenu, setActiveActionMenu] = useState<number | null>(null);

    const resetTableFilters = () => {
        setGlobalTableSearch('');
        setTableFilters({
            work_status: '',
            log_status: ''
        });
        setSortConfig({ key: 'log_date', direction: 'asc' });
    };

    const handleSort = (key: string) => {
        if (key === 'Work Status' || key === 'Status / Action') {
            setActiveDropdown(activeDropdown === key ? null : key);
            return;
        }
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    // Filtered & Sorted Entries Calculation
    const processedEntries = useMemo(() => {
        const filtered = memberEntries.filter(entry => {
            // Global text search
            const searchFields = [
                entry.project_name || 'System',
                entry.module_name || '—',
                entry.task_name || '—',
                entry.description || '—',
                entry.log_date || '',
                Number(entry.duration).toFixed(1) + 'h'
            ].map(f => f.toLowerCase());

            const searchStr = globalTableSearch.toLowerCase();
            const matchesGlobal = !searchStr || searchFields.some(field => field.includes(searchStr));

            // Status filters (dropdowns)
            const matchesWork = !tableFilters.work_status || entry.work_status === tableFilters.work_status;
            const matchesLog = !tableFilters.log_status || entry.log_status === tableFilters.log_status;

            return matchesGlobal && matchesWork && matchesLog;
        });

        if (sortConfig.key && sortConfig.direction) {
            filtered.sort((a: any, b: any) => {
                let aVal, bVal;

                switch (sortConfig.key) {
                    case 'Project': aVal = a.project_name || 'System'; bVal = b.project_name || 'System'; break;
                    case 'Module': aVal = a.module_name || ''; bVal = b.module_name || ''; break;
                    case 'Task': aVal = a.task_name || ''; bVal = b.task_name || ''; break;
                    case 'Date': aVal = a.log_date; bVal = b.log_date; break;
                    case 'Time': aVal = Number(a.duration); bVal = Number(b.duration); break;
                    case 'Work Status': aVal = a.work_status || ''; bVal = b.work_status || ''; break;
                    case 'Status / Action': aVal = a.log_status || ''; bVal = b.log_status || ''; break;
                    default: aVal = a[sortConfig.key]; bVal = b[sortConfig.key];
                }

                if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return filtered;
    }, [memberEntries, tableFilters, sortConfig, globalTableSearch]);

    // -- Effects --
    useEffect(() => {
        fetchTeamStatus();
    }, [weekRange]);

    useEffect(() => {
        if (selectedMemberId) {
            fetchMemberEntries(selectedMemberId);
            resetTableFilters();
        }
    }, [selectedMemberId, weekRange]);

    useEffect(() => {
        if (!searchQuery) {
            setFilteredMembers(teamMembers);
        } else {
            const lower = searchQuery.toLowerCase();
            setFilteredMembers(teamMembers.filter(m =>
                m.name.toLowerCase().includes(lower) ||
                m.emp_id.toLowerCase().includes(lower)
            ));
        }
    }, [searchQuery, teamMembers]);

    // Close dropdowns on outside click
    useEffect(() => {
        const handleClickOutside = () => {
            setActiveDropdown(null);
            setActiveActionMenu(null);
        };
        window.addEventListener('click', handleClickOutside);
        return () => window.removeEventListener('click', handleClickOutside);
    }, []);

    // -- Fetchers --
    const fetchTeamStatus = async () => {
        try {
            const startStr = formatDate(weekRange.start);
            const endStr = formatDate(weekRange.end);
            const data = await timesheetService.getTeamStatus(startStr, endStr);
            setTeamMembers(data);

            // If currently selected member is in the list, update their status reference? 
            // Doesn't matter much unless we want to reflect total hours updates immediately.
        } catch (err) {
            console.error(err);
            showError('Failed to load team status');
        }
    };

    const fetchMemberEntries = async (userId: number) => {
        setMemberEntries([]); // Clear stale data first
        setIsLoadingEntries(true);
        try {
            const startStr = formatDate(weekRange.start);
            const endStr = formatDate(weekRange.end);
            const data = await timesheetService.getMemberEntries(userId, startStr, endStr);
            setMemberEntries(data);
        } catch (err: any) {
            console.error('[ApprovalPage] Fetch Member error:', err);
            const status = err.response?.status;
            if (status === 401) {
                showError('Your session has expired. Please log in again.');
            } else if (status === 403) {
                showError('You are not authorized to view this user\'s timesheet.');
            } else {
                showError('Unable to load member timesheet. Please try again.');
            }
            // Keep the selection but clear entries to show empty/error state
            setMemberEntries([]);
        } finally {
            setIsLoadingEntries(false);
        }
    };

    // -- Handlers --
    const handleApproveWeek = async () => {
        if (!selectedMemberId || processingAction) return;

        // Optimistic Update
        const previousEntries = [...memberEntries];
        const previousMembers = [...teamMembers];

        setMemberEntries(prev => prev.map(e => ({ ...e, log_status: 'approved' })));
        setTeamMembers(prev => prev.map(m => m.id === selectedMemberId ? { ...m, status: 'approved' } : m));

        setProcessingAction(true);
        try {
            const startStr = formatDate(weekRange.start);
            const endStr = formatDate(weekRange.end);
            await timesheetService.approveTimesheet(selectedMemberId, startStr, endStr);
            showSuccess('Timesheet approved successfully');
            fetchTeamStatus();
            fetchMemberEntries(selectedMemberId);
        } catch (err: any) {
            // Rollback on error
            setMemberEntries(previousEntries);
            setTeamMembers(previousMembers);
            showError(err.response?.data?.error || err.message || 'Failed to approve');
        } finally {
            setProcessingAction(false);
        }
    };


    // -- Per-entry actions --
    const handleApproveEntry = async (entryId: number) => {
        if (processingAction) return;
        const prev = [...memberEntries];
        setMemberEntries(p => p.map(e => e.id === entryId ? { ...e, log_status: 'approved' } : e));
        setProcessingAction(true);
        try {
            await timesheetService.approveEntry(entryId);
            showSuccess('Entry approved');
            if (selectedMemberId) fetchMemberEntries(selectedMemberId);
            fetchTeamStatus();
        } catch (err: any) {
            setMemberEntries(prev);
            showError(err.response?.data?.error || err.message || 'Failed to approve');
        } finally {
            setProcessingAction(false);
        }
    };

    const openRejectEntry = (entryId: number) => {
        setEntryToReject(entryId);
        setRejectionReason('');
        setRejectModalOpen(true);
    };

    const confirmRejectEntry = async () => {
        if (!entryToReject || !rejectionReason.trim() || processingAction) {
            if (!rejectionReason.trim()) showError('Please provide a reason');
            return;
        }
        const prev = [...memberEntries];
        setMemberEntries(p => p.map(e => e.id === entryToReject ? { ...e, log_status: 'rejected', rejection_reason: rejectionReason } : e));
        setProcessingAction(true);
        try {
            await timesheetService.rejectEntry(entryToReject, rejectionReason);
            showSuccess('Entry rejected');
            setRejectModalOpen(false);
            if (selectedMemberId) fetchMemberEntries(selectedMemberId);
            fetchTeamStatus();
        } catch (err: any) {
            setMemberEntries(prev);
            showError(err.response?.data?.error || err.message || 'Failed to reject');
        } finally {
            setProcessingAction(false);
        }
    };

    const changeWeek = (offset: number) => {
        const newDate = new Date(currentDate);
        newDate.setDate(newDate.getDate() + (offset * 7));
        setCurrentDate(newDate);
    };


    const selectedMember = teamMembers.find(m => m.id === selectedMemberId);
    const isReportingManager = selectedMember && String(selectedMember.reporting_manager_id) === String(user?.id);
    const canApprove = isReportingManager && selectedMemberId !== user?.id;

    return (
        <AppLayout>
            <div className="timesheet-container">
                <div className="timesheet-header">
                    <div className="timesheet-title">
                        <h1>Timesheet Approvals</h1>
                    </div>

                    <div className="header-actions">
                        {['hr', 'super_admin'].includes(user?.role || '') && (
                            <Button
                                variant="outline"
                                onClick={() => setReportModalOpen(true)}
                                style={{ display: 'flex', gap: '8px', alignItems: 'center' }}
                            >
                                <Download size={16} />
                                Reports
                            </Button>
                        )}

                        <div className="week-navigator">
                            <button className="nav-btn" onClick={() => changeWeek(-1)}><ChevronLeft size={20} /></button>
                            <span className="current-week-display">
                                {(() => {
                                    const d1 = String(weekRange.start.getDate()).padStart(2, '0');
                                    const m1 = String(weekRange.start.getMonth() + 1).padStart(2, '0');
                                    const y1 = weekRange.start.getFullYear();
                                    const d2 = String(weekRange.end.getDate()).padStart(2, '0');
                                    const m2 = String(weekRange.end.getMonth() + 1).padStart(2, '0');
                                    const y2 = weekRange.end.getFullYear();
                                    return `${d1}-${m1}-${y1} - ${d2}-${m2}-${y2}`;
                                })()}
                            </span>
                            <button
                                className="nav-btn"
                                onClick={() => changeWeek(1)}
                                disabled={(() => {
                                    const { start: todayWeekStart } = getWeekRange(new Date());
                                    const { start: viewWeekStart } = getWeekRange(currentDate);

                                    // Disable "Next" if current view is already the previous week
                                    // (i.e., we don't want them to reach or see the current active week)
                                    return viewWeekStart >= new Date(todayWeekStart.setDate(todayWeekStart.getDate() - 7));
                                })()}
                                style={{
                                    opacity: (() => {
                                        const { start: todayWeekStart } = getWeekRange(new Date());
                                        const { start: viewWeekStart } = getWeekRange(currentDate);
                                        return viewWeekStart >= new Date(todayWeekStart.setDate(todayWeekStart.getDate() - 7));
                                    })() ? 0.3 : 1, cursor: 'pointer'
                                }}
                            >
                                <ChevronRight size={20} />
                            </button>
                        </div>
                    </div>
                </div>

                <div className="timesheet-layout">
                    {/* Left: Employee List */}
                    <div className="employee-list-card">
                        <div className="employee-search-box">
                            <div style={{ position: 'relative' }}>
                                <Search size={16} style={{ position: 'absolute', left: 10, top: 12, color: '#94a3b8' }} />
                                <input
                                    className="search-input"
                                    style={{ paddingLeft: '32px' }}
                                    placeholder="Search employees..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="employee-list">
                            {filteredMembers.map(member => (
                                <div
                                    key={member.id}
                                    className={`employee-item ${selectedMemberId === member.id ? 'active' : ''}`}
                                    onClick={() => setSelectedMemberId(member.id)}
                                >
                                    <div className="emp-info">
                                        <span className="emp-name">{member.name}</span>
                                        <span className="emp-role">{member.designation}</span>
                                    </div>
                                </div>
                            ))}
                            {filteredMembers.length === 0 && (
                                <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                                    No employees found.
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right: Details */}
                    <div className="entries-list-card">
                        {!selectedMemberId ? (
                            <div className="ts-empty-state animate-fadeIn" style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                <div className="animate-float" style={{
                                    width: '80px',
                                    height: '80px',
                                    background: '#f8fafc',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '50%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    marginBottom: '24px',
                                    margin: '0 auto 24px auto'
                                }}>
                                    <Search size={32} style={{ color: '#cbd5e1' }} />
                                </div>
                                <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#334155', marginBottom: '8px' }}>Select an Employee</h3>
                                <p style={{ fontSize: '14px', maxWidth: '300px', textAlign: 'center', lineHeight: '1.5', margin: '0 auto' }}>
                                    Choose a team member from the list to view their timesheet, approve logs, or check submission status.
                                </p>
                            </div>
                        ) : (
                            <div className="animate-fadeIn">
                                {/* Header / Action Bar */}
                                <div style={{
                                    padding: '24px',
                                    borderBottom: '1px solid #f1f5f9',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    background: '#fff',
                                    borderRadius: '12px 12px 0 0',
                                    overflow: 'hidden', // Extra safety
                                    gap: '16px'
                                }}>
                                    <div style={{ minWidth: 0, flex: 1 }}>
                                        <h2 style={{
                                            fontSize: '20px',
                                            fontWeight: 700,
                                            color: '#1e293b',
                                            margin: 0,
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis'
                                        }}>
                                            {selectedMember?.name}
                                        </h2>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
                                            <span style={{ fontSize: '13px', color: '#64748b' }}>{selectedMember?.emp_id}</span>
                                            <span style={{ color: '#cbd5e1' }}>•</span>
                                            <span style={{ fontSize: '13px', fontWeight: 600, color: '#2563eb', whiteSpace: 'nowrap' }}>{selectedMember?.total_hours.toFixed(1)} Hrs Logged</span>
                                        </div>
                                    </div>

                                    <div className="action-bar-badge-container" style={{ flexShrink: 0 }}>
                                        {(() => {
                                            if (selectedMemberId === user?.id) {
                                                return <div className="logged-hours-badge warning">Self Approval Disabled</div>;
                                            }

                                            const totalHours = selectedMember?.total_hours || 0;
                                            const criteriaMet = totalHours >= 40;
                                            const hasActionable = memberEntries.some(e => e.log_status === 'submitted');
                                            const isAllApproved = memberEntries.length > 0 && memberEntries.every(e => e.log_status === 'approved');
                                            const isAllRejected = memberEntries.length > 0 && memberEntries.every(e => e.log_status === 'rejected');
                                            const allReviewed = memberEntries.length > 0 && memberEntries.every(e => e.log_status === 'approved' || e.log_status === 'rejected');

                                            if (isLoadingEntries) return <div className="logged-hours-badge neutral"><Clock size={14} className="animate-spin" style={{ marginRight: 6 }} /> Loading...</div>;
                                            if (memberEntries.length === 0) return <div className="logged-hours-badge neutral">No Logs</div>;

                                            if (criteriaMet) {
                                                if (hasActionable) {
                                                    return canApprove ? (
                                                        <button className="bulk-approve-btn" onClick={handleApproveWeek} disabled={processingAction}>
                                                            {processingAction ? <Clock size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                                                            {processingAction ? 'Processing...' : 'Approve Week'}
                                                        </button>
                                                    ) : (
                                                        <div className="logged-hours-badge info"><Clock size={14} style={{ marginRight: 4 }} /> Submitted</div>
                                                    );
                                                }
                                                if (isAllApproved) return <div className="logged-hours-badge success"><CheckCircle size={14} style={{ marginRight: 4 }} /> Approved</div>;
                                                if (isAllRejected) return <div className="logged-hours-badge danger"><XCircle size={14} style={{ marginRight: 4 }} /> Rejected</div>;
                                                if (allReviewed) return <div className="logged-hours-badge info"><CheckCircle size={14} style={{ marginRight: 4 }} /> Reviewed</div>;
                                                return <div className="logged-hours-badge warning" style={{ whiteSpace: 'nowrap' }}>Pending Resubmission</div>;
                                            }
                                            return <div className="logged-hours-badge danger" style={{ whiteSpace: 'nowrap' }}>Criteria Not Met</div>;
                                        })()}
                                    </div>
                                </div>

                                {/* Status Banner (Warning) */}
                                {(() => {
                                    const totalHours = selectedMember?.total_hours || 0;
                                    const criteriaMet = totalHours >= 40;
                                    const hasActionable = memberEntries.some(e => e.log_status === 'submitted');
                                    const allReviewed = memberEntries.length > 0 && memberEntries.every(e => e.log_status === 'approved' || e.log_status === 'rejected');

                                    if (weekRange.end < new Date() && !criteriaMet && selectedMemberId !== user?.id && !hasActionable && !allReviewed) {
                                        return (
                                            <div className="animate-fadeIn" style={{ margin: '16px 24px 0', padding: '12px 16px', borderRadius: '8px', background: '#fef2f2', border: '1px solid #fee2e2', display: 'flex', alignItems: 'center', gap: '12px', color: '#b91c1c' }}>
                                                <div className="animate-pulse-red" style={{ padding: '6px', background: '#fff', borderRadius: '50%', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                                                    <XCircle size={20} color="#ef4444" />
                                                </div>
                                                <div>
                                                    <h3 style={{ margin: '0', fontSize: '14px', fontWeight: 600 }}>Submission Criteria Not Met</h3>
                                                    <p style={{ margin: 0, fontSize: '12px', opacity: 0.9 }}>User has logged only {totalHours.toFixed(1)}h (min 40h required).</p>
                                                </div>
                                            </div>
                                        );
                                    }
                                    return null;
                                })()}

                                {/* Log Table Section */}
                                <div style={{ padding: '24px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: 600, color: '#1e293b' }}>
                                            <FileText size={18} />
                                            Weekly Log Table
                                        </span>
                                        <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', background: '#f1f5f9', borderRadius: '6px', padding: '4px 8px' }}>
                                            {formatDate(weekRange.start)} — {formatDate(weekRange.end)}
                                        </span>
                                    </div>

                                    {/* Global Search Bar */}
                                    <div style={{ marginBottom: '20px', position: 'relative', maxWidth: '180px' }}>
                                        <div style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}>
                                            <Search size={16} />
                                        </div>
                                        <input
                                            type="text"
                                            placeholder="Search"
                                            style={{
                                                width: '100%',
                                                padding: '12px 16px 12px 42px',
                                                borderRadius: '12px',
                                                border: '1px solid #eef2f6',
                                                background: '#fcfdfe',
                                                fontSize: '14px',
                                                color: '#1e293b',
                                                boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                                                outline: 'none',
                                                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                                            }}
                                            className="ts-global-search-input"
                                            value={globalTableSearch}
                                            onChange={e => setGlobalTableSearch(e.target.value)}
                                        />
                                    </div>

                                    <div className="ts-table-wrapper">
                                        <table className="ts-detailed-table">
                                            <thead>
                                                <tr>
                                                    {['Project', 'Module', 'Task', 'Description', 'Date', 'Time', 'Work Status', 'Status / Action'].map(h => {
                                                        const isDropdown = h === 'Work Status' || h === 'Status / Action';

                                                        // Map header to consistent CSS class
                                                        let headerClass = '';
                                                        if (h === 'Work Status') headerClass = 'ts-col-work';
                                                        else if (h === 'Status / Action') headerClass = 'ts-col-status';
                                                        else headerClass = `ts-col-${h.toLowerCase().split(' ')[0]}`;

                                                        return (
                                                            <th
                                                                key={h}
                                                                className={`${isDropdown ? 'ts-header-dropdown-trigger' : ''} ${headerClass}`}
                                                                style={{
                                                                    cursor: h === 'Description' ? 'default' : 'pointer',
                                                                    userSelect: 'none',
                                                                    position: 'relative',
                                                                    textAlign: 'left' // Explicitly align heading text to left
                                                                }}
                                                                onClick={() => h !== 'Description' && handleSort(h)}
                                                            >
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-start' }}>
                                                                    {h}
                                                                    {h !== 'Description' && (
                                                                        <span style={{ color: (sortConfig.key === h || (isDropdown && activeDropdown === h)) ? '#2563eb' : '#cbd5e1' }}>
                                                                            {isDropdown ? (
                                                                                <ChevronDown size={12} />
                                                                            ) : sortConfig.key === h ? (
                                                                                sortConfig.direction === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
                                                                            ) : (
                                                                                <ChevronsUpDown size={12} />
                                                                            )}
                                                                        </span>
                                                                    )}
                                                                </div>

                                                                {/* Custom Dropdown Popover */}
                                                                {isDropdown && activeDropdown === h && (
                                                                    <div className="ts-filter-popover" onClick={e => e.stopPropagation()}>
                                                                        {h === 'Work Status' ? (
                                                                            <>
                                                                                <div className={`ts-popover-item ${tableFilters.work_status === '' ? 'active' : ''}`} onClick={() => { setTableFilters({ ...tableFilters, work_status: '' }); setActiveDropdown(null); }}>All Work Status</div>
                                                                                <div className={`ts-popover-item ${tableFilters.work_status === 'in_progress' ? 'active' : ''}`} onClick={() => { setTableFilters({ ...tableFilters, work_status: 'in_progress' }); setActiveDropdown(null); }}>In Progress</div>
                                                                                <div className={`ts-popover-item ${tableFilters.work_status === 'completed' ? 'active' : ''}`} onClick={() => { setTableFilters({ ...tableFilters, work_status: 'completed' }); setActiveDropdown(null); }}>Completed</div>
                                                                                <div className={`ts-popover-item ${tableFilters.work_status === 'not_applicable' ? 'active' : ''}`} onClick={() => { setTableFilters({ ...tableFilters, work_status: 'not_applicable' }); setActiveDropdown(null); }}>Not Applicable</div>
                                                                            </>
                                                                        ) : (
                                                                            <>
                                                                                <div className={`ts-popover-item ${tableFilters.log_status === '' ? 'active' : ''}`} onClick={() => { setTableFilters({ ...tableFilters, log_status: '' }); setActiveDropdown(null); }}>All Status</div>
                                                                                <div className={`ts-popover-item ${tableFilters.log_status === 'draft' ? 'active' : ''}`} onClick={() => { setTableFilters({ ...tableFilters, log_status: 'draft' }); setActiveDropdown(null); }}>Draft</div>
                                                                                <div className={`ts-popover-item ${tableFilters.log_status === 'submitted' ? 'active' : ''}`} onClick={() => { setTableFilters({ ...tableFilters, log_status: 'submitted' }); setActiveDropdown(null); }}>Submitted</div>
                                                                                <div className={`ts-popover-item ${tableFilters.log_status === 'approved' ? 'active' : ''}`} onClick={() => { setTableFilters({ ...tableFilters, log_status: 'approved' }); setActiveDropdown(null); }}>Approved</div>
                                                                                <div className={`ts-popover-item ${tableFilters.log_status === 'rejected' ? 'active' : ''}`} onClick={() => { setTableFilters({ ...tableFilters, log_status: 'rejected' }); setActiveDropdown(null); }}>Rejected</div>
                                                                            </>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </th>
                                                        );
                                                    })}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {processedEntries.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={8} style={{ padding: '48px', textAlign: 'center', color: '#94a3b8' }}>
                                                            {memberEntries.length === 0 ? 'No log entries found for this week.' : 'No entries match your filters.'}
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    processedEntries.map(entry => (
                                                        <tr key={entry.id} className="ts-table-row">
                                                            <td className="ts-col-project">{entry.project_name || 'System'}</td>
                                                            <td className="ts-col-module">{entry.module_name || '—'}</td>
                                                            <td className="ts-col-task">{entry.task_name || '—'}</td>
                                                            <td className="ts-col-desc" title={entry.description}>
                                                                {entry.description || '—'}
                                                            </td>
                                                            <td className="ts-col-date">{entry.log_date}</td>
                                                            <td className="ts-col-time">{Number(entry.duration).toFixed(1)}h</td>
                                                            <td className="ts-col-work">
                                                                <span className={`ts-work-badge ts-work-${entry.work_status}`}>
                                                                    {entry.work_status?.replace(/_/g, ' ')}
                                                                </span>
                                                            </td>
                                                            <td className="ts-col-action">
                                                                <div className="ts-action-cell">
                                                                    {(entry.log_status !== 'submitted' || !canApprove) && (
                                                                        <span className={`ts-log-badge ts-log-${entry.log_status}`}>
                                                                            {entry.log_status}
                                                                        </span>
                                                                    )}

                                                                    {entry.log_status === 'rejected' && entry.rejection_reason && (
                                                                        <span className="ts-rejection-mini">
                                                                            ⚠ {entry.rejection_reason}
                                                                        </span>
                                                                    )}

                                                                    {entry.log_status === 'submitted' && canApprove && (
                                                                        <div
                                                                            className="ts-row-action-container"
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                setActiveActionMenu(activeActionMenu === entry.id ? null : entry.id!);
                                                                            }}
                                                                        >
                                                                            <button className={`ts-action-trigger submitted ${activeActionMenu === entry.id ? 'active' : ''}`}>
                                                                                <span>Submitted</span>
                                                                                <ChevronDown size={14} />
                                                                            </button>

                                                                            {activeActionMenu === entry.id && (
                                                                                <div className="ts-action-dropdown animate-fadeIn">
                                                                                    <div className="ts-dropdown-item approve" onClick={(e) => { e.stopPropagation(); handleApproveEntry(entry.id!); setActiveActionMenu(null); }}>
                                                                                        <CheckCircle size={14} /> Approve
                                                                                    </div>
                                                                                    <div className="ts-dropdown-item reject" onClick={(e) => { e.stopPropagation(); openRejectEntry(entry.id!); setActiveActionMenu(null); }}>
                                                                                        <XCircle size={14} /> Reject
                                                                                    </div>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Reject Entry Modal */}
                {rejectModalOpen && (
                    <div style={{
                        position: 'fixed', inset: 0, zIndex: 1000,
                        background: 'rgba(0,0,0,0.4)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                        <div style={{
                            background: '#fff', borderRadius: '16px', padding: '28px',
                            width: '420px', boxShadow: '0 20px 40px rgba(0,0,0,0.15)'
                        }}>
                            <h3 style={{ margin: '0 0 6px', fontSize: '16px', fontWeight: 700, color: '#1e293b' }}>Reject Entry</h3>
                            <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#64748b' }}>Please provide a reason for rejection. The employee will be notified.</p>
                            <textarea
                                autoFocus
                                placeholder="e.g. Description is insufficient..."
                                value={rejectionReason}
                                onChange={e => setRejectionReason(e.target.value)}
                                style={{
                                    width: '100%', minHeight: '90px', padding: '10px 12px',
                                    border: '1px solid #e2e8f0', borderRadius: '8px',
                                    fontSize: '13px', resize: 'vertical', boxSizing: 'border-box',
                                    outline: 'none', fontFamily: 'inherit'
                                }}
                            />
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
                                <button
                                    onClick={() => setRejectModalOpen(false)}
                                    disabled={processingAction}
                                    style={{ padding: '8px 18px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#f8fafc', color: '#475569', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={confirmRejectEntry}
                                    disabled={processingAction || !rejectionReason.trim()}
                                    style={{
                                        padding: '8px 18px', borderRadius: '8px',
                                        border: 'none', background: processingAction || !rejectionReason.trim() ? '#fca5a5' : '#ef4444',
                                        color: '#fff', fontSize: '13px', fontWeight: 600, cursor: processingAction ? 'not-allowed' : 'pointer'
                                    }}
                                >
                                    {processingAction ? 'Rejecting...' : 'Confirm Reject'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}


                {/* PDF Report Modal */}
                <TimesheetReportModal
                    isOpen={reportModalOpen}
                    onClose={() => setReportModalOpen(false)}
                />
            </div>
        </AppLayout>
    );
};
