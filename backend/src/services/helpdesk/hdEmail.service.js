'use strict';

/**
 * @file hdEmail.service.js
 * @description Helpdesk email notification service for PLI Portal.
 *
 * All functions are fire-and-forget: errors are logged to console.error
 * and never re-thrown, so callers do not need to await delivery.
 *
 * Reuses the shared sendEmail utility from utils/emailService so the
 * SMTP transporter (SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS /
 * SMTP_FROM) is configured exactly once across the application.
 */

const { sendEmail } = require('../../utils/emailService');

// ── Constants ────────────────────────────────────────────────────────────────

const PORTAL_NAME = 'PLI Portal Helpdesk';
const HEADER_BG   = '#0F1B2D';
const FOOTER_COLOR = '#6b7280';

/** Colour map for priority badges. */
const PRIORITY_COLORS = {
  critical : '#dc2626',
  high     : '#ea580c',
  medium   : '#2563eb',
  low      : '#16a34a',
};

/** Colour map for status badges. */
const STATUS_COLORS = {
  open        : '#2563eb',
  in_progress : '#d97706',
  resolved    : '#16a34a',
  closed      : '#6b7280',
  pending     : '#7c3aed',
  reopened    : '#dc2626',
};

// ── Shared HTML helpers ──────────────────────────────────────────────────────

/**
 * Returns the base URL used for backend API links (approval callbacks, etc.)
 * Prefers BACKEND_URL, falls back to FRONTEND_URL, then localhost.
 * @returns {string}
 */
function backendBase() {
  return (
    process.env.BACKEND_URL ||
    process.env.FRONTEND_URL ||
    'http://localhost:5105'
  );
}

/**
 * Returns the frontend base URL used for portal deep-links.
 * @returns {string}
 */
function frontendBase() {
  return process.env.FRONTEND_URL || 'http://localhost:5173';
}

/**
 * Renders a coloured inline badge (display:inline-block).
 * @param {string} label
 * @param {string} color - hex colour
 * @returns {string} HTML snippet
 */
function badge(label, color) {
  return `<span style="display:inline-block;background-color:${color};color:#ffffff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:12px;letter-spacing:0.5px;text-transform:uppercase;">${label}</span>`;
}

/**
 * Returns a priority badge using the PRIORITY_COLORS map.
 * @param {string} priority
 * @returns {string}
 */
function priorityBadge(priority) {
  const p = (priority || 'medium').toLowerCase();
  return badge(p, PRIORITY_COLORS[p] || '#6b7280');
}

/**
 * Returns a status badge using the STATUS_COLORS map.
 * @param {string} status
 * @returns {string}
 */
function statusBadge(status) {
  const s = (status || 'open').toLowerCase();
  return badge(s.replace(/_/g, ' '), STATUS_COLORS[s] || '#6b7280');
}

/**
 * Builds the shared Outlook-safe email wrapper.
 *   - Table-based layout, no flexbox / grid / linear-gradient.
 *   - Header uses bgcolor attribute on <td> (not CSS background on <div>).
 *   - Body content is injected between header and footer.
 *
 * @param {string} bodyHtml - Inner HTML to inject between header and footer.
 * @returns {string} Full HTML document string.
 */
function wrapEmail(bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${PORTAL_NAME}</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f3f4f6;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <!-- Card -->
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.12);">

          <!-- Header -->
          <tr>
            <td bgcolor="${HEADER_BG}" style="background-color:${HEADER_BG};padding:24px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <span style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:0.5px;">${PORTAL_NAME}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              ${bodyHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px 24px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:12px;color:${FOOTER_COLOR};">
                This is an automated notification from the PLI Portal Helpdesk.
                Please do not reply to this email.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Renders a ticket summary block (REQ number, title, priority, status row).
 * Uses a plain table so it is Outlook-safe.
 * @param {object} ticket
 * @returns {string}
 */
function ticketSummaryBlock(ticket) {
  const reqNumber  = ticket.reqNumber  || ticket.req_number  || '—';
  const title      = ticket.title      || '(no title)';
  const priority   = ticket.priority   || 'medium';
  const status     = ticket.status     || 'open';
  const category   = ticket.category   || '';

  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;margin:20px 0;">
      <tr>
        <td style="padding:16px 20px;">
          <p style="margin:0 0 4px 0;font-size:22px;font-weight:700;color:${HEADER_BG};">${reqNumber}</p>
          <p style="margin:0 0 12px 0;font-size:15px;color:#1e293b;">${title}</p>
          <table cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="padding-right:8px;">${priorityBadge(priority)}</td>
              <td>${statusBadge(status)}</td>
              ${category ? `<td style="padding-left:8px;font-size:12px;color:${FOOTER_COLOR};">${category}</td>` : ''}
            </tr>
          </table>
        </td>
      </tr>
    </table>`;
}

/**
 * Renders a CTA button anchor (Outlook-safe table-based button).
 * @param {string} href
 * @param {string} label
 * @param {string} [bgColor='#1e40af']
 * @returns {string}
 */
function ctaButton(href, label, bgColor = '#1e40af') {
  return `
    <table cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td bgcolor="${bgColor}" style="background-color:${bgColor};border-radius:6px;padding:0;">
          <a href="${href}"
             style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;border-radius:6px;">${label}</a>
        </td>
      </tr>
    </table>`;
}

// ── Exported email functions ─────────────────────────────────────────────────

/**
 * Notify requester that their ticket was created.
 *
 * @param {object} ticket    - HdTicket instance (plain object or Sequelize model).
 * @param {object} requester - { name: string, email: string }
 * @returns {Promise<void>}
 */
const sendTicketCreated = async (ticket, requester) => {
  try {
    const reqNumber = ticket.reqNumber || ticket.req_number || '—';
    const subject   = `Ticket Created: ${reqNumber} — ${ticket.title || 'New Request'}`;

    const body = `
      <p style="margin:0 0 8px 0;font-size:16px;color:#1e293b;">
        Dear <strong>${requester.name || 'Requester'}</strong>,
      </p>
      <p style="margin:0 0 16px 0;font-size:14px;color:#475569;">
        Your helpdesk request has been successfully created and is now in our queue.
        We will assign an agent shortly.
      </p>

      ${ticketSummaryBlock(ticket)}

      <p style="margin:16px 0 8px 0;font-size:14px;color:#475569;">
        You can track the status of your ticket at any time from the portal.
      </p>

      <div style="margin-top:20px;">
        ${ctaButton(`${frontendBase()}/helpdesk/my-tickets`, 'View My Ticket')}
      </div>`;

    await sendEmail(requester.email, subject, wrapEmail(body));
  } catch (err) {
    console.error('[HdEmail] sendTicketCreated failed:', err.message);
  }
};

/**
 * Notify assignee that a ticket was assigned to them.
 *
 * @param {object} ticket   - HdTicket instance.
 * @param {object} assignee - { name: string, email: string }
 * @param {object} assigner - { name: string } (who performed the assignment)
 * @returns {Promise<void>}
 */
const sendTicketAssigned = async (ticket, assignee, assigner) => {
  try {
    const reqNumber = ticket.reqNumber || ticket.req_number || '—';
    const subject   = `Ticket Assigned to You: ${reqNumber}`;

    const body = `
      <p style="margin:0 0 8px 0;font-size:16px;color:#1e293b;">
        Dear <strong>${assignee.name || 'Agent'}</strong>,
      </p>
      <p style="margin:0 0 16px 0;font-size:14px;color:#475569;">
        A helpdesk ticket has been assigned to you
        ${assigner && assigner.name ? `by <strong>${assigner.name}</strong>` : ''}.
        Please review the details below and take action.
      </p>

      ${ticketSummaryBlock(ticket)}

      ${ticket.description ? `
      <p style="margin:16px 0 4px 0;font-size:13px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:0.5px;">Description</p>
      <p style="margin:0 0 16px 0;font-size:14px;color:#475569;border-left:3px solid #e2e8f0;padding-left:12px;">${ticket.description}</p>
      ` : ''}

      <div style="margin-top:20px;">
        ${ctaButton(`${frontendBase()}/helpdesk/tickets/${ticket.id || ''}`, 'Open Ticket', '#0F1B2D')}
      </div>`;

    await sendEmail(assignee.email, subject, wrapEmail(body));
  } catch (err) {
    console.error('[HdEmail] sendTicketAssigned failed:', err.message);
  }
};

/**
 * Send one-click approve / reject email to the approver.
 *
 * Approval and rejection links hit the backend API directly because the
 * respond endpoint is on the backend. Uses:
 *   process.env.BACKEND_URL || process.env.FRONTEND_URL || 'http://localhost:5105'
 *
 * @param {object} ticket   - HdTicket instance.
 * @param {object} approval - { token: string } — HdTicketApproval instance.
 * @param {object} approver - { name: string, email: string }
 * @param {object} requester - { name: string } (who requested the approval)
 * @returns {Promise<void>}
 */
const sendApprovalRequest = async (ticket, approval, approver, requester) => {
  try {
    const reqNumber  = ticket.reqNumber || ticket.req_number || '—';
    const base       = backendBase();
    const token      = approval.token || '';
    const approveUrl = `${base}/api/helpdesk/approvals/respond?token=${token}&action=approve`;
    const rejectUrl  = `${base}/api/helpdesk/approvals/respond?token=${token}&action=reject`;
    const subject    = `Action Required — Approval Requested: ${reqNumber}`;

    const body = `
      <p style="margin:0 0 8px 0;font-size:16px;color:#1e293b;">
        Dear <strong>${approver.name || 'Approver'}</strong>,
      </p>
      <p style="margin:0 0 16px 0;font-size:14px;color:#475569;">
        ${requester && requester.name ? `<strong>${requester.name}</strong> has` : 'A requester has'}
        submitted a helpdesk ticket that requires your approval.
        Please review the details and respond using the buttons below.
      </p>

      ${ticketSummaryBlock(ticket)}

      ${ticket.description ? `
      <p style="margin:16px 0 4px 0;font-size:13px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:0.5px;">Details</p>
      <p style="margin:0 0 16px 0;font-size:14px;color:#475569;border-left:3px solid #e2e8f0;padding-left:12px;">${ticket.description}</p>
      ` : ''}

      <!-- CTA buttons -->
      <table cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;">
        <tr>
          <!-- Approve -->
          <td style="padding-right:12px;">
            <table cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td bgcolor="#16a34a" style="background-color:#16a34a;border-radius:6px;">
                  <a href="${approveUrl}"
                     style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:6px;">
                    &#10003; Approve
                  </a>
                </td>
              </tr>
            </table>
          </td>
          <!-- Reject -->
          <td>
            <table cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td bgcolor="#dc2626" style="background-color:#dc2626;border-radius:6px;">
                  <a href="${rejectUrl}"
                     style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:6px;">
                    &#10007; Reject
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <p style="margin:20px 0 0 0;font-size:12px;color:${FOOTER_COLOR};">
        Clicking Approve or Reject will immediately record your decision.
        These links are unique to this request and can only be used once.
      </p>`;

    await sendEmail(approver.email, subject, wrapEmail(body));
  } catch (err) {
    console.error('[HdEmail] sendApprovalRequest failed:', err.message);
  }
};

/**
 * Notify the project manager when a widget ticket is reopened by the submitter.
 *
 * @param {object} ticket  - HdTicket instance.
 * @param {object} manager - { name: string, email: string }
 * @returns {Promise<void>}
 */
const sendWidgetTicketReopened = async (ticket, manager) => {
  try {
    const reqNumber = ticket.reqNumber || ticket.req_number || '—';
    const subject   = `Widget Ticket Reopened: ${reqNumber}`;

    const body = `
      <p style="margin:0 0 8px 0;font-size:16px;color:#1e293b;">
        Dear <strong>${manager.name || 'Manager'}</strong>,
      </p>
      <p style="margin:0 0 16px 0;font-size:14px;color:#475569;">
        A widget ticket that was previously resolved has been
        <strong style="color:#dc2626;">reopened</strong> by the submitter.
        Please review and take appropriate action.
      </p>

      ${ticketSummaryBlock(ticket)}

      ${ticket.reopenCount != null ? `
      <p style="margin:12px 0 0 0;font-size:13px;color:${FOOTER_COLOR};">
        This ticket has been reopened <strong>${ticket.reopenCount}</strong> time(s).
      </p>` : ''}

      <div style="margin-top:20px;">
        ${ctaButton(`${frontendBase()}/helpdesk/tickets/${ticket.id || ''}`, 'View Ticket', '#ea580c')}
      </div>`;

    await sendEmail(manager.email, subject, wrapEmail(body));
  } catch (err) {
    console.error('[HdEmail] sendWidgetTicketReopened failed:', err.message);
  }
};

/**
 * Notify a manager when a ticket is escalated — either because of a high
 * reopen count (default wording) or an SLA breach (pass `options.reason`).
 *
 * Never throws. Returns true only when the mail was actually handed to SMTP
 * (sendEmail returns null when SMTP is unconfigured or delivery failed), so a
 * caller that records "escalated" can tell a real send from a no-op.
 *
 * @param {object} ticket      - HdTicket instance.
 * @param {object} escalateTo  - { name: string, email: string }
 * @param {object} [options]
 * @param {string} [options.reason] - Plain-text explanation shown in place of the
 *                                    reopen-count wording (e.g. SLA breach details).
 * @returns {Promise<boolean>}
 */
const sendEscalation = async (ticket, escalateTo, options = {}) => {
  try {
    const reqNumber = ticket.reqNumber || ticket.req_number || '—';
    const subject   = `[ESCALATED] Helpdesk Ticket Requires Attention: ${reqNumber}`;
    const reason    = options && options.reason ? String(options.reason) : null;

    const whyText = reason
      ? `to you because ${reason}.`
      : 'to you because it has been reopened multiple times and remains unresolved.';
    const bannerText = reason
      ? `&#9888; ESCALATED — ${reason}.`
      : `&#9888; ESCALATED — This ticket has been reopened
              ${ticket.reopenCount != null ? `<strong>${ticket.reopenCount}</strong> time(s)` : 'multiple times'}.`;

    const body = `
      <p style="margin:0 0 8px 0;font-size:16px;color:#1e293b;">
        Dear <strong>${escalateTo.name || 'Manager'}</strong>,
      </p>
      <p style="margin:0 0 16px 0;font-size:14px;color:#475569;">
        The following helpdesk ticket has been <strong style="color:#dc2626;">escalated</strong>
        ${whyText}
        Your intervention is required.
      </p>

      <!-- Escalation alert banner -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;">
        <tr>
          <td bgcolor="#fef2f2" style="background-color:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:12px 16px;">
            <p style="margin:0;font-size:13px;font-weight:700;color:#dc2626;">
              ${bannerText}
            </p>
          </td>
        </tr>
      </table>

      ${ticketSummaryBlock(ticket)}

      <div style="margin-top:20px;">
        ${ctaButton(`${frontendBase()}/helpdesk/tickets/${ticket.id || ''}`, 'View Escalated Ticket', '#dc2626')}
      </div>`;

    const info = await sendEmail(escalateTo.email, subject, wrapEmail(body));
    return Boolean(info);
  } catch (err) {
    console.error('[HdEmail] sendEscalation failed:', err.message);
    return false;
  }
};

/**
 * Confirm to a widget submitter (unauthenticated) that their ticket was received.
 *
 * @param {{ reqNumber: string, title: string, status: string }} ticket
 * @param {{ name: string, email: string }} submitter
 * @returns {Promise<void>}
 */
const sendWidgetConfirmation = async (ticket, submitter) => {
  try {
    const reqNumber = ticket.reqNumber || ticket.req_number || '—';
    const subject   = `We received your request — ${reqNumber}`;

    const body = `
      <p style="margin:0 0 8px 0;font-size:16px;color:#1e293b;">
        Dear <strong>${submitter.name || 'Submitter'}</strong>,
      </p>
      <p style="margin:0 0 16px 0;font-size:14px;color:#475569;">
        Thank you for reaching out. Your helpdesk request has been received and
        logged in our system. Our team will review it shortly.
      </p>

      <table width="100%" cellpadding="0" cellspacing="0" border="0"
             style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;margin:20px 0;">
        <tr>
          <td style="padding:16px 20px;">
            <p style="margin:0 0 4px 0;font-size:22px;font-weight:700;color:${HEADER_BG};">${reqNumber}</p>
            <p style="margin:0 0 12px 0;font-size:15px;color:#1e293b;">${ticket.title || '(no title)'}</p>
            <table cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td>${statusBadge(ticket.status || 'open')}</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <p style="margin:16px 0 0 0;font-size:14px;color:#475569;">
        Please keep this reference number for future correspondence.
        You may also use the link below to check your request status.
      </p>

      <div style="margin-top:20px;">
        ${ctaButton(`${frontendBase()}/helpdesk/track?req=${reqNumber}`, 'Track Your Request', '#0F1B2D')}
      </div>`;

    await sendEmail(submitter.email, subject, wrapEmail(body));
  } catch (err) {
    console.error('[HdEmail] sendWidgetConfirmation failed:', err.message);
  }
};

/**
 * Notify requester or relevant parties when a new reply is added to a ticket.
 *
 * @param {object} ticket        - HdTicket instance.
 * @param {object} conversation  - { message: string, isInternal: boolean }
 * @param {object} author        - { name: string }
 * @param {object} recipient     - { name: string, email: string }
 * @returns {Promise<void>}
 */
const sendConversationReply = async (ticket, conversation, author, recipient) => {
  try {
    // Internal notes are not emailed to external recipients.
    if (conversation.isInternal) return;

    const reqNumber = ticket.reqNumber || ticket.req_number || '—';
    const subject   = `New Reply on Ticket ${reqNumber}`;

    const messagePreview = (conversation.message || '')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    const body = `
      <p style="margin:0 0 8px 0;font-size:16px;color:#1e293b;">
        Dear <strong>${recipient.name || 'User'}</strong>,
      </p>
      <p style="margin:0 0 16px 0;font-size:14px;color:#475569;">
        <strong>${author.name || 'An agent'}</strong> has added a reply to your helpdesk ticket.
      </p>

      ${ticketSummaryBlock(ticket)}

      <!-- Reply block -->
      <p style="margin:20px 0 6px 0;font-size:13px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:0.5px;">
        Reply from ${author.name || 'Agent'}
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="background-color:#f8fafc;border-left:4px solid ${HEADER_BG};border-radius:4px;padding:14px 16px;">
            <p style="margin:0;font-size:14px;color:#1e293b;white-space:pre-wrap;">${messagePreview}</p>
          </td>
        </tr>
      </table>

      <p style="margin:20px 0 8px 0;font-size:14px;color:#475569;">
        Please log in to view the full conversation and respond.
      </p>

      <div style="margin-top:8px;">
        ${ctaButton(`${frontendBase()}/helpdesk/tickets/${ticket.id || ''}`, 'View Conversation')}
      </div>`;

    await sendEmail(recipient.email, subject, wrapEmail(body));
  } catch (err) {
    console.error('[HdEmail] sendConversationReply failed:', err.message);
  }
};

// ── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  sendTicketCreated,
  sendTicketAssigned,
  sendApprovalRequest,
  sendWidgetTicketReopened,
  sendEscalation,
  sendWidgetConfirmation,
  sendConversationReply,
};
