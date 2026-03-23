import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchAssignmentDetail } from '../../store/kpiSlice';
import { employeeSubmitApi } from '../../api/kpiAssignments.api';
import PageHeader from '../../components/common/PageHeader';
import StatusBadge from '../../components/common/StatusBadge';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import Breadcrumbs from '../../components/common/Breadcrumbs';
import toast from 'react-hot-toast';
import { getMonthName, formatScore } from '../../utils/formatters';

export default function KpiSelfAssessment() {
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
          employeeValue: item.employeeValue ?? '',
          employeeComment: item.employeeComment ?? '',
        };
      });
      setFormData(initial);
    }
  }, [currentItems]);

  const handleChange = (itemId, field, value) => {
    setFormData((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], [field]: value },
    }));
  };

  const handleSubmit = async () => {
    const items = currentItems.map((item) => ({
      id: item._id,
      employeeValue: Number(formData[item._id]?.employeeValue),
      employeeComment: formData[item._id]?.employeeComment || '',
    }));

    // Validate all values filled
    if (items.some((i) => isNaN(i.employeeValue))) {
      toast.error('Please fill all actual values');
      return;
    }

    setSubmitting(true);
    try {
      await employeeSubmitApi(assignmentId, { items });
      toast.success('Self-assessment submitted successfully');
      navigate('/employee/kpis');
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingSpinner />;
  if (!currentAssignment) return <p className="text-gray-500">Assignment not found</p>;

  const canSubmit = currentAssignment.status === 'assigned';

  return (
    <div>
      <Breadcrumbs
        items={[
          { label: 'Dashboard', to: '/employee/dashboard' },
          { label: 'My KPIs', to: '/employee/kpis' },
          { label: 'Self Assessment' },
        ]}
      />
      <PageHeader
        title={`KPI Self Assessment — ${getMonthName(currentAssignment.month)} ${currentAssignment.financialYear}`}
        subtitle={`Manager: ${currentAssignment.manager?.name} | Total Weightage: ${currentAssignment.totalWeightage}%`}
        actions={<StatusBadge status={currentAssignment.status} />}
      />

      <div className="space-y-4">
        {currentItems.map((item) => (
          <div key={item._id} className="card">
            <div className="flex justify-between items-start mb-3">
              <div>
                <h4 className="font-semibold text-gray-900">{item.title}</h4>
                {item.description && <p className="text-sm text-gray-500 mt-1">{item.description}</p>}
              </div>
              <span className="text-sm font-medium text-primary-600">Weight: {item.weightage}%</span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-4">
              <div><span className="text-gray-500">Target:</span> <span className="font-medium">{item.targetValue}</span></div>
              <div><span className="text-gray-500">Threshold:</span> <span className="font-medium">{item.thresholdValue ?? '—'}</span></div>
              <div><span className="text-gray-500">Stretch:</span> <span className="font-medium">{item.stretchTarget ?? '—'}</span></div>
              <div><span className="text-gray-500">Unit:</span> <span className="font-medium">{item.unit}</span></div>
            </div>

            {item.remarks && (
              <p className="text-xs text-gray-400 mb-3">Instructions: {item.remarks}</p>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 border-t pt-3">
              <div>
                <label className="label-text">Actual Value Achieved</label>
                <input
                  type="number"
                  value={formData[item._id]?.employeeValue ?? ''}
                  onChange={(e) => handleChange(item._id, 'employeeValue', e.target.value)}
                  className="input-field"
                  disabled={!canSubmit}
                  placeholder="Enter your actual value"
                />
              </div>
              <div>
                <label className="label-text">Comment</label>
                <input
                  type="text"
                  value={formData[item._id]?.employeeComment ?? ''}
                  onChange={(e) => handleChange(item._id, 'employeeComment', e.target.value)}
                  className="input-field"
                  disabled={!canSubmit}
                  placeholder="Optional comment"
                />
              </div>
            </div>

            {/* Show manager/final review values if available */}
            {(item.managerScore != null || item.finalScore != null) && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mt-3 border-t pt-3 bg-gray-50 -mx-6 -mb-6 px-6 pb-4 rounded-b-lg">
                {item.managerValue != null && <div><span className="text-gray-500">Manager Value:</span> <span className="font-medium">{item.managerValue}</span></div>}
                {item.managerScore != null && <div><span className="text-gray-500">Manager Score:</span> <span className="font-medium">{formatScore(item.managerScore)}</span></div>}
                {item.finalValue != null && <div><span className="text-gray-500">Final Value:</span> <span className="font-medium">{item.finalValue}</span></div>}
                {item.finalScore != null && <div><span className="text-gray-500">Final Score:</span> <span className="font-medium text-green-600">{formatScore(item.finalScore)}</span></div>}
              </div>
            )}
          </div>
        ))}
      </div>

      {canSubmit && (
        <div className="mt-6 flex gap-3">
          <button onClick={handleSubmit} disabled={submitting} className="btn-primary">
            {submitting ? 'Submitting...' : 'Submit Self Assessment'}
          </button>
          <button onClick={() => navigate('/employee/kpis')} className="btn-secondary">Cancel</button>
        </div>
      )}
    </div>
  );
}
