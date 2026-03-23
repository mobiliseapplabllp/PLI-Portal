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

module.exports = {
  sendEmail,
  sendKpiAssignedEmail,
  sendSubmissionReminderEmail,
  sendReviewCompleteEmail,
  sendEmployeeSubmittedEmail,
  sendManagerReviewedEmail,
};
