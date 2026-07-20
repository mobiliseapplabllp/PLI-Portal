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

    const from = process.env.SMTP_FROM || process.env.SMTP_USER;
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
      <p>Your KPIs for <strong>${month} ${year}</strong> have been assigned. Please log in to the PLI Portal to view your KPIs and submit your self-assessment.</p>
      <p style="margin-top: 24px;">
        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/employee/my-kpis"
           style="background-color: #1e40af; color: white; padding: 10px 24px; text-decoration: none; border-radius: 6px;">
          View My KPIs
        </a>
      </p>
      <hr style="margin-top: 32px; border: none; border-top: 1px solid #e5e7eb;" />
      <p style="font-size: 12px; color: #6b7280;">This is an automated notification from the PLI Portal.</p>
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
      <p>This is a reminder to submit your self-assessment for <strong>${month} ${year}</strong>. Please log in to the PLI Portal and complete your submission at your earliest convenience.</p>
      <p style="margin-top: 24px;">
        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/employee/my-kpis"
           style="background-color: #d97706; color: white; padding: 10px 24px; text-decoration: none; border-radius: 6px;">
          Submit Now
        </a>
      </p>
      <hr style="margin-top: 32px; border: none; border-top: 1px solid #e5e7eb;" />
      <p style="font-size: 12px; color: #6b7280;">This is an automated notification from the PLI Portal.</p>
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
      <p>Please log in to the PLI Portal to view the details.</p>
      <p style="margin-top: 24px;">
        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/employee/my-kpis"
           style="background-color: #059669; color: white; padding: 10px 24px; text-decoration: none; border-radius: 6px;">
          View Details
        </a>
      </p>
      <hr style="margin-top: 32px; border: none; border-top: 1px solid #e5e7eb;" />
      <p style="font-size: 12px; color: #6b7280;">This is an automated notification from the PLI Portal.</p>
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
      <p><strong>${employeeName}</strong> has submitted their self-assessment for <strong>${month} ${year}</strong>. Please log in to the PLI Portal to review.</p>
      <p style="margin-top: 24px;">
        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/manager/team-overview"
           style="background-color: #7c3aed; color: white; padding: 10px 24px; text-decoration: none; border-radius: 6px;">
          Review Now
        </a>
      </p>
      <hr style="margin-top: 32px; border: none; border-top: 1px solid #e5e7eb;" />
      <p style="font-size: 12px; color: #6b7280;">This is an automated notification from the PLI Portal.</p>
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
      <p>A manager review has been completed for <strong>${month} ${year}</strong>. Please log in to the PLI Portal to perform the final review.</p>
      <p style="margin-top: 24px;">
        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/admin/overview"
           style="background-color: #7c3aed; color: white; padding: 10px 24px; text-decoration: none; border-radius: 6px;">
          View Overview
        </a>
      </p>
      <hr style="margin-top: 32px; border: none; border-top: 1px solid #e5e7eb;" />
      <p style="font-size: 12px; color: #6b7280;">This is an automated notification from the PLI Portal.</p>
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
      <p>Please log in to the PLI Portal and submit your KPI commitment before the deadline.</p>
      <p style="margin-top: 24px;">
        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/employee/my-kpis"
           style="background-color: ${urgency}; color: white; padding: 10px 24px; text-decoration: none; border-radius: 6px;">
          Submit Commitment Now
        </a>
      </p>
      <hr style="margin-top: 32px; border: none; border-top: 1px solid #e5e7eb;" />
      <p style="font-size: 12px; color: #6b7280;">This is an automated reminder from the PLI Portal.</p>
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
      <p>Please log in to the PLI Portal and submit your achievement self-review before the deadline.</p>
      <p style="margin-top: 24px;">
        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/employee/my-kpis"
           style="background-color: ${urgency}; color: white; padding: 10px 24px; text-decoration: none; border-radius: 6px;">
          Submit Self-Review Now
        </a>
      </p>
      <hr style="margin-top: 32px; border: none; border-top: 1px solid #e5e7eb;" />
      <p style="font-size: 12px; color: #6b7280;">This is an automated reminder from the PLI Portal.</p>
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
      <p>Please log in to the PLI Portal and complete your team's KPI review before the deadline.</p>
      <p style="margin-top: 24px;">
        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/manager/team-overview"
           style="background-color: ${urgency}; color: white; padding: 10px 24px; text-decoration: none; border-radius: 6px;">
          Review Team KPIs Now
        </a>
      </p>
      <hr style="margin-top: 32px; border: none; border-top: 1px solid #e5e7eb;" />
      <p style="font-size: 12px; color: #6b7280;">This is an automated reminder from the PLI Portal.</p>
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
      <p>The KPI appraisal cycle for <strong>${month} ${year}</strong> is now open. Please log in to the PLI Portal to view and submit your KPI commitments.</p>
      ${deadlineNote}
      <p style="color: #6b7280; font-style: italic;">If you have already submitted your commitments, please ignore this notification.</p>
      <p style="margin-top: 24px;">
        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/employee/my-kpis"
           style="background-color: #059669; color: white; padding: 10px 24px; text-decoration: none; border-radius: 6px;">
          View My KPIs
        </a>
      </p>
      <hr style="margin-top: 32px; border: none; border-top: 1px solid #e5e7eb;" />
      <p style="font-size: 12px; color: #6b7280;">This is an automated notification from the PLI Portal.</p>
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
};
