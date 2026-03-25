import React, { useState, useEffect } from 'react';
import { X, FileDown, Loader2, ChevronDown, Search } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { timesheetService } from '../../services/timesheetService';
import { projectService, Project, ProjectModule, ProjectTask } from '../../services/projectService';
import { DatePicker } from '../../components/ui/date-picker';
// import { Modal } from '../../components/ui/modal';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
// import { Button } from '../../components/ui/button';
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
    const [loadingExcel, setLoadingExcel] = useState(false);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [modules, setModules] = useState<ProjectModule[]>([]);
    const [tasks, setTasks] = useState<ProjectTask[]>([]);


    // Search states
    const [employeeSearch, setEmployeeSearch] = useState('');
    const [projectSearch, setProjectSearch] = useState('');
    const [moduleSearch, setModuleSearch] = useState('');
    const [taskSearch, setTaskSearch] = useState('');


    const [filters, setFilters] = useState({
        employeeId: '',
        projectId: '',
        moduleId: '',
        taskId: '',
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
        setFilters({ ...filters, projectId, moduleId: '', taskId: '' });
        setModules([]);
        setTasks([]);

        if (!projectId) return;

        try {
            const data = await projectService.getModules(parseInt(projectId));
            setModules(data.filter(m => m.status === 'active'));
        } catch (error) {
            console.error('Failed to fetch modules:', error);
        }
    };

    const handleModuleChange = async (moduleId: string) => {
        setFilters({ ...filters, moduleId, taskId: '' });
        setTasks([]);

        if (!moduleId) return;

        try {
            const data = await projectService.getTasks(parseInt(moduleId));
            setTasks(data.filter(t => t.status !== 'archived'));
        } catch (error) {
            console.error('Failed to fetch tasks:', error);
        }
    };

    const handleTaskChange = async (taskId: string) => {
        setFilters({ ...filters, taskId });
    };

    const handleGeneratePDF = async () => {
        setLoading(true);
        generateReportFile('pdf');
    };

    const handleGenerateExcel = async () => {
        setLoadingExcel(true);
        generateReportFile('excel');
    };

    const generateReportFile = async (format: 'pdf' | 'excel') => {
        try {
            const reportFilters: any = {};

            if (filters.employeeId) reportFilters.employeeId = parseInt(filters.employeeId);
            if (filters.projectId) reportFilters.projectId = parseInt(filters.projectId);
            if (filters.moduleId) reportFilters.moduleId = parseInt(filters.moduleId);
            if (filters.taskId) reportFilters.taskId = parseInt(filters.taskId);

            if (filters.startDate) reportFilters.startDate = filters.startDate;
            if (filters.endDate) reportFilters.endDate = filters.endDate;

            let blob: Blob;
            if (format === 'pdf') {
                blob = await timesheetService.generatePDFReport(reportFilters);
            } else {
                blob = await timesheetService.generateExcelReport(reportFilters);
            }

            // Check if the blob is actually a JSON error (happens with responseType: 'blob')
            if (blob.type === 'application/json') {
                const text = await blob.text();
                const errorData = JSON.parse(text);
                throw new Error(errorData.error || `Failed to generate ${format.toUpperCase()} report`);
            }

            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `timesheet-report-${new Date().toISOString().split('T')[0]}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);

            showSuccess(`${format.toUpperCase()} report generated successfully`);
            onClose();
        } catch (error: any) {
            console.error(`Failed to generate ${format}:`, error);
            let errorMessage = `Failed to generate ${format.toUpperCase()} report`;

            if (error.response?.data instanceof Blob) {
                try {
                    const text = await error.response.data.text();
                    const errorData = JSON.parse(text);
                    errorMessage = errorData.error || errorMessage;
                } catch (e) {
                    console.error('Failed to parse error blob:', e);
                }
            } else if (error.response?.data?.error) {
                errorMessage = error.response.data.error;
            } else if (error.message) {
                errorMessage = error.message;
            }

            showError(errorMessage);
        } finally {
            if (format === 'pdf') setLoading(false);
            else setLoadingExcel(false);
        }
    };

    const handleReset = () => {
        setFilters({
            employeeId: '',
            projectId: '',
            moduleId: '',
            taskId: '',
            startDate: '',
            endDate: ''
        });
        setModules([]);
        setTasks([]);
        setEmployeeSearch('');
        setProjectSearch('');
        setModuleSearch('');
        setTaskSearch('');
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



    if (!isOpen) return null;

    return (
        <div className="modal-overlay">
            <div className="modal-container report-modal-container">
                <div className="modal-header">
                    <h2>Generate Timesheet Report</h2>
                    <button onClick={onClose} className="close-button">
                        <X size={20} />
                    </button>
                </div>

                <div className="modal-body">
                    <div className="filter-grid">
                        {/* Row 1: Employee & Project */}
                        <div className="grid-row">
                            {isHROrAdmin && (
                                <div className="ts-form-group">
                                    <label className="ts-form-label">Employee</label>
                                    <DropdownMenu onOpenChange={(open) => !open && setEmployeeSearch('')}>
                                        <DropdownMenuTrigger asChild>
                                            <button className="custom-select-trigger">
                                                <span className="selected-val">
                                                    {filters.employeeId
                                                        ? getEmployeeName(employees.find(e => String(e.id) === filters.employeeId)!)
                                                        : 'All Employees'}
                                                </span>
                                                <ChevronDown size={16} className="text-gray-400" />
                                            </button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent className="manager-dropdown-content" style={{ width: 'var(--radix-dropdown-menu-trigger-width)' }}>
                                            <div className="dropdown-search-wrapper">
                                                <Search size={14} className="search-icon" />
                                                <input
                                                    type="text"
                                                    placeholder="Search employees..."
                                                    value={employeeSearch}
                                                    onChange={(e) => setEmployeeSearch(e.target.value)}
                                                    className="dropdown-search-input"
                                                    onClick={(e) => e.stopPropagation()}
                                                />
                                            </div>
                                            <div className="dropdown-items-scroll">
                                                <DropdownMenuItem onClick={() => setFilters({ ...filters, employeeId: '' })} className="manager-item">
                                                    All Employees
                                                </DropdownMenuItem>
                                                {filteredEmployees.map(emp => (
                                                    <DropdownMenuItem
                                                        key={emp.id}
                                                        onClick={() => setFilters({ ...filters, employeeId: String(emp.id) })}
                                                        className="manager-item"
                                                    >
                                                        <div className="manager-info">
                                                            <span className="manager-name">
                                                                {getEmployeeName(emp)}
                                                                {emp.empId && <span className="manager-id">({emp.empId})</span>}
                                                            </span>
                                                        </div>
                                                    </DropdownMenuItem>
                                                ))}
                                                {filteredEmployees.length === 0 && employeeSearch && (
                                                    <div className="no-results">No employees found</div>
                                                )}
                                            </div>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            )}

                            <div className="ts-form-group">
                                <label className="ts-form-label">Project</label>
                                <DropdownMenu onOpenChange={(open) => !open && setProjectSearch('')}>
                                    <DropdownMenuTrigger asChild>
                                        <button className="custom-select-trigger">
                                            <span className="selected-val">
                                                {projects.find(p => String(p.id) === filters.projectId)?.name || 'All Projects'}
                                            </span>
                                            <ChevronDown size={16} className="text-gray-400" />
                                        </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent className="manager-dropdown-content" style={{ width: 'var(--radix-dropdown-menu-trigger-width)' }}>
                                        <div className="dropdown-search-wrapper">
                                            <Search size={14} className="search-icon" />
                                            <input
                                                type="text"
                                                placeholder="Search projects..."
                                                value={projectSearch}
                                                onChange={(e) => setProjectSearch(e.target.value)}
                                                className="dropdown-search-input"
                                                onClick={(e) => e.stopPropagation()}
                                            />
                                        </div>
                                        <div className="dropdown-items-scroll">
                                            <DropdownMenuItem onClick={() => handleProjectChange('')} className="manager-item">
                                                All Projects
                                            </DropdownMenuItem>
                                            {filteredProjects.map(proj => (
                                                <DropdownMenuItem
                                                    key={proj.id}
                                                    onClick={() => handleProjectChange(String(proj.id))}
                                                    className="manager-item"
                                                >
                                                    <span className="manager-name">{proj.name}</span>
                                                </DropdownMenuItem>
                                            ))}
                                            {filteredProjects.length === 0 && projectSearch && (
                                                <div className="no-results">No projects found</div>
                                            )}
                                        </div>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        </div>

                        {/* Row 2: Module & Task */}
                        <div className="grid-row">
                            <div className="ts-form-group">
                                <label className="ts-form-label">Module</label>
                                <DropdownMenu onOpenChange={(open) => !open && setModuleSearch('')}>
                                    <DropdownMenuTrigger asChild disabled={!filters.projectId}>
                                        <button className={`custom-select-trigger ${!filters.projectId ? 'disabled' : ''}`}>
                                            <span className="selected-val">
                                                {modules.find(m => String(m.id) === filters.moduleId)?.name || 'All Modules'}
                                            </span>
                                            <ChevronDown size={16} className="text-gray-400" />
                                        </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent className="manager-dropdown-content" style={{ width: 'var(--radix-dropdown-menu-trigger-width)' }}>
                                        <div className="dropdown-search-wrapper">
                                            <Search size={14} className="search-icon" />
                                            <input
                                                type="text"
                                                placeholder="Search modules..."
                                                value={moduleSearch}
                                                onChange={(e) => setModuleSearch(e.target.value)}
                                                className="dropdown-search-input"
                                                onClick={(e) => e.stopPropagation()}
                                            />
                                        </div>
                                        <div className="dropdown-items-scroll">
                                            <DropdownMenuItem onClick={() => handleModuleChange('')} className="manager-item">
                                                All Modules
                                            </DropdownMenuItem>
                                            {filteredModules.map(mod => (
                                                <DropdownMenuItem
                                                    key={mod.id}
                                                    onClick={() => handleModuleChange(String(mod.id))}
                                                    className="manager-item"
                                                >
                                                    <span className="manager-name">{mod.name}</span>
                                                </DropdownMenuItem>
                                            ))}
                                        </div>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>

                            <div className="ts-form-group">
                                <label className="ts-form-label">Task</label>
                                <DropdownMenu onOpenChange={(open) => !open && setTaskSearch('')}>
                                    <DropdownMenuTrigger asChild disabled={!filters.moduleId}>
                                        <button className={`custom-select-trigger ${!filters.moduleId ? 'disabled' : ''}`}>
                                            <span className="selected-val">
                                                {tasks.find(t => String(t.id) === filters.taskId)?.name || 'All Tasks'}
                                            </span>
                                            <ChevronDown size={16} className="text-gray-400" />
                                        </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent className="manager-dropdown-content" style={{ width: 'var(--radix-dropdown-menu-trigger-width)' }}>
                                        <div className="dropdown-search-wrapper">
                                            <Search size={14} className="search-icon" />
                                            <input
                                                type="text"
                                                placeholder="Search tasks..."
                                                value={taskSearch}
                                                onChange={(e) => setTaskSearch(e.target.value)}
                                                className="dropdown-search-input"
                                                onClick={(e) => e.stopPropagation()}
                                            />
                                        </div>
                                        <div className="dropdown-items-scroll">
                                            <DropdownMenuItem onClick={() => handleTaskChange('')} className="manager-item">
                                                All Tasks
                                            </DropdownMenuItem>
                                            {filteredTasks.map(task => (
                                                <DropdownMenuItem
                                                    key={task.id}
                                                    onClick={() => handleTaskChange(String(task.id))}
                                                    className="manager-item"
                                                >
                                                    <span className="manager-name">{task.name}</span>
                                                </DropdownMenuItem>
                                            ))}
                                        </div>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        </div>



                        <div className="grid-row">
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
                </div>

                <div className="modal-footer">
                    <div className="footer-left">
                        <button className="btn btn-secondary btn-reset" onClick={handleReset}>
                            Reset Filters
                        </button>
                    </div>
                    <div className="footer-right">
                        <button className="btn btn-secondary" onClick={onClose} disabled={loading || loadingExcel}>
                            Cancel
                        </button>
                        <button
                            className="btn btn-excel"
                            onClick={handleGenerateExcel}
                            disabled={loading || loadingExcel}
                        >
                            {loadingExcel ? (
                                <>
                                    <Loader2 size={16} className="spinner" />
                                    Generating...
                                </>
                            ) : (
                                <>
                                    <FileDown size={16} />
                                    Excel
                                </>
                            )}
                        </button>
                        <button
                            className="btn btn-primary"
                            onClick={handleGeneratePDF}
                            disabled={loading || loadingExcel}
                        >
                            {loading ? (
                                <>
                                    <Loader2 size={16} className="spinner" />
                                    Generating...
                                </>
                            ) : (
                                <>
                                    <FileDown size={16} />
                                    PDF
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
