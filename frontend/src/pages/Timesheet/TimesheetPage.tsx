/* v1.0.1 - Corrected Holiday Date Logic & Premium Cards */
import React, { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Save, Trash2, Edit2, Clock, FileText, ChevronDown } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import { timesheetService, TimesheetEntry } from '../../services/timesheetService';
import { projectService, Project, ProjectModule, ProjectTask, ProjectActivity } from '../../services/projectService';
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

    const getWeekRange = (date: Date) => {
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
        const monday = new Date(date);
        monday.setDate(diff);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        return { start: monday, end: sunday };
    };

    // Date State
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState(formatDate(new Date()));

    // Data State
    const [entries, setEntries] = useState<TimesheetEntry[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [modules, setModules] = useState<ProjectModule[]>([]);
    const [tasks, setTasks] = useState<ProjectTask[]>([]);
    const [activities, setActivities] = useState<ProjectActivity[]>([]);

    const weekRange = useMemo(() => getWeekRange(currentDate), [currentDate]);

    const isWeekEditable = useMemo(() => {
        const today = new Date();
        const { start: currentWeekStart } = getWeekRange(today);
        currentWeekStart.setHours(0, 0, 0, 0); // Normalize to midnight

        const viewWeekStart = new Date(weekRange.start);
        viewWeekStart.setHours(0, 0, 0, 0);

        // Strict: Only Current Week (or future, effectively limited by max date)
        // Previous weeks are locked for NEW logs.
        return viewWeekStart.getTime() >= currentWeekStart.getTime();
    }, [weekRange]);

    // Form State
    const initialFormState = {
        project_id: '',
        module_id: '',
        task_id: '',
        activity_id: '',
        duration: '',
        work_status: 'in_progress',
        description: ''
    };
    const [formData, setFormData] = useState(initialFormState);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);

    // Initial Load
    useEffect(() => {
        fetchProjects();
    }, []);

    // Fetch Entries when week changes
    useEffect(() => {
        const controller = new AbortController();
        fetchEntries(controller.signal);
        return () => controller.abort();
    }, [weekRange]);

    const fetchProjects = async () => {
        try {
            const data = await projectService.getProjects();
            // Strict Filtering for Timesheet: Only show projects where user is Active Member or Project Manager
            setProjects(data.filter(p =>
                p.status === 'active' && (p.is_member || p.is_pm)
            ));
        } catch (err) {
            console.error(err);
            showError('Failed to load projects');
        }
    };

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

    // Cascading Dropdowns
    const handleProjectChange = async (projectId: string) => {
        setFormData({ ...formData, project_id: projectId, module_id: '', task_id: '', activity_id: '' });
        setModules([]); setTasks([]); setActivities([]);
        if (!projectId) return;

        try {
            const data = await projectService.getModules(parseInt(projectId));
            // Strict Filtering: Only show modules user is assigned to
            // Add safety check for user
            if (!user) {
                setModules([]);
                return;
            }
            setModules(data.filter(m =>
                m.status === 'active' &&
                m.assigned_users?.some(u => u.id === user.id)
            ));
        } catch (err) { console.error(err); }
    };

    const handleModuleChange = async (moduleId: string) => {
        setFormData({ ...formData, module_id: moduleId, task_id: '', activity_id: '' });
        setTasks([]); setActivities([]);
        if (!moduleId) return;

        try {
            const data = await projectService.getTasks(parseInt(moduleId));
            // Strict Filtering: Only show tasks user is assigned to
            if (!user) {
                setTasks([]);
                return;
            }
            setTasks(data.filter(t =>
                t.status !== 'archived' &&
                (t.is_assigned || t.assigned_users?.some(u => u.id === user.id))
            ));
        } catch (err) { console.error(err); }
    };

    const handleTaskChange = async (taskId: string) => {
        setFormData({ ...formData, task_id: taskId, activity_id: '' });
        setActivities([]);
        if (!taskId) return;

        try {
            const data = await projectService.getActivities(parseInt(taskId));
            // Strict Filtering: Only show activities user is assigned to
            if (!user) {
                setActivities([]);
                return;
            }
            setActivities(data.filter(a =>
                a.status !== 'archived' &&
                a.assigned_users?.some(u => u.id === user.id)
            ));
        } catch (err) { console.error(err); }
    };

    // Modal State
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [entryToDelete, setEntryToDelete] = useState<number | null>(null);

    // Form Submission
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const today = formatDate(new Date());
        if (selectedDate > today) {
            showError("Cannot log time for future dates");
            return;
        }

        const dur = parseFloat(formData.duration);
        if (isNaN(dur) || dur <= 0 || dur > 24) {
            showError("Invalid duration (0.5 - 24 hours)");
            return;
        }

        // Validate 0.5 increments
        if (dur % 0.5 !== 0) {
            showError("Hours must be in 0.5 increments (e.g. 1.0, 1.5, 2.0)");
            return;
        }

        setLoading(true);
        try {
            await timesheetService.saveEntry({
                id: editingId || undefined,
                project_id: parseInt(formData.project_id),
                module_id: parseInt(formData.module_id),
                task_id: parseInt(formData.task_id),
                activity_id: parseInt(formData.activity_id),
                log_date: selectedDate,
                duration: dur,
                description: formData.description,
                work_status: formData.work_status
            });
            showSuccess(editingId ? "Entry updated" : "Time logged successfully");
            setFormData(initialFormState);
            setEditingId(null);
            fetchEntries();
        } catch (err: any) {
            showError(err.message || 'Failed to save entry');
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = async (entry: TimesheetEntry) => {
        if (entry.log_status !== 'draft' && entry.log_status !== 'rejected') {
            showError("Cannot edit submitted logs");
            return;
        }

        const eDate = new Date(entry.log_date);
        const dateStr = formatDate(eDate);
        setSelectedDate(dateStr);
        setCurrentDate(eDate); // Ensure weekly view switches to the entry's week
        setEditingId(entry.id!);

        try {
            setFormData(prev => ({ ...prev, project_id: String(entry.project_id) }));
            const mods = await projectService.getModules(entry.project_id);
            setModules(mods);

            setFormData(prev => ({ ...prev, module_id: String(entry.module_id) }));
            const tsks = await projectService.getTasks(entry.module_id);
            setTasks(tsks);

            setFormData(prev => ({ ...prev, task_id: String(entry.task_id) }));
            const acts = await projectService.getActivities(entry.task_id);
            setActivities(acts);

            setFormData({
                project_id: String(entry.project_id),
                module_id: String(entry.module_id),
                task_id: String(entry.task_id),
                activity_id: String(entry.activity_id),
                duration: String(entry.duration),
                work_status: entry.work_status,
                description: entry.description
            });

        } catch (e) {
            console.error("Error populating edit form", e);
            showError("Error loading entry details");
        }
    };

    const confirmDelete = async () => {
        if (!entryToDelete) return;

        try {
            await timesheetService.deleteEntry(entryToDelete);
            showSuccess("Entry deleted successfully");
            fetchEntries();
        } catch (err: any) {
            showError(err.message || "Failed to delete");
        } finally {
            setIsDeleteModalOpen(false);
            setEntryToDelete(null);
        }
    };

    const handleDeleteClick = (id: number) => {
        setEntryToDelete(id);
        setIsDeleteModalOpen(true);
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
            return formatDate(eDate) === dateStr;
        });
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

                        <div className="week-navigator">
                            <button className="nav-btn" onClick={() => changeWeek(-1)}><ChevronLeft size={20} /></button>
                            <span className="current-week-display">
                                {weekRange.start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} - {weekRange.end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                            <button className="nav-btn" onClick={() => changeWeek(1)}><ChevronRight size={20} /></button>
                        </div>
                    </div>
                </div>

                <div className="timesheet-layout">
                    {/* Left Column: Form */}
                    <div className="form-column">
                        <div className="log-form-card">
                            <div className="form-title" style={{ justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Clock size={18} />
                                    {editingId ? 'Edit Log Entry' : 'Log Time'}
                                </div>
                                {!isWeekEditable && !editingId && <span style={{ fontSize: '11px', color: '#64748b', background: '#f1f5f9', padding: '2px 8px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>Locked</span>}
                            </div>
                            <fieldset disabled={!isWeekEditable && !editingId} style={{ border: 'none', padding: 0, margin: 0 }}>
                                <form onSubmit={handleSubmit}>
                                    {/* Date */}
                                    <div className="ts-form-group">
                                        <label className="ts-form-label">Date</label>
                                        <DatePicker
                                            value={selectedDate}
                                            onChange={setSelectedDate}
                                            max={new Date().toISOString().split('T')[0]} // Cannot log future
                                        />
                                    </div>

                                    {/* Project Struct */}
                                    <div className="ts-form-group">
                                        <label className="ts-form-label">Project</label>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button
                                                    variant="outline"
                                                    className="ts-dropdown-trigger"
                                                    type="button"
                                                    style={{
                                                        width: '100%',
                                                        justifyContent: 'space-between',
                                                        padding: '12px 16px',
                                                        fontSize: '15px',
                                                        fontFamily: 'Poppins, sans-serif',
                                                        border: '1px solid #e6e8f0',
                                                        borderRadius: '8px',
                                                        backgroundColor: '#ffffff',
                                                        color: '#203050',
                                                        height: 'auto',
                                                        fontWeight: 500
                                                    }}
                                                >
                                                    <span>
                                                        {projects.find(p => String(p.id) === formData.project_id)?.name || 'Select Project'}
                                                    </span>
                                                    <ChevronDown size={14} />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent className="ts-dropdown-content" style={{ width: 'var(--radix-dropdown-menu-trigger-width)' }}>
                                                {projects.map(p => (
                                                    <DropdownMenuItem
                                                        key={p.id}
                                                        onClick={() => handleProjectChange(String(p.id))}
                                                    >
                                                        {p.name}
                                                    </DropdownMenuItem>
                                                ))}
                                                {projects.length === 0 && <DropdownEmptyState message="No projects available" />}
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>

                                    <div className="ts-form-group">
                                        <label className="ts-form-label">Module</label>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button
                                                    variant="outline"
                                                    className="ts-dropdown-trigger"
                                                    type="button"
                                                >
                                                    <span>
                                                        {modules.find(m => String(m.id) === formData.module_id)?.name || 'Select Module'}
                                                    </span>
                                                    <ChevronDown size={14} />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent className="ts-dropdown-content" style={{ width: 'var(--radix-dropdown-menu-trigger-width)' }}>
                                                {!formData.project_id ? (
                                                    <DropdownEmptyState message="Please select a project first" />
                                                ) : modules.length === 0 ? (
                                                    <DropdownEmptyState message="No modules available for this project" />
                                                ) : (
                                                    modules.map(m => (
                                                        <DropdownMenuItem
                                                            key={m.id}
                                                            onClick={() => handleModuleChange(String(m.id))}
                                                        >
                                                            {m.name}
                                                        </DropdownMenuItem>
                                                    ))
                                                )}
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>

                                    <div className="ts-form-group">
                                        <label className="ts-form-label">Task</label>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button
                                                    variant="outline"
                                                    className="ts-dropdown-trigger"
                                                    type="button"
                                                >
                                                    <span>
                                                        {tasks.find(t => String(t.id) === formData.task_id)?.name || 'Select Task'}
                                                    </span>
                                                    <ChevronDown size={14} />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent className="ts-dropdown-content" style={{ width: 'var(--radix-dropdown-menu-trigger-width)' }}>
                                                {!formData.module_id ? (
                                                    <DropdownEmptyState message="Please select a module first" />
                                                ) : tasks.length === 0 ? (
                                                    <DropdownEmptyState message="No tasks available for this module" />
                                                ) : (
                                                    tasks.map(t => (
                                                        <DropdownMenuItem
                                                            key={t.id}
                                                            onClick={() => handleTaskChange(String(t.id))}
                                                        >
                                                            {t.name}
                                                        </DropdownMenuItem>
                                                    ))
                                                )}
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>

                                    <div className="ts-form-group">
                                        <label className="ts-form-label">Activity</label>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button
                                                    variant="outline"
                                                    className="ts-dropdown-trigger"
                                                    type="button"
                                                >
                                                    <span>
                                                        {activities.find(a => String(a.id) === formData.activity_id)?.name || 'Select Activity'}
                                                    </span>
                                                    <ChevronDown size={14} />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent className="ts-dropdown-content" style={{ width: 'var(--radix-dropdown-menu-trigger-width)' }}>
                                                {!formData.task_id ? (
                                                    <DropdownEmptyState message="Please select a task first" />
                                                ) : activities.length === 0 ? (
                                                    <DropdownEmptyState message="No activities available" />
                                                ) : (
                                                    activities.map(a => (
                                                        <DropdownMenuItem
                                                            key={a.id}
                                                            onClick={() => setFormData({ ...formData, activity_id: String(a.id) })}
                                                        >
                                                            {a.name}
                                                        </DropdownMenuItem>
                                                    ))
                                                )}
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>

                                    <div className="ts-form-group">
                                        <label className="ts-form-label">Time Spent (Hrs)</label>
                                        <input
                                            type="number"
                                            step="0.5"
                                            min="0.5"
                                            max="24"
                                            className="ts-form-input"
                                            value={formData.duration}
                                            onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                                            placeholder="e.g. 4.0"
                                            required
                                        />
                                    </div>

                                    <div className="ts-form-group">
                                        <label className="ts-form-label">Work Status</label>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button
                                                    variant="outline"
                                                    className="ts-dropdown-trigger"
                                                    type="button"
                                                >
                                                    <span>
                                                        {formData.work_status === 'in_progress' ? 'In Progress' :
                                                            formData.work_status === 'closed' ? 'Closed' :
                                                                formData.work_status === 'differed' ? 'Differed' :
                                                                    formData.work_status === 'review' ? 'Review' :
                                                                        formData.work_status === 'testing' ? 'Testing' :
                                                                            formData.work_status === 'fixed' ? 'Fixed' :
                                                                                formData.work_status === 'not_applicable' ? 'Not Applicable' : 'Select Work Status'}
                                                    </span>
                                                    <ChevronDown size={14} />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent className="ts-dropdown-content" style={{ width: 'var(--radix-dropdown-menu-trigger-width)' }}>
                                                {[
                                                    { val: 'in_progress', label: 'In Progress' },
                                                    { val: 'closed', label: 'Closed' },
                                                    { val: 'differed', label: 'Differed' },
                                                    { val: 'review', label: 'Review' },
                                                    { val: 'testing', label: 'Testing' },
                                                    { val: 'fixed', label: 'Fixed' },
                                                    { val: 'not_applicable', label: 'Not Applicable' }
                                                ].map(s => (
                                                    <DropdownMenuItem
                                                        key={s.val}
                                                        onClick={() => setFormData({ ...formData, work_status: s.val })}
                                                    >
                                                        {s.label}
                                                    </DropdownMenuItem>
                                                ))}
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>

                                    <div className="ts-form-group">
                                        <label className="ts-form-label">Description</label>
                                        <textarea
                                            className="ts-form-textarea"
                                            value={formData.description}
                                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                            placeholder="Work description..."
                                            required
                                        />
                                    </div>

                                    <div className="form-actions">
                                        {editingId && (
                                            <button
                                                type="button"
                                                className="ts-submit-btn"
                                                style={{ backgroundColor: '#64748b', marginBottom: '8px' }}
                                                onClick={() => {
                                                    setEditingId(null);
                                                    setFormData(initialFormState);
                                                }}
                                            >
                                                Cancel Edit
                                            </button>
                                        )}
                                        <button type="submit" className="ts-submit-btn" disabled={loading || (!isWeekEditable && !editingId)}>
                                            <Save size={18} />
                                            {editingId ? 'Update' : 'Log Time'}
                                        </button>
                                    </div>
                                </form>
                            </fieldset>
                        </div>
                    </div>

                    {/* Right Column: List */}
                    <div className="entries-list-card">
                        <div className="form-title">
                            <FileText size={18} />
                            Weekly Overview
                        </div>

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
                                        <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }}>
                                            {day.toLocaleDateString('en-US', { weekday: 'short' })}
                                        </span>
                                        <span style={{ fontSize: '14px', fontWeight: 700, marginTop: '2px' }}>
                                            {day.getDate()}
                                        </span>

                                        {/* Status Dots */}
                                        <div style={{ display: 'flex', gap: '2px', marginTop: '4px' }}>
                                            {isToday && (
                                                <div style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: '#3b82f6' }} title="Today" />
                                            )}
                                            {dayLogCount > 0 && (
                                                <div style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: '#10b981' }} title="Has Logs" />
                                            )}
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
                                        <div className="day-header">
                                            <div className="day-title-group">
                                                <span className="day-title">
                                                    {day.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}
                                                </span>
                                            </div>
                                            <span className="day-total">{dayTotal.toFixed(2)} Hrs</span>
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
                                                    const isEditable = !entry.project_name?.includes('System') && (
                                                        entry.log_status === 'rejected' || (isWeekEditable && entry.log_status === 'draft')
                                                    );
                                                    const formattedDesc = entry.description?.length > 100
                                                        ? entry.description.substring(0, 100) + '...'
                                                        : entry.description;

                                                    return (
                                                        <div key={entry.id} className={`entry-item premium-card status-${entry.log_status || 'draft'} ${entry.project_name?.includes('System') ? 'holiday-card' : ''}`}>
                                                            <div className="entry-inner">
                                                                <div className="entry-header">
                                                                    <div className="entry-path">
                                                                        <strong>{entry.project_name}</strong>
                                                                        <span className="path-sep">&gt;</span>
                                                                        <span>{entry.module_name}</span>
                                                                        <span className="path-sep">&gt;</span>
                                                                        <span>{entry.task_name}</span>
                                                                        <span className="path-sep">&gt;</span>
                                                                        <span>{entry.activity_name}</span>
                                                                    </div>
                                                                    <div className="duration-label">
                                                                        {parseFloat(String(entry.duration)).toFixed(2)} hrs
                                                                    </div>
                                                                </div>

                                                                {entry.project_name?.includes('System') && entry.description && (
                                                                    <h4 className="holiday-name" style={{ fontSize: '14px', margin: '4px 0' }}>{entry.description}</h4>
                                                                )}

                                                                <div className="description-text">
                                                                    {formattedDesc || 'No description provided.'}
                                                                </div>

                                                                {entry.log_status === 'rejected' && entry.rejection_reason && (
                                                                    <div style={{ marginTop: '8px', padding: '8px', background: '#fee2e2', borderRadius: '4px', border: '1px solid #fecaca', fontSize: '13px', color: '#b91c1c' }}>
                                                                        <strong>Rejection:</strong> {entry.rejection_reason}
                                                                    </div>
                                                                )}

                                                                <div className="entry-footer">
                                                                    <div className="status-pill pill-progress">
                                                                        {entry.work_status.replace('_', ' ')}
                                                                    </div>
                                                                    <div className={`status-pill pill-status status-${entry.log_status || 'draft'}`}>
                                                                        {entry.log_status || 'draft'}
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            <div className="entry-actions-sidebar">
                                                                <button
                                                                    className="action-btn-styled edit"
                                                                    onClick={() => handleEdit(entry)}
                                                                    disabled={!isEditable}
                                                                    title={isEditable ? "Edit Entry" : "Status doesn't allow editing"}
                                                                >
                                                                    <Edit2 size={14} />
                                                                </button>
                                                                <button
                                                                    className="action-btn-styled delete"
                                                                    onClick={() => handleDeleteClick(entry.id!)}
                                                                    disabled={!isEditable}
                                                                    title={isEditable ? "Delete Entry" : "Status doesn't allow deleting"}
                                                                >
                                                                    <Trash2 size={14} />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    );
                                                })
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                    </div>
                </div>

                {/* Confirm Delete Modal */}
                <Modal
                    isOpen={isDeleteModalOpen}
                    onClose={() => setIsDeleteModalOpen(false)}
                    title="Confirm Deletion"
                    footer={
                        <>
                            <button className="modal-btn secondary" onClick={() => setIsDeleteModalOpen(false)}>Cancel</button>
                            <button className="modal-btn danger" onClick={confirmDelete}>Delete</button>
                        </>
                    }
                >
                    <p>Are you sure you want to delete this timesheet entry? This action cannot be undone.</p>
                </Modal>
            </div >
        </AppLayout >
    );
};
