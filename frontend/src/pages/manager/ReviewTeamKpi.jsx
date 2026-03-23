import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchAssignmentDetail } from '../../store/kpiSlice';
import { managerReviewApi } from '../../api/kpiAssignments.api';
import PageHeader from '../../components/common/PageHeader';
import StatusBadge from '../../components/common/StatusBadge';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import Breadcrumbs from '../../components/common/Breadcrumbs';
import toast from 'react-hot-toast';
import { getMonthName, formatScore } from '../../utils/formatters';

export default function ReviewTeamKpi() {
  const { assignmentId } = useParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { currentAssignment, currentItems, loading } = useSelector((state) => state.kpi);
  const [formData, setFormData] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    dispatch(fetchAssignmentDetail(assignmentId));
  }, [dispatch, assignmentId]);

  useEffect(() => {
    if (currentItems.length > 0) {
      const initial = {};
      currentItems.forEach((item) => {
        initial[item._id] = {
          managerValue: item.managerValue ?? '',
          managerScore: item.managerScore ?? '',
          managerComment: item.managerComment ?? '',
        };
      });
      setFormData(initial);
    }
  }, [currentItems]);

  const handleChange = (itemId, field, value) => {
    setFormData((prev) => ({ ...prev, [itemId]: { ...prev[itemId], [field]: value } }));
  };

  const handleSubmit = async () => {
    const items = currentItems.map((item) => ({
      id: item._id,
      managerValue: Number(formData[item._id]?.managerValue),
      managerScore: Number(formData[item._id]?.managerScore),
      managerComment: formData[item._id]?.managerComment || '',
    }));

    if (items.some((i) => isNaN(i.managerValue) || isNaN(i.managerScore))) {
      toast.error('Please fill all manager values and scores');
      return;
    }
    if (items.some((i) => i.managerScore < 0 || i.managerScore > 100)) {
      toast.error('Scores must be between 0 and 100');
      return;
    }

    setSubmitting(true);
    try {
      await managerReviewApi(assignmentId, { items });
      toast.success('Manager review submitted');
      navigate('/manager/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingSpinner />;
  if (!currentAssignment) return <p className="text-gray-500">Assignment not found</p>;

  const canReview = currentAssignment.status === 'employee_submitted';

  return (
    <div>
      <Breadcrumbs
        items={[
          { label: 'Dashboard', to: '/manager/dashboard' },
          { label: 'Team KPI Review', to: '/manager/team-review' },
          { label: 'Review' },
        ]}
      />
      <PageHeader
        title={`Manager Review — ${currentAssignment.employee?.name}`}
        subtitle={`${getMonthName(currentAssignment.month)} ${currentAssignment.financialYear} | Weightage: ${currentAssignment.totalWeightage}%`}
        actions={<StatusBadge status={currentAssignment.status} />}
      />

      <div className="space-y-4">
        {currentItems.map((item) => (
          <div key={item._id} className="card">
            <div className="flex justify-between items-start mb-3">
              <div>
                <h4 className="font-semibold">{item.title}</h4>
                <p className="text-sm text-gray-500">{item.category} | {item.unit} | Weight: {item.weightage}%</p>
              </div>
              <span className="text-sm">Target: <b>{item.targetValue}</b></span>
            </div>

            {/* Employee submission */}
            <div className="bg-blue-50 rounded-lg p-3 mb-3 text-sm">
              <p><span className="text-gray-500">Employee Value:</span> <b>{item.employeeValue ?? '—'}</b></p>
              {item.employeeComment && <p className="text-gray-500 mt-1">Comment: {item.employeeComment}</p>}
            </div>

            {/* Manager fields */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="label-text">Reviewed Value</label>
                <input type="number" value={formData[item._id]?.managerValue ?? ''} onChange={(e) => handleChange(item._id, 'managerValue', e.target.value)} className="input-field" disabled={!canReview} />
              </div>
              <div>
                <label className="label-text">Score (0-100)</label>
                <input type="number" min="0" max="100" value={formData[item._id]?.managerScore ?? ''} onChange={(e) => handleChange(item._id, 'managerScore', e.target.value)} className="input-field" disabled={!canReview} />
              </div>
              <div>
                <label className="label-text">Comment</label>
                <input type="text" value={formData[item._id]?.managerComment ?? ''} onChange={(e) => handleChange(item._id, 'managerComment', e.target.value)} className="input-field" disabled={!canReview} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {canReview && (
        <div className="mt-6 flex gap-3">
          <button onClick={handleSubmit} disabled={submitting} className="btn-primary">
            {submitting ? 'Submitting...' : 'Submit Manager Review'}
          </button>
          <button onClick={() => navigate('/manager/dashboard')} className="btn-secondary">Cancel</button>
        </div>
      )}
    </div>
  );
}
