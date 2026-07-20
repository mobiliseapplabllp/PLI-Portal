import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import {
  HiOutlineChevronRight, HiOutlineChevronLeft, HiOutlinePaperAirplane,
  HiOutlineCheck, HiOutlineClock, HiOutlineExclamation,
} from 'react-icons/hi';
import {
  getSurveysApi, getClientOrgsApi, createDispatchApi, getDispatchDetailApi,
  submitForApprovalApi, reviseDispatchApi, resubmitForApprovalApi,
} from '../../api/csat.api';
import RecipientSelector from './components/RecipientSelector';
import ScheduleConfig from './components/ScheduleConfig';
import ConfirmDialog from '../../components/common/ConfirmDialog';

const MODE_LABELS = { instant: 'Instant', scheduled: 'Scheduled', recurring: 'Recurring' };
const STEPS = ['Select Survey', 'Select Recipients', 'Configure & Send'];

function StepIndicator({ step }) {
  return (
    <div className="flex items-center">
      {STEPS.map((label, i) => (
        <div key={i} className="flex items-center">
          <div className="flex flex-col items-center">
            <div className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold border-2 transition-all ${
              i < step
                ? 'bg-emerald-600 border-emerald-600 text-white'
                : i === step
                ? 'bg-white border-emerald-600 text-emerald-700'
                : 'bg-white border-gray-200 text-gray-400'
            }`}>
              {i < step ? <HiOutlineCheck className="w-4 h-4" /> : i + 1}
            </div>
            <span className={`mt-1.5 text-xs font-semibold hidden sm:block transition-colors ${
              i === step ? 'text-gray-900' : 'text-gray-400'
            }`}>
              {label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={`h-px w-10 sm:w-16 mx-2 mb-5 transition-colors ${i < step ? 'bg-emerald-600' : 'bg-gray-200'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

export default function SendSurveyPage() {
  const navigate = useNavigate();
  const { dispatchId } = useParams(); // set only in revise mode (/csat/send/:dispatchId/revise)
  const { user } = useSelector((state) => state.auth);
  const isAdmin = user?.role === 'admin';
  const isReviseMode = !!dispatchId;

  const [step, setStep] = useState(0);
  const [surveys, setSurveys] = useState([]);
  const [selectedSurvey, setSelectedSurvey] = useState(null);
  const [orgs, setOrgs] = useState([]);
  const [selectedOrg, setSelectedOrg] = useState(null);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState([]);
  const [emailSubject, setEmailSubject] = useState('');
  const [schedCfg, setSchedCfg] = useState({ dispatchMode: 'instant' });
  const [showConfirm, setShowConfirm] = useState(false);
  const [sending, setSending] = useState(false);

  // Fix D14: track two-step state for submit-approval retry
  const [createdDispatchId, setCreatedDispatchId] = useState(null);
  const [approvalSubmitFailed, setApprovalSubmitFailed] = useState(false);

  useEffect(() => {
    getSurveysApi({ status: 'published', limit: 100 })
      .then((res) => setSurveys(res.data.data || []))
      .catch(() => toast.error('Failed to load surveys'));
    getClientOrgsApi({ isActive: true, limit: 100 })
      .then((res) => setOrgs(res.data.data || []))
      .catch(() => toast.error('Failed to load organisations'));
  }, []);

  // Pre-populate form in revise mode
  useEffect(() => {
    if (!isReviseMode) return;
    getDispatchDetailApi(dispatchId)
      .then((res) => {
        const d = res.data.data;
        setSelectedSurvey(d.survey ? { ...d.survey, _id: d.survey.id } : null);
        const org = d.clientOrganisation ? { ...d.clientOrganisation, _id: d.clientOrganisation.id } : null;
        setSelectedOrg(org);
        setSelectedEmployeeIds(d.employeeIds || []);
        setEmailSubject(d.emailSubject || '');
        setSchedCfg({
          dispatchMode: d.dispatchMode || 'instant',
          scheduledAt: d.scheduledAt || null,
          recurrencePattern: d.recurrencePattern || null,
          recurrenceEndAt: d.recurrenceEndAt || null,
          expiresAt: d.expiresAt || null,
          reminderDays: d.reminderDays || null,
        });
        // Jump straight to configure step — survey/org/employees are pre-filled
        setStep(2);
      })
      .catch(() => toast.error('Failed to load dispatch for revision'));
  }, [dispatchId, isReviseMode]);

  useEffect(() => {
    if (selectedSurvey && !isReviseMode) {
      setEmailSubject(`Please complete our survey: ${selectedSurvey.name}`);
    }
  }, [selectedSurvey, isReviseMode]);

  const canGoNext = () => {
    if (step === 0) return !!selectedSurvey;
    if (step === 1) return !!selectedOrg && selectedEmployeeIds.length > 0;
    if (step === 2) {
      if (!emailSubject.trim()) return false;
      const mode = schedCfg.dispatchMode || 'instant';
      if (mode === 'scheduled' && !schedCfg.scheduledAt) return false;
      if (mode === 'recurring' && (!schedCfg.scheduledAt || !schedCfg.recurrencePattern)) return false;
      return true;
    }
    return false;
  };

  const handleNext = () => {
    if (!canGoNext()) return;
    if (step < 2) setStep((s) => s + 1);
    else setShowConfirm(true);
  };

  // Retry approval submission if first attempt failed (Fix D14)
  const handleRetryApprovalSubmit = async () => {
    if (!createdDispatchId) return;
    setSending(true);
    try {
      await submitForApprovalApi(createdDispatchId);
      toast.success('Submitted for admin approval');
      setApprovalSubmitFailed(false);
      setCreatedDispatchId(null);
      navigate('/csat/my-requests');
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Approval submission failed — please try again');
    } finally {
      setSending(false);
    }
  };

  const handleSend = async () => {
    setSending(true);
    setApprovalSubmitFailed(false);
    try {
      if (isReviseMode) {
        // ── Revise & Resubmit flow ──────────────────────────────────────────
        if (!selectedOrg) {
          toast.error('Organisation could not be loaded — please go back and try again');
          setSending(false);
          setShowConfirm(false);
          return;
        }
        await reviseDispatchApi(dispatchId, {
          surveyId: selectedSurvey._id || selectedSurvey.id,
          clientOrganisationId: selectedOrg._id || selectedOrg.id,
          employeeIds: selectedEmployeeIds,
          emailSubject: emailSubject.trim(),
          dispatchMode: schedCfg.dispatchMode || 'instant',
          scheduledAt: schedCfg.scheduledAt || null,
          recurrencePattern: schedCfg.recurrencePattern || null,
          recurrenceEndAt: schedCfg.recurrenceEndAt || null,
          expiresAt: schedCfg.expiresAt || null,
          reminderDays: schedCfg.reminderDays || null,
        });

        // Step 2: resubmit for approval — Fix D14: if this fails, inform clearly
        try {
          await resubmitForApprovalApi(dispatchId);
          toast.success('Revised and resubmitted for approval');
          navigate('/csat/my-requests');
        } catch (resubmitErr) {
          // Revise succeeded but resubmit failed — let manager retry
          setApprovalSubmitFailed(true);
          setCreatedDispatchId(dispatchId);
          toast.error('Changes saved, but resubmission failed. Please retry below.');
          setShowConfirm(false);
        }

      } else if (!isAdmin) {
        // ── Manager: create dispatch → submit for approval ──────────────────
        const dispatchRes = await createDispatchApi({
          surveyId: selectedSurvey._id,
          clientOrganisationId: selectedOrg._id,
          employeeIds: selectedEmployeeIds,
          emailSubject: emailSubject.trim(),
          dispatchMode: schedCfg.dispatchMode || 'instant',
          scheduledAt: schedCfg.scheduledAt || null,
          recurrencePattern: schedCfg.recurrencePattern || null,
          recurrenceEndAt: schedCfg.recurrenceEndAt || null,
          expiresAt: schedCfg.expiresAt || null,
          reminderDays: schedCfg.reminderDays || null,
        });
        const newId = dispatchRes.data.data?.id || dispatchRes.data.data?._id;

        // Step 2: submit for approval — Fix D14: if this fails, inform clearly
        try {
          await submitForApprovalApi(newId);
          toast.success('Survey request submitted for admin approval');
          navigate('/csat/my-requests');
        } catch (approvalErr) {
          setApprovalSubmitFailed(true);
          setCreatedDispatchId(newId);
          toast.error('Dispatch created, but approval submission failed. Please retry below.');
          setShowConfirm(false);
        }

      } else {
        // ── Admin: send directly ────────────────────────────────────────────
        await createDispatchApi({
          surveyId: selectedSurvey._id,
          clientOrganisationId: selectedOrg._id,
          employeeIds: selectedEmployeeIds,
          emailSubject: emailSubject.trim(),
          dispatchMode: schedCfg.dispatchMode || 'instant',
          scheduledAt: schedCfg.scheduledAt || null,
          recurrencePattern: schedCfg.recurrencePattern || null,
          recurrenceEndAt: schedCfg.recurrenceEndAt || null,
          expiresAt: schedCfg.expiresAt || null,
          reminderDays: schedCfg.reminderDays || null,
        });
        const mode = schedCfg.dispatchMode || 'instant';
        const msg = mode === 'instant'
          ? `Survey sent to ${selectedEmployeeIds.length} recipient(s)`
          : mode === 'scheduled' ? 'Survey scheduled successfully'
          : 'Recurring survey set up';
        toast.success(msg);
        navigate('/csat/responses');
      }
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Operation failed');
    } finally {
      setSending(false);
      setShowConfirm(false);
    }
  };

  // ── Derive submit button label ──────────────────────────────────────────────
  const submitLabel = (() => {
    if (isReviseMode) return 'Save & Resubmit';
    if (!isAdmin) return 'Submit for Approval';
    const mode = schedCfg.dispatchMode || 'instant';
    if (mode === 'scheduled') return 'Schedule';
    if (mode === 'recurring') return 'Set Up Recurring';
    return 'Send Now';
  })();

  const confirmTitle = isReviseMode
    ? 'Resubmit for Approval?'
    : !isAdmin
    ? 'Submit for Approval?'
    : schedCfg.dispatchMode === 'instant' ? 'Send Survey Now?'
    : schedCfg.dispatchMode === 'recurring' ? 'Set Up Recurring Survey?'
    : 'Schedule Survey?';

  const confirmMessage = isReviseMode
    ? `Save your revisions to "${selectedSurvey?.name}" and resubmit to admins for re-review.`
    : !isAdmin
    ? `Submit "${selectedSurvey?.name}" for ${selectedEmployeeIds.length} employee(s) at ${selectedOrg?.name} to admin for approval before sending.`
    : schedCfg.dispatchMode === 'instant'
    ? `Immediately send "${selectedSurvey?.name}" to ${selectedEmployeeIds.length} employee(s) at ${selectedOrg?.name}.`
    : schedCfg.dispatchMode === 'scheduled'
    ? `Schedule "${selectedSurvey?.name}" for ${selectedEmployeeIds.length} employee(s) at ${selectedOrg?.name}. The cron will fire it at the scheduled time.`
    : `Set up ${schedCfg.recurrencePattern || 'recurring'} dispatch of "${selectedSurvey?.name}" to ${selectedEmployeeIds.length} employee(s) at ${selectedOrg?.name}.`;

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {isReviseMode ? 'Revise Survey Request' : 'Send Survey'}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {isReviseMode
            ? 'Update the details below and resubmit for admin approval'
            : !isAdmin
            ? 'Submit a survey dispatch request for admin approval'
            : 'Dispatch a published survey to client employees'}
        </p>
      </div>

      {/* Non-admin approval notice */}
      {!isAdmin && !isReviseMode && (
        <div className="flex items-start gap-3 bg-yellow-50 border border-yellow-200 rounded-xl p-4">
          <HiOutlineClock className="w-5 h-5 text-yellow-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-yellow-800">Approval Required</p>
            <p className="text-xs text-yellow-600 mt-0.5">
              Your survey dispatch request will be sent to an admin for review before any emails are sent.
            </p>
          </div>
        </div>
      )}

      {/* Fix D14: Approval retry banner */}
      {approvalSubmitFailed && createdDispatchId && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
          <HiOutlineExclamation className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-800">Approval submission failed</p>
            <p className="text-xs text-red-600 mt-0.5">
              Your dispatch was saved but could not be submitted for approval. Click Retry to try again.
            </p>
          </div>
          <button
            onClick={handleRetryApprovalSubmit}
            disabled={sending}
            className="text-xs font-semibold px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors flex-shrink-0"
          >
            {sending ? 'Retrying…' : 'Retry'}
          </button>
        </div>
      )}

      {/* Step indicator */}
      <div className="bg-white border border-gray-200 rounded-2xl px-6 py-5">
        <StepIndicator step={step} />
      </div>

      {/* Step content */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4 min-h-[200px]">
        {/* Step 0 — Select Survey */}
        {step === 0 && (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-gray-700">Choose a published survey</p>
            {surveys.length === 0 ? (
              <div className="border-2 border-dashed border-gray-200 rounded-2xl p-8 text-center">
                <p className="text-sm text-gray-500">No published surveys found.</p>
                {isAdmin && (
                  <button
                    onClick={() => navigate('/csat/surveys')}
                    className="mt-2 text-emerald-600 text-sm font-semibold hover:underline"
                  >
                    Build and publish a survey first →
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {surveys.map((s) => (
                  <label
                    key={s._id}
                    className={`flex items-start gap-3.5 p-4 border-2 rounded-xl cursor-pointer transition-all ${
                      selectedSurvey?._id === s._id
                        ? 'border-emerald-500 bg-emerald-50'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <input
                      type="radio"
                      name="survey"
                      checked={selectedSurvey?._id === s._id}
                      onChange={() => setSelectedSurvey(s)}
                      className="mt-0.5 w-4 h-4 text-emerald-600 border-gray-300 focus:ring-emerald-500"
                    />
                    <div>
                      <p className="text-sm font-bold text-gray-900">{s.name}</p>
                      {s.description && <p className="text-xs text-gray-400 mt-0.5">{s.description}</p>}
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 1 — Select Org + Recipients */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Client Organisation
              </label>
              <select
                value={selectedOrg?._id || ''}
                onChange={(e) => {
                  const org = orgs.find((o) => o._id === e.target.value);
                  setSelectedOrg(org || null);
                  setSelectedEmployeeIds([]);
                }}
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
              >
                <option value="">— Select organisation —</option>
                {orgs.map((o) => (
                  <option key={o._id} value={o._id}>{o.name}</option>
                ))}
              </select>
            </div>
            {selectedOrg && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Recipients</label>
                <RecipientSelector
                  orgId={selectedOrg?._id}
                  selected={selectedEmployeeIds}
                  onChange={setSelectedEmployeeIds}
                />
              </div>
            )}
          </div>
        )}

        {/* Step 2 — Configure */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Email Subject <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                placeholder="Enter email subject..."
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <ScheduleConfig value={schedCfg} onChange={setSchedCfg} />

            {/* Summary */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2 text-sm">
              <p className="font-semibold text-gray-700 text-xs uppercase tracking-wide mb-3">Summary</p>
              {[
                { label: 'Survey', value: selectedSurvey?.name },
                { label: 'Organisation', value: selectedOrg?.name },
                { label: 'Recipients', value: `${selectedEmployeeIds.length} employee${selectedEmployeeIds.length !== 1 ? 's' : ''}` },
                { label: 'Mode', value: MODE_LABELS[schedCfg.dispatchMode] || 'Instant' },
                ...(!isAdmin ? [{ label: 'Approval', value: 'Required (Admin review)' }] : []),
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center gap-2">
                  <span className="text-gray-400 text-xs w-24 flex-shrink-0">{label}</span>
                  <span className="text-gray-900 font-medium text-xs">{value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => step === 0 ? navigate(-1) : setStep((s) => s - 1)}
          className="flex items-center gap-1.5 px-4 py-2.5 text-sm text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 font-medium transition-colors"
        >
          <HiOutlineChevronLeft className="w-4 h-4" />
          {step === 0 ? 'Cancel' : 'Back'}
        </button>
        <button
          onClick={handleNext}
          disabled={!canGoNext()}
          className="flex items-center gap-2 px-6 py-2.5 text-sm bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:opacity-40 font-semibold transition-colors shadow-sm shadow-emerald-100"
        >
          {step < 2 ? (
            <>Next <HiOutlineChevronRight className="w-4 h-4" /></>
          ) : (
            <><HiOutlinePaperAirplane className="w-4 h-4" />{submitLabel}</>
          )}
        </button>
      </div>

      {/* Confirm dialog */}
      <ConfirmDialog
        isOpen={showConfirm}
        onCancel={() => setShowConfirm(false)}
        onConfirm={handleSend}
        loading={sending}
        title={confirmTitle}
        message={confirmMessage}
        confirmLabel={isReviseMode ? 'Resubmit' : !isAdmin ? 'Submit for Approval' : 'Confirm'}
      />
    </div>
  );
}
