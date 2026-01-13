import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import AppLayout from '../components/layout/AppLayout';
import { useToast } from '../contexts/ToastContext';
import { DatePicker } from '../components/ui/date-picker';
import * as leaveService from '../services/leaveService';
import { format } from 'date-fns';
import { FaTrash, FaSortUp, FaSortDown } from 'react-icons/fa';
import EmptyState from '../components/common/EmptyState';
import ConfirmationDialog from '../components/ConfirmationDialog';
import './HolidayManagementPage.css';

const HolidayManagementPage: React.FC = () => {
    const queryClient = useQueryClient();
    const { showSuccess, showError } = useToast();

    const [formData, setFormData] = useState({
        holidayDate: '',
        holidayName: ''
    });
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [selectedHoliday, setSelectedHoliday] = useState<{ id: number; name: string } | null>(null);
    const [resetKey, setResetKey] = useState(0);

    const currentYear = new Date().getFullYear();
    const [selectedYear, setSelectedYear] = useState<number>(currentYear);
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

    const handleSortToggle = () => {
        setSortDirection((prev) => prev === 'asc' ? 'desc' : 'asc');
    };

    // Fetch holidays
    const { data: holidaysData = [], isLoading: holidaysLoading } = useQuery(
        ['holidays', selectedYear],
        () => leaveService.getHolidays(selectedYear),
        {
            retry: false,
            staleTime: 0,
            refetchInterval: 5000, // Reduced to 5 seconds for immediate updates
            cacheTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
            keepPreviousData: true, // Keep old data while fetching new
            refetchOnMount: true
        }
    );

    // Filter holidays by selected year
    const holidays = React.useMemo(() => {
        if (!holidaysData || holidaysData.length === 0) return [];
        return holidaysData.filter((holiday: any) => {
            try {
                const holidayDate = new Date(holiday.date + 'T00:00:00');
                const holidayYear = holidayDate.getFullYear();
                return holidayYear === selectedYear;
            } catch (error) {
                return false;
            }
        }).sort((a: any, b: any) => {
            const dateA = new Date(a.date + 'T00:00:00');
            const dateB = new Date(b.date + 'T00:00:00');
            return sortDirection === 'asc'
                ? dateA.getTime() - dateB.getTime()
                : dateB.getTime() - dateA.getTime();
        });
    }, [holidaysData, selectedYear, sortDirection]);

    // Create holiday mutation
    const createMutation = useMutation(
        ({ holidayDate, holidayName }: { holidayDate: string; holidayName: string }) =>
            leaveService.createHoliday(holidayDate, holidayName),
        {
            onSuccess: () => {
                showSuccess('Holiday created!');
                setFormData({ holidayDate: '', holidayName: '' });
                queryClient.invalidateQueries(['holidays', selectedYear]);
                queryClient.invalidateQueries('holidays');
            },
            onError: (error: any) => {
                const errorMessage = error.response?.data?.error?.message || error.message || 'Creation failed';
                showError(errorMessage);
            }
        }
    );

    // Delete holiday mutation
    const deleteMutation = useMutation(
        (holidayId: number) => leaveService.deleteHoliday(holidayId),
        {
            onSuccess: () => {
                showSuccess('Holiday deleted!');
                queryClient.invalidateQueries(['holidays', selectedYear]);
                queryClient.invalidateQueries('holidays');
                setDeleteConfirmOpen(false);
                setSelectedHoliday(null);
            },
            onError: (error: any) => {
                const errorMessage = error.response?.data?.error?.message || error.message || 'Delete failed';
                showError(errorMessage);
                setDeleteConfirmOpen(false);
            }
        }
    );

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.holidayName.trim()) {
            showError('Holiday Name is required');
            return;
        }

        if (!formData.holidayDate) {
            showError('Holiday Date is required');
            return;
        }

        const selectedDate = new Date(formData.holidayDate + 'T00:00:00');
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (selectedDate < today) {
            showError('Holiday Cannot be Added in Past Dates');
            return;
        }

        createMutation.mutate({
            holidayDate: formData.holidayDate,
            holidayName: formData.holidayName.trim()
        });
    };

    const handleReset = () => {
        setFormData({ holidayDate: '', holidayName: '' });
        setResetKey(prev => prev + 1);
    };

    const handleDelete = (holidayId: number, holidayName: string) => {
        setSelectedHoliday({ id: holidayId, name: holidayName });
        setDeleteConfirmOpen(true);
    };

    const confirmDelete = () => {
        if (selectedHoliday) {
            deleteMutation.mutate(selectedHoliday.id);
        }
    };

    const handleDateChange = (dateStr: string) => {
        setFormData({ ...formData, holidayDate: dateStr });
    };

    return (
        <AppLayout>
            <div className="holiday-management-page">
                <h1 className="page-title">Holiday Management</h1>

                {/* Add Holiday Form */}
                <div className="hm-form-section">
                    <h2>Add New Holiday</h2>
                    <form onSubmit={handleSubmit} className="hm-form">
                        <div className="hm-form-row">
                            <div className="hm-form-group hm-form-group-date">
                                <label>Holiday Date <span className="required-indicator">*</span></label>
                                <DatePicker
                                    key={resetKey}
                                    value={formData.holidayDate}
                                    onChange={handleDateChange}
                                    placeholder="DD - MM - YYYY"
                                    min={new Date().toISOString().split('T')[0]}
                                    allowManualEntry={true}
                                    isEmployeeVariant={true}
                                />
                            </div>
                            <div className="hm-form-group hm-form-group-name">
                                <label>Holiday Name <span className="required-indicator">*</span></label>
                                <input
                                    type="text"
                                    value={formData.holidayName}
                                    onChange={(e) => {
                                        const value = e.target.value.replace(/[^a-zA-Z\s]/g, '');
                                        setFormData({ ...formData, holidayName: value });
                                    }}
                                    maxLength={100}
                                />
                            </div>
                            <div className="hm-form-actions">
                                <button
                                    type="submit"
                                    className="hm-submit-button"
                                    disabled={createMutation.isLoading}
                                >
                                    {createMutation.isLoading ? 'Adding...' : 'Add Holiday'}
                                </button>
                                <button
                                    type="button"
                                    className="hm-reset-button"
                                    onClick={handleReset}
                                    disabled={createMutation.isLoading}
                                >
                                    Reset
                                </button>
                            </div>
                        </div>
                    </form>
                </div>

                {/* Holidays List */}
                <div className="hm-list-section">
                    <div className="hm-header">
                        <h2>Holidays List</h2>
                        <div className="hm-year-selector">
                            <button
                                className={`hm-year-button ${selectedYear === currentYear - 1 ? 'active' : ''}`}
                                onClick={() => setSelectedYear(currentYear - 1)}
                            >
                                {currentYear - 1}
                            </button>
                            <button
                                className={`hm-year-button ${selectedYear === currentYear ? 'active' : ''}`}
                                onClick={() => setSelectedYear(currentYear)}
                            >
                                {currentYear}
                            </button>
                            <button
                                className={`hm-year-button ${selectedYear === currentYear + 1 ? 'active' : ''}`}
                                onClick={() => setSelectedYear(currentYear + 1)}
                            >
                                {currentYear + 1}
                            </button>
                        </div>
                    </div>

                    <div className={`hm-table-wrapper ${holidaysLoading && holidays.length > 0 ? 'fetching' : ''}`}>
                        {holidaysLoading && holidays.length === 0 ? (
                            <div className="hm-skeleton-container">
                                {Array.from({ length: 5 }).map((_, idx) => (
                                    <div key={idx} className="hm-skeleton-row"></div>
                                ))}
                            </div>
                        ) : holidays.length === 0 ? (
                            <EmptyState
                                title={`No Holidays for ${selectedYear}`}
                                description="There are no holidays listed for the selected year."
                            />
                        ) : (
                            <div className="hm-table-container">
                                <table className="hm-table">
                                    <thead>
                                        <tr>
                                            <th className="sortable-header" onClick={handleSortToggle}>
                                                <div className="header-sort-wrapper">
                                                    Date
                                                    {sortDirection === 'asc' ? <FaSortUp className="sort-icon active" /> : <FaSortDown className="sort-icon active" />}
                                                </div>
                                            </th>
                                            <th>Name</th>
                                            <th>Day</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {holidays.map((holiday: any) => {
                                            const holidayDate = new Date(holiday.date + 'T00:00:00');
                                            const dayName = holidayDate.toLocaleDateString('en-US', { weekday: 'long' });
                                            const formattedDate = format(holidayDate, 'dd-MM-yyyy');

                                            return (
                                                <tr key={holiday.id || holiday.date}>
                                                    <td>{formattedDate}</td>
                                                    <td>{holiday.name}</td>
                                                    <td>{dayName}</td>
                                                    <td>
                                                        <button
                                                            className="action-btn delete-btn"
                                                            onClick={() => handleDelete(holiday.id, holiday.name)}
                                                            disabled={deleteMutation.isLoading}
                                                            title="Delete holiday"
                                                        >
                                                            <FaTrash />
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                    <ConfirmationDialog
                        isOpen={deleteConfirmOpen}
                        title="Delete Holiday"
                        message={`Are you sure you want to delete "${selectedHoliday?.name}"? This action cannot be undone.`}
                        confirmText="Delete"
                        cancelText="Cancel"
                        type="danger"
                        isLoading={deleteMutation.isLoading}
                        onConfirm={confirmDelete}
                        onCancel={() => {
                            setDeleteConfirmOpen(false);
                            setSelectedHoliday(null);
                        }}
                    />
                </div>
            </div>
        </AppLayout>
    );
};

export default HolidayManagementPage;

