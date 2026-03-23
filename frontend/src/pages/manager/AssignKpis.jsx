import { useEffect, useState, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { fetchTeam } from '../../store/usersSlice';
import { createAssignmentApi, assignToEmployeeApi, bulkCloneKpisApi, getAssignmentsApi, getAssignmentByIdApi, bulkImportKpisApi, downloadKpiTemplate } from '../../api/kpiAssignments.api';
import { createKpiItemApi, updateKpiItemApi, deleteKpiItemApi } from '../../api/kpiItems.api';
import { getKpiTemplatesApi } from '../../api/kpiTemplates.api';
import PageHeader from '../../components/common/PageHeader';
import StatusBadge from '../../components/common/StatusBadge';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import toast from 'react-hot-toast';
import { MONTHS, KPI_CATEGORIES, KPI_UNITS, QUARTER_MAP, FINANCIAL_YEARS, getCurrentFinancialYear, getVisibleMonthOptions } from '../../utils/constants';
import { getMonthName } from '../../utils/formatters';

export default function AssignKpis() {
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.auth);
  const { team } = useSelector((state) => state.users);

  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [financialYear, setFinancialYear] = useState(() => getCurrentFinancialYear());
  const [month, setMonth] = useState('');
  const [assignment, setAssignment] = useState(null);
  const [items, setItems] = useState([]);
  const [showAddItem, setShowAddItem] = useState(false);
  const [newItem, setNewItem] = useState({ title: '', weightage: '', targetValue: '', unit: 'Number', category: 'Other', description: '', thresholdValue: '', stretchTarget: '', remarks: '' });
  const [loading, setLoading] = useState(false);
  const [bulkApplyConfirm, setBulkApplyConfirm] = useState(false);
  const [bulkApplyLoading, setBulkApplyLoading] = useState(false);
  const [eligibleCount, setEligibleCount] = useState(0);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const visibleMonthOptions = useMemo(() => getVisibleMonthOptions(), []);

  useEffect(() => {
    if (user?._id) dispatch(fetchTeam(user._id));
  }, [dispatch, user]);

  // Load existing assignment when employee+month selected
  useEffect(() => {
    if (selectedEmployee && financialYear && month) {
      setLoading(true);
      getAssignmentsApi({ employee: selectedEmployee, financialYear, month })
        .then((res) => {
          const existing = res.data.data?.[0];
          if (existing) {
            // Load full detail
            return getAssignmentByIdApi(existing._id).then((r) => {
              setAssignment(r.data.data.assignment);
              setItems(r.data.data.items);
            });
          } else {
            setAssignment(null);
            setItems([]);
          }
        })
        .finally(() => setLoading(false));
    }
  }, [selectedEmployee, financialYear, month]);

  const handleCreateAssignment = async () => {
    try {
      const res = await createAssignmentApi({ financialYear, month: Number(month), employee: selectedEmployee });
      setAssignment(res.data.data);
      setItems([]);
      toast.success('Assignment created');
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed');
    }
  };

  const handleAddItem = async () => {
    if (!newItem.title || !newItem.weightage || !newItem.targetValue) {
      toast.error('Title, weightage, and target are required');
      return;
    }
    try {
      const res = await createKpiItemApi({
        kpiAssignment: assignment._id,
        ...newItem,
        weightage: Number(newItem.weightage),
        targetValue: Number(newItem.targetValue),
        thresholdValue: newItem.thresholdValue ? Number(newItem.thresholdValue) : undefined,
        stretchTarget: newItem.stretchTarget ? Number(newItem.stretchTarget) : undefined,
      });
      setItems([...items, res.data.data]);
      setNewItem({ title: '', weightage: '', targetValue: '', unit: 'Number', category: 'Other', description: '', thresholdValue: '', stretchTarget: '', remarks: '' });
      setShowAddItem(false);
      toast.success('KPI item added');
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed');
    }
  };

  const openAddItemModal = () => {
    setSelectedTemplate('');
    setShowAddItem(true);
    // Load templates when modal opens
    getKpiTemplatesApi().then((res) => setTemplates(res.data.data || [])).catch(() => setTemplates([]));
  };

  const handleTemplateSelect = (templateId) => {
    setSelectedTemplate(templateId);
    if (!templateId) return;
    const tpl = templates.find((t) => t._id === templateId);
    if (tpl) {
      setNewItem({
        title: tpl.name || '',
        description: tpl.description || '',
        category: tpl.category || 'Other',
        unit: tpl.unit || 'Number',
        weightage: tpl.defaultWeightage ?? '',
        targetValue: tpl.defaultTargetValue ?? '',
        thresholdValue: tpl.defaultThresholdValue ?? '',
        stretchTarget: tpl.defaultStretchTarget ?? '',
        remarks: '',
      });
    }
  };

  const handleDeleteItem = async (itemId) => {
    try {
      await deleteKpiItemApi(itemId);
      setItems(items.filter((i) => i._id !== itemId));
      toast.success('Item removed');
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed');
    }
  };

  const handleAssignToEmployee = async () => {
    try {
      const res = await assignToEmployeeApi(assignment._id);
      setAssignment(res.data.data);
      toast.success('KPIs assigned to employee');
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed');
    }
  };

  // Compute how many team members don't have KPIs for this month
  const checkEligibleForBulk = async () => {
    if (!financialYear || !month || team.length === 0) {
      setEligibleCount(0);
      return 0;
    }
    try {
      const res = await getAssignmentsApi({ financialYear, month, manager: user._id, limit: 100 });
      const existingEmployeeIds = new Set((res.data.data || []).map((a) => a.employee?._id || a.employee));
      const eligible = team.filter((emp) => emp.kpiReviewApplicable !== false && !existingEmployeeIds.has(emp._id));
      setEligibleCount(eligible.length);
      return eligible.length;
    } catch {
      setEligibleCount(0);
      return 0;
    }
  };

  // Recheck eligible count when assignment changes or items are added
  useEffect(() => {
    if (assignment && items.length > 0) {
      checkEligibleForBulk();
    }
  }, [assignment, items.length, financialYear, month, team]);

  const handleBulkApply = async () => {
    setBulkApplyConfirm(false);
    setBulkApplyLoading(true);
    try {
      // Find employees without KPIs for this month
      const res = await getAssignmentsApi({ financialYear, month, manager: user._id, limit: 100 });
      const existingEmployeeIds = new Set((res.data.data || []).map((a) => a.employee?._id || a.employee));
      const targetIds = team
        .filter((emp) => emp.kpiReviewApplicable !== false && !existingEmployeeIds.has(emp._id) && emp._id !== selectedEmployee)
        .map((emp) => emp._id);

      if (targetIds.length === 0) {
        toast.error('All team members already have KPIs for this month');
        setBulkApplyLoading(false);
        return;
      }

      const result = await bulkCloneKpisApi({
        sourceAssignmentId: assignment._id,
        targetEmployeeIds: targetIds,
        targetMonth: Number(month),
        targetFinancialYear: financialYear,
      });
      const data = result.data.data;
      const successCount = data.success?.length || 0;
      const failedCount = data.failed?.length || 0;

      if (successCount > 0 && failedCount === 0) {
        toast.success(`KPIs applied to ${successCount} team member${successCount !== 1 ? 's' : ''}`);
      } else if (successCount > 0 && failedCount > 0) {
        toast.success(`${successCount} succeeded, ${failedCount} failed`);
      } else {
        toast.error(`Bulk apply failed for all ${failedCount} member${failedCount !== 1 ? 's' : ''}`);
      }
      checkEligibleForBulk();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Bulk apply failed');
    } finally {
      setBulkApplyLoading(false);
    }
  };

  const handleOpenImportModal = () => {
    setImportFile(null);
    setImportResult(null);
    setShowImportModal(true);
  };

  const handleImportSubmit = async () => {
    if (!importFile) {
      toast.error('Please select an Excel file');
      return;
    }
    if (!financialYear || !month) {
      toast.error('Please select a financial year and month first');
      return;
    }
    setImportLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      formData.append('financialYear', financialYear);
      formData.append('month', month);
      const res = await bulkImportKpisApi(formData);
      const data = res.data.data;
      setImportResult(data);
      if (data.success?.length > 0) {
        toast.success(`${data.success.length} KPI(s) imported successfully`);
      }
      if (data.errors?.length > 0) {
        toast.error(`${data.errors.length} row(s) had errors`);
      }
      // Refresh current assignment if one is selected
      if (selectedEmployee && financialYear && month) {
        getAssignmentsApi({ employee: selectedEmployee, financialYear, month })
          .then((r) => {
            const existing = r.data.data?.[0];
            if (existing) {
              return getAssignmentByIdApi(existing._id).then((r2) => {
                setAssignment(r2.data.data.assignment);
                setItems(r2.data.data.items);
              });
            }
          })
          .catch(() => {});
      }
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Import failed');
    } finally {
      setImportLoading(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const res = await downloadKpiTemplate();
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'kpi_import_template.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toast.error('Failed to download template');
    }
  };

  const totalWeightage = items.reduce((sum, i) => sum + i.weightage, 0);

  return (
    <div>
      <PageHeader
        title="Assign KPIs"
        subtitle="Create and assign monthly KPIs for your team"
        actions={
          <>
            <button onClick={handleDownloadTemplate} className="btn-secondary text-sm">Download Template</button>
            <button onClick={handleOpenImportModal} className="btn-secondary text-sm" disabled={!financialYear || !month}>Import from Excel</button>
          </>
        }
      />

      {/* Selection */}
      <div className="card mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="label-text">Employee</label>
            <select value={selectedEmployee} onChange={(e) => setSelectedEmployee(e.target.value)} className="input-field">
              <option value="">Select employee</option>
              {team.filter(emp => emp.kpiReviewApplicable !== false).map((emp) => (
                <option key={emp._id} value={emp._id}>{emp.name} ({emp.employeeCode})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label-text">Financial Year</label>
            <select value={financialYear} onChange={(e) => setFinancialYear(e.target.value)} className="input-field">
              {FINANCIAL_YEARS.map((fy) => (
                <option key={fy} value={fy}>FY {fy}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label-text">Month</label>
            <select value={month} onChange={(e) => setMonth(e.target.value)} className="input-field">
              <option value="">Select month</option>
              {visibleMonthOptions.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Assignment area */}
      {selectedEmployee && financialYear && month && (
        <>
          {!assignment ? (
            <div className="card text-center py-8">
              <p className="text-gray-500 mb-4">No assignment exists for this employee/month combination.</p>
              <button onClick={handleCreateAssignment} className="btn-primary">Create Assignment</button>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <StatusBadge status={assignment.status} />
                  <span className="text-sm text-gray-500">Total Weightage: <span className={`font-bold ${totalWeightage === 100 ? 'text-green-600' : 'text-yellow-600'}`}>{totalWeightage}%</span></span>
                </div>
                <div className="flex gap-2">
                  {['draft', 'assigned'].includes(assignment.status) && (
                    <>
                      <button onClick={openAddItemModal} className="btn-secondary">+ Add KPI Item</button>
                      <button onClick={handleOpenImportModal} className="btn-secondary">Import from Excel</button>
                    </>
                  )}
                  {assignment.status === 'draft' && items.length > 0 && (
                    <button onClick={handleAssignToEmployee} className="btn-primary">Assign to Employee</button>
                  )}
                  {items.length > 0 && eligibleCount > 0 && (
                    <button
                      onClick={() => setBulkApplyConfirm(true)}
                      disabled={bulkApplyLoading}
                      className="btn-secondary inline-flex items-center gap-1"
                    >
                      {bulkApplyLoading ? 'Applying...' : `Apply to All Team Members (${eligibleCount})`}
                    </button>
                  )}
                </div>
              </div>

              {/* KPI Items */}
              {items.length > 0 ? (
                <div className="space-y-3">
                  {items.map((item) => (
                    <div key={item._id} className="card flex justify-between items-start">
                      <div>
                        <h4 className="font-semibold">{item.title}</h4>
                        <p className="text-sm text-gray-500">{item.category} | {item.unit} | Target: {item.targetValue} | Weight: {item.weightage}%</p>
                        {item.description && <p className="text-xs text-gray-400 mt-1">{item.description}</p>}
                      </div>
                      {assignment.status === 'draft' && (
                        <button onClick={() => handleDeleteItem(item._id)} className="text-red-500 text-sm hover:underline">Remove</button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-400 text-center py-4">No KPI items yet. Add one to get started.</p>
              )}
            </div>
          )}
        </>
      )}

      {/* Add Item Modal */}
      <Modal open={showAddItem} onClose={() => setShowAddItem(false)} title="Add KPI Item" size="lg">
        {/* Load from Template */}
        {templates.length > 0 && (
          <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
            <label className="label-text text-blue-700">Load from Template</label>
            <select value={selectedTemplate} onChange={(e) => handleTemplateSelect(e.target.value)} className="input-field mt-1">
              <option value="">— Select a template to pre-fill —</option>
              {templates.map((tpl) => (
                <option key={tpl._id} value={tpl._id}>{tpl.name} ({tpl.category})</option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="label-text">Title *</label>
            <input value={newItem.title} onChange={(e) => setNewItem({ ...newItem, title: e.target.value })} className="input-field" />
          </div>
          <div className="md:col-span-2">
            <label className="label-text">Description</label>
            <textarea value={newItem.description} onChange={(e) => setNewItem({ ...newItem, description: e.target.value })} className="input-field" rows={2} />
          </div>
          <div>
            <label className="label-text">Category</label>
            <select value={newItem.category} onChange={(e) => setNewItem({ ...newItem, category: e.target.value })} className="input-field">
              {KPI_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label-text">Unit</label>
            <select value={newItem.unit} onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })} className="input-field">
              {KPI_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <label className="label-text">Weightage (%) *</label>
            <input type="number" value={newItem.weightage} onChange={(e) => setNewItem({ ...newItem, weightage: e.target.value })} className="input-field" min="1" max="100" />
          </div>
          <div>
            <label className="label-text">Target Value *</label>
            <input type="number" value={newItem.targetValue} onChange={(e) => setNewItem({ ...newItem, targetValue: e.target.value })} className="input-field" />
          </div>
          <div>
            <label className="label-text">Threshold (Min)</label>
            <input type="number" value={newItem.thresholdValue} onChange={(e) => setNewItem({ ...newItem, thresholdValue: e.target.value })} className="input-field" />
          </div>
          <div>
            <label className="label-text">Stretch Target</label>
            <input type="number" value={newItem.stretchTarget} onChange={(e) => setNewItem({ ...newItem, stretchTarget: e.target.value })} className="input-field" />
          </div>
          <div className="md:col-span-2">
            <label className="label-text">Remarks / Instructions</label>
            <input value={newItem.remarks} onChange={(e) => setNewItem({ ...newItem, remarks: e.target.value })} className="input-field" />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setShowAddItem(false)} className="btn-secondary">Cancel</button>
          <button onClick={handleAddItem} className="btn-primary">Add Item</button>
        </div>
      </Modal>

      {/* Bulk Apply Confirmation */}
      <ConfirmDialog
        open={bulkApplyConfirm}
        title="Apply KPIs to All Team Members"
        message={`This will clone the current KPI structure to ${eligibleCount} team member${eligibleCount !== 1 ? 's' : ''} who don't have KPIs for this month. Existing assignments will not be affected.`}
        confirmText={`Apply to ${eligibleCount} Member${eligibleCount !== 1 ? 's' : ''}`}
        onConfirm={handleBulkApply}
        onCancel={() => setBulkApplyConfirm(false)}
      />

      {/* Import from Excel Modal */}
      <Modal open={showImportModal} onClose={() => setShowImportModal(false)} title="Import KPIs from Excel" size="lg">
        <div className="space-y-4">
          {/* Info */}
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-200 text-sm text-blue-800">
            <p className="font-medium mb-1">Upload an Excel file to bulk-import KPI items.</p>
            <p>Expected columns: Employee Code, KPI Title, Description, Category, Unit, Weightage, Target Value, Threshold Value, Stretch Target, Remarks</p>
          </div>

          {/* FY and Month display */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label-text">Financial Year</label>
              <input value={financialYear ? `FY ${financialYear}` : 'Not selected'} disabled className="input-field bg-gray-50" />
            </div>
            <div>
              <label className="label-text">Month</label>
              <input value={month ? visibleMonthOptions.find((m) => String(m.value) === String(month))?.label || month : 'Not selected'} disabled className="input-field bg-gray-50" />
            </div>
          </div>

          {/* File input */}
          <div>
            <label className="label-text">Excel File (.xlsx)</label>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => { setImportFile(e.target.files[0] || null); setImportResult(null); }}
              className="input-field"
            />
          </div>

          {/* Download template */}
          <button onClick={handleDownloadTemplate} className="text-blue-600 hover:text-blue-800 text-sm underline">
            Download Import Template
          </button>

          {/* Import result */}
          {importResult && (
            <div className="space-y-2">
              {importResult.success?.length > 0 && (
                <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                  <p className="text-green-800 font-medium">{importResult.success.length} KPI(s) imported successfully</p>
                  <ul className="text-sm text-green-700 mt-1 max-h-32 overflow-y-auto">
                    {importResult.success.map((s, idx) => (
                      <li key={idx}>Row {s.row}: {s.employeeName} — {s.kpiTitle}</li>
                    ))}
                  </ul>
                </div>
              )}
              {importResult.errors?.length > 0 && (
                <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                  <p className="text-red-800 font-medium">{importResult.errors.length} error(s)</p>
                  <ul className="text-sm text-red-700 mt-1 max-h-32 overflow-y-auto">
                    {importResult.errors.map((e, idx) => (
                      <li key={idx}>Row {e.row}{e.employeeCode ? ` (${e.employeeCode})` : ''}: {e.message}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 mt-4">
            <button onClick={() => setShowImportModal(false)} className="btn-secondary">
              {importResult ? 'Close' : 'Cancel'}
            </button>
            {!importResult && (
              <button
                onClick={handleImportSubmit}
                disabled={importLoading || !importFile || !financialYear || !month}
                className="btn-primary disabled:opacity-50"
              >
                {importLoading ? 'Importing...' : 'Import'}
              </button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
