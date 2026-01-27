import React, { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight, CheckCircle, XCircle, Search, Download, Clock } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import { timesheetService, TimesheetEntry } from '../../services/timesheetService';
import AppLayout from '../../components/layout/AppLayout';
import { Button } from '../../components/ui/button';
import { Modal } from '../../components/ui/modal';
import { TimesheetReportModal } from '../../components/timesheet/TimesheetReportModal';
import './TimesheetApprovalPage.css';

interface TeamMemberStatus {
    id: number;
    name: string;
    emp_id: string;
    designation: string;
    total_hours: number;
    status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'pending_submission';
}

export const TimesheetApprovalPage: React.FC = () => {
    const { user } = useAuth();
    const { showSuccess, showError } = useToast();

    // -- Date Logic --
    // Default to previous week (Managers only see past/submitted weeks)
    const [currentDate, setCurrentDate] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        return d;
    });
    // Initialize selectedDate to today's string format
    const [selectedDate, setSelectedDate] = useState(() => {
        const d = new Date();
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
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
        const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
        const monday = new Date(date);
        monday.setDate(diff);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        return { start: monday, end: sunday };
    };

    const weekRange = useMemo(() => getWeekRange(currentDate), [currentDate]);
    const weekDays = useMemo(() => {
        const days = [];
        const { start } = weekRange;
        for (let i = 0; i < 7; i++) {
            const d = new Date(start);
            d.setDate(start.getDate() + i);
            days.push(d);
        }
        return days;
    }, [weekRange]);

    // Ensure selectedDate is within the current week view
    useEffect(() => {
        const startStr = formatDate(weekRange.start);
        const endStr = formatDate(weekRange.end);
        if (selectedDate < startStr || selectedDate > endStr) {
            setSelectedDate(startStr);
        }
    }, [weekRange, selectedDate]);

    // -- State --
    const [teamMembers, setTeamMembers] = useState<TeamMemberStatus[]>([]);
    const [filteredMembers, setFilteredMembers] = useState<TeamMemberStatus[]>([]);
    const [searchQuery, setSearchQuery] = useState('');

    const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
    const [memberEntries, setMemberEntries] = useState<TimesheetEntry[]>([]);
    const [loadingEntries, setLoadingEntries] = useState(false);

    // -- Actions State --
    const [rejectModalOpen, setRejectModalOpen] = useState(false);
    const [entryToReject, setEntryToReject] = useState<number | null>(null);
    const [rejectDateStr, setRejectDateStr] = useState<string | null>(null); // For day-wise rejection
    const [rejectionReason, setRejectionReason] = useState('');

    const [reportModalOpen, setReportModalOpen] = useState(false);
    const [reportFilters, setReportFilters] = useState({
        startDate: formatDate(weekRange.start),
        endDate: formatDate(weekRange.end),
        projectId: '',
        moduleId: ''
    });

    // -- Effects --
    useEffect(() => {
        fetchTeamStatus();
    }, [weekRange]);

    useEffect(() => {
        if (selectedMemberId) {
            fetchMemberEntries(selectedMemberId);
        } else {
            setMemberEntries([]);
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
        setLoadingEntries(true);
        try {
            const startStr = formatDate(weekRange.start);
            const endStr = formatDate(weekRange.end);
            const data = await timesheetService.getMemberEntries(userId, startStr, endStr);
            setMemberEntries(data);
        } catch (err: any) {
            showError('Failed to load user timesheet');
            setSelectedMemberId(null); // Reset selection on error
        } finally {
            setLoadingEntries(false);
        }
    };

    // -- Handlers --
    const handleApproveWeek = async () => {
        if (!selectedMemberId) return;
        try {
            const startStr = formatDate(weekRange.start);
            const endStr = formatDate(weekRange.end);
            await timesheetService.approveTimesheet(selectedMemberId, startStr, endStr);
            showSuccess('Timesheet approved successfully');
            fetchTeamStatus();
            fetchMemberEntries(selectedMemberId);
        } catch (err: any) {
            showError(err.message || 'Failed to approve');
        }
    };

    const handleApproveDay = async (dateStr: string) => {
        if (!selectedMemberId) return;
        try {
            await timesheetService.approveTimesheet(selectedMemberId, dateStr, dateStr);
            showSuccess(`Timesheet for ${dateStr} approved`);
            fetchTeamStatus();
            fetchMemberEntries(selectedMemberId);
        } catch (err: any) {
            showError(err.message || 'Failed to approve day');
        }
    };

    const handleRejectDay = (dateStr: string) => {
        setRejectDateStr(dateStr);
        setEntryToReject(null);
        setRejectionReason('');
        setRejectModalOpen(true);
    };

    const handleRejectClick = (entryId: number) => {
        setEntryToReject(entryId);
        setRejectDateStr(null);
        setRejectionReason('');
        setRejectModalOpen(true);
    };

    const confirmReject = async () => {
        if ((!entryToReject && !rejectDateStr) || !rejectionReason.trim()) {
            showError('Please provide a reason');
            return;
        }
        try {
            if (entryToReject) {
                await timesheetService.rejectEntry(entryToReject, rejectionReason);
            } else if (rejectDateStr && selectedMemberId) {
                await timesheetService.rejectTimesheet(selectedMemberId, rejectDateStr, rejectDateStr, rejectionReason);
            }

            showSuccess('Rejection processed');
            setRejectModalOpen(false);
            if (selectedMemberId) fetchMemberEntries(selectedMemberId);
            fetchTeamStatus();
        } catch (err: any) {
            showError(err.message || 'Failed to reject');
        }
    };

    const changeWeek = (offset: number) => {
        const newDate = new Date(currentDate);
        newDate.setDate(newDate.getDate() + (offset * 7));
        setCurrentDate(newDate);
    };

    const handleDownloadReport = async () => {
        try {
            const data = await timesheetService.downloadReport(reportFilters);
            // Convert JSON to CSV
            if (!data || data.length === 0) {
                showError('No data found for criteria');
                return;
            }

            const headers = Object.keys(data[0]).join(',');
            const rows = data.map((row: any) => Object.values(row).map(v => `"${v}"`).join(',')).join('\n');
            const csvContent = `data:text/csv;charset=utf-8,${headers}\n${rows}`;

            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", `timesheet_report_${formatDate(new Date())}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            setReportModalOpen(false);
            showSuccess('Report downloaded');
        } catch (err) {
            showError('Failed to generate report');
        }
    };





    // -- Grouping --
    const getEntriesForDay = (dateStr: string) => {
        return memberEntries.filter(e => {
            const eDate = new Date(e.log_date);
            return formatDate(eDate) === dateStr;
        });
    };

    const selectedMember = teamMembers.find(m => m.id === selectedMemberId);

    return (
        <AppLayout>
            <div className="timesheet-container">
                <div className="timesheet-header">
                    <div className="timesheet-title">
                        <h1>Timesheet Approvals</h1>
                    </div>

                    <div className="header-actions">
                        <Button
                            variant="outline"
                            onClick={() => setReportModalOpen(true)}
                            style={{ display: 'flex', gap: '8px', alignItems: 'center' }}
                        >
                            <Download size={16} />
                            Reports
                        </Button>

                        <div className="week-navigator">
                            <button className="nav-btn" onClick={() => changeWeek(-1)}><ChevronLeft size={20} /></button>
                            <span className="current-week-display">
                                {weekRange.start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} - {weekRange.end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                            <button
                                className="nav-btn"
                                onClick={() => changeWeek(1)}
                                disabled={(() => {
                                    const nextWeekEnd = new Date(weekRange.end);
                                    nextWeekEnd.setDate(nextWeekEnd.getDate() + 7);
                                    return nextWeekEnd >= new Date();
                                })()}
                                style={{
                                    opacity: (() => {
                                        const nextWeekEnd = new Date(weekRange.end);
                                        nextWeekEnd.setDate(nextWeekEnd.getDate() + 7);
                                        return nextWeekEnd >= new Date();
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
                                    <div className="emp-status">
                                        <div className={`status-dot ${member.status}`} title={member.status} />
                                        <span className="hours-pill">{member.total_hours.toFixed(1)}h</span>
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
                            <div className="ts-empty-state" style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                height: '100%',
                                color: '#94a3b8',
                                animation: 'fadeIn 0.5s ease-out'
                            }}>
                                <style>
                                    {`
                                        @keyframes float { 0% { transform: translateY(0px); } 50% { transform: translateY(-10px); } 100% { transform: translateY(0px); } }
                                    `}
                                </style>
                                <div style={{
                                    width: '80px',
                                    height: '80px',
                                    background: '#f8fafc',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '50%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    marginBottom: '24px',
                                    animation: 'float 3s ease-in-out infinite'
                                }}>
                                    <Search size={32} style={{ color: '#cbd5e1' }} />
                                </div>
                                <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#334155', marginBottom: '8px' }}>Select an Employee</h3>
                                <p style={{ fontSize: '14px', maxWidth: '300px', textAlign: 'center', lineHeight: '1.5' }}>
                                    Choose a team member from the list to view their timesheet, approve logs, or check submission status.
                                </p>
                            </div>
                        ) : (
                            <>
                                <div style={{ paddingBottom: '20px', borderBottom: '1px solid #f1f5f9', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#1e293b', margin: 0 }}>
                                            {selectedMember?.name}
                                        </h2>
                                        <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
                                            {selectedMember?.emp_id} • {selectedMember?.total_hours.toFixed(2)} Hrs Logged
                                        </div>
                                    </div>

                                    {/* Action Bar */}
                                    {(() => {
                                        if (selectedMemberId === user?.id) {
                                            return <div className="logged-hours-badge warning">Self Approval Disabled</div>;
                                        }

                                        // Criteria Check (Past Weeks Only)
                                        const isPastWeek = weekRange.end < new Date();
                                        const totalHours = selectedMember?.total_hours || 0;
                                        const criteriaMet = totalHours >= 40;

                                        if (isPastWeek && !criteriaMet) {
                                            // Show nothing in action bar or show disabled state? 
                                            // We show banner below instead.
                                            return <div className="logged-hours-badge danger">Criteria Not Met</div>;
                                        }

                                        if (memberEntries.length === 0 && !loadingEntries) {
                                            return <div className="logged-hours-badge neutral" style={{ background: '#f1f5f9', color: '#64748b' }}>No Logs</div>;
                                        }

                                        const hasPending = memberEntries.some(e => e.log_status !== 'approved');
                                        if (hasPending) {
                                            return (
                                                <button className="bulk-approve-btn" onClick={handleApproveWeek}>
                                                    <CheckCircle size={16} />
                                                    Approve Week
                                                </button>
                                            );
                                        } else if (memberEntries.length > 0) {
                                            return (
                                                <div className="logged-hours-badge success">
                                                    <CheckCircle size={14} style={{ marginRight: 4 }} />
                                                    Approved
                                                </div>
                                            );
                                        }
                                        return null;
                                    })()}
                                </div>

                                {/* Criteria Error Banner */}
                                {(() => {
                                    const isPastWeek = weekRange.end < new Date();
                                    const totalHours = selectedMember?.total_hours || 0;
                                    const criteriaMet = totalHours >= 40;

                                    // Only show if it's a past week AND criteria failed AND it's not the user themselves
                                    if (isPastWeek && !criteriaMet && selectedMemberId !== user?.id) {
                                        return (
                                            <div style={{
                                                marginBottom: '20px',
                                                padding: '16px',
                                                borderRadius: '12px',
                                                background: '#fef2f2',
                                                border: '1px solid #fee2e2',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '12px',
                                                color: '#b91c1c',
                                                animation: 'fadeIn 0.5s ease-out'
                                            }}>
                                                <style>
                                                    {`
                                                        @keyframes fadeIn { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }
                                                        @keyframes pulse-red { 0% { transform: scale(1); } 50% { transform: scale(1.05); } 100% { transform: scale(1); } }
                                                    `}
                                                </style>
                                                <div style={{ padding: '8px', background: '#fff', borderRadius: '50%', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', animation: 'pulse-red 2s infinite' }}>
                                                    <XCircle size={24} color="#ef4444" />
                                                </div>
                                                <div>
                                                    <h3 style={{ margin: '0 0 4px 0', fontSize: '15px', fontWeight: 600 }}>Submission Criteria Not Met</h3>
                                                    <p style={{ margin: 0, fontSize: '13px', opacity: 0.9 }}>
                                                        This user has logged fewer than 40 hours.
                                                    </p>
                                                </div>
                                            </div>
                                        )
                                    }
                                    return null;
                                })()}

                                {/* Week Days Navigation */}
                                <div className="week-days-nav" style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(7, 1fr)',
                                    gap: '8px',
                                    marginBottom: '20px',
                                    padding: '10px 0'
                                }}>
                                    {weekDays.map(day => {
                                        const dStr = formatDate(day);
                                        const isToday = dStr === formatDate(new Date());
                                        const dayEntries = getEntriesForDay(dStr);
                                        const hasLogs = dayEntries.length > 0;
                                        const isSelected = dStr === selectedDate;

                                        return (
                                            <button
                                                key={dStr}
                                                onClick={() => setSelectedDate(dStr)}
                                                className={`week-day-btn ${isSelected ? 'active' : ''}`}
                                                style={{
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    alignItems: 'center',
                                                    padding: '8px 4px',
                                                    borderRadius: '8px',
                                                    border: isSelected ? '1px solid #3b82f6' : '1px solid #e2e8f0',
                                                    backgroundColor: isSelected ? '#eff6ff' : '#fff',
                                                    color: isSelected ? '#1d4ed8' : '#64748b',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s'
                                                }}
                                            >
                                                <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }}>
                                                    {day.toLocaleDateString('en-US', { weekday: 'short' })}
                                                </span>
                                                <span style={{ fontSize: '14px', fontWeight: 700, marginTop: '2px' }}>
                                                    {day.getDate()}
                                                </span>

                                                <div style={{ display: 'flex', gap: '2px', marginTop: '4px' }}>
                                                    {isToday && (
                                                        <div style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: '#3b82f6' }} title="Today" />
                                                    )}
                                                    {hasLogs && (
                                                        <div style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: '#10b981' }} title="Has Logs" />
                                                    )}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>

                                <div className="entries-grid">
                                    {weekDays
                                        .filter(day => formatDate(day) === selectedDate)
                                        .map(day => {
                                            const dateStr = formatDate(day);
                                            const dayEntries = getEntriesForDay(dateStr);
                                            const dayTotal = dayEntries.reduce((sum, e) => sum + Number(e.duration), 0);

                                            // Always render the container for anchor linking, even if empty?
                                            // Probably yes, or at least if we want the button to scroll somewhere.

                                            return (
                                                <div key={dateStr} id={`day-${dateStr}`} className="day-group">
                                                    <div className="day-header">
                                                        <div className="day-title-group">
                                                            <span className="day-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                {day.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}

                                                                {/* Day Actions */}
                                                                {selectedMemberId !== user?.id && dayEntries.length > 0 && (
                                                                    <div className="day-actions" style={{ display: 'flex', gap: '4px', marginLeft: '12px', alignItems: 'center' }}>
                                                                        {/* Only show Approve/Reject if there are pending entries and NOT only system entries */}
                                                                        {dayEntries.some(e => e.log_status !== 'approved' && !e.project_name?.includes('System')) && (
                                                                            <>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={(e) => { e.stopPropagation(); handleApproveDay(dateStr); }}
                                                                                    title="Approve Day"
                                                                                    style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#10b981', padding: '4px' }}
                                                                                >
                                                                                    <CheckCircle size={20} />
                                                                                </button>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={(e) => { e.stopPropagation(); handleRejectDay(dateStr); }}
                                                                                    title="Reject Day"
                                                                                    style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#ef4444', padding: '4px' }}
                                                                                >
                                                                                    <XCircle size={20} />
                                                                                </button>
                                                                            </>
                                                                        )}

                                                                        {/* Show Green Tick if all Approved or System */}
                                                                        {dayEntries.every(e => e.log_status === 'approved' || e.project_name?.includes('System')) && (
                                                                            <CheckCircle size={20} color="#10b981" fill="#ecfdf5" />
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </span>
                                                        </div>
                                                        <span className="day-total">{dayTotal.toFixed(2)} Hrs</span>
                                                    </div>

                                                    {dayEntries.length === 0 ? (
                                                        <div className="ts-empty-state-card" style={{ padding: '40px 20px', textAlign: 'center', marginTop: '20px' }}>
                                                            <div className="animation-container" style={{ position: 'relative', width: '64px', height: '64px', margin: '0 auto 16px' }}>
                                                                <Clock className="floating-clock" size={48} style={{ color: '#cbd5e1', animation: 'float 3s ease-in-out infinite' }} />
                                                                <div className="pulse-ring" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '100%', height: '100%', borderRadius: '50%', border: '2px solid #e2e8f0', animation: 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite' }}></div>
                                                            </div>
                                                            <h3 style={{ fontSize: '16px', color: '#64748b', fontWeight: 500 }}>No entries logged for this week.</h3>
                                                        </div>
                                                    ) : (
                                                        dayEntries.map(entry => (
                                                            <div key={entry.id} className={`entry-item premium-card status-${entry.log_status} ${entry.project_name?.includes('System') ? 'holiday-card' : ''}`}>
                                                                <div className="entry-inner">
                                                                    <div className="entry-header">
                                                                        <div className="entry-path">
                                                                            <strong>{entry.project_name}</strong>
                                                                            <span className="path-sep">&gt;</span>
                                                                            <span>{entry.module_name}</span>
                                                                            <span className="path-sep">&gt;</span>
                                                                            <span>{entry.task_name}</span>
                                                                        </div>
                                                                        <span className="duration-label">{Number(entry.duration).toFixed(2)}h</span>
                                                                    </div>
                                                                    <div className="description-text">{entry.description}</div>
                                                                    {entry.rejection_reason && (
                                                                        <div style={{ fontSize: '12px', color: '#ef4444', marginTop: '4px', background: '#fef2f2', padding: '4px 8px', borderRadius: '4px' }}>
                                                                            <strong>Rejection Reason:</strong> {entry.rejection_reason}
                                                                        </div>
                                                                    )}
                                                                    <div className="entry-footer">
                                                                        <span className={`status-pill status-${entry.log_status}`}>{entry.log_status}</span>
                                                                    </div>
                                                                </div>

                                                                {entry.log_status !== 'approved' && entry.log_status !== 'rejected' && !entry.project_name?.includes('System') && (
                                                                    <div className="entry-actions-sidebar">
                                                                        <button
                                                                            className="action-btn-styled delete"
                                                                            title="Reject"
                                                                            onClick={() => {
                                                                                if (entry.id) handleRejectClick(entry.id);
                                                                            }}
                                                                        >
                                                                            <XCircle size={16} />
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ))
                                                    )}
                                                </div>
                                            );
                                        })}
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* Reject Modal */}
                <Modal
                    isOpen={rejectModalOpen}
                    onClose={() => setRejectModalOpen(false)}
                    title="Reject Entry"
                    footer={
                        <>
                            <button className="modal-btn secondary" onClick={() => setRejectModalOpen(false)}>Cancel</button>
                            <button className="modal-btn danger" onClick={confirmReject}>Reject</button>
                        </>
                    }
                >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={{ fontSize: '14px', fontWeight: 500 }}>Reason for Rejection</label>
                        <textarea
                            className="ts-form-textarea"
                            style={{ minHeight: '80px' }}
                            value={rejectionReason}
                            onChange={(e) => setRejectionReason(e.target.value)}
                            placeholder="e.g. Invalid task allocation"
                        />
                    </div>
                </Modal>

                {/* PDF Report Modal */}
                <TimesheetReportModal
                    isOpen={reportModalOpen}
                    onClose={() => setReportModalOpen(false)}
                />
            </div>
        </AppLayout >
    );
};
