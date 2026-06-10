const Project = require('../../models/pm/Project');
const ProjectMember = require('../../models/pm/ProjectMember');
const Milestone = require('../../models/pm/Milestone');
const DailyStatusLog = require('../../models/pm/DailyStatusLog');
const ProjectNotificationRecipient = require('../../models/pm/ProjectNotificationRecipient');
const User = require('../../models/User');
const { sendEmail } = require('../../utils/emailService');

const STATUS_COLORS = {
  on_track: '#059669',
  at_risk: '#d97706',
  delayed: '#dc2626',
  completed: '#1e40af',
};

const STATUS_LABELS = {
  on_track: 'On Track',
  at_risk: 'At Risk',
  delayed: 'Delayed',
  completed: 'Completed',
};

const MILESTONE_STATUS_COLORS = {
  not_started: '#6b7280',
  in_progress: '#2563eb',
  completed: '#059669',
  delayed: '#dc2626',
  on_hold: '#d97706',
  cancelled: '#9ca3af',
};

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function buildMilestoneRows(milestones, today) {
  if (!milestones.length) return '<tr><td colspan="6" style="text-align:center;color:#9ca3af;padding:12px;">No milestones defined</td></tr>';
  return milestones.map(m => {
    const isDelayed = m.endDate && m.endDate < today && m.status !== 'completed';
    const rowBg = isDelayed ? '#fef2f2' : '';
    const color = MILESTONE_STATUS_COLORS[m.status] || '#6b7280';
    const label = m.status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    return `
      <tr style="background:${rowBg};">
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${m.name}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${m.accountableUser ? m.accountableUser.name : '—'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${formatDate(m.startDate)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;${isDelayed ? 'color:#dc2626;font-weight:600;' : ''}">${formatDate(m.endDate)}${isDelayed ? ' ⚠️' : ''}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">
          <span style="background:${color}20;color:${color};padding:2px 8px;border-radius:12px;font-size:12px;font-weight:600;">${label}</span>
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${m.completionPercentage}%</td>
      </tr>`;
  }).join('');
}

function buildEmailHtml(project, milestones, log, today) {
  const overallStatus = log ? log.overallStatus : 'on_track';
  const statusColor = STATUS_COLORS[overallStatus] || '#6b7280';
  const statusLabel = STATUS_LABELS[overallStatus] || overallStatus;

  const total = milestones.length;
  const completed = milestones.filter(m => m.status === 'completed').length;
  const inProgress = milestones.filter(m => m.status === 'in_progress').length;
  const delayed = milestones.filter(m => m.status === 'delayed' || (m.endDate && m.endDate < today && m.status !== 'completed')).length;
  const completionPct = total > 0 ? Math.round((completed / total) * 100) : 0;

  const upcoming = milestones.filter(m => {
    if (!m.endDate || m.status === 'completed') return false;
    const diff = Math.round((new Date(m.endDate) - new Date(today)) / 86400000);
    return diff >= 0 && diff <= 7;
  });

  const upcomingHtml = upcoming.length
    ? upcoming.map(m => `<li><strong>${m.name}</strong> — Due ${formatDate(m.endDate)} (${m.accountableUser ? m.accountableUser.name : 'Unassigned'})</li>`).join('')
    : '<li style="color:#6b7280;">No upcoming milestones in next 7 days</li>';

  const section = (label, content, color = '#1e40af') => content ? `
    <div style="margin-top:20px;">
      <h3 style="color:${color};font-size:14px;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.5px;">${label}</h3>
      <div style="background:#f9fafb;border-left:3px solid ${color};padding:10px 14px;border-radius:0 6px 6px 0;font-size:14px;color:#374151;">${content.replace(/\n/g, '<br>')}</div>
    </div>` : '';

  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#f3f4f6;margin:0;padding:0;">
<div style="max-width:700px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,#1e40af,#3b82f6);padding:24px 28px;color:white;">
    <div style="font-size:11px;opacity:0.8;margin-bottom:4px;">DAILY PROJECT STATUS REPORT</div>
    <h1 style="margin:0;font-size:22px;">${project.name}</h1>
    <div style="margin-top:8px;font-size:13px;opacity:0.9;">${formatDate(today)}</div>
  </div>

  <!-- Status Banner -->
  <div style="background:${statusColor}15;border-left:4px solid ${statusColor};padding:14px 28px;display:flex;align-items:center;gap:12px;">
    <div style="font-size:13px;color:#374151;">Overall Status:</div>
    <span style="background:${statusColor};color:white;padding:4px 14px;border-radius:20px;font-size:13px;font-weight:700;">${statusLabel}</span>
    <div style="margin-left:auto;font-size:13px;color:#6b7280;">Overall Progress: <strong style="color:#111827;">${completionPct}%</strong></div>
  </div>

  <div style="padding:24px 28px;">

    <!-- Stats -->
    <div style="display:flex;gap:12px;margin-bottom:24px;">
      ${[
        ['Total Milestones', total, '#6366f1'],
        ['Completed', completed, '#059669'],
        ['In Progress', inProgress, '#2563eb'],
        ['Delayed', delayed, '#dc2626'],
      ].map(([l, v, c]) => `
        <div style="flex:1;background:${c}10;border:1px solid ${c}30;border-radius:8px;padding:12px;text-align:center;">
          <div style="font-size:24px;font-weight:700;color:${c};">${v}</div>
          <div style="font-size:11px;color:#6b7280;margin-top:2px;">${l}</div>
        </div>`).join('')}
    </div>

    <!-- Milestone Table -->
    <h3 style="color:#1e40af;font-size:14px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 10px;">Milestone Overview</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead>
        <tr style="background:#f1f5f9;">
          <th style="padding:10px 12px;text-align:left;color:#374151;border-bottom:2px solid #e2e8f0;">Milestone</th>
          <th style="padding:10px 12px;text-align:left;color:#374151;border-bottom:2px solid #e2e8f0;">Accountable</th>
          <th style="padding:10px 12px;text-align:left;color:#374151;border-bottom:2px solid #e2e8f0;">Start</th>
          <th style="padding:10px 12px;text-align:left;color:#374151;border-bottom:2px solid #e2e8f0;">Due Date</th>
          <th style="padding:10px 12px;text-align:left;color:#374151;border-bottom:2px solid #e2e8f0;">Status</th>
          <th style="padding:10px 12px;text-align:left;color:#374151;border-bottom:2px solid #e2e8f0;">Progress</th>
        </tr>
      </thead>
      <tbody>${buildMilestoneRows(milestones, today)}</tbody>
    </table>

    ${log ? section('Completed Today', log.completedTasks, '#059669') : ''}
    ${log ? section('Ongoing Tasks', log.ongoingTasks, '#2563eb') : ''}
    ${log ? section('Blockers / Issues', log.blockers, '#dc2626') : ''}
    ${log ? section('Upcoming Work', log.upcomingWork, '#d97706') : ''}

    <!-- Upcoming Milestones -->
    <div style="margin-top:20px;">
      <h3 style="color:#7c3aed;font-size:14px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 8px;">Upcoming Deadlines (Next 7 Days)</h3>
      <ul style="margin:0;padding:0 0 0 18px;font-size:13px;color:#374151;line-height:1.8;">${upcomingHtml}</ul>
    </div>

    ${log && log.notes ? section('Additional Notes', log.notes, '#6b7280') : ''}
  </div>

  <!-- Footer -->
  <div style="background:#f9fafb;padding:16px 28px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;text-align:center;">
    This is an automated daily status report from the PLI Portal — Project Management Module.<br>
    Project Manager: ${project.projectManager ? project.projectManager.name : '—'} &nbsp;|&nbsp; Report Date: ${formatDate(today)}
  </div>
</div>
</body>
</html>`;
}

async function sendDailyReportForProject(project) {
  const today = new Date().toISOString().slice(0, 10);

  const milestones = await Milestone.findAll({
    where: { projectId: project.id },
    include: [{ model: User, as: 'accountableUser', attributes: ['id', 'name'] }],
    order: [['order', 'ASC']],
  });

  // Use today's manual log if exists, otherwise auto-generate
  let log = await DailyStatusLog.findOne({ where: { projectId: project.id, reportDate: today } });
  if (!log) {
    const hasDelayed = milestones.some(m => m.status === 'delayed' || (m.endDate && m.endDate < today && m.status !== 'completed'));
    const hasInProgress = milestones.some(m => m.status === 'in_progress');
    let overallStatus = 'on_track';
    if (hasDelayed) overallStatus = 'delayed';
    else if (!hasInProgress && milestones.length > 0) overallStatus = 'on_track';

    log = await DailyStatusLog.create({
      projectId: project.id,
      reportDate: today,
      overallStatus,
      generatedBy: 'auto',
    });
  }

  const html = buildEmailHtml(project, milestones, log, today);
  const subject = `Daily Project Status — ${project.name} — ${formatDate(today)}`;

  // Collect recipient emails
  const emailSet = new Set();

  // MD and Director users system-wide
  const mdDirectors = await User.findAll({
    where: { role: ['md', 'director'], isActive: true },
    attributes: ['email', 'name'],
  });
  mdDirectors.forEach(u => emailSet.add(u.email));

  // Project manager
  if (project.projectManager && project.projectManager.email) emailSet.add(project.projectManager.email);

  // Project members
  const members = await ProjectMember.findAll({
    where: { projectId: project.id },
    include: [{ model: User, as: 'user', attributes: ['email'] }],
  });
  members.forEach(m => { if (m.user && m.user.email) emailSet.add(m.user.email); });

  // Client
  if (project.notifyClient && project.clientEmail) emailSet.add(project.clientEmail);

  // Manual extra recipients
  const extras = await ProjectNotificationRecipient.findAll({
    where: { projectId: project.id },
    include: [{ model: User, as: 'user', attributes: ['email'] }],
  });
  extras.forEach(r => {
    if (r.user && r.user.email) emailSet.add(r.user.email);
    if (r.externalEmail) emailSet.add(r.externalEmail);
  });

  // Send to all recipients
  const sends = Array.from(emailSet).map(email => sendEmail(email, subject, html));
  await Promise.allSettled(sends);

  console.log(`[PM DailyReport] Sent for "${project.name}" to ${emailSet.size} recipients`);
}

async function runAllDailyReports() {
  console.log('[PM DailyReport] Running daily report job...');
  try {
    const activeProjects = await Project.findAll({
      where: { status: 'active' },
      include: [
        { model: User, as: 'projectManager', attributes: ['id', 'name', 'email'] },
        { model: User, as: 'owner', attributes: ['id', 'name', 'email'] },
      ],
    });

    for (const project of activeProjects) {
      await sendDailyReportForProject(project).catch(err =>
        console.error(`[PM DailyReport] Failed for project ${project.name}:`, err.message)
      );
    }
    console.log(`[PM DailyReport] Completed for ${activeProjects.length} active projects`);
  } catch (err) {
    console.error('[PM DailyReport] Fatal error:', err.message);
  }
}

module.exports = { runAllDailyReports, sendDailyReportForProject };
