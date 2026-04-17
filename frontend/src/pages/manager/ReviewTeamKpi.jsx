import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchAssignmentDetail } from '../../store/kpiSlice';
import { managerReviewApi } from '../../api/kpiAssignments.api';
import StatusBadge from '../../components/common/StatusBadge';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import Breadcrumbs from '../../components/common/Breadcrumbs';
import WorkflowStepper from '../../components/common/WorkflowStepper';
import StatusSelector from '../../components/common/StatusSelector';
import CommitVsAchieveRow from '../../components/common/CommitVsAchieveRow';
import toast from 'react-hot-toast';
import { getMonthName, formatScore } from '../../utils/formatters';
import { KPI_STATUS, KPI_SUBMISSION_VALUES } from '../../utils/constants';

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
        const id = item._id || item.id;
        initial[id] = {
          managerStatus: item.managerStatus || '',
          managerComment: item.managerComment || '',
        };
      });
      setFormData(initial);
    }
  }, [currentItems]);

  const setField = (id, field, value) => {
    setFormData((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const canReview = currentAssignment?.status === KPI_STATUS.EMPLOYEE_SUBMITTED
    || currentAssignment?.status === KPI_STATUS.MANAGER_REVIEWED;

  const unfilledCount = currentItems.filter((item) => {
    const id = item._id || item.id;
    return !formData[id]?.managerStatus;
  }).length;

  const applyToAll = (status) => {
    const updated = {};
    currentItems.forEach((item) => {
      const id = item._id || item.id;
      updated[id] = { ...formData[id], managerStatus: formData[id]?.managerStatus || status };
    });
    setFormData(updated);
  };

  const handleSubmit = async () => {
    const items = currentItems.map((item) => {
      const id = item._id || item.id;
      return {
        id,
        managerStatus: formData[id]?.managerStatus,
        managerComment: formData[id]?.managerComment || '',
      };
    });
    if (items.some((i) => !i.managerStatus)) {
      toast.error('Please select a status for all KPI items');
      return;
    }
    setSubmitting(true);
    try {
      await managerReviewApi(assignmentId, { items });
      toast.success('Manager review submitted');
      navigate('/manager/team-review');
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="flex justify-center py-16"><LoadingSpinner /></div>;
  if (!currentAssignment) return <p className="text-gray-500">Assignment not found</p>;

  return (
    <div className="space-y-5">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', to: '/manager/dashboard' },
          { label: 'Team KPI Review', to: '/manager/team-review' },
          { label: currentAssignment.employee?.name || 'Review' },
        ]}
      />

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            {currentAssignment.employee?.name} — Achievement Review
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {getMonthName(currentAssignment.month)} {currentAssignment.financialYear} · Weightage: {currentAssignment.totalWeightage}%
          </p>
        </div>
        <StatusBadge status={currentAssignment.status} />
      </div>

      {/* Workflow stepper */}
      <div className="card py-4">
        <WorkflowStepper status={currentAssignment.status} />
      </div>

      {/* Bulk-apply toolbar */}
      {canReview && unfilledCount > 0 && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-4 py-2.5 flex items-center gap-3">
          <span className="text-xs text-indigo-600 font-medium">Quick apply to all unfilled ({unfilledCount}):</span>
          {KPI_SUBMISSION_VALUES.map((s) => (
            <button key={s} onClick={() => applyToAll(s)} className="text-xs px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-700 hover:bg-indigo-200 font-medium">
              {s}
            </button>
          ))}
        </div>
      )}

      {/* KPI item review cards */}
      <div className="space-y-4">
        {currentItems.map((item) => {
          const id = item._id || item.id;
          const fd = formData[id] || {};

          return (
            <div key={id} className="card space-y-4">
              {/* Item header */}
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-semibold text-gray-900">{item.title}</h4>
                  <p className="text-sm text-gray-500">{item.category} · {item.unit} · Monthly: {item.weightage}%</p>
                </div>
                <span className="text-sm text-gray-500">Target: <b>{item.targetValue ?? '—'}</b></span>
              </div>

              {/* Commitment vs Achievement side-by-side */}
              <CommitVsAchieveRow
                commitmentStatus={item.employeeCommitmentStatus}
                commitmentComment={item.employeeCommitmentComment}
                achievementStatus={item.employeeStatus}
                achievementComment={item.employeeComment}
              />

              {/* Legacy employee value (pre-migration records) */}
              {item.employeeValue != null && !item.employeeStatus && (
                <div className="flex items-center gap-2 text-xs bg-gray-50 rounded px-3 py-2">
                  <span className="bg-gray-200 text-gray-500 px-2 py-0.5 rounded">Legacy</span>
                  <span>Employee Value: {item.employeeValue}</span>
                </div>
              )}

              {/* Manager assessment */}
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 space-y-3">
                <h5 className="text-xs font-semibold text-indigo-700 uppercase">Your Assessment</h5>
                {canReview ? (
                  <>
                    <StatusSelector
                      value={fd.managerStatus}
                      onChange={(v) => setField(id, 'managerStatus', v)}
                    />
                    <div>
                      <label className="label-text">Comments</label>
                      <input
                        type="text"
                        value={fd.managerComment}
                        onChange={(e) => setField(id, 'managerComment', e.target.value)}
                        className="input-field"
                        placeholder="Optional comment"
                      />
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-2">
                    {item.managerStatus && (
                      <span className="text-sm font-semibold text-indigo-700">{item.managerStatus}</span>
                    )}
                    {item.managerComment && (
                      <span className="text-xs text-gray-500 italic">"{item.managerComment}"</span>
                    )}
                    {/* Legacy */}
                    {item.managerScore != null && !item.managerStatus && (
                      <span className="text-xs bg-gray-200 text-gray-500 px-2 py-0.5 rounded">
                        Legacy score: {formatScore(item.managerScore)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {canReview && (
        <div className="flex gap-3 pt-2">
          <button onClick={handleSubmit} disabled={submitting} className="btn-primary">
            {submitting ? 'Submitting...' : 'Submit Manager Review'}
          </button>
          <button onClick={() => navigate('/manager/team-review')} className="btn-secondary">Cancel</button>
        </div>
      )}
    </div>
  );
}
