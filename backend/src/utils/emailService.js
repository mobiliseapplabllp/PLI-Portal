const nodemailer = require('nodemailer');

let transporter = null;

/**
 * Initialize the nodemailer transporter.
 * Called lazily on first send attempt.
 */
function getTransporter() {
  if (transporter) return transporter;

  if (!process.env.SMTP_HOST) {
    return null;
  }

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return transporter;
}

/**
 * Send an email. Never throws — logs errors instead.
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} html - HTML body
 */
const sendEmail = async (to, subject, html) => {
  try {
    const t = getTransporter();
    if (!t) {
      console.warn('[Email] SMTP_HOST not configured — skipping email to', to);
      return null;
    }

    // Fall back to a named sender rather than a bare address, so mail still
    // arrives as "Lakshya Portal" on environments where SMTP_FROM is unset.
    const from = process.env.SMTP_FROM || `Lakshya Portal <${process.env.SMTP_USER}>`;
    const info = await t.sendMail({ from, to, subject, html });
    console.log('[Email] Sent to', to, '— messageId:', info.messageId);
    return info;
  } catch (err) {
    console.error('[Email] Failed to send to', to, ':', err.message);
    return null;
  }
};

/**
 * Notify employee that KPIs have been assigned.
 */
const sendKpiAssignedEmail = async (employeeEmail, employeeName, month, year) => {
  const subject = `KPIs Assigned — ${month} ${year}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1e40af;">KPIs Assigned</h2>
      <p>Dear <strong>${employeeName}</strong>,</p>
      <p>Your KPIs for <strong>${month} ${year}</strong> have been assigned. Please log in to the Lakshya Portal to view your KPIs and submit your self-assessment.</p>
      <p style="margin-top: 24px;">
        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/employee/my-kpis"
           style="background-color: #1e40af; color: white; padding: 10px 24px; text-decoration: none; border-radius: 6px;">
          View My KPIs
        </a>
      </p>
      <hr style="margin-top: 32px; border: none; border-top: 1px solid #e5e7eb;" />
      <p style="font-size: 12px; color: #6b7280;">This is an automated notification from the Lakshya Portal.</p>
    </div>
  `;
  return sendEmail(employeeEmail, subject, html);
};

/**
 * Remind an employee to submit their KPI values.
 */
const sendSubmissionReminderEmail = async (employeeEmail, employeeName, month, year) => {
  const subject = `Reminder: Submit Your KPIs — ${month} ${year}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #d97706;">Submission Reminder</h2>
      <p>Dear <strong>${employeeName}</strong>,</p>
      <p>This is a reminder to submit your self-assessment for <strong>${month} ${year}</strong>. Please log in to the Lakshya Portal and complete your submission at your earliest convenience.</p>
      <p style="margin-top: 24px;">
        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/employee/my-kpis"
           style="background-color: #d97706; color: white; padding: 10px 24px; text-decoration: none; border-radius: 6px;">
          Submit Now
        </a>
      </p>
      <hr style="margin-top: 32px; border: none; border-top: 1px solid #e5e7eb;" />
      <p style="font-size: 12px; color: #6b7280;">This is an automated notification from the Lakshya Portal.</p>
    </div>
  `;
  return sendEmail(employeeEmail, subject, html);
};

/**
 * Notify employee that their review is complete (manager reviewed, final reviewed, or locked).
 */
const sendReviewCompleteEmail = async (employeeEmail, employeeName, month, year, status) => {
  const statusLabels = {
    manager_reviewed: 'Manager Review Complete',
    final_reviewed: 'Final Review Complete',
    locked: 'Record Locked & Finalized',
  };
  const label = statusLabels[status] || 'Review Update';

  const subject = `${label} — ${month} ${year}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #059669;">${label}</h2>
      <p>Dear <strong>${employeeName}</strong>,</p>
      <p>Your KPI assessment for <strong>${month} ${year}</strong> has been updated to: <strong>${label}</strong>.</p>
      <p>Please log in to the Lakshya Portal to view the details.</p>
      <p style="margin-top: 24px;">
        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/employee/my-kpis"
           style="background-color: #059669; color: white; padding: 10px 24px; text-decoration: none; border-radius: 6px;">
          View Details
        </a>
      </p>
      <hr style="margin-top: 32px; border: none; border-top: 1px solid #e5e7eb;" />
      <p style="font-size: 12px; color: #6b7280;">This is an automated notification from the Lakshya Portal.</p>
    </div>
  `;
  return sendEmail(employeeEmail, subject, html);
};

/**
 * Notify manager that an employee has submitted KPIs.
 */
const sendEmployeeSubmittedEmail = async (managerEmail, managerName, employeeName, month, year) => {
  const subject = `Employee Submission — ${employeeName} — ${month} ${year}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #7c3aed;">Employee KPI Submission</h2>
      <p>Dear <strong>${managerName}</strong>,</p>
      <p><strong>${employeeName}</strong> has submitted their self-assessment for <strong>${month} ${year}</strong>. Please log in to the Lakshya Portal to review.</p>
      <p style="margin-top: 24px;">
        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/manager/team-overview"
           style="background-color: #7c3aed; color: white; padding: 10px 24px; text-decoration: none; border-radius: 6px;">
          Review Now
        </a>
      </p>
      <hr style="margin-top: 32px; border: none; border-top: 1px solid #e5e7eb;" />
      <p style="font-size: 12px; color: #6b7280;">This is an automated notification from the Lakshya Portal.</p>
    </div>
  `;
  return sendEmail(managerEmail, subject, html);
};

/**
 * Notify admins that a manager review is complete.
 */
const sendManagerReviewedEmail = async (adminEmail, adminName, month, year) => {
  const subject = `Manager Review Complete — ${month} ${year}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #7c3aed;">Manager Review Complete</h2>
      <p>Dear <strong>${adminName}</strong>,</p>
      <p>A manager review has been completed for <strong>${month} ${year}</strong>. Please log in to the Lakshya Portal to perform the final review.</p>
      <p style="margin-top: 24px;">
        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/admin/overview"
           style="background-color: #7c3aed; color: white; padding: 10px 24px; text-decoration: none; border-radius: 6px;">
          View Overview
        </a>
      </p>
      <hr style="margin-top: 32px; border: none; border-top: 1px solid #e5e7eb;" />
      <p style="font-size: 12px; color: #6b7280;">This is an automated notification from the Lakshya Portal.</p>
    </div>
  `;
  return sendEmail(adminEmail, subject, html);
};

/**
 * Remind employee that commitment deadline is approaching.
 */
const sendCommitmentDeadlineReminderEmail = async (employeeEmail, employeeName, month, year, deadline, daysLeft) => {
  const urgency = daysLeft <= 1 ? '#dc2626' : daysLeft <= 3 ? '#d97706' : '#1e40af';
  const subject = `Action Required: KPI Commitment Due in ${daysLeft} Day${daysLeft === 1 ? '' : 's'} — ${month} ${year}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: ${urgency};">KPI Commitment Deadline Reminder</h2>
      <p>Dear <strong>${employeeName}</strong>,</p>
      <p>Your KPI commitment for <strong>${month} ${year}</strong> is due in <strong>${daysLeft} day${daysLeft === 1 ? '' : 's'}</strong> (by <strong>${deadline}</strong>).</p>
      <p>Please log in to the Lakshya Portal and submit your KPI commitment before the deadline.</p>
      <p style="margin-top: 24px;">
        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/employee/my-kpis"
           style="background-color: ${urgency}; color: white; padding: 10px 24px; text-decoration: none; border-radius: 6px;">
          Submit Commitment Now
        </a>
      </p>
      <hr style="margin-top: 32px; border: none; border-top: 1px solid #e5e7eb;" />
      <p style="font-size: 12px; color: #6b7280;">This is an automated reminder from the Lakshya Portal.</p>
    </div>
  `;
  return sendEmail(employeeEmail, subject, html);
};

/**
 * Remind employee that self-review (achievement submission) deadline is approaching.
 */
const sendSelfReviewDeadlineReminderEmail = async (employeeEmail, employeeName, month, year, deadline, daysLeft) => {
  const urgency = daysLeft <= 1 ? '#dc2626' : daysLeft <= 3 ? '#d97706' : '#1e40af';
  const subject = `Action Required: KPI Self-Review Due in ${daysLeft} Day${daysLeft === 1 ? '' : 's'} — ${month} ${year}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: ${urgency};">KPI Self-Review Deadline Reminder</h2>
      <p>Dear <strong>${employeeName}</strong>,</p>
      <p>Your KPI self-review for <strong>${month} ${year}</strong> is due in <strong>${daysLeft} day${daysLeft === 1 ? '' : 's'}</strong> (by <strong>${deadline}</strong>).</p>
      <p>Please log in to the Lakshya Portal and submit your achievement self-review before the deadline.</p>
      <p style="margin-top: 24px;">
        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/employee/my-kpis"
           style="background-color: ${urgency}; color: white; padding: 10px 24px; text-decoration: none; border-radius: 6px;">
          Submit Self-Review Now
        </a>
      </p>
      <hr style="margin-top: 32px; border: none; border-top: 1px solid #e5e7eb;" />
      <p style="font-size: 12px; color: #6b7280;">This is an automated reminder from the Lakshya Portal.</p>
    </div>
  `;
  return sendEmail(employeeEmail, subject, html);
};

/**
 * Remind manager that their KPI review deadline is approaching.
 */
const sendManagerReviewDeadlineReminderEmail = async (managerEmail, managerName, month, year, deadline, daysLeft) => {
  const urgency = daysLeft <= 1 ? '#dc2626' : daysLeft <= 3 ? '#d97706' : '#7c3aed';
  const subject = `Action Required: Manager KPI Review Due in ${daysLeft} Day${daysLeft === 1 ? '' : 's'} — ${month} ${year}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: ${urgency};">Manager Review Deadline Reminder</h2>
      <p>Dear <strong>${managerName}</strong>,</p>
      <p>The KPI manager review for <strong>${month} ${year}</strong> is due in <strong>${daysLeft} day${daysLeft === 1 ? '' : 's'}</strong> (by <strong>${deadline}</strong>).</p>
      <p>Please log in to the Lakshya Portal and complete your team's KPI review before the deadline.</p>
      <p style="margin-top: 24px;">
        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/manager/team-overview"
           style="background-color: ${urgency}; color: white; padding: 10px 24px; text-decoration: none; border-radius: 6px;">
          Review Team KPIs Now
        </a>
      </p>
      <hr style="margin-top: 32px; border: none; border-top: 1px solid #e5e7eb;" />
      <p style="font-size: 12px; color: #6b7280;">This is an automated reminder from the Lakshya Portal.</p>
    </div>
  `;
  return sendEmail(managerEmail, subject, html);
};

/**
 * Notify an employee that the appraisal cycle is now open.
 */
const sendCycleOpenedEmail = async (employeeEmail, employeeName, month, year, commitmentDeadline) => {
  const subject = `KPI Appraisal Cycle Open — ${month} ${year}`;
  const deadlineNote = commitmentDeadline
    ? `<p>Commitment deadline: <strong>${commitmentDeadline}</strong></p>`
    : '';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #059669;">KPI Appraisal Cycle is Now Open</h2>
      <p>Dear <strong>${employeeName}</strong>,</p>
      <p>The KPI appraisal cycle for <strong>${month} ${year}</strong> is now open. Please log in to the Lakshya Portal to view and submit your KPI commitments.</p>
      ${deadlineNote}
      <p style="color: #6b7280; font-style: italic;">If you have already submitted your commitments, please ignore this notification.</p>
      <p style="margin-top: 24px;">
        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/employee/my-kpis"
           style="background-color: #059669; color: white; padding: 10px 24px; text-decoration: none; border-radius: 6px;">
          View My KPIs
        </a>
      </p>
      <hr style="margin-top: 32px; border: none; border-top: 1px solid #e5e7eb;" />
      <p style="font-size: 12px; color: #6b7280;">This is an automated notification from the Lakshya Portal.</p>
    </div>
  `;
  return sendEmail(employeeEmail, subject, html);
};

/**
 * Send CSAT survey invitation to a client employee.
 * Throws on SMTP failure — caller catches and stores emailError.
 */
const sendCsatSurveyEmail = async (to, recipientName, surveyName, surveyLink, emailSubject, expiresAt) => {
  const expiryNote = expiresAt
    ? `<p style="color: #d97706; font-size: 13px;">⏰ This survey closes on <strong>${new Date(expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>.</p>`
    : '';
  const subject = emailSubject || `Survey: ${surveyName}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #059669;">We'd love your feedback</h2>
      <p>Dear <strong>${recipientName}</strong>,</p>
      <p>You have received a satisfaction survey: <strong>${surveyName}</strong>.</p>
      <p style="color: #6b7280; font-size: 13px;">No account required. Takes under 2 minutes.</p>
      ${expiryNote}
      <p style="margin-top: 24px;">
        <a href="${surveyLink}"
           style="background-color: #059669; color: white; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-size: 15px;">
          Start Survey
        </a>
      </p>
      <hr style="margin-top: 32px; border: none; border-top: 1px solid #e5e7eb;" />
      <p style="font-size: 12px; color: #6b7280;">If you did not expect this survey, you may ignore this email.</p>
    </div>
  `;
  const t = getTransporter();
  if (!t) throw new Error('SMTP not configured');
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  await t.sendMail({ from, to, subject, html });
};

/**
 * Send CSAT survey reminder to a non-submitting recipient.
 * Throws on SMTP failure — caller catches and logs.
 */
const sendCsatReminderEmail = async (to, recipientName, surveyName, surveyLink) => {
  const subject = `Reminder: ${surveyName}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #d97706;">Reminder: Your feedback is still pending</h2>
      <p>Dear <strong>${recipientName}</strong>,</p>
      <p>You haven't completed the survey yet: <strong>${surveyName}</strong>.</p>
      <p style="color: #6b7280; font-size: 13px;">It only takes under 2 minutes.</p>
      <p style="margin-top: 24px;">
        <a href="${surveyLink}"
           style="background-color: #d97706; color: white; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-size: 15px;">
          Complete Survey
        </a>
      </p>
      <hr style="margin-top: 32px; border: none; border-top: 1px solid #e5e7eb;" />
      <p style="font-size: 12px; color: #6b7280;">If you did not expect this survey, you may ignore this email.</p>
    </div>
  `;
  const t = getTransporter();
  if (!t) throw new Error('SMTP not configured');
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  await t.sendMail({ from, to, subject, html });
};

// ── CSAT Approval emails ──────────────────────────────────────────────────────

const sendApprovalRequestEmail = async (adminEmail, {
  requesterName, surveyName, orgName, recipientCount,
  dispatchMode, scheduledAt, approvalDeadline, version, approvalLink,
}) => {
  const subject = version > 1
    ? `[Resubmission v${version}] Survey Dispatch Approval: ${surveyName}`
    : `New Survey Dispatch Approval Request: ${surveyName}`;

  const deadlineText = approvalDeadline
    ? `<p><strong>Approval Deadline:</strong> ${new Date(approvalDeadline).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</p>`
    : '';

  const html = `
    <p>Hi,</p>
    <p><strong>${requesterName}</strong> submitted a survey dispatch for your approval.</p>
    <table style="border-collapse:collapse;width:100%;max-width:480px">
      <tr><td style="padding:4px 8px;color:#555">Survey</td><td style="padding:4px 8px"><strong>${surveyName}</strong></td></tr>
      <tr><td style="padding:4px 8px;color:#555">Organisation</td><td style="padding:4px 8px">${orgName || '—'}</td></tr>
      <tr><td style="padding:4px 8px;color:#555">Recipients</td><td style="padding:4px 8px">${recipientCount || '—'}</td></tr>
      <tr><td style="padding:4px 8px;color:#555">Mode</td><td style="padding:4px 8px">${dispatchMode}</td></tr>
      ${scheduledAt ? `<tr><td style="padding:4px 8px;color:#555">Scheduled</td><td style="padding:4px 8px">${new Date(scheduledAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</td></tr>` : ''}
    </table>
    ${deadlineText}
    <p><a href="${approvalLink}" style="display:inline-block;margin-top:12px;padding:10px 20px;background:#059669;color:#fff;text-decoration:none;border-radius:6px">Review Request</a></p>
  `;
  return sendEmail(adminEmail, subject, html);
};

const sendApprovalOutcomeEmail = async (managerEmail, {
  outcome, surveyName, overallFeedback, questionFeedbackCount, approvalLink,
}) => {
  const outcomeText = {
    approved: '✅ Your survey dispatch request has been approved.',
    changes_requested: '🔄 Your survey dispatch request needs changes.',
    rejected: '❌ Your survey dispatch request has been rejected.',
    expired: '⏱ Your survey dispatch request expired without approval.',
  }[outcome] || 'Your approval request was updated.';

  const subject = {
    approved: `Approved: ${surveyName}`,
    changes_requested: `Changes Requested: ${surveyName}`,
    rejected: `Rejected: ${surveyName}`,
    expired: `Expired: ${surveyName}`,
  }[outcome] || `Update: ${surveyName}`;

  const feedbackHtml = overallFeedback
    ? `<p><strong>Admin feedback:</strong> ${overallFeedback}</p>`
    : '';
  const qFeedback = questionFeedbackCount
    ? `<p>${questionFeedbackCount} per-question note(s) provided — view in portal.</p>`
    : '';

  const html = `
    <p>${outcomeText}</p>
    <p><strong>Survey:</strong> ${surveyName}</p>
    ${feedbackHtml}${qFeedback}
    <p><a href="${approvalLink}" style="display:inline-block;margin-top:12px;padding:10px 20px;background:#059669;color:#fff;text-decoration:none;border-radius:6px">View Details</a></p>
  `;
  return sendEmail(managerEmail, subject, html);
};

const sendApprovalEscalationEmail = async (adminEmail, {
  surveyName, requesterName, minutesRemaining, approvalLink,
}) => {
  const subject = `⚠️ Approval Needed in ${minutesRemaining} min: ${surveyName}`;
  const html = `
    <p><strong>⚠️ Urgent:</strong> A survey dispatch approval is about to expire.</p>
    <p><strong>Survey:</strong> ${surveyName}</p>
    <p><strong>Requested by:</strong> ${requesterName || '—'}</p>
    <p><strong>Time remaining:</strong> ${minutesRemaining} minutes</p>
    <p><a href="${approvalLink}" style="display:inline-block;margin-top:12px;padding:10px 20px;background:#dc2626;color:#fff;text-decoration:none;border-radius:6px">Review Now</a></p>
  `;
  return sendEmail(adminEmail, subject, html);
};

// ── Project billing ───────────────────────────────────────────────────────────

/**
 * Escape user-supplied text before it goes into email HTML. Project names,
 * client names and descriptions are free text — without this, markup typed into
 * a project field would render live in Finance's inbox.
 */
const esc = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const fmtDay = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const detailRow = (label, value) => `
  <tr>
    <td style="padding:7px 14px;border-bottom:1px solid #eef2f7;color:#6b7280;font-size:13px;white-space:nowrap">${label}</td>
    <td style="padding:7px 14px;border-bottom:1px solid #eef2f7;color:#111827;font-size:13px"><strong>${value}</strong></td>
  </tr>`;

/**
 * Sent to Finance when a billable project is marked Completed. Carries enough
 * detail to raise the invoice without opening the portal or chasing the PM.
 */
const sendProjectReadyToBillEmail = async (email, name, project, stats, link) => {
  const durationDays =
    project.startDate && project.endDate
      ? Math.max(1, Math.round((new Date(project.endDate) - new Date(project.startDate)) / 86400000))
      : null;

  const subject = `Ready to invoice: ${project.name}${project.clientName ? ` — ${project.clientName}` : ''}`;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#111827">
      <div style="background:#111827;color:#fff;padding:18px 22px;border-radius:10px 10px 0 0">
        <div style="font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#9ca3af">Ready to invoice</div>
        <div style="font-size:20px;font-weight:bold;margin-top:4px">${esc(project.name)}</div>
      </div>

      <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 10px 10px;padding:20px 22px">
        <p style="margin:0 0 16px">Hi ${esc(name)},</p>
        <p style="margin:0 0 18px">
          This project has been marked <strong>Completed</strong> and is flagged <strong>billable</strong>.
          The details below are everything recorded against it.
        </p>

        <table style="width:100%;border-collapse:collapse;border:1px solid #eef2f7;border-radius:8px;margin-bottom:18px">
          ${detailRow('Client', esc(project.clientName) || '—')}
          ${project.clientEmail ? detailRow('Client contact', esc(project.clientEmail)) : ''}
          ${detailRow('Project manager', esc(project.projectManager?.name) || '—')}
          ${project.projectManager?.email ? detailRow('PM contact', esc(project.projectManager.email)) : ''}
          ${project.owner?.name ? detailRow('Project owner', esc(project.owner.name)) : ''}
          ${detailRow('Period', `${fmtDay(project.startDate)} → ${fmtDay(project.endDate)}${durationDays ? ` <span style="color:#6b7280;font-weight:normal">(${durationDays} days)</span>` : ''}`)}
          ${detailRow('Completed on', fmtDay(new Date()))}
          ${detailRow('Milestones delivered', `${stats.milestonesCompleted} of ${stats.milestonesTotal}`)}
          ${detailRow('Tasks completed', `${stats.tasksCompleted} of ${stats.tasksTotal}`)}
          ${detailRow('Team size', String(stats.teamSize))}
        </table>

        ${
          project.description || project.purpose
            ? `<div style="background:#f8fafc;border-left:3px solid #2563eb;padding:12px 16px;border-radius:6px;margin-bottom:18px">
                 <div style="font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#6b7280;margin-bottom:6px">Scope</div>
                 <div style="font-size:13px;color:#374151;white-space:pre-wrap">${esc(project.description || project.purpose).slice(0, 600)}</div>
               </div>`
            : ''
        }

        <p style="margin:0 0 6px">
          <a href="${link}" style="display:inline-block;padding:11px 22px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold">
            Open Billing Register
          </a>
        </p>
        <p style="font-size:12px;color:#6b7280;margin:14px 0 0">
          You will be asked for an invoice number and billing date. Only the Finance team can mark a project billed —
          the project manager cannot. Raising the invoice notifies ${esc(project.projectManager?.name) || 'the project manager'} automatically.
        </p>
      </div>
    </div>
  `;
  return sendEmail(email, subject, html);
};

/** Confirmation to the project manager once Finance has raised the invoice. */
const sendProjectBilledEmail = async (email, name, project) => {
  const subject = `Invoice ${project.invoiceNumber} raised for ${project.name}`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#111827">
      <p>Hi ${esc(name)},</p>
      <p>Finance has invoiced <strong>${esc(project.name)}</strong>${project.clientName ? ` for ${esc(project.clientName)}` : ''}.</p>
      <table style="width:100%;border-collapse:collapse;border:1px solid #eef2f7;margin:14px 0">
        ${detailRow('Invoice number', esc(project.invoiceNumber))}
        ${detailRow('Billed date', fmtDay(project.billedDate))}
        ${detailRow('Billed by', esc(project.billedBy?.name) || 'Finance')}
      </table>
      <p style="font-size:12px;color:#6b7280">No action is needed from you — this is a record for your project.</p>
    </div>
  `;
  return sendEmail(email, subject, html);
};

// ── Login OTP ─────────────────────────────────────────────────────────────────

// NOTE: unlike most templates here, this one THROWS on failure. sendEmail()
// swallows errors and returns null, which for a login code would leave the user
// staring at "code sent" forever. The caller needs to know delivery failed.
const sendLoginOtpEmail = async (email, name, code, ttlMinutes) => {
  const subject = `${code} is your Lakshya Portal sign-in code`;
  const html = `
    <p>Hi ${name},</p>
    <p>Use this code to sign in to the Lakshya Portal:</p>
    <p style="margin:20px 0">
      <span style="display:inline-block;padding:14px 28px;background:#111827;color:#fff;
        font-size:30px;letter-spacing:10px;font-weight:bold;border-radius:8px;font-family:monospace">${code}</span>
    </p>
    <p style="color:#6b7280;font-size:13px">
      This code expires in ${ttlMinutes} minutes and can be used once.
    </p>
    <p style="color:#dc2626;font-size:13px">
      If you did not try to sign in, ignore this email and tell your administrator — do not share this code with anyone.
    </p>
  `;
  const info = await sendEmail(email, subject, html);
  if (!info) throw new Error(`SMTP delivery failed for ${email}`);
  return info;
};

// ── Saturday Rostering emails ─────────────────────────────────────────────────

const rosterStatusBadge = (status) =>
  status === 'working'
    ? '<span style="display:inline-block;padding:6px 16px;background:#059669;color:#fff;border-radius:6px;font-weight:bold">WORKING</span>'
    : '<span style="display:inline-block;padding:6px 16px;background:#6b7280;color:#fff;border-radius:6px;font-weight:bold">OFF</span>';

const rosterMyLink = () =>
  `<p><a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/roster/my"
      style="display:inline-block;margin-top:12px;padding:10px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px">View My Saturdays</a></p>`;

// Sent when a manager publishes the week's roster
const sendRosterPublishedEmail = async (email, name, dateLabel, status) => {
  const subject = `Saturday Roster — ${dateLabel}: You are ${status === 'working' ? 'Working' : 'Off'}`;
  const html = `
    <p>Hi ${name},</p>
    <p>Your roster for <strong>Saturday, ${dateLabel}</strong> has been published:</p>
    <p style="margin:16px 0">${rosterStatusBadge(status)}</p>
    ${status === 'working'
      ? '<p>Please plan to be available for work this Saturday.</p>'
      : '<p>Enjoy your Saturday off!</p>'}
    ${rosterMyLink()}
  `;
  return sendEmail(email, subject, html);
};

// Sent when a published entry is changed as per company work requirement
const sendRosterChangeEmail = async (email, name, dateLabel, oldStatus, newStatus, reason, compOffGranted) => {
  const subject = `Roster Change — ${dateLabel}: You are now ${newStatus === 'working' ? 'Working' : 'Off'}`;
  const html = `
    <p>Hi ${name},</p>
    <p>Your roster for <strong>Saturday, ${dateLabel}</strong> has been <strong>changed</strong> as per company work requirement:</p>
    <p style="margin:16px 0">
      <span style="text-decoration:line-through;color:#9ca3af;margin-right:8px">${oldStatus === 'working' ? 'Working' : 'Off'}</span>
      → ${rosterStatusBadge(newStatus)}
    </p>
    ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
    ${compOffGranted
      ? '<p style="color:#059669"><strong>✓ A compensatory off has been credited to you</strong> for working this Saturday.</p>'
      : ''}
    ${rosterMyLink()}
  `;
  return sendEmail(email, subject, html);
};

// Friday reminder to employees marked Working for tomorrow
const sendRosterReminderEmail = async (email, name, dateLabel) => {
  const subject = `Reminder: You are Working tomorrow (Saturday, ${dateLabel})`;
  const html = `
    <p>Hi ${name},</p>
    <p>This is a reminder that you are rostered <strong>WORKING</strong> tomorrow, <strong>Saturday, ${dateLabel}</strong>.</p>
    <p style="margin:16px 0">${rosterStatusBadge('working')}</p>
    ${rosterMyLink()}
  `;
  return sendEmail(email, subject, html);
};

// Weekly (Wednesday) digest to each employee for the upcoming Saturday
const sendRosterDigestEmail = async (email, name, dateLabel, status) => {
  const subject = `This Saturday (${dateLabel}): You are ${status === 'working' ? 'Working' : 'Off'}`;
  const html = `
    <p>Hi ${name},</p>
    <p>Your status for the upcoming <strong>Saturday, ${dateLabel}</strong>:</p>
    <p style="margin:16px 0">${rosterStatusBadge(status)}</p>
    ${rosterMyLink()}
  `;
  return sendEmail(email, subject, html);
};

// Weekly digest to a manager with their team's Saturday roster
const sendRosterManagerDigestEmail = async (email, name, dateLabel, rows) => {
  const subject = `Team Saturday Roster — ${dateLabel}`;
  const rowsHtml = rows
    .map(
      (r) => `<tr>
        <td style="padding:6px 12px;border:1px solid #e5e7eb">${r.employeeCode || ''}</td>
        <td style="padding:6px 12px;border:1px solid #e5e7eb">${r.name}</td>
        <td style="padding:6px 12px;border:1px solid #e5e7eb;text-align:center">${
          r.status === 'working'
            ? '<span style="color:#059669;font-weight:bold">Working</span>'
            : '<span style="color:#6b7280">Off</span>'
        }</td>
      </tr>`
    )
    .join('');
  const html = `
    <p>Hi ${name},</p>
    <p>Your team's roster for <strong>Saturday, ${dateLabel}</strong>:</p>
    <table style="border-collapse:collapse;margin:12px 0">
      <tr style="background:#1f2937;color:#fff">
        <th style="padding:6px 12px;border:1px solid #e5e7eb">Code</th>
        <th style="padding:6px 12px;border:1px solid #e5e7eb">Employee</th>
        <th style="padding:6px 12px;border:1px solid #e5e7eb">Status</th>
      </tr>
      ${rowsHtml}
    </table>
    <p><a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/roster/board"
        style="display:inline-block;margin-top:12px;padding:10px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px">Open Roster Board</a></p>
  `;
  return sendEmail(email, subject, html);
};

// Swap lifecycle emails — stage: requested | peer_accepted | approved | rejected
const sendRosterSwapEmail = async (email, name, stage, { requesterName, targetName, dateLabel, reason, comment }) => {
  const map = {
    requested: {
      subject: `Saturday Swap Request — ${dateLabel}`,
      body: `<p><strong>${requesterName}</strong> has requested to swap Saturday (${dateLabel}) statuses with you.</p>
             ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
             <p>Please open the portal to accept or ignore this request.</p>`,
    },
    peer_accepted: {
      subject: `Swap Awaiting Your Approval — ${dateLabel}`,
      body: `<p><strong>${requesterName}</strong> and <strong>${targetName}</strong> have agreed to swap their Saturday (${dateLabel}) statuses.</p>
             <p>Please open the portal to approve or reject the swap.</p>`,
    },
    approved: {
      subject: `Swap Approved — ${dateLabel}`,
      body: `<p>The Saturday (${dateLabel}) swap between <strong>${requesterName}</strong> and <strong>${targetName}</strong> has been <strong style="color:#059669">approved</strong>. Your roster has been updated.</p>
             ${comment ? `<p><strong>Comment:</strong> ${comment}</p>` : ''}`,
    },
    rejected: {
      subject: `Swap Rejected — ${dateLabel}`,
      body: `<p>The Saturday (${dateLabel}) swap between <strong>${requesterName}</strong> and <strong>${targetName}</strong> was <strong style="color:#dc2626">rejected</strong>.</p>
             ${comment ? `<p><strong>Comment:</strong> ${comment}</p>` : ''}`,
    },
  };
  const t = map[stage];
  if (!t) return null;
  const html = `<p>Hi ${name},</p>${t.body}${rosterMyLink()}`;
  return sendEmail(email, t.subject, html);
};

module.exports = {
  sendEmail,
  sendCsatSurveyEmail,
  sendCsatReminderEmail,
  sendApprovalRequestEmail,
  sendApprovalOutcomeEmail,
  sendApprovalEscalationEmail,
  sendKpiAssignedEmail,
  sendSubmissionReminderEmail,
  sendReviewCompleteEmail,
  sendEmployeeSubmittedEmail,
  sendManagerReviewedEmail,
  sendCommitmentDeadlineReminderEmail,
  sendSelfReviewDeadlineReminderEmail,
  sendManagerReviewDeadlineReminderEmail,
  sendCycleOpenedEmail,
  sendLoginOtpEmail,
  sendProjectReadyToBillEmail,
  sendProjectBilledEmail,
  sendRosterPublishedEmail,
  sendRosterChangeEmail,
  sendRosterReminderEmail,
  sendRosterDigestEmail,
  sendRosterManagerDigestEmail,
  sendRosterSwapEmail,
};
