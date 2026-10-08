/**
 * TicketApprovalRespond.jsx
 * Public-facing confirmation page shown after clicking approve/reject in email.
 * Route: /helpdesk/approvals/respond?token=X&action=approve|reject
 *
 * The actual API call is handled server-side via the email link hitting the
 * backend directly. This page simply reads the `action` query param and shows
 * a friendly confirmation message with a link back to the portal.
 */
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { HiOutlineCheckCircle, HiOutlineXCircle } from 'react-icons/hi';

export default function TicketApprovalRespond() {
  const [params] = useSearchParams();
  const action = params.get('action');
  const ticket = params.get('ticket') || params.get('req');

  const isApproved = action === 'approve' || action === 'approved';
  const isRejected = action === 'reject' || action === 'rejected';
  const isKnown = isApproved || isRejected;

  const config = useMemo(() => {
    if (isApproved) {
      return {
        icon: HiOutlineCheckCircle,
        iconColor: 'text-emerald-500',
        bg: 'bg-emerald-50',
        border: 'border-emerald-200',
        heading: 'Ticket Approved',
        message: 'Your approval has been recorded. The requestor has been notified and the ticket will move forward.',
      };
    }
    if (isRejected) {
      return {
        icon: HiOutlineXCircle,
        iconColor: 'text-red-500',
        bg: 'bg-red-50',
        border: 'border-red-200',
        heading: 'Ticket Rejected',
        message: 'Your rejection has been recorded. The requestor has been notified and the ticket has been updated accordingly.',
      };
    }
    return {
      icon: HiOutlineCheckCircle,
      iconColor: 'text-gray-400',
      bg: 'bg-gray-50',
      border: 'border-gray-200',
      heading: 'Response Recorded',
      message: 'Thank you for your response. The ticket has been updated.',
    };
  }, [isApproved, isRejected]);

  const Icon = config.icon;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className={`bg-white rounded-2xl border ${config.border} shadow-sm max-w-md w-full p-10 text-center`}>
        {/* Icon */}
        <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full ${config.bg} mb-6`}>
          <Icon className={`w-10 h-10 ${config.iconColor}`} />
        </div>

        {/* Heading */}
        <h1 className="text-2xl font-bold text-gray-900 mb-3">{config.heading}</h1>

        {/* Ticket reference */}
        {ticket && (
          <p className="text-sm text-gray-500 mb-3">
            Ticket reference: <strong className="font-mono text-gray-700">{ticket}</strong>
          </p>
        )}

        {/* Message */}
        <p className="text-sm text-gray-600 leading-relaxed mb-8">{config.message}</p>

        {/* Portal Link */}
        <Link
          to="/helpdesk"
          className="inline-block px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          Go to Operations Portal
        </Link>

        <p className="text-xs text-gray-400 mt-6">
          PLI Portal &mdash; Operations
        </p>
      </div>
    </div>
  );
}
