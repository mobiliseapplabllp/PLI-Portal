import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getAssignmentsApi, getAssignmentByIdApi, finalReviewApi, lockAssignmentApi, unlockAssignmentApi } from '../../api/kpiAssignments.api';
import PageHeader from '../../components/common/PageHeader';
import DataTable from '../../components/common/DataTable';
import StatusBadge from '../../components/common/StatusBadge';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import toast from 'react-hot-toast';
import { getMonthName, formatScore } from '../../utils/formatters';

export default function FinalReviewWorkbench() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();

  // If no assignmentId, show list. Otherwise show detail.
  if (assignmentId) return <FinalReviewDetail assignmentId={assignmentId} navigate={navigate} />;
  return <FinalReviewList navigate={navigate} />;
}

function FinalReviewList({ navigate }) {
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAssignmentsApi({ status: 'manager_reviewed' })
      .then((res) => setAssignments(res.data.data))
      .finally(() => setLoading(false));
  }, []);

  const columns = [
    { key: 'employee', label: 'Employee', render: (r) => r.employee?.name },
    { key: 'code', label: 'Code', render: (r) => r.employee?.employeeCode },
    { key: 'period', label: 'Period', render: (r) => `${getMonthName(r.month)} ${r.financialYear}` },
    { key: 'quarter', label: 'Quarter' },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'weightage', label: 'Weightage', render: (r) => `${r.totalWeightage}%` },
  ];

  return (
    <div>
      <PageHeader title="Final Review Workbench" subtitle="Review manager-assessed KPIs and provide final scores" />
      <DataTable
        columns={columns}
        data={assignments}
        loading={loading}
        emptyMessage="No assignments pending final review"
        onRowClick={(row) => navigate(`/admin/final-review/${row._id}`)}
      />
    </div>
  );
}

function FinalReviewDetail({ assignmentId, navigate }) {
  const [assignment, setAssignment] = useState(null);
  const [items, setItems] = useState([]);
  const [formData, setFormData] = useState({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getAssignmentByIdApi(assignmentId)
      .then((res) => {
        setAssignment(res.data.data.assignment);
        setItems(res.data.data.items);
        const initial = {};
        res.data.data.items.forEach((item) => {
          initial[item._id] = {
            finalValue: item.finalValue ?? '',
            finalScore: item.finalScore ?? '',
            finalComment: item.finalComment ?? '',
          };
        });
        setFormData(initial);
      })
      .finally(() => setLoading(false));
  }, [assignmentId]);

  const handleChange = (itemId, field, value) => {
    setFormData((prev) => ({ ...prev, [itemId]: { ...prev[itemId], [field]: value } }));
  };

  const handleFinalReview = async () => {
    const payload = items.map((item) => ({
      id: item._id,
      finalValue: Number(formData[item._id]?.finalValue),
      finalScore: Number(formData[item._id]?.finalScore),
      finalComment: formData[item._id]?.finalComment || '',
    }));

    if (payload.some((i) => isNaN(i.finalValue) || isNaN(i.finalScore))) {
      toast.error('Please fill all values and scores');
      return;
    }

    setSubmitting(true);
    try {
      await finalReviewApi(assignmentId, { items: payload });
      toast.success('Final review submitted');
      navigate('/admin/final-review');
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLock = async () => {
    try {
      await lockAssignmentApi(assignmentId);
      toast.success('Assignment locked');
      navigate('/admin/final-review');
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed');
    }
  };

  const handleUnlock = async () => {
    try {
      await unlockAssignmentApi(assignmentId);
      toast.success('Assignment unlocked');
      navigate('/admin/final-review');
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed');
    }
  };

  if (loading) return <LoadingSpinner />;
  if (!assignment) return <p>Not found</p>;

  const canFinalReview = assignment.status === 'manager_reviewed';
  const canLock = assignment.status === 'final_reviewed';
  const canUnlock = assignment.status === 'locked';

  return (
    <div>
      <PageHeader
        title={`Final Review — ${assignment.employee?.name}`}
        subtitle={`${getMonthName(assignment.month)} ${assignment.financialYear}`}
        actions={
          <div className="flex gap-2">
            <StatusBadge status={assignment.status} />
            {canLock && <button onClick={handleLock} className="btn-danger">Lock</button>}
            {canUnlock && <button onClick={handleUnlock} className="btn-secondary">Unlock</button>}
          </div>
        }
      />

      <div className="space-y-4">
        {items.map((item) => (
          <div key={item._id} className="card">
            <div className="flex justify-between mb-2">
              <h4 className="font-semibold">{item.title}</h4>
              <span className="text-sm text-primary-600">Weight: {item.weightage}%</span>
            </div>
            <div className="grid grid-cols-4 gap-2 text-sm mb-3">
              <div>Target: <b>{item.targetValue}</b></div>
              <div>Emp Value: <b>{item.employeeValue ?? '—'}</b></div>
              <div>Mgr Value: <b>{item.managerValue ?? '—'}</b></div>
              <div>Mgr Score: <b>{formatScore(item.managerScore)}</b></div>
            </div>

            <div className="grid grid-cols-3 gap-3 border-t pt-3">
              <div>
                <label className="label-text">Final Value</label>
                <input type="number" value={formData[item._id]?.finalValue ?? ''} onChange={(e) => handleChange(item._id, 'finalValue', e.target.value)} className="input-field" disabled={!canFinalReview} />
              </div>
              <div>
                <label className="label-text">Final Score (0-100)</label>
                <input type="number" min="0" max="100" value={formData[item._id]?.finalScore ?? ''} onChange={(e) => handleChange(item._id, 'finalScore', e.target.value)} className="input-field" disabled={!canFinalReview} />
              </div>
              <div>
                <label className="label-text">Comment</label>
                <input type="text" value={formData[item._id]?.finalComment ?? ''} onChange={(e) => handleChange(item._id, 'finalComment', e.target.value)} className="input-field" disabled={!canFinalReview} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {canFinalReview && (
        <div className="mt-6">
          <button onClick={handleFinalReview} disabled={submitting} className="btn-primary">
            {submitting ? 'Submitting...' : 'Submit Final Review'}
          </button>
        </div>
      )}
    </div>
  );
}
