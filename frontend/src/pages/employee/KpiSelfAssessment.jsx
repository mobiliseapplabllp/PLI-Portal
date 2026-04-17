import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchAssignmentDetail } from '../../store/kpiSlice';
import { commitKpiApi, employeeSubmitApi } from '../../api/kpiAssignments.api';
import StatusBadge from '../../components/common/StatusBadge';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import Breadcrumbs from '../../components/common/Breadcrumbs';
import WorkflowStepper from '../../components/common/WorkflowStepper';
import StatusSelector from '../../components/common/StatusSelector';
import CommitVsAchieveRow from '../../components/common/CommitVsAchieveRow';
import DeadlineCountdown from '../../components/common/DeadlineCountdown';
import toast from 'react-hot-toast';
import { getMonthName, formatScore } from '../../utils/formatters';
import { KPI_STATUS } from '../../utils/constants';

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
        const id = item._id || item.id;
        initial[id] = {
          employeeCommitmentStatus: item.employeeCommitmentStatus || '',
          employeeCommitmentComment: item.employeeCommitmentComment || '',
          employeeStatus: item.employeeStatus || '',
          employeeComment: item.employeeComment || '',
        };
      });
      setFormData(initial);
    }
  }, [currentItems]);

  const status = currentAssignment?.status;
  const isCommitMode = status === KPI_STATUS.ASSIGNED;
  const isAchieveMode = status === KPI_STATUS.COMMITMENT_SUBMITTED || status === KPI_STATUS.EMPLOYEE_SUBMITTED;
  const isReadOnly = !isCommitMode && !isAchieveMode;

  const setField = (id, field, value) => {
    setFormData((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const filledCount = currentItems.filter((item) => {
    const id = item._id || item.id;
    const fd = formData[id];
    if (isCommitMode) return !!fd?.employeeCommitmentStatus;
    if (isAchieveMode) return !!fd?.employeeStatus;
    return true;
  }).length;
  const allFilled = filledCount === currentItems.length;

  const handleCommitSubmit = async () => {
    const items = currentItems.map((item) => {
      const id = item._id || item.id;
      return {
        id,
        employeeCommitmentStatus: formData[id]?.employeeCommitmentStatus,
        employeeCommitmentComment: formData[id]?.employeeCommitmentComment || '',
      };
    });
    if (items.some((i) => !i.employeeCommitmentStatus)) {
      toast.error('Please select a commitment status for all KPI items');
      return;
    }
    setSubmitting(true);
    try {
      await commitKpiApi(assignmentId, { items });
      toast.success('Commitment submitted successfully');
      navigate('/employee/kpis');
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Commitment submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAchieveSubmit = async () => {
    const items = currentItems.map((item) => {
      const id = item._id || item.id;
      return {
        id,
        employeeStatus: formData[id]?.employeeStatus,
        employeeComment: formData[id]?.employeeComment || '',
      };
    });
    if (items.some((i) => !i.employeeStatus)) {
      toast.error('Please select an achievement status for all KPI items');
      return;
    }
    setSubmitting(true);
    try {
      await employeeSubmitApi(assignmentId, { items });
      toast.success('Achievement submitted successfully');
      navigate('/employee/kpis');
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="flex justify-center py-16"><LoadingSpinner /></div>;
  if (!currentAssignment) return <p className="text-gray-500">Assignment not found</p>;

  const cycle = currentAssignment.appraisalCycle;

  return (
    <div className="space-y-5">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', to: '/employee/dashboard' },
          { label: 'My KPIs', to: '/employee/kpis' },
          { label: isCommitMode ? 'Submit Commitment' : isAchieveMode ? 'Submit Achievement' : 'View Assessment' },
        ]}
      />

      {/* Mode-aware banner */}
      {isCommitMode && (
        <div className="bg-primary-50 border border-primary-200 rounded-xl p-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-bold text-primary-800">
                🎯 Submit Commitment — {getMonthName(currentAssignment.month)} {currentAssignment.financialYear}
              </h2>
              <p className="text-sm text-primary-600 mt-1">
                Commit to your targets for this month. Your commitment will be compared to your actual achievement later.
              </p>
            </div>
            {cycle?.commitmentDeadline && (
              <DeadlineCountdown deadline={cycle.commitmentDeadline} label="Commit by" />
            )}
          </div>
          {/* Progress bar */}
          <div className="mt-3">
            <div className="flex justify-between text-xs text-primary-600 mb-1">
              <span>Progress: {filledCount}/{currentItems.length} items</span>
              <span>{Math.round((filledCount / currentItems.length) * 100)}%</span>
            </div>
            <div className="h-2 bg-primary-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary-600 rounded-full transition-all duration-300"
                style={{ width: `${(filledCount / currentItems.length) * 100}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {isAchieveMode && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-bold text-amber-800">
                ✅ Submit Achievement — {getMonthName(currentAssignment.month)} {currentAssignment.financialYear}
              </h2>
              <p className="text-sm text-amber-600 mt-1">
                How did you actually perform this month? Your commitment is shown for reference.
              </p>
            </div>
            {cycle?.employeeSubmissionDeadline && (
              <DeadlineCountdown deadline={cycle.employeeSubmissionDeadline} label="Submit by" />
            )}
          </div>
          {/* Progress bar */}
          <div className="mt-3">
            <div className="flex justify-between text-xs text-amber-600 mb-1">
              <span>Progress: {filledCount}/{currentItems.length} items</span>
              <span>{Math.round((filledCount / currentItems.length) * 100)}%</span>
            </div>
            <div className="h-2 bg-amber-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-500 rounded-full transition-all duration-300"
                style={{ width: `${(filledCount / currentItems.length) * 100}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Workflow stepper */}
      {!isCommitMode && !isAchieveMode && (
        <div className="card py-4">
          <WorkflowStepper status={currentAssignment.status} />
        </div>
      )}

      {/* KPI item cards */}
      <div className="space-y-4">
        {currentItems.map((item) => {
          const id = item._id || item.id;
          const fd = formData[id] || {};

          return (
            <div key={id} className="card space-y-4">
              {/* Item header */}
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-semibold text-gray-900 text-base">{item.title}</h4>
                  {item.description && <p className="text-sm text-gray-500 mt-1">{item.description}</p>}
                </div>
                <div className="text-right flex-shrink-0 ml-4">
                  <span className="text-xs text-gray-400">{item.category}</span>
                  <div className="text-sm font-medium text-primary-600">Monthly: {item.weightage}%</div>
                  {item.quarterlyWeightage != null && (
                    <div className="text-xs text-gray-400">Quarterly cap: {item.quarterlyWeightage}%</div>
                  )}
                </div>
              </div>

              {/* Target info */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm bg-gray-50 rounded-lg p-3">
                <div><span className="text-gray-500">Target:</span> <span className="font-medium">{item.targetValue ?? '—'}</span></div>
                <div><span className="text-gray-500">Threshold:</span> <span className="font-medium">{item.thresholdValue ?? '—'}</span></div>
                <div><span className="text-gray-500">Stretch:</span> <span className="font-medium">{item.stretchTarget ?? '—'}</span></div>
                <div><span className="text-gray-500">Unit:</span> <span className="font-medium">{item.unit}</span></div>
              </div>

              {/* Commitment mode */}
              {isCommitMode && (
                <div className="space-y-3">
                  <label className="label-text">I commit to achieving:</label>
                  <StatusSelector
                    value={fd.employeeCommitmentStatus}
                    onChange={(v) => setField(id, 'employeeCommitmentStatus', v)}
                  />
                  <div>
                    <label className="label-text">My plan to achieve this</label>
                    <textarea
                      value={fd.employeeCommitmentComment}
                      onChange={(e) => setField(id, 'employeeCommitmentComment', e.target.value)}
                      className="input-field"
                      rows={2}
                      placeholder="Optional: describe your plan or approach"
                    />
                  </div>
                </div>
              )}

              {/* Achievement mode */}
              {isAchieveMode && (
                <div className="space-y-3">
                  {/* Show commitment context */}
                  {item.employeeCommitmentStatus && (
                    <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                      <div className="text-xs text-blue-500 font-medium mb-1">Your Commitment</div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={`commitment_${item.employeeCommitmentStatus?.toLowerCase()}`} />
                        <span className="text-sm font-semibold text-blue-800">{item.employeeCommitmentStatus}</span>
                        {item.employeeCommitmentComment && (
                          <span className="text-xs text-gray-400 italic">"{item.employeeCommitmentComment}"</span>
                        )}
                      </div>
                    </div>
                  )}

                  <label className="label-text">I actually achieved:</label>
                  <StatusSelector
                    value={fd.employeeStatus}
                    onChange={(v) => setField(id, 'employeeStatus', v)}
                  />

                  {/* Deviation warning */}
                  {item.employeeCommitmentStatus && fd.employeeStatus &&
                    item.employeeCommitmentStatus !== fd.employeeStatus && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
                      ⚠ You committed <strong>{item.employeeCommitmentStatus}</strong> but are submitting{' '}
                      <strong>{fd.employeeStatus}</strong> — please add a note explaining the variance.
                    </div>
                  )}

                  <div>
                    <label className="label-text">Notes / explanation</label>
                    <textarea
                      value={fd.employeeComment}
                      onChange={(e) => setField(id, 'employeeComment', e.target.value)}
                      className="input-field"
                      rows={2}
                      placeholder="Optional comment"
                    />
                  </div>
                </div>
              )}

              {/* Read-only view */}
              {isReadOnly && (
                <div className="space-y-3">
                  {/* Legacy numeric display */}
                  {item.employeeValue != null && item.employeeStatus == null && (
                    <div className="flex items-center gap-2 text-xs text-gray-400 bg-gray-50 rounded px-3 py-2">
                      <span className="bg-gray-200 text-gray-500 px-2 py-0.5 rounded">Legacy</span>
                      <span>Employee Value: {item.employeeValue}</span>
                    </div>
                  )}

                  {/* 4-badge timeline */}
                  <div className="flex flex-wrap gap-2 text-xs">
                    {item.employeeCommitmentStatus && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-100 text-blue-700 font-medium">
                        Committed: {item.employeeCommitmentStatus}
                      </span>
                    )}
                    {item.employeeStatus && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-100 text-amber-700 font-medium">
                        Achieved: {item.employeeStatus}
                      </span>
                    )}
                    {item.managerStatus && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-purple-100 text-purple-700 font-medium">
                        Manager: {item.managerStatus}
                      </span>
                    )}
                    {item.finalApproverStatus && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-cyan-100 text-cyan-700 font-medium">
                        Final: {item.finalApproverStatus} ({item.finalApproverAchievedWeightage}%)
                      </span>
                    )}
                    {/* Legacy score display */}
                    {item.finalScore != null && !item.finalApproverStatus && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 font-medium">
                        Score: {formatScore(item.finalScore)}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Submit actions */}
      {isCommitMode && (
        <div className="flex gap-3">
          <button onClick={handleCommitSubmit} disabled={submitting || !allFilled} className="btn-primary">
            {submitting ? 'Submitting...' : 'Submit Commitment'}
          </button>
          <button onClick={() => navigate('/employee/kpis')} className="btn-secondary">Cancel</button>
        </div>
      )}
      {isAchieveMode && (
        <div className="flex gap-3">
          <button onClick={handleAchieveSubmit} disabled={submitting || !allFilled} className="btn-primary bg-amber-500 hover:bg-amber-600 border-amber-500">
            {submitting ? 'Submitting...' : 'Submit Achievement'}
          </button>
          <button onClick={() => navigate('/employee/kpis')} className="btn-secondary">Cancel</button>
        </div>
      )}
    </div>
  );
}
