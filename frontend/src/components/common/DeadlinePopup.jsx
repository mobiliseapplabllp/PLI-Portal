import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { HiOutlineCalendar, HiOutlineClock, HiX } from 'react-icons/hi';
import { getCyclesApi } from '../../api/cycles.api';

const STORAGE_KEY = 'pli_deadline_popup_shown';

function formatDate(dateStr) {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.round((target - now) / (1000 * 60 * 60 * 24));
}

function DeadlineItem({ label, dateStr, color }) {
  const date = formatDate(dateStr);
  const days = daysUntil(dateStr);
  if (!date || days === null || days < 0) return null;

  const urgency = days <= 1 ? 'text-red-600' : days <= 3 ? 'text-orange-500' : color;
  const badge = days === 0 ? 'Due Today' : days === 1 ? '1 day left' : `${days} days left`;

  return (
    <div className="flex items-start gap-3 py-2 border-b border-gray-100 last:border-0">
      <HiOutlineCalendar className={`mt-0.5 flex-shrink-0 ${urgency}`} size={18} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-700">{label}</p>
        <p className="text-sm text-gray-500">{date}</p>
      </div>
      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
        days <= 1 ? 'bg-red-100 text-red-700' :
        days <= 3 ? 'bg-orange-100 text-orange-700' :
        'bg-blue-100 text-blue-700'
      }`}>
        {badge}
      </span>
    </div>
  );
}

export default function DeadlinePopup() {
  const { user } = useSelector((s) => s.auth);
  const [visible, setVisible] = useState(false);
  const [cycle, setCycle] = useState(null);

  useEffect(() => {
    if (!user) return;

    // Show only once per day per user
    const today = new Date().toISOString().slice(0, 10);
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === `${user.id}_${today}`) return;

    getCyclesApi({ status: 'open' })
      .then((res) => {
        const cycles = res.data?.data;
        if (!Array.isArray(cycles) || cycles.length === 0) return;

        // Pick the most recent open cycle
        const latest = cycles[0];
        const role = user.role;

        // Determine if there are any upcoming deadlines relevant to this role
        const hasDeadline =
          (role === 'employee' && (
            (latest.commitmentDeadline && daysUntil(latest.commitmentDeadline) >= 0) ||
            (latest.employeeSubmissionDeadline && daysUntil(latest.employeeSubmissionDeadline) >= 0)
          )) ||
          (['manager', 'senior_manager'].includes(role) &&
            latest.managerReviewDeadline && daysUntil(latest.managerReviewDeadline) >= 0) ||
          (['admin', 'hr_admin', 'final_approver'].includes(role) &&
            latest.finalReviewDeadline && daysUntil(latest.finalReviewDeadline) >= 0);

        if (!hasDeadline) return;

        setCycle(latest);
        setVisible(true);
        localStorage.setItem(STORAGE_KEY, `${user.id}_${today}`);
      })
      .catch(() => {});
  }, [user]);

  if (!visible || !cycle) return null;

  const role = user?.role;
  const monthName = cycle.month
    ? new Date(2000, cycle.month - 1).toLocaleString('en-IN', { month: 'long' })
    : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-blue-600 to-blue-700">
          <div className="flex items-center gap-2">
            <HiOutlineClock className="text-white" size={20} />
            <h2 className="text-base font-semibold text-white">
              KPI Deadlines — {monthName} {cycle.financialYear}
            </h2>
          </div>
          <button
            onClick={() => setVisible(false)}
            className="text-white/80 hover:text-white transition-colors"
          >
            <HiX size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          <p className="text-sm text-gray-500 mb-3">
            The appraisal cycle is currently open. Please ensure you complete your tasks before the deadlines.
          </p>

          <div className="space-y-0">
            {/* Employee deadlines */}
            {(role === 'employee' || ['admin', 'hr_admin'].includes(role)) && (
              <>
                <DeadlineItem
                  label="KPI Commitment Deadline"
                  dateStr={cycle.commitmentDeadline}
                  color="text-blue-600"
                />
                <DeadlineItem
                  label="Self-Review Submission Deadline"
                  dateStr={cycle.employeeSubmissionDeadline}
                  color="text-blue-600"
                />
              </>
            )}

            {/* Manager deadlines */}
            {(['manager', 'senior_manager', 'admin', 'hr_admin'].includes(role)) && (
              <DeadlineItem
                label="Manager Review Deadline"
                dateStr={cycle.managerReviewDeadline}
                color="text-purple-600"
              />
            )}

            {/* Final approver / admin */}
            {(['final_approver', 'admin'].includes(role)) && (
              <DeadlineItem
                label="Final Review Deadline"
                dateStr={cycle.finalReviewDeadline}
                color="text-green-600"
              />
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-end">
          <button
            onClick={() => setVisible(false)}
            className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
