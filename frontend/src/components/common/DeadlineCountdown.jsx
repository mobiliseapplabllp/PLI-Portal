/**
 * DeadlineCountdown — Compact urgency-coloured deadline strip.
 * Shows "Deadline: 3 days left", "Overdue by 2 days", or "Not set" with colour coding.
 * Pass showIfMissing to render a warning badge when deadline is null/undefined.
 */
import { HiOutlineClock } from 'react-icons/hi';

export default function DeadlineCountdown({ deadline, label = 'Deadline', className = '', showIfMissing = false }) {
  if (!deadline) {
    if (!showIfMissing) return null;
    return (
      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-orange-50 text-orange-700 border border-orange-200 ${className}`}>
        <HiOutlineClock className="h-3.5 w-3.5 flex-shrink-0" />
        <span>{label}: Not set by admin</span>
      </div>
    );
  }

  const now = new Date();
  const deadlineDate = new Date(deadline);
  const diffMs = deadlineDate - now;
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  let urgencyClass = 'deadline-ok';
  let text = '';

  if (diffMs < 0) {
    urgencyClass = 'deadline-overdue';
    const overdueDays = Math.abs(diffDays);
    text = `Overdue by ${overdueDays} day${overdueDays !== 1 ? 's' : ''}`;
  } else if (diffDays <= 3) {
    urgencyClass = 'deadline-soon';
    text = `${diffDays} day${diffDays !== 1 ? 's' : ''} left`;
  } else {
    urgencyClass = 'deadline-ok';
    text = `${diffDays} days left`;
  }

  const dateStr = deadlineDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${urgencyClass} ${className}`}>
      <HiOutlineClock className="h-3.5 w-3.5 flex-shrink-0" />
      <span>
        {label}: {dateStr} — {text}
      </span>
    </div>
  );
}
