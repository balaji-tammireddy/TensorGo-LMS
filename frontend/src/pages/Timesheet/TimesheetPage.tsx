/* v1.0.1 - Corrected Holiday Date Logic & Premium Cards */
import React, { useState, useEffect, useMemo } from 'react';
import {
    Clock,
    ChevronLeft,
    ChevronRight,
    Save,
    FileText,
    Edit2,
    Trash2,
    ChevronDown,
    Lock,
    Repeat,
    AlertCircle
} from 'lucide-react';

import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import { timesheetService, TimesheetEntry } from '../../services/timesheetService';
import { projectService, Project, ProjectModule, ProjectTask } from '../../services/projectService';
import AppLayout from '../../components/layout/AppLayout';

import { DatePicker } from '../../components/ui/date-picker';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import { Button } from '../../components/ui/button';
import { Modal } from '../../components/ui/modal';
import './TimesheetPage.css';

export const TimesheetPage: React.FC = () => {
    const { user } = useAuth();
    const { showSuccess, showError } = useToast();

    // Helpers for Consistent Date Formatting
    const formatDate = (date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const getStatusLabel = (status?: string) => {
        if (!status) return 'N/A';
        return status.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
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

    // Date State
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    // Data State
    const [entries, setEntries] = useState<TimesheetEntry[]>([]);

    const weekRange = useMemo(() => getWeekRange(currentDate), [currentDate]);

    const isWeekEditable = useMemo(() => {
        const today = new Date();
        const { start: currentWeekStart } = getWeekRange(today);
        currentWeekStart.setHours(0, 0, 0, 0); // Normalize to midnight

        const viewWeekStart = new Date(weekRange.start);
        viewWeekStart.setHours(0, 0, 0, 0);

        const prevWeekStart = new Date(currentWeekStart);
        prevWeekStart.setDate(currentWeekStart.getDate() - 7);

        // Allow Current Week AND the immediately preceding week (Past 1 week)
        return viewWeekStart.getTime() >= prevWeekStart.getTime();
    }, [weekRange]);

    const isWeekLocked = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const isPastWeek = weekRange.end < today;

        if (!isPastWeek) return false;

        // Check if any entry for the week is submitted or approved
        // This ensures if the user manually submitted, they can't add more logs
        // unless it was rejected (in which case status = 'rejected')
        return entries.some(e => e.log_status === 'submitted' || e.log_status === 'approved');
    }, [weekRange, entries]);

    const [viewMode, setViewMode] = useState<'cards' | 'table'>('table');
    const [loading, setLoading] = useState(false);

    // Initial Load
    useEffect(() => {
        // Entries will be fetched by the next useEffect when weekRange is initialized
    }, []);

    // Fetch Entries when week changes
    useEffect(() => {
        const controller = new AbortController();
        fetchEntries(controller.signal);
        return () => controller.abort();
    }, [weekRange]);


    const fetchEntries = async (signal?: AbortSignal) => {
        try {
            const startStr = formatDate(weekRange.start);
            const endStr = formatDate(weekRange.end);

            // Note: Since timesheetService uses axios/fetch wrapper, we should check if we can pass signal.
            // If the service doesn't support signal, we can just check signal.aborted before setting state.

            const data = await timesheetService.getWeeklyEntries(startStr, endStr, signal);
            if (!signal?.aborted) {
                setEntries(data);
            }
        } catch (err: any) {
            // Ignore abort errors
            if (signal?.aborted || err.name === 'CanceledError' || err.message === 'canceled') return;

            console.error('[TimesheetPage] Fetch Error:', err);
            showError('Failed to load timesheet entries');
        }
    };

    // Calculations
    const totalHours = useMemo(() => {
        return entries.reduce((sum, e) => sum + parseFloat(String(e.duration)), 0).toFixed(2);
    }, [entries]);

    // Calculations
    const weekDays = useMemo(() => {
        const days = [];
        const { start } = weekRange;
        for (let i = 0; i < 6; i++) { // Only 6 days: Mon - Sat
            const d = new Date(start);
            d.setDate(start.getDate() + i);
            days.push(d);
        }
        return days;
    }, [weekRange]);

    // Note: Removed auto-reset of selectedDate to allow selecting dates in previous weeks
    // The date picker and validation will handle invalid dates


    // Modal State
    const [isLeaveActionModalOpen, setIsLeaveActionModalOpen] = useState(false);
    const [leaveActionData, setLeaveActionData] = useState<{ entry: TimesheetEntry, action: 'half_day' | 'delete' } | null>(null);


    const handleLeaveActionClick = (entry: TimesheetEntry, action: 'half_day' | 'delete') => {
        setLeaveActionData({ entry, action });
        setIsLeaveActionModalOpen(true);
    };

    const confirmLeaveAction = async () => {
        if (!leaveActionData) return;
        const { entry, action } = leaveActionData;
        setLoading(true);
        try {
            await timesheetService.updateLeaveLog(entry.id!, entry.log_date, action);
            showSuccess(action === 'half_day' ? "Leave updated to half day" : "Leave log removed");
            fetchEntries();
        } catch (err: any) {
            showError(err.response?.data?.error || err.message || "Action failed");
        } finally {
            setLoading(false);
            setIsLeaveActionModalOpen(false);
            setLeaveActionData(null);
        }
    };

    const changeWeek = (offset: number) => {
        const newDate = new Date(currentDate);
        newDate.setDate(newDate.getDate() + (offset * 7));
        setCurrentDate(newDate);
    };

    // Grouping
    const getEntriesForDay = (dateStr: string) => {
        return entries.filter(e => {
            // Normalize log_date (which might be ISO string) to local YYYY-MM-DD
            const eDate = new Date(e.log_date);
            const local = new Date(eDate.getFullYear(), eDate.getMonth(), eDate.getDate());
            const compare = formatDate(local);
            return compare === dateStr;
        });
    };

    // Check if date is blocked for logging (holidays or approved full-day leaves)
    const isDateBlocked = (dateStr: string): { blocked: boolean; reason: string } => {
        const dayEntries = getEntriesForDay(dateStr);

        // Check for holidays (System + Holiday module)
        const holiday = dayEntries.find(e =>
            e.project_name?.includes('System') &&
            e.module_name === 'Holiday'
        );

        if (holiday) {
            return { blocked: true, reason: `Holiday - ${holiday.description || 'Day Off'}` };
        }

        // Check for approved full-day leaves (System + Leave module with 8+ hours)
        const fullDayLeave = dayEntries.find(e =>
            e.project_name?.includes('System') &&
            e.module_name === 'Leave' &&
            e.duration >= 8 // Full day = 8 hours
        );

        if (fullDayLeave) {
            return { blocked: true, reason: `Full-Day Leave` };
        }

        return { blocked: false, reason: '' };
    };



    // Dropdown Empty State Component
    const DropdownEmptyState = ({ message }: { message: string }) => (
        <div className="ts-dropdown-empty-state">
            <div className="animation-container">
                <Clock className="floating-clock" size={32} />
                <div className="pulse-ring"></div>
            </div>
            <p className="ts-dropdown-empty-text">{message}</p>
        </div>
    );

    return (
        <AppLayout>
            <div className="timesheet-container">
                <div className="timesheet-header">
                    <div className="timesheet-title">
                        <h1>My Timesheet</h1>
                    </div>

                    <div className="header-actions">
                        {/* Logged Hours Badge - As requested */}
                        <div className={`logged-hours-badge ${parseFloat(String(totalHours)) >= 40 ? 'success' : 'warning'}`}>
                            <Clock size={16} />
                            <span>{totalHours} hours logged this week</span>
                        </div>

                        {/* Submit Button (Manual - Past Weeks) */}
                        {(() => {
                            const today = new Date();
                            today.setHours(0, 0, 0, 0);

                            // Calculate Monday 12 AM of the following week (Start of manual submission window)
                            // This opens after the Sunday 11:59 PM auto-submission has run.
                            const submissionStart = new Date(weekRange.end);
                            submissionStart.setDate(submissionStart.getDate() + 2); // Sat + 2 = Monday
                            submissionStart.setHours(0, 0, 0, 0);

                            // Calculate Sunday 12 AM of the week after (End of submission window)
                            const submissionEnd = new Date(submissionStart);
                            submissionEnd.setDate(submissionStart.getDate() + 7); // Next Sunday
                            submissionEnd.setHours(0, 0, 0, 0);

                            // Only show if today is within the 1-week window (Monday to Sunday)
                            if (today >= submissionStart && today < submissionEnd) {
                                const th = parseFloat(String(totalHours));
                                // Check if already submitted/approved
                                const isSubmitted = entries.some(e => e.log_status === 'submitted' || e.log_status === 'approved');
                                const hasRejected = entries.some(e => e.log_status === 'rejected');
                                const hasDrafts = entries.some(e => e.log_status === 'draft' && !e.is_system);

                                if (!isSubmitted || hasRejected || hasDrafts) {
                                    return (
                                        <Button
                                            className="btn-primary"
                                            style={{ height: '36px', gap: '8px', backgroundColor: hasRejected ? '#dc2626' : undefined }}
                                            disabled={th < 40 || loading}
                                            onClick={async () => {
                                                if (th < 40) {
                                                    showError('You need at least 40 hours to submit.');
                                                    return;
                                                }
                                                try {
                                                    setLoading(true);
                                                    await timesheetService.submitTimesheet(
                                                        formatDate(weekRange.start),
                                                        formatDate(weekRange.end)
                                                    );
                                                    showSuccess('Timesheet submitted successfully');
                                                    fetchEntries();
                                                } catch (e: any) {
                                                    showError(e.message || 'Submission failed');
                                                } finally {
                                                    setLoading(false);
                                                }
                                            }}
                                        >
                                            <Save size={16} />
                                            {(hasRejected || (isSubmitted && hasDrafts)) ? 'Resubmit Timesheet' : 'Submit Timesheet'}
                                        </Button>
                                    )
                                } else {
                                    return (
                                        <div className="logged-hours-badge success">
                                            <span>Submitted</span>
                                        </div>
                                    )
                                }
                            }
                            return null;
                        })()}

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
                            <button className="nav-btn" onClick={() => changeWeek(1)}><ChevronRight size={20} /></button>
                        </div>
                    </div>
                </div>

                <div className="timesheet-layout">
                    {/* List of entries */}
                    <div className="entries-list-card">
                        <div className="form-title">
                            <FileText size={18} />
                            Weekly Overview
                        </div>

                        {/* Week Days Navigation */}
                        <div className="week-days-nav" style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(6, 1fr)', // Updated to 6 columns
                            gap: '8px',
                            marginBottom: '20px',
                            padding: '10px 0'
                        }}>
                            {weekDays.map(day => {
                                const dStr = formatDate(day);
                                const isSelected = dStr === selectedDate;
                                const isToday = dStr === formatDate(new Date());
                                const dayLogCount = getEntriesForDay(dStr).length;

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
                                            position: 'relative',
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'capitalize' }}>
                                            {day.toLocaleDateString('en-US', { weekday: 'short' })}
                                        </span>
                                        <span style={{ fontSize: '14px', fontWeight: 700, marginTop: '2px' }}>
                                            {day.getDate()}
                                        </span>

                                        {/* Status Dots */}
                                        <div style={{ display: 'flex', gap: '2px', marginTop: '4px' }}>
                                            {(() => {
                                                const blockInfo = isDateBlocked(dStr);
                                                if (blockInfo.blocked) {
                                                    return <div style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: '#ef4444' }} title={blockInfo.reason} />;
                                                }
                                                return <>
                                                    {isToday && (
                                                        <div style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: '#3b82f6' }} title="Today" />
                                                    )}
                                                    {dayLogCount > 0 && (
                                                        <div style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: '#10b981' }} title="Has Logs" />
                                                    )}
                                                </>;
                                            })()}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        {weekDays
                            .filter(day => formatDate(day) === selectedDate)
                            .map(day => {
                                const dateStr = formatDate(day);
                                const dayEntries = getEntriesForDay(dateStr);
                                let dayTotal = dayEntries.reduce((sum, e) => sum + parseFloat(String(e.duration)), 0);

                                return (
                                    <div key={dateStr} className="day-group" style={{ opacity: 0, animation: 'fadeIn 0.5s ease-out forwards' }}>
                                        <div className="day-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
                                            <div className="day-title-group" style={{ display: 'flex', flexDirection: 'column' }}>
                                                <span className="day-title" style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 500 }}>
                                                    {day.toLocaleDateString('en-GB', { weekday: 'long' })}
                                                </span>
                                                <span style={{ fontSize: '15px', fontWeight: 600, color: '#1e293b' }}>
                                                    {(() => {
                                                        const d = String(day.getDate()).padStart(2, '0');
                                                        const m = String(day.getMonth() + 1).padStart(2, '0');
                                                        const y = day.getFullYear();
                                                        return `${d}-${m}-${y}`;
                                                    })()}
                                                </span>
                                            </div>
                                            <span className="day-total" style={{ fontWeight: 600, color: '#475569' }}>{dayTotal.toFixed(2)} Hrs</span>
                                        </div>

                                        <div className="entries-grid" style={{ marginTop: '20px' }}>
                                            {dayEntries.length === 0 ? (
                                                <div className="ts-empty-state-card" style={{ padding: '40px 20px' }}>
                                                    <div className="animation-container">
                                                        <Clock className="floating-clock" size={64} />
                                                        <div className="pulse-ring"></div>
                                                    </div>
                                                    <h3 className="empty-title">No Activity Logged</h3>
                                                    <p className="empty-desc">There are no records found for this date. Use the form on the left to log your work or select another day.</p>
                                                </div>
                                            ) : (
                                                dayEntries.map(entry => {
                                                    const formattedDesc = entry.description?.length > 100
                                                        ? entry.description.substring(0, 100) + '...'
                                                        : entry.description;

                                                    return (
                                                        <div key={entry.id} className={`entry-item premium-card status-${entry.log_status || 'draft'} ${entry.project_name?.includes('System') ? 'holiday-card' : ''}`}>
                                                            <div className="entry-inner">
                                                                <div className="entry-header">
                                                                    <div className="entry-path">
                                                                        {entry.is_system || entry.project_name?.includes('System') ? (
                                                                            <strong>System log</strong>
                                                                        ) : entry.work_status === 'On Leave' || entry.project_name === 'Leave' ? (
                                                                            <strong>On Leave</strong>
                                                                        ) : (
                                                                            <>
                                                                                <strong>{entry.project_name}</strong>
                                                                                {entry.module_name && entry.module_name !== entry.project_name && (
                                                                                    <>
                                                                                        <span className="path-sep">&gt;</span>
                                                                                        <span>{entry.module_name}</span>
                                                                                    </>
                                                                                )}
                                                                                {entry.task_name && entry.task_name !== entry.module_name && (
                                                                                    <>
                                                                                        <span className="path-sep">&gt;</span>
                                                                                        <span>{entry.task_name}</span>
                                                                                    </>
                                                                                )}
                                                                                {entry.activity_name && entry.activity_name !== entry.task_name && (
                                                                                    <>
                                                                                        <span className="path-sep">&gt;</span>
                                                                                        <span>{entry.activity_name}</span>
                                                                                    </>
                                                                                )}
                                                                            </>
                                                                        )}
                                                                    </div>
                                                                    <div className="duration-label">
                                                                        {parseFloat(String(entry.duration)).toFixed(2)} hrs
                                                                    </div>
                                                                </div>

                                                                {entry.project_name?.includes('System') && entry.description && (
                                                                    <h4 className="holiday-name" style={{ fontSize: '14px', margin: '4px 0' }}>{entry.description}</h4>
                                                                )}

                                                                {!entry.project_name?.includes('System') && (
                                                                    <div className="description-text">
                                                                        {formattedDesc || 'No description provided.'}
                                                                    </div>
                                                                )}

                                                                {entry.log_status === 'rejected' && entry.rejection_reason && (
                                                                    <div className="rejection-box">
                                                                        <strong>Rejection:</strong> {entry.rejection_reason}
                                                                    </div>
                                                                )}

                                                                <div className="entry-footer">
                                                                    <div className="status-pill pill-progress">
                                                                        {entry.work_status.replace('_', ' ')}
                                                                    </div>
                                                                    <span className={`status-pill status-${entry.log_status}`}>{entry.log_status}</span>
                                                                    {/* Show Lock Icon for System Entries */}
                                                                    {entry.project_name?.includes('System') && (
                                                                        <span className="status-pill info" style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#f0f9ff', color: '#0369a1', border: '1px solid #e0f2fe' }}>
                                                                            <Lock size={12} /> System
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            {/* Actions removed for manual tasks - use Workspace for logging */}
                                                            {entry.module_name === 'Leave' && (entry.is_system || entry.project_name?.includes('System')) &&
                                                                entry.log_status !== 'approved' &&
                                                                entry.log_status !== 'submitted' && (
                                                                    <div className="entry-actions-sidebar">
                                                                        {parseFloat(String(entry.duration)) >= 8 && (
                                                                            <button
                                                                                className="action-btn-styled edit"
                                                                                onClick={() => handleLeaveActionClick(entry, 'half_day')}
                                                                                title="Change to Half Day"
                                                                                disabled={loading}
                                                                            >
                                                                                <Repeat size={16} />
                                                                            </button>
                                                                        )}
                                                                        <button
                                                                            className="action-btn-styled delete"
                                                                            onClick={() => handleLeaveActionClick(entry, 'delete')}
                                                                            title="Delete Log"
                                                                            disabled={loading}
                                                                        >
                                                                            <Trash2 size={16} />
                                                                        </button>
                                                                    </div>
                                                                )}
                                                        </div>
                                                    );
                                                })
                                            )}
                                        </div>

                                        {/* Detailed Table View - Requested by User */}
                                        <div className="timesheet-table-container" style={{ marginTop: '40px' }}>
                                            <div className="form-title" style={{ borderTop: '1px solid #e2e8f0', paddingTop: '20px', marginTop: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <FileText size={18} />
                                                    Detailed Log Table
                                                </span>
                                                <span style={{ fontSize: '12px', fontWeight: 500, color: '#64748b', background: '#f1f5f9', borderRadius: '6px', padding: '4px 10px' }}>
                                                    {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                                                </span>
                                            </div>
                                            <div className="ts-table-wrapper" style={{ overflowX: 'auto', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}>
                                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                                    <thead>
                                                        <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                                            {['Project', 'Module', 'Task', 'Description', 'Date', 'Time Spent', 'Status'].map(h => (
                                                                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#475569', fontSize: '13px', whiteSpace: 'nowrap', verticalAlign: 'top' }}>{h}</th>
                                                            ))}
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {entries.filter(e => {
                                                            // Normalize log_date to YYYY-MM-DD for comparison
                                                            const d = new Date(e.log_date);
                                                            const normalized = isNaN(d.getTime())
                                                                ? e.log_date
                                                                : d.toISOString().split('T')[0];
                                                            return normalized === selectedDate;
                                                        }).length === 0 ? (
                                                            <tr>
                                                                <td colSpan={7} style={{ padding: '30px', textAlign: 'center', color: '#94a3b8', verticalAlign: 'middle' }}>No logs found for this date</td>
                                                            </tr>
                                                        ) : (
                                                            entries.filter(e => {
                                                                const d = new Date(e.log_date);
                                                                const normalized = isNaN(d.getTime())
                                                                    ? e.log_date
                                                                    : d.toISOString().split('T')[0];
                                                                return normalized === selectedDate;
                                                            }).map(entry => {
                                                                const cell: React.CSSProperties = { padding: '12px 16px', verticalAlign: 'top', textAlign: 'left', borderBottom: '1px solid #f1f5f9', color: '#475569', fontSize: '13px' };
                                                                return (
                                                                    <tr key={entry.id} style={{ transition: 'background 0.2s' }}
                                                                        onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                                                                        onMouseLeave={e => (e.currentTarget.style.background = '')}>
                                                                        <td style={{ ...cell, fontWeight: 500, color: '#1e293b' }}>{entry.project_name || 'System'}</td>
                                                                        <td style={cell}>{entry.module_name || 'N/A'}</td>
                                                                        <td style={cell}>
                                                                            <span style={{ fontWeight: 500, color: '#1e293b' }}>{entry.task_name || 'N/A'}</span>
                                                                        </td>
                                                                        <td style={{ ...cell, maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={entry.description}>
                                                                            {entry.description || '—'}
                                                                        </td>
                                                                        <td style={cell}>{entry.log_date}</td>
                                                                        <td style={{ ...cell, fontWeight: 600, color: '#1e293b' }}>{parseFloat(String(entry.duration)).toFixed(1)} hrs</td>
                                                                        <td style={cell}>
                                                                            <span className={`ts-work-badge ts-work-${entry.work_status}`}>{getStatusLabel(entry.work_status)}</span>
                                                                        </td>
                                                                    </tr>
                                                                );
                                                            })
                                                        )}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                    </div>
                </div>


                {/* Confirm Leave Action Modal */}
                <Modal
                    isOpen={isLeaveActionModalOpen}
                    onClose={() => setIsLeaveActionModalOpen(false)}
                    title={leaveActionData?.action === 'half_day' ? "Confirm Half Day Change" : "Confirm Deletion"}
                    footer={
                        <>
                            <button className="modal-btn secondary" onClick={() => setIsLeaveActionModalOpen(false)}>Cancel</button>
                            <button
                                className={`modal-btn ${leaveActionData?.action === 'half_day' ? 'primary' : 'danger'}`}
                                onClick={confirmLeaveAction}
                                disabled={loading}
                            >
                                {loading ? 'Processing...' : (leaveActionData?.action === 'half_day' ? 'Change to Half Day' : 'Delete Log')}
                            </button>
                        </>
                    }
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                        <AlertCircle size={24} color={leaveActionData?.action === 'half_day' ? '#f59e0b' : '#ef4444'} />
                        <p style={{ margin: 0, fontWeight: 500 }}>
                            {leaveActionData?.action === 'half_day'
                                ? "Are you sure you want to change this leave log to Half Day (4 hours)?"
                                : "Are you sure you want to delete this leave log and reduce hours to 0?"}
                        </p>
                    </div>
                    <p style={{ fontSize: '14px', color: '#64748b' }}>
                        This will create a permanent override for this date. You can resubmit the timesheet after this change.
                    </p>
                </Modal>
            </div>
        </AppLayout>
    );
};
