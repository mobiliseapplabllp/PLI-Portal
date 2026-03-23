import { useEffect, useState } from 'react';
import { getCyclesApi, createCycleApi, updateCycleApi } from '../../api/cycles.api';
import PageHeader from '../../components/common/PageHeader';
import DataTable from '../../components/common/DataTable';
import StatusBadge from '../../components/common/StatusBadge';
import Modal from '../../components/common/Modal';
import toast from 'react-hot-toast';
import { useForm } from 'react-hook-form';
import { MONTHS, FINANCIAL_YEARS, getCurrentFinancialYear } from '../../utils/constants';
import { getMonthName, formatDate } from '../../utils/formatters';

export default function CycleManagement() {
  const [cycles, setCycles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const { register, handleSubmit, reset } = useForm();

  const loadCycles = () => {
    setLoading(true);
    getCyclesApi().then((res) => setCycles(res.data.data)).finally(() => setLoading(false));
  };

  useEffect(() => { loadCycles(); }, []);

  const openCreate = () => {
    setEditing(null);
    reset({ financialYear: getCurrentFinancialYear(), month: '', employeeSubmissionDeadline: '', managerReviewDeadline: '', finalReviewDeadline: '' });
    setShowModal(true);
  };

  const openEdit = (cycle) => {
    setEditing(cycle);
    reset({
      status: cycle.status,
      employeeSubmissionDeadline: cycle.employeeSubmissionDeadline?.slice(0, 10) || '',
      managerReviewDeadline: cycle.managerReviewDeadline?.slice(0, 10) || '',
      finalReviewDeadline: cycle.finalReviewDeadline?.slice(0, 10) || '',
    });
    setShowModal(true);
  };

  const onSubmit = async (data) => {
    try {
      if (editing) {
        await updateCycleApi(editing._id, data);
        toast.success('Cycle updated');
      } else {
        await createCycleApi({ ...data, month: Number(data.month) });
        toast.success('Cycle created');
      }
      setShowModal(false);
      loadCycles();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed');
    }
  };

  const columns = [
    { key: 'financialYear', label: 'FY' },
    { key: 'month', label: 'Month', render: (r) => getMonthName(r.month) },
    { key: 'quarter', label: 'Quarter' },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} type="cycle" /> },
    { key: 'empDeadline', label: 'Emp Deadline', render: (r) => formatDate(r.employeeSubmissionDeadline) },
    { key: 'mgrDeadline', label: 'Mgr Deadline', render: (r) => formatDate(r.managerReviewDeadline) },
    { key: 'actions', label: '', render: (r) => (
      <button onClick={(e) => { e.stopPropagation(); openEdit(r); }} className="text-primary-600 text-sm hover:underline">Edit</button>
    )},
  ];

  return (
    <div>
      <PageHeader title="Appraisal Cycles" actions={<button onClick={openCreate} className="btn-primary">+ Create Cycle</button>} />
      <DataTable columns={columns} data={cycles} loading={loading} />

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Cycle' : 'Create Cycle'}>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {!editing && (
            <>
              <div>
                <label className="label-text">Financial Year</label>
                <select {...register('financialYear', { required: true })} className="input-field">
                  {FINANCIAL_YEARS.map((fy) => (
                    <option key={fy} value={fy}>FY {fy}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label-text">Month</label>
                <select {...register('month', { required: true })} className="input-field">
                  <option value="">Select</option>
                  {MONTHS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
            </>
          )}
          {editing && (
            <div>
              <label className="label-text">Status</label>
              <select {...register('status')} className="input-field">
                <option value="draft">Draft</option>
                <option value="open">Open</option>
                <option value="closed">Closed</option>
                <option value="locked">Locked</option>
              </select>
            </div>
          )}
          <div>
            <label className="label-text">Employee Submission Deadline</label>
            <input type="date" {...register('employeeSubmissionDeadline')} className="input-field" />
          </div>
          <div>
            <label className="label-text">Manager Review Deadline</label>
            <input type="date" {...register('managerReviewDeadline')} className="input-field" />
          </div>
          <div>
            <label className="label-text">Final Review Deadline</label>
            <input type="date" {...register('finalReviewDeadline')} className="input-field" />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">{editing ? 'Update' : 'Create'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
