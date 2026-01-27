import React, { useState, useEffect } from 'react';
import { X, FileDown, Loader2, ChevronDown, Search } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { timesheetService } from '../../services/timesheetService';
import { projectService, Project, ProjectModule, ProjectTask, ProjectActivity } from '../../services/projectService';
import { DatePicker } from '../../components/ui/date-picker';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import { Button } from '../../components/ui/button';
import api from '../../services/api';
import './TimesheetReportModal.css';

interface TimesheetReportModalProps {
    isOpen: boolean;
    onClose: () => void;
}

interface Employee {
    id: number;
    first_name?: string;
    last_name?: string;
    emp_id?: string;
    empId?: string;
    name?: string;
}

export const TimesheetReportModal: React.FC<TimesheetReportModalProps> = ({ isOpen, onClose }) => {
    const { user } = useAuth();
    const { showSuccess, showError } = useToast();

    const [loading, setLoading] = useState(false);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [modules, setModules] = useState<ProjectModule[]>([]);
    const [tasks, setTasks] = useState<ProjectTask[]>([]);
    const [activities, setActivities] = useState<ProjectActivity[]>([]);

    // Search states
    const [employeeSearch, setEmployeeSearch] = useState('');
    const [projectSearch, setProjectSearch] = useState('');
    const [moduleSearch, setModuleSearch] = useState('');
    const [taskSearch, setTaskSearch] = useState('');
    const [activitySearch, setActivitySearch] = useState('');

    const [filters, setFilters] = useState({
        employeeId: '',
        projectId: '',
        moduleId: '',
        taskId: '',
        activityId: '',
        startDate: '',
        endDate: ''
    });

    const isHROrAdmin = user?.role === 'hr' || user?.role === 'super_admin';

    useEffect(() => {
        if (isOpen) {
            fetchProjects();
            if (isHROrAdmin) {
                fetchEmployees();
            }
        }
    }, [isOpen, isHROrAdmin]);

    const fetchEmployees = async () => {
        try {
            const response = await api.get('/employees?limit=1000');

            if (response.data && response.data.employees && Array.isArray(response.data.employees)) {
                setEmployees(response.data.employees);
            } else if (response.data && Array.isArray(response.data)) {
                setEmployees(response.data);
            } else {
                console.warn('Unexpected employees response format:', response.data);
                setEmployees([]);
            }
        } catch (error: any) {
            console.error('Failed to fetch employees:', error);
            showError('Failed to load employees list');
            setEmployees([]);
        }
    };

    const fetchProjects = async () => {
        try {
            const data = await projectService.getProjects();
            if (data && Array.isArray(data)) {
                setProjects(data.filter(p => p.status === 'active'));
            } else {
                setProjects([]);
            }
        } catch (error: any) {
            console.error('Failed to fetch projects:', error);
            showError('Failed to load projects list');
            setProjects([]);
        }
    };

    const handleProjectChange = async (projectId: string) => {
        setFilters({ ...filters, projectId, moduleId: '', taskId: '', activityId: '' });
        setModules([]);
        setTasks([]);
        setActivities([]);

        if (!projectId) return;

        try {
            const data = await projectService.getModules(parseInt(projectId));
            setModules(data.filter(m => m.status === 'active'));
        } catch (error) {
            console.error('Failed to fetch modules:', error);
        }
    };

    const handleModuleChange = async (moduleId: string) => {
        setFilters({ ...filters, moduleId, taskId: '', activityId: '' });
        setTasks([]);
        setActivities([]);

        if (!moduleId) return;

        try {
            const data = await projectService.getTasks(parseInt(moduleId));
            setTasks(data.filter(t => t.status !== 'archived'));
        } catch (error) {
            console.error('Failed to fetch tasks:', error);
        }
    };

    const handleTaskChange = async (taskId: string) => {
        setFilters({ ...filters, taskId, activityId: '' });
        setActivities([]);

        if (!taskId) return;

        try {
            const data = await projectService.getActivities(parseInt(taskId));
            setActivities(data.filter(a => a.status !== 'archived'));
        } catch (error) {
            console.error('Failed to fetch activities:', error);
        }
    };

    const handleGeneratePDF = async () => {
        setLoading(true);
        try {
            const reportFilters: any = {};

            if (filters.employeeId) reportFilters.employeeId = parseInt(filters.employeeId);
            if (filters.projectId) reportFilters.projectId = parseInt(filters.projectId);
            if (filters.moduleId) reportFilters.moduleId = parseInt(filters.moduleId);
            if (filters.taskId) reportFilters.taskId = parseInt(filters.taskId);
            if (filters.activityId) reportFilters.activityId = parseInt(filters.activityId);
            if (filters.startDate) reportFilters.startDate = filters.startDate;
            if (filters.endDate) reportFilters.endDate = filters.endDate;

            const blob = await timesheetService.generatePDFReport(reportFilters);

            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `timesheet-report-${new Date().toISOString().split('T')[0]}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);

            showSuccess('PDF report generated successfully');
            onClose();
        } catch (error: any) {
            console.error('Failed to generate PDF:', error);
            showError(error.response?.data?.error || 'Failed to generate PDF report');
        } finally {
            setLoading(false);
        }
    };

    const handleReset = () => {
        setFilters({
            employeeId: '',
            projectId: '',
            moduleId: '',
            taskId: '',
            activityId: '',
            startDate: '',
            endDate: ''
        });
        setModules([]);
        setTasks([]);
        setActivities([]);
        setEmployeeSearch('');
        setProjectSearch('');
        setModuleSearch('');
        setTaskSearch('');
        setActivitySearch('');
    };

    // Helper to get employee display name - handle multiple field name formats
    const getEmployeeName = (emp: Employee) => {
        const firstName = emp.first_name || '';
        const lastName = emp.last_name || '';
        const fullName = emp.name || `${firstName} ${lastName}`.trim();

        return fullName || 'Unknown Employee';
    };

    // Filter functions
    const filteredEmployees = employees.filter(emp =>
        getEmployeeName(emp).toLowerCase().includes(employeeSearch.toLowerCase())
    );

    const filteredProjects = projects.filter(p =>
        p.name.toLowerCase().includes(projectSearch.toLowerCase())
    );

    const filteredModules = modules.filter(m =>
        m.name.toLowerCase().includes(moduleSearch.toLowerCase())
    );

    const filteredTasks = tasks.filter(t =>
        t.name.toLowerCase().includes(taskSearch.toLowerCase())
    );

    const filteredActivities = activities.filter(a =>
        a.name.toLowerCase().includes(activitySearch.toLowerCase())
    );

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content report-modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>Generate Timesheet Report</h2>
                    <button className="close-btn" onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>

                <div className="modal-body">
                    <div className="filter-grid">
                        {/* Employee Filter - Only for HR/Super Admin */}
                        {isHROrAdmin && (
                            <div className="ts-form-group">
                                <label className="ts-form-label">Employee</label>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="outline" className="ts-dropdown-trigger">
                                            <span>
                                                {filters.employeeId
                                                    ? getEmployeeName(employees.find(e => String(e.id) === filters.employeeId)!)
                                                    : 'All Employees'}
                                            </span>
                                            <ChevronDown size={14} />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent className="ts-dropdown-content searchable-dropdown" style={{ width: 'var(--radix-dropdown-menu-trigger-width)' }}>
                                        <div className="dropdown-search">
                                            <Search size={14} />
                                            <input
                                                type="text"
                                                placeholder="Search employees..."
                                                value={employeeSearch}
                                                onChange={(e) => setEmployeeSearch(e.target.value)}
                                                onClick={(e) => e.stopPropagation()}
                                            />
                                        </div>
                                        <div className="dropdown-items">
                                            <DropdownMenuItem onClick={() => { setFilters({ ...filters, employeeId: '' }); setEmployeeSearch(''); }}>
                                                All Employees
                                            </DropdownMenuItem>
                                            {filteredEmployees.map(emp => (
                                                <DropdownMenuItem
                                                    key={emp.id}
                                                    onClick={() => { setFilters({ ...filters, employeeId: String(emp.id) }); setEmployeeSearch(''); }}
                                                >
                                                    {getEmployeeName(emp)}
                                                </DropdownMenuItem>
                                            ))}
                                            {filteredEmployees.length === 0 && employeeSearch && (
                                                <div className="dropdown-empty">No employees found</div>
                                            )}
                                        </div>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        )}

                        {/* Project Filter */}
                        <div className="ts-form-group">
                            <label className="ts-form-label">Project</label>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" className="ts-dropdown-trigger">
                                        <span>
                                            {projects.find(p => String(p.id) === filters.projectId)?.name || 'All Projects'}
                                        </span>
                                        <ChevronDown size={14} />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent className="ts-dropdown-content searchable-dropdown" style={{ width: 'var(--radix-dropdown-menu-trigger-width)' }}>
                                    <div className="dropdown-search">
                                        <Search size={14} />
                                        <input
                                            type="text"
                                            placeholder="Search projects..."
                                            value={projectSearch}
                                            onChange={(e) => setProjectSearch(e.target.value)}
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                        {projectSearch && (
                                            <button
                                                className="search-clear-btn"
                                                onClick={(e) => { e.stopPropagation(); setProjectSearch(''); }}
                                                type="button"
                                            >
                                                <X size={14} />
                                            </button>
                                        )}
                                    </div>
                                    <div className="dropdown-items">
                                        <DropdownMenuItem onClick={() => { handleProjectChange(''); setProjectSearch(''); }}>
                                            All Projects
                                        </DropdownMenuItem>
                                        {filteredProjects.map(proj => (
                                            <DropdownMenuItem
                                                key={proj.id}
                                                onClick={() => { handleProjectChange(String(proj.id)); setProjectSearch(''); }}
                                            >
                                                {proj.name}
                                            </DropdownMenuItem>
                                        ))}
                                        {filteredProjects.length === 0 && projectSearch && (
                                            <div className="dropdown-empty">No projects found</div>
                                        )}
                                    </div>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>

                        {/* Module Filter */}
                        <div className="ts-form-group">
                            <label className="ts-form-label">Module</label>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" className="ts-dropdown-trigger" disabled={!filters.projectId}>
                                        <span>
                                            {modules.find(m => String(m.id) === filters.moduleId)?.name || 'All Modules'}
                                        </span>
                                        <ChevronDown size={14} />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent className="ts-dropdown-content searchable-dropdown" style={{ width: 'var(--radix-dropdown-menu-trigger-width)' }}>
                                    <div className="dropdown-search">
                                        <Search size={14} />
                                        <input
                                            type="text"
                                            placeholder="Search modules..."
                                            value={moduleSearch}
                                            onChange={(e) => setModuleSearch(e.target.value)}
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                        {moduleSearch && (
                                            <button
                                                className="search-clear-btn"
                                                onClick={(e) => { e.stopPropagation(); setModuleSearch(''); }}
                                                type="button"
                                            >
                                                <X size={14} />
                                            </button>
                                        )}
                                    </div>
                                    <div className="dropdown-items">
                                        <DropdownMenuItem onClick={() => { handleModuleChange(''); setModuleSearch(''); }}>
                                            All Modules
                                        </DropdownMenuItem>
                                        {filteredModules.map(mod => (
                                            <DropdownMenuItem
                                                key={mod.id}
                                                onClick={() => { handleModuleChange(String(mod.id)); setModuleSearch(''); }}
                                            >
                                                {mod.name}
                                            </DropdownMenuItem>
                                        ))}
                                        {filteredModules.length === 0 && moduleSearch && (
                                            <div className="dropdown-empty">No modules found</div>
                                        )}
                                    </div>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>

                        {/* Task Filter */}
                        <div className="ts-form-group">
                            <label className="ts-form-label">Task</label>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" className="ts-dropdown-trigger" disabled={!filters.moduleId}>
                                        <span>
                                            {tasks.find(t => String(t.id) === filters.taskId)?.name || 'All Tasks'}
                                        </span>
                                        <ChevronDown size={14} />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent className="ts-dropdown-content searchable-dropdown" style={{ width: 'var(--radix-dropdown-menu-trigger-width)' }}>
                                    <div className="dropdown-search">
                                        <Search size={14} />
                                        <input
                                            type="text"
                                            placeholder="Search tasks..."
                                            value={taskSearch}
                                            onChange={(e) => setTaskSearch(e.target.value)}
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                        {taskSearch && (
                                            <button
                                                className="search-clear-btn"
                                                onClick={(e) => { e.stopPropagation(); setTaskSearch(''); }}
                                                type="button"
                                            >
                                                <X size={14} />
                                            </button>
                                        )}
                                    </div>
                                    <div className="dropdown-items">
                                        <DropdownMenuItem onClick={() => { handleTaskChange(''); setTaskSearch(''); }}>
                                            All Tasks
                                        </DropdownMenuItem>
                                        {filteredTasks.map(task => (
                                            <DropdownMenuItem
                                                key={task.id}
                                                onClick={() => { handleTaskChange(String(task.id)); setTaskSearch(''); }}
                                            >
                                                {task.name}
                                            </DropdownMenuItem>
                                        ))}
                                        {filteredTasks.length === 0 && taskSearch && (
                                            <div className="dropdown-empty">No tasks found</div>
                                        )}
                                    </div>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>

                        {/* Activity Filter */}
                        <div className="ts-form-group">
                            <label className="ts-form-label">Activity</label>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" className="ts-dropdown-trigger" disabled={!filters.taskId}>
                                        <span>
                                            {activities.find(a => String(a.id) === filters.activityId)?.name || 'All Activities'}
                                        </span>
                                        <ChevronDown size={14} />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent className="ts-dropdown-content searchable-dropdown" style={{ width: 'var(--radix-dropdown-menu-trigger-width)' }}>
                                    <div className="dropdown-search">
                                        <Search size={14} />
                                        <input
                                            type="text"
                                            placeholder="Search activities..."
                                            value={activitySearch}
                                            onChange={(e) => setActivitySearch(e.target.value)}
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                        {activitySearch && (
                                            <button
                                                className="search-clear-btn"
                                                onClick={(e) => { e.stopPropagation(); setActivitySearch(''); }}
                                                type="button"
                                            >
                                                <X size={14} />
                                            </button>
                                        )}
                                    </div>
                                    <div className="dropdown-items">
                                        <DropdownMenuItem onClick={() => { setFilters({ ...filters, activityId: '' }); setActivitySearch(''); }}>
                                            All Activities
                                        </DropdownMenuItem>
                                        {filteredActivities.map(act => (
                                            <DropdownMenuItem
                                                key={act.id}
                                                onClick={() => { setFilters({ ...filters, activityId: String(act.id) }); setActivitySearch(''); }}
                                            >
                                                {act.name}
                                            </DropdownMenuItem>
                                        ))}
                                        {filteredActivities.length === 0 && activitySearch && (
                                            <div className="dropdown-empty">No activities found</div>
                                        )}
                                    </div>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>

                        {/* Date Range */}
                        <div className="ts-form-group">
                            <label className="ts-form-label">Start Date</label>
                            <DatePicker
                                value={filters.startDate}
                                onChange={(value) => setFilters({ ...filters, startDate: value })}
                            />
                        </div>

                        <div className="ts-form-group">
                            <label className="ts-form-label">End Date</label>
                            <DatePicker
                                value={filters.endDate}
                                onChange={(value) => setFilters({ ...filters, endDate: value })}
                                min={filters.startDate}
                            />
                        </div>
                    </div>
                </div>

                <div className="modal-footer">
                    <button className="btn-secondary" onClick={handleReset}>
                        Reset Filters
                    </button>
                    <button
                        className="btn-primary"
                        onClick={handleGeneratePDF}
                        disabled={loading}
                    >
                        {loading ? (
                            <>
                                <Loader2 size={18} className="spinner" />
                                Generating...
                            </>
                        ) : (
                            <>
                                <FileDown size={18} />
                                Generate PDF
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};
