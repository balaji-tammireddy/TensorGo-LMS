import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import AppLayout from '../components/layout/AppLayout';
import * as employeeService from '../services/employeeService';
import { format } from 'date-fns';
import './EmployeeManagementPage.css';

const EmployeeManagementPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const { data: employeesData, isLoading, error } = useQuery(
    ['employees', search, filter, statusFilter],
    () => employeeService.getEmployees(1, 20, search || undefined, filter || undefined, statusFilter || undefined),
    {
      retry: false,
      onError: (error: any) => {
        if (error.response?.status === 403 || error.response?.status === 401) {
          window.location.href = '/login';
        }
      }
    }
  );

  const deleteMutation = useMutation(employeeService.deleteEmployee, {
    onSuccess: () => {
      queryClient.invalidateQueries('employees');
      alert('Employee deleted successfully!');
    },
    onError: (error: any) => {
      alert(error.response?.data?.error?.message || 'Failed to delete employee');
    }
  });

  const handleDelete = (id: number, name: string) => {
    if (window.confirm(`Are you sure you want to delete ${name}?`)) {
      deleteMutation.mutate(id);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return '#4caf50';
      case 'on_leave':
        return '#ff9800';
      case 'resigned':
        return '#f44336';
      default:
        return '#666';
    }
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="employee-management-page">
          <div style={{ padding: '20px', textAlign: 'center' }}>Loading...</div>
        </div>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout>
        <div className="employee-management-page">
          <div style={{ padding: '20px', textAlign: 'center', color: 'red' }}>
            {error?.response?.status === 403
              ? 'You do not have permission to view this page. HR access required.'
              : 'Error loading data. Please try again.'}
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="employee-management-page">
        <h1 className="page-title">Employee Management (HR - Dashboard)</h1>

        <div className="search-filter-bar">
          <div className="search-box">
            <input
              type="text"
              placeholder="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button className="search-button">🔍</button>
          </div>
          <div className="filter-box">
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="">All Departments</option>
              <option value="IT">IT</option>
              <option value="HR">HR</option>
              <option value="Engineering">Engineering</option>
            </select>
            <button className="filter-button">▼</button>
          </div>
          <button className="add-employee-button">Add Employee</button>
        </div>

        <div className="employees-section">
          <table className="employees-table">
            <thead>
              <tr>
                <th>SNo</th>
                <th>Emp ID</th>
                <th>Emp Name</th>
                <th>Position</th>
                <th>Joining Date</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {employeesData?.employees.map((employee, idx) => (
                <tr key={employee.id}>
                  <td>{idx + 1}</td>
                  <td>{employee.empId}</td>
                  <td>{employee.name}</td>
                  <td>{employee.position}</td>
                  <td>{format(new Date(employee.joiningDate), 'dd/MM/yyyy')}</td>
                  <td>
                    <span
                      className="status-badge"
                      style={{ color: getStatusColor(employee.status) }}
                    >
                      {employee.status === 'active' ? 'Active' : 
                       employee.status === 'on_leave' ? 'On Leave' : 
                       'Resigned'}
                    </span>
                  </td>
                  <td className="actions-cell">
                    <span className="action-icon" title="View">👁️</span>
                    <span
                      className="action-icon"
                      onClick={() => handleDelete(employee.id, employee.name)}
                      title="Delete"
                    >
                      🗑️
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
};

export default EmployeeManagementPage;

