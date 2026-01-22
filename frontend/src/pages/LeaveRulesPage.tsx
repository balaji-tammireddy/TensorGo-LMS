import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import AppLayout from '../components/layout/AppLayout';
import { useToast } from '../contexts/ToastContext';
import * as leaveRuleService from '../services/leaveRuleService';
import { LeaveType, LeavePolicyConfig } from '../services/leaveRuleService';
import { FaPlus, FaTrash, FaCog, FaList, FaEdit, FaTimes } from 'react-icons/fa';
import ConfirmationDialog from '../components/ConfirmationDialog';
import { DatePicker } from '../components/ui/date-picker';
import './LeaveRulesPage.css';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { Button } from '../components/ui/button';
import { ChevronDown } from 'lucide-react';

const LeaveRulesPage: React.FC = () => {
    const queryClient = useQueryClient();
    const { showSuccess, showError } = useToast();
    const [activeTab, setActiveTab] = useState<'policies' | 'types'>('policies');
    const [selectedRole, setSelectedRole] = useState<string>('hr');

    // -- Fetch Data --
    const { data: leaveTypes = [] } = useQuery('leaveRulesTypes', leaveRuleService.getLeaveTypes);
    const { data: policiesGrouped = {} } = useQuery('leaveRulesPolicies', leaveRuleService.getPolicies);

    // -- Mutations --
    const createTypeMutation = useMutation(
        (data: { code: string; name: string; description: string; roles: string[] }) =>
            leaveRuleService.createLeaveType(data.code, data.name, data.description, data.roles),
        {
            onSuccess: () => {
                showSuccess('Leave Type Created');
                queryClient.invalidateQueries('leaveRulesTypes');
                queryClient.invalidateQueries('leaveRulesPolicies');
                setNewTypeForm({ code: '', name: '', description: '', roles: [] as string[] });
                setIsCreatingType(false);
            },
            onError: (err: any) => showError(err.response?.data?.error || 'Failed To Create Leave Type')
        }
    );

    const deleteTypeMutation = useMutation(
        (id: number) => leaveRuleService.deleteLeaveType(id),
        {
            onSuccess: () => {
                showSuccess('Leave Type Permanently Deleted');
                queryClient.invalidateQueries('leaveRulesTypes');
                queryClient.invalidateQueries('leaveRulesPolicies');
                setIsDeleteDialogOpen(false);
                setDeleteTypeTarget(null);
            },
            onError: () => showError('Failed To Delete Leave Type. It May Be In Use.')
        }
    );

    const updateTypeMutation = useMutation(
        (data: { id: number; name: string; description: string; is_active: boolean; roles: string[] }) =>
            leaveRuleService.updateLeaveType(data.id, {
                name: data.name,
                description: data.description,
                is_active: data.is_active,
                roles: data.roles
            }),
        {
            onSuccess: () => {
                showSuccess('Leave Type Updated');
                queryClient.invalidateQueries('leaveRulesTypes');
                queryClient.invalidateQueries('leaveRulesPolicies');
                setEditingType(null);
            },
            onError: (err: any) => showError(err.response?.data?.error || 'Failed To Update Leave Type')
        }
    );

    const updatePolicyMutation = useMutation(
        (data: { id: number; updates: Partial<LeavePolicyConfig> }) => leaveRuleService.updatePolicy(data.id, data.updates),
        {
            onSuccess: () => {
                showSuccess('Leave Rules Updated');
                queryClient.invalidateQueries('leaveRulesPolicies');
            },
            onError: () => showError('Failed To Update Leave Rules')
        }
    );

    // -- State for forms --
    const [isCreatingType, setIsCreatingType] = useState(false);
    const [newTypeForm, setNewTypeForm] = useState({ code: '', name: '', description: '', roles: [] as string[] });

    const [editingType, setEditingType] = useState<any | null>(null);
    const [editTypeForm, setEditTypeForm] = useState({ name: '', description: '', is_active: true, roles: [] as string[] });

    // -- State for delete dialog --
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [deleteTypeTarget, setDeleteTypeTarget] = useState<LeaveType | null>(null);

    const [editingPolicy, setEditingPolicy] = useState<LeavePolicyConfig | null>(null);
    const [policyEditForm, setPolicyEditForm] = useState<Partial<LeavePolicyConfig>>({});

    // -- Render Helpers --

    const renderPolicies = () => {
        const roles = ['hr', 'manager', 'employee', 'intern', 'on_notice'];

        const currentRolePolicies: LeavePolicyConfig[] = (policiesGrouped && policiesGrouped[selectedRole]) || [];

        return (
            <div className="lr-policies-section">
                <div className="lr-role-selector">
                    {roles.map(role => (
                        <button
                            key={role}
                            className={`lr-role-btn ${selectedRole === role ? 'active' : ''}`}
                            onClick={() => setSelectedRole(role)}
                        >
                            {role === 'on_notice' ? 'On Notice' : role.charAt(0).toUpperCase() + role.slice(1)}
                        </button>
                    ))}
                </div>



                <div className="lr-policy-cards">
                    {currentRolePolicies.length === 0 ? (
                        <p>No Rules found for this role.</p>
                    ) : (
                        currentRolePolicies.map((policy) => (
                            <div key={policy.id} className="lr-policy-card">
                                <h3>
                                    <div>{policy.leave_type_name}</div>
                                    <button
                                        className="lr-policy-edit-btn"
                                        onClick={() => {
                                            setEditingPolicy(policy);
                                            setPolicyEditForm({
                                                annual_credit: policy.annual_credit,
                                                carry_forward_limit: policy.carry_forward_limit,
                                                max_leave_per_month: policy.max_leave_per_month,
                                                anniversary_3_year_bonus: policy.anniversary_3_year_bonus,
                                                anniversary_5_year_bonus: policy.anniversary_5_year_bonus,
                                                effective_from: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`
                                            });
                                        }}
                                    >
                                        <FaEdit /> Edit
                                    </button>
                                </h3>
                                <div className="lr-policy-grid">
                                    <div className="lr-input-group">
                                        <label>Annual Credit</label>
                                        <input
                                            type="number"
                                            disabled={true}
                                            value={policy.annual_credit}
                                        />
                                        <span className="lr-hint">
                                            {policy.leave_type_code === 'lop'
                                                ? 'Credited Annually At Year End (Additive).'
                                                : `Monthly Equivalent: ${policy.annual_credit ? (parseFloat(policy.annual_credit) / 12).toFixed(2) : '0.00'}`}
                                        </span>
                                    </div>
                                    <div className="lr-input-group">
                                        <label>Carry Forward Limit (Year End)</label>
                                        <input
                                            type="number"
                                            disabled={true}
                                            value={policy.carry_forward_limit}
                                        />
                                    </div>
                                    <div className="lr-input-group">
                                        <label>Max Monthly Limit</label>
                                        <input
                                            type="number"
                                            disabled={true}
                                            value={policy.max_leave_per_month}
                                        />
                                    </div>
                                    <div className="lr-input-group">
                                        <label>3-Year Anniversary Bonus</label>
                                        <input
                                            type="number"
                                            disabled={true}
                                            value={policy.anniversary_3_year_bonus}
                                        />
                                    </div>
                                    <div className="lr-input-group">
                                        <label>5-Year Anniversary Bonus</label>
                                        <input
                                            type="number"
                                            disabled={true}
                                            value={policy.anniversary_5_year_bonus}
                                        />
                                    </div>
                                    {policy.effective_from && (
                                        <div className="lr-input-group">
                                            <label>Effective From</label>
                                            <input
                                                type="text"
                                                disabled={true}
                                                value={new Date(policy.effective_from).toLocaleDateString('en-GB')}
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {editingPolicy && (
                    <div className="lr-modal-overlay">
                        <div className="lr-modal-container">
                            <div className="lr-modal-header">
                                <h3>Edit Rules: {editingPolicy.leave_type_name} ({selectedRole.toUpperCase()})</h3>
                                <button className="lr-modal-close" onClick={() => setEditingPolicy(null)}><FaTimes /></button>
                            </div>
                            <div className="lr-modal-body">
                                <div className="lr-policy-grid">
                                    <div className="lr-input-group">
                                        <label>Annual Credit</label>
                                        <input
                                            type="number"
                                            step="0.5"
                                            min="0"
                                            value={policyEditForm.annual_credit}
                                            onChange={(e) => {
                                                const val = parseFloat(e.target.value);
                                                if (val < 0) return;
                                                setPolicyEditForm({ ...policyEditForm, annual_credit: e.target.value })
                                            }}
                                        />
                                        <span className="lr-hint">
                                            {editingPolicy.leave_type_code === 'lop'
                                                ? 'Credited Annually At Year End (Additive).'
                                                : `Monthly Equivalent: ${policyEditForm.annual_credit ? (parseFloat(policyEditForm.annual_credit) / 12).toFixed(2) : '0.00'}`}
                                        </span>
                                    </div>
                                    <div className="lr-input-group">
                                        <label>Carry Forward Limit (Year End)</label>
                                        <input
                                            type="number"
                                            step="0.5"
                                            min="0"
                                            value={policyEditForm.carry_forward_limit}
                                            onChange={(e) => {
                                                const val = parseFloat(e.target.value);
                                                if (val < 0) return;
                                                setPolicyEditForm({ ...policyEditForm, carry_forward_limit: e.target.value })
                                            }}
                                        />
                                    </div>
                                    <div className="lr-input-group">
                                        <label>Max Monthly Limit</label>
                                        <input
                                            type="number"
                                            step="0.5"
                                            min="0"
                                            value={policyEditForm.max_leave_per_month}
                                            onChange={(e) => {
                                                const val = parseFloat(e.target.value);
                                                if (val < 0) return;
                                                setPolicyEditForm({ ...policyEditForm, max_leave_per_month: e.target.value })
                                            }}
                                        />
                                    </div>
                                    <div className="lr-input-group">
                                        <label>3-Year Anniversary Bonus</label>
                                        <input
                                            type="number"
                                            step="0.5"
                                            min="0"
                                            value={policyEditForm.anniversary_3_year_bonus}
                                            onChange={(e) => {
                                                const val = parseFloat(e.target.value);
                                                if (val < 0) return;
                                                setPolicyEditForm({ ...policyEditForm, anniversary_3_year_bonus: e.target.value })
                                            }}
                                        />
                                    </div>
                                    <div className="lr-input-group">
                                        <label>5-Year Anniversary Bonus</label>
                                        <input
                                            type="number"
                                            step="0.5"
                                            min="0"
                                            value={policyEditForm.anniversary_5_year_bonus}
                                            onChange={(e) => {
                                                const val = parseFloat(e.target.value);
                                                if (val < 0) return;
                                                setPolicyEditForm({ ...policyEditForm, anniversary_5_year_bonus: e.target.value })
                                            }}
                                        />
                                    </div>
                                    <div className="lr-input-group">
                                        <label>Effective Date (For Updates)</label>
                                        <div style={{ width: '100%' }}>
                                            <DatePicker
                                                value={policyEditForm.effective_from || ''}
                                                onChange={(date) => setPolicyEditForm({ ...policyEditForm, effective_from: date })}
                                                min={`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`}
                                                placeholder="Select effective date"
                                                displayFormat="dd/MM/yyyy"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="lr-modal-footer">
                                <button
                                    className="lr-save-btn"
                                    disabled={updatePolicyMutation.isLoading}
                                    onClick={() => {
                                        updatePolicyMutation.mutate({
                                            id: editingPolicy.id,
                                            updates: policyEditForm
                                        }, {
                                            onSuccess: () => setEditingPolicy(null)
                                        });
                                    }}
                                >
                                    {updatePolicyMutation.isLoading ? 'Saving...' : 'Save'}
                                </button>
                                <button
                                    className="lr-cancel-btn"
                                    onClick={() => {
                                        setPolicyEditForm({
                                            annual_credit: editingPolicy.annual_credit,
                                            carry_forward_limit: editingPolicy.carry_forward_limit,
                                            max_leave_per_month: editingPolicy.max_leave_per_month,
                                            anniversary_3_year_bonus: editingPolicy.anniversary_3_year_bonus,
                                            anniversary_5_year_bonus: editingPolicy.anniversary_5_year_bonus,
                                            effective_from: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`
                                        });
                                    }}
                                >
                                    Reset
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const renderLeaveTypes = () => (
        <div className="lr-types-section">
            <div className="lr-types-header">
                <h2>Leave Types</h2>
                <button className="lr-add-btn" onClick={() => {
                    setIsCreatingType(true);
                    setEditingType(null);
                }}><FaPlus /> Add New</button>
            </div>

            {isCreatingType && (
                <div className="lr-modal-overlay">
                    <div className="lr-modal-container">
                        <div className="lr-modal-header">
                            <h3>Add New Leave Type</h3>
                            <button className="lr-modal-close" onClick={() => setIsCreatingType(false)}><FaTimes /></button>
                        </div>
                        <div className="lr-modal-body">
                            <div className="lr-create-form">
                                <div className="lr-form-row">
                                    <div className="lr-form-group">
                                        <label>Display Name <span style={{ color: 'red' }}>*</span></label>
                                        <input
                                            placeholder="Name"
                                            value={newTypeForm.name}
                                            onChange={e => setNewTypeForm({ ...newTypeForm, name: e.target.value.replace(/[^a-zA-Z0-9\s._-]/g, '') })}
                                        />
                                    </div>
                                </div>

                                <div className="lr-role-options-label">Select Roles This Leave Type Applies To: <span style={{ color: 'red' }}>*</span></div>
                                <div className="lr-role-options">
                                    {['employee', 'manager', 'hr', 'intern', 'on_notice'].map(role => (
                                        <label key={role} className="lr-role-checkbox">
                                            <input
                                                type="checkbox"
                                                checked={newTypeForm.roles.includes(role)}
                                                onChange={e => {
                                                    const roles = e.target.checked
                                                        ? [...newTypeForm.roles, role]
                                                        : newTypeForm.roles.filter(r => r !== role);
                                                    setNewTypeForm({ ...newTypeForm, roles });
                                                }}
                                            />
                                            {role === 'hr' ? 'HR' : role === 'on_notice' ? 'On Notice' : role.charAt(0).toUpperCase() + role.slice(1)}
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="lr-modal-footer">
                            <button
                                className="lr-save-btn"
                                disabled={createTypeMutation.isLoading}
                                onClick={() => createTypeMutation.mutate(newTypeForm)}
                            >
                                {createTypeMutation.isLoading ? 'Saving...' : 'Save'}
                            </button>
                            <button
                                className="lr-cancel-btn"
                                onClick={() => {
                                    setNewTypeForm({ code: '', name: '', description: '', roles: [] });
                                }}
                            >
                                Reset
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {editingType && (
                <div className="lr-modal-overlay">
                    <div className="lr-modal-container">
                        <div className="lr-modal-header">
                            <h3>Edit Leave Type: {editingType.code}</h3>
                            <button className="lr-modal-close" onClick={() => setEditingType(null)}><FaTimes /></button>
                        </div>
                        <div className="lr-modal-body">
                            <div className="lr-create-form">
                                <div className="lr-form-row">
                                    <div className="lr-form-group">
                                        <label>Display Name</label>
                                        <input
                                            placeholder="Display Name"
                                            value={editTypeForm.name}
                                            onChange={e => setEditTypeForm({ ...editTypeForm, name: e.target.value.replace(/[^a-zA-Z0-9\s._-]/g, '') })}
                                        />
                                    </div>
                                    <div className="lr-form-group">
                                        <div className="lr-status-toggle">
                                            <label>Status:</label>
                                            <div style={{ width: 'fit-content' }}>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button
                                                            variant="outline"
                                                            className="justify-between font-normal"
                                                            style={{
                                                                minWidth: '100px',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'space-between',
                                                                height: '40px',
                                                                padding: '0 12px',
                                                                border: '1px solid #e2e8f0',
                                                                borderRadius: '6px',
                                                                backgroundColor: 'white',
                                                                color: editTypeForm.is_active ? '#16a34a' : '#dc2626',
                                                                fontSize: '14px'
                                                            }}
                                                        >
                                                            <span>{editTypeForm.is_active ? 'Active' : 'Inactive'}</span>
                                                            <ChevronDown style={{ width: '16px', height: '16px', opacity: 0.5, marginLeft: '8px', color: '#64748b' }} />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent style={{ width: 'var(--radix-dropdown-menu-trigger-width)', minWidth: '100px', backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '4px', zIndex: 1000 }} align="start">
                                                        <DropdownMenuItem
                                                            style={{ fontSize: '14px', padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', borderRadius: '4px', color: '#16a34a' }}
                                                            onSelect={() => setEditTypeForm({ ...editTypeForm, is_active: true })}
                                                        >
                                                            Active
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem
                                                            style={{ fontSize: '14px', padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', borderRadius: '4px', color: '#dc2626' }}
                                                            onSelect={() => setEditTypeForm({ ...editTypeForm, is_active: false })}
                                                        >
                                                            Inactive
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="lr-role-options-label">Select Roles This Leave Type Applies To:</div>
                                <div className="lr-role-options">
                                    {['employee', 'manager', 'hr', 'intern', 'on_notice'].map(role => (
                                        <label key={role} className="lr-role-checkbox">
                                            <input
                                                type="checkbox"
                                                checked={editTypeForm.roles.includes(role)}
                                                onChange={e => {
                                                    const roles = e.target.checked
                                                        ? [...editTypeForm.roles, role]
                                                        : editTypeForm.roles.filter(r => r !== role);
                                                    setEditTypeForm({ ...editTypeForm, roles });
                                                }}
                                            />
                                            {role === 'hr' ? 'HR' : role === 'on_notice' ? 'On Notice' : role.charAt(0).toUpperCase() + role.slice(1)}
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="lr-modal-footer">
                            <button
                                className="lr-save-btn"
                                disabled={updateTypeMutation.isLoading}
                                onClick={() => updateTypeMutation.mutate({ id: editingType.id, ...editTypeForm })}
                            >
                                {updateTypeMutation.isLoading ? 'Updating...' : 'Update'}
                            </button>
                            <button
                                className="lr-cancel-btn"
                                onClick={() => {
                                    setEditTypeForm({
                                        name: editingType.name,
                                        description: editingType.description || '',
                                        is_active: editingType.is_active,
                                        roles: editingType.roles || []
                                    });
                                }}
                            >
                                Reset
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <table className="lr-table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {(leaveTypes || []).map((type: LeaveType & { roles: string[] }) => (
                        <tr key={type.id} className={!type.is_active ? 'inactive' : ''}>
                            <td className="lr-name-col">
                                {type.name}
                            </td>
                            <td>
                                <span className={`status-pill ${type.is_active ? 'active' : 'inactive'}`}>
                                    {type.is_active ? 'Active' : 'Inactive'}
                                </span>
                            </td>
                            <td className="lr-actions-cell">
                                <button
                                    className="lr-edit-icon-btn"
                                    title="Edit"
                                    onClick={() => {
                                        setEditingType(type);
                                        setEditTypeForm({
                                            name: type.name,
                                            description: type.description || '',
                                            is_active: type.is_active,
                                            roles: type.roles || []
                                        });
                                        setIsCreatingType(false);
                                    }}
                                >
                                    <FaEdit />
                                </button>
                                <button
                                    className="lr-delete-icon-btn"
                                    title="Delete"
                                    onClick={() => {
                                        setDeleteTypeTarget(type);
                                        setIsDeleteDialogOpen(true);
                                    }}
                                >
                                    <FaTrash />
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );

    return (
        <AppLayout>
            <div className="leave-rules-page">
                <div className="page-header">
                    <h1 className="page-title">Leave Rules</h1>
                    <div className="lr-tabs">
                        <button
                            className={`lr-tab ${activeTab === 'policies' ? 'active' : ''}`}
                            onClick={() => setActiveTab('policies')}
                        >
                            <FaList /> Role Configurations
                        </button>
                        <button
                            className={`lr-tab ${activeTab === 'types' ? 'active' : ''}`}
                            onClick={() => setActiveTab('types')}
                        >
                            <FaCog /> Leave Types
                        </button>
                    </div>
                </div>

                <div className="lr-content">
                    {activeTab === 'policies' ? renderPolicies() : renderLeaveTypes()}
                </div>

                {/* Delete Confirmation Dialog */}
                <ConfirmationDialog
                    isOpen={isDeleteDialogOpen}
                    title="Delete Leave Type"
                    message={`Are You Sure You Want To Permanently Delete "${deleteTypeTarget?.name}"? \n\nThis Action Will Also Delete All Policy Configurations For This Type Across All Roles. This Cannot Be Undone.`}
                    confirmText="Delete Permanently"
                    cancelText="Keep Leave Type"
                    onConfirm={() => deleteTypeTarget && deleteTypeMutation.mutate(deleteTypeTarget.id)}
                    onCancel={() => {
                        setIsDeleteDialogOpen(false);
                        setDeleteTypeTarget(null);
                    }}
                    type="danger"
                    isLoading={deleteTypeMutation.isLoading}
                />
            </div>
        </AppLayout>
    );
};

export default LeaveRulesPage;
