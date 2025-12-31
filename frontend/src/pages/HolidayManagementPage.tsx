import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import AppLayout from '../components/layout/AppLayout';
import { useToast } from '../contexts/ToastContext';
import { DatePicker } from '../components/ui/date-picker';
import * as leaveService from '../services/leaveService';
import { format } from 'date-fns';
import { FaTrash } from 'react-icons/fa';
import './HolidayManagementPage.css';

const HolidayManagementPage: React.FC = () => {
    const queryClient = useQueryClient();
    const { showSuccess, showError } = useToast();

    const [formData, setFormData] = useState({
        holidayDate: '',
        holidayName: ''
    });

    const currentYear = new Date().getFullYear();
    const [selectedYear, setSelectedYear] = useState<number>(currentYear);

    // Fetch holidays
    const { data: holidaysData = [], isLoading: holidaysLoading } = useQuery(
        ['holidays', selectedYear],
        () => leaveService.getHolidays(selectedYear),
        {
            retry: false,
            staleTime: 0,
            cacheTime: 0,
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
            return dateA.getTime() - dateB.getTime();
        });
    }, [holidaysData, selectedYear]);

    // Create holiday mutation
    const createMutation = useMutation(
        ({ holidayDate, holidayName }: { holidayDate: string; holidayName: string }) =>
            leaveService.createHoliday(holidayDate, holidayName),
        {
            onSuccess: () => {
                showSuccess('Holiday created successfully!');
                setFormData({ holidayDate: '', holidayName: '' });
                queryClient.invalidateQueries(['holidays', selectedYear]);
                queryClient.invalidateQueries('holidays');
            },
            onError: (error: any) => {
                const errorMessage = error.response?.data?.error?.message || error.message || 'Failed to create holiday';
                showError(errorMessage);
            }
        }
    );

    // Delete holiday mutation
    const deleteMutation = useMutation(
        (holidayId: number) => leaveService.deleteHoliday(holidayId),
        {
            onSuccess: () => {
                showSuccess('Holiday deleted successfully!');
                queryClient.invalidateQueries(['holidays', selectedYear]);
                queryClient.invalidateQueries('holidays');
            },
            onError: (error: any) => {
                const errorMessage = error.response?.data?.error?.message || error.message || 'Failed to delete holiday';
                showError(errorMessage);
            }
        }
    );

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.holidayDate || !formData.holidayName.trim()) {
            showError('Please fill in all fields');
            return;
        }

        createMutation.mutate({
            holidayDate: formData.holidayDate,
            holidayName: formData.holidayName.trim()
        });
    };

    const handleReset = () => {
        setFormData({ holidayDate: '', holidayName: '' });
    };

    const handleDelete = (holidayId: number, holidayName: string) => {
        if (window.confirm(`Are you sure you want to delete "${holidayName}"?`)) {
            deleteMutation.mutate(holidayId);
        }
    };

    const handleDateChange = (dateStr: string) => {
        setFormData({ ...formData, holidayDate: dateStr });
    };

    return (
        <AppLayout>
            <div className="holiday-management-page">
                <h1 className="hm-page-title">Holiday Management</h1>

                {/* Add Holiday Form */}
                <div className="hm-form-section">
                    <h2>Add New Holiday</h2>
                    <form onSubmit={handleSubmit} className="hm-form">
                        <div className="hm-form-row">
                            <div className="hm-form-group">
                                <label>Holiday Date *</label>
                                <DatePicker
                                    value={formData.holidayDate}
                                    onChange={handleDateChange}
                                    placeholder="Select date"
                                />
                            </div>
                            <div className="hm-form-group">
                                <label>Holiday Name *</label>
                                <input
                                    type="text"
                                    value={formData.holidayName}
                                    onChange={(e) => setFormData({ ...formData, holidayName: e.target.value })}
                                    placeholder="Enter holiday name"
                                    maxLength={100}
                                />
                            </div>
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

                    {holidaysLoading ? (
                        <div className="hm-loading-message">Loading holidays...</div>
                    ) : holidays.length === 0 ? (
                        <div className="hm-no-holidays-message">
                            No holidays found for {selectedYear}
                        </div>
                    ) : (
                        <div className="hm-table-container">
                            <table className="hm-table">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Holiday Name</th>
                                        <th>Day</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {holidays.map((holiday: any) => {
                                        const holidayDate = new Date(holiday.date + 'T00:00:00');
                                        const dayName = holidayDate.toLocaleDateString('en-US', { weekday: 'long' });
                                        const formattedDate = format(holidayDate, 'dd MMM yyyy');

                                        return (
                                            <tr key={holiday.id || holiday.date}>
                                                <td>{formattedDate}</td>
                                                <td>{holiday.name}</td>
                                                <td>{dayName}</td>
                                                <td>
                                                    <button
                                                        className="hm-delete-icon-button"
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
            </div>
        </AppLayout>
    );
};

export default HolidayManagementPage;
