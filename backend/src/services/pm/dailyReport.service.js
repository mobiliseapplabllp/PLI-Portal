const { Op } = require('sequelize');
const Project = require('../../models/pm/Project');
const ProjectMember = require('../../models/pm/ProjectMember');
const Milestone = require('../../models/pm/Milestone');
const DailyStatusLog = require('../../models/pm/DailyStatusLog');
const ProjectNotificationRecipient = require('../../models/pm/ProjectNotificationRecipient');
const User = require('../../models/User');
const { sendEmail } = require('../../utils/emailService');
const pmSettingsService = require('./pmSettings.service');

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

async function sendDailyReportForProject(project, { skipCcEmails = false } = {}) {
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
    where: { role: { [Op.in]: ['md', 'director'] }, isActive: true },
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

  // Manual extra recipients (per-project)
  const extras = await ProjectNotificationRecipient.findAll({
    where: { projectId: project.id },
    include: [{ model: User, as: 'user', attributes: ['email'] }],
  });
  extras.forEach(r => {
    if (r.user && r.user.email) emailSet.add(r.user.email);
    if (r.externalEmail) emailSet.add(r.externalEmail);
  });

  // Global CC emails from PM Settings — skipped in consolidated mode (they already got the consolidated email)
  if (!skipCcEmails) {
    try {
      const settings = await pmSettingsService.getSettings();
      const ccEmails = settings.reportCcEmails || [];
      ccEmails.forEach(email => { if (email) emailSet.add(email); });
    } catch (e) {
      console.warn('[PM DailyReport] Could not load CC emails from settings:', e.message);
    }
  }

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

// ─────────────────────────────────────────────────────────────────────────────
// CONSOLIDATED REPORT
// ─────────────────────────────────────────────────────────────────────────────

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function statusPill(status) {
  const map = {
    on_track:    { bg: '#ECFDF5', color: '#065F46', dot: '#059669', label: 'On Track' },
    at_risk:     { bg: '#FFFBEB', color: '#92400E', dot: '#D97706', label: 'At Risk' },
    delayed:     { bg: '#FEF2F2', color: '#991B1B', dot: '#DC2626', label: 'Delayed' },
    completed:   { bg: '#EFF6FF', color: '#1E40AF', dot: '#2563EB', label: 'Completed' },
    not_started: { bg: '#F8FAFC', color: '#475569', dot: '#94A3B8', label: 'Not Started' },
    in_progress: { bg: '#EFF6FF', color: '#1D4ED8', dot: '#2563EB', label: 'In Progress' },
    on_hold:     { bg: '#F8FAFC', color: '#475569', dot: '#94A3B8', label: 'On Hold' },
    cancelled:   { bg: '#F8FAFC', color: '#9CA3AF', dot: '#D1D5DB', label: 'Cancelled' },
  };
  const s = map[status] || map.not_started;
  return `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 9px;border-radius:20px;font-size:11px;font-weight:700;background:${s.bg};color:${s.color};">
    <span style="width:5px;height:5px;border-radius:50%;background:${s.dot};display:inline-block;"></span>${s.label}</span>`;
}

function progressBar(pct, color) {
  const c = color || '#059669';
  const barWidth = Math.min(100, Math.max(0, pct));
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;min-width:70px;">
    <tr>
      <td style="width:80%;vertical-align:middle;padding-right:6px;">
        <table cellpadding="0" cellspacing="0" border="0" style="width:100%;height:5px;border-radius:10px;background-color:#E2E8F0;">
          <tr>
            <td bgcolor="${c}" width="${barWidth}%" style="background-color:${c};height:5px;border-radius:10px;font-size:0;line-height:0;"${barWidth > 0 ? '' : ' style="display:none"'}></td>
            <td></td>
          </tr>
        </table>
      </td>
      <td style="width:20%;text-align:right;font-size:11px;font-weight:700;color:#475569;white-space:nowrap;">${pct}%</td>
    </tr>
  </table>`;
}

function milestoneStatusColor(status) {
  const map = { completed:'#059669', in_progress:'#2563EB', delayed:'#DC2626', on_hold:'#D97706', not_started:'#94A3B8', cancelled:'#D1D5DB' };
  return map[status] || '#94A3B8';
}

function buildProjectBlock(project, milestones, log, today, index, total) {
  const overallStatus = log ? log.overallStatus : 'on_track';
  const statusBarColor = { on_track:'#059669', at_risk:'#D97706', delayed:'#DC2626', completed:'#2563EB', on_hold:'#94A3B8' }[overallStatus] || '#94A3B8';
  const completedCount = milestones.filter(m => m.status === 'completed').length;
  const delayedCount   = milestones.filter(m => m.status === 'delayed' || (m.endDate && m.endDate < today && m.status !== 'completed')).length;
  const pct = milestones.length ? Math.round((milestones.filter(m => m.status === 'completed').length / milestones.length) * 100) : 0;
  const pctColor = overallStatus === 'delayed' ? '#DC2626' : overallStatus === 'at_risk' ? '#D97706' : '#059669';

  const milestoneRows = milestones.length ? milestones.map((m, i) => {
    const isOverdue = m.endDate && m.endDate < today && m.status !== 'completed';
    const rowBg = i % 2 === 1 ? '#FAFCFF' : '#FFFFFF';
    const mColor = milestoneStatusColor(m.status);
    return `<tr style="background:${rowBg};">
      <td style="padding:9px 12px;border-bottom:1px solid #F1F5F9;font-size:12.5px;font-weight:600;color:${isOverdue ? '#DC2626' : '#0F172A'};">
        ${m.name}${isOverdue ? `<span style="display:inline-flex;align-items:center;gap:2px;background:#FEF2F2;color:#DC2626;font-size:9px;font-weight:700;padding:1px 5px;border-radius:4px;margin-left:6px;">⚠ Overdue</span>` : ''}
      </td>
      <td style="padding:9px 12px;border-bottom:1px solid #F1F5F9;font-size:12px;color:#475569;">${m.accountableUser ? m.accountableUser.name : '—'}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #F1F5F9;font-size:12px;color:#64748B;">${fmtDate(m.startDate)}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #F1F5F9;font-size:12px;${isOverdue ? 'color:#DC2626;font-weight:700;' : 'color:#64748B;'}">${fmtDate(m.endDate)}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #F1F5F9;">${statusPill(m.status)}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #F1F5F9;">${progressBar(m.completionPercentage || 0, mColor)}</td>
    </tr>`;
  }).join('') : `<tr><td colspan="6" style="padding:14px;text-align:center;color:#94A3B8;font-size:12px;">No milestones defined</td></tr>`;

  // Build log cards as a 2-col table (email-safe: no grid/flex)
  const logCards = log ? (() => {
    const cards = [
      log.completedTasks ? { bg: '#F0FDF4', border: '#059669', label: '&#10003; Completed Today', text: log.completedTasks } : null,
      log.ongoingTasks   ? { bg: '#EFF6FF', border: '#2563EB', label: '&#9679; Ongoing Tasks',   text: log.ongoingTasks   } : null,
      log.blockers       ? { bg: '#FEF2F2', border: '#DC2626', label: '&#9679; Blockers / Issues',text: log.blockers       } : null,
      log.upcomingWork   ? { bg: '#FFFBEB', border: '#D97706', label: '&#9679; Upcoming Work',    text: log.upcomingWork   } : null,
    ].filter(Boolean);
    if (!cards.length) return '';
    // Group into pairs for a 2-column layout
    const rows = [];
    for (let i = 0; i < cards.length; i += 2) {
      const left  = cards[i];
      const right = cards[i + 1];
      rows.push(`
        <tr>
          <td width="50%" valign="top" style="padding:5px 5px 5px 0;">
            <div style="background-color:${left.bg};border-left:3px solid ${left.border};border-radius:0 8px 8px 0;padding:11px 13px;">
              <div style="font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:${left.border};margin-bottom:5px;">${left.label}</div>
              <div style="font-size:12px;color:#475569;line-height:1.5;">${left.text.replace(/\n/g,'<br>')}</div>
            </div>
          </td>
          ${right ? `<td width="50%" valign="top" style="padding:5px 0 5px 5px;">
            <div style="background-color:${right.bg};border-left:3px solid ${right.border};border-radius:0 8px 8px 0;padding:11px 13px;">
              <div style="font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:${right.border};margin-bottom:5px;">${right.label}</div>
              <div style="font-size:12px;color:#475569;line-height:1.5;">${right.text.replace(/\n/g,'<br>')}</div>
            </div>
          </td>` : '<td width="50%"></td>'}
        </tr>`);
    }
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px;">${rows.join('')}</table>`;
  })() : `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:10px;">
      <tr>
        <td bgcolor="#FFFBEB" style="background-color:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:10px 13px;">
          <span style="font-size:12px;color:#92400E;"><strong>Auto-generated status</strong> &mdash; No manual log submitted today. Status derived from milestone data.</span>
        </td>
      </tr>
    </table>`;

  const logSection = logCards;

  const isOnHold = project.status === 'on_hold';

  return `
  <!-- PROJECT ${index} -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:2px;border-left:4px solid ${statusBarColor};">

    <!-- Project Header -->
    <tr>
      <td bgcolor="#FFFFFF" style="background-color:#FFFFFF;padding:20px 30px 16px;border-bottom:1px solid #F1F5F9;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td valign="top" width="75%">
              <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#94A3B8;margin-bottom:4px;">Project ${index} of ${total} &nbsp;&middot;&nbsp; ${isOnHold ? '<span style="color:#D97706;">On Hold</span>' : 'Active'}</div>
              <div style="font-size:17px;font-weight:700;color:${isOnHold ? '#64748B' : '#0F172A'};margin-bottom:6px;">${project.name}</div>
              <div style="font-size:12px;color:#64748B;">
                &#128100; ${project.projectManager ? project.projectManager.name : '&mdash;'}
                ${project.startDate ? ` &nbsp;&middot;&nbsp; &#128197; ${fmtDate(project.startDate)}` : ''}
                ${project.endDate ? ` &nbsp;&middot;&nbsp; &#127937; ${fmtDate(project.endDate)}` : ''}
                &nbsp;&nbsp;${statusPill(overallStatus)}
              </div>
            </td>
            <td valign="top" align="right" width="25%">
              <div style="font-size:28px;font-weight:800;letter-spacing:-1px;line-height:1;color:${pctColor};">${pct}%</div>
              <div style="font-size:10px;color:#94A3B8;text-transform:uppercase;letter-spacing:0.5px;margin-top:2px;">Progress</div>
              <div style="margin-top:6px;font-size:11px;color:#64748B;">${completedCount}/${milestones.length} done${delayedCount ? ` &nbsp;&middot;&nbsp; <span style="color:#DC2626;font-weight:700;">${delayedCount} delayed</span>` : ''}</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Milestones -->
    <tr>
      <td bgcolor="#FFFFFF" style="background-color:#FFFFFF;padding:18px 30px;border-bottom:1px solid #F1F5F9;">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:#94A3B8;margin-bottom:12px;">Milestones</div>
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
          <thead>
            <tr bgcolor="#F8FAFC" style="background-color:#F8FAFC;">
              <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#94A3B8;border-bottom:2px solid #E2E8F0;">Milestone</th>
              <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#94A3B8;border-bottom:2px solid #E2E8F0;">Accountable</th>
              <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#94A3B8;border-bottom:2px solid #E2E8F0;">Start</th>
              <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#94A3B8;border-bottom:2px solid #E2E8F0;">Due Date</th>
              <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#94A3B8;border-bottom:2px solid #E2E8F0;">Status</th>
              <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#94A3B8;border-bottom:2px solid #E2E8F0;">Progress</th>
            </tr>
          </thead>
          <tbody>${milestoneRows}</tbody>
        </table>
      </td>
    </tr>

    <!-- Daily Log -->
    <tr>
      <td bgcolor="#FFFFFF" style="background-color:#FFFFFF;padding:16px 30px 20px;">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:#94A3B8;margin-bottom:4px;">Today's Status Log</div>
        ${isOnHold
          ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px;">
              <tr>
                <td bgcolor="#F8FAFC" style="background-color:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:10px 13px;">
                  <span style="font-size:12px;color:#64748B;">Project is <strong>On Hold</strong>. No activity expected until resumed.</span>
                </td>
              </tr>
            </table>`
          : logSection
        }
      </td>
    </tr>

  </table>`;
}

async function buildConsolidatedEmailHtml(projects, recipientLabel) {
  const today = new Date().toISOString().slice(0, 10);
  const reportDate = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  const reportTime = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });

  // Fetch milestones and logs for all projects
  const projectData = await Promise.all(projects.map(async project => {
    const milestones = await Milestone.findAll({
      where: { projectId: project.id },
      include: [{ model: User, as: 'accountableUser', attributes: ['id', 'name'] }],
      order: [['order', 'ASC']],
    });
    let log = await DailyStatusLog.findOne({ where: { projectId: project.id, reportDate: today } });
    if (!log) {
      const hasDelayed = milestones.some(m => m.status === 'delayed' || (m.endDate && m.endDate < today && m.status !== 'completed'));
      const overallStatus = hasDelayed ? 'delayed' : 'on_track';
      log = { overallStatus, completedTasks: null, ongoingTasks: null, blockers: null, upcomingWork: null };
    }
    return { project, milestones, log };
  }));

  // Portfolio summary stats
  const totalProjects   = projectData.length;
  const totalMilestones = projectData.reduce((s, d) => s + d.milestones.length, 0);
  const totalOverdue    = projectData.reduce((s, d) => s + d.milestones.filter(m => m.endDate && m.endDate < today && m.status !== 'completed').length, 0);
  const avgProgress     = totalMilestones
    ? Math.round(projectData.reduce((s, d) => s + d.milestones.reduce((ms, m) => ms + (m.completionPercentage || 0), 0), 0) / totalMilestones)
    : 0;

  const onTrack  = projectData.filter(d => d.log.overallStatus === 'on_track').length;
  const atRisk   = projectData.filter(d => d.log.overallStatus === 'at_risk').length;
  const delayed  = projectData.filter(d => d.log.overallStatus === 'delayed').length;
  const onHold   = projectData.filter(d => d.project.status === 'on_hold').length;

  // Upcoming deadlines (next 7 days, all projects combined)
  const upcoming = [];
  projectData.forEach(({ project, milestones }) => {
    milestones.forEach(m => {
      if (!m.endDate || m.status === 'completed') return;
      const diff = Math.round((new Date(m.endDate) - new Date(today)) / 86400000);
      if (diff >= 0 && diff <= 7) upcoming.push({ ...m.dataValues, projectName: project.name, diff });
    });
  });
  upcoming.sort((a, b) => a.diff - b.diff);

  const upcomingRows = upcoming.length ? upcoming.map(m => {
    const urgency = m.diff <= 2 ? { color:'#DC2626', dot:'#FEF2F2', label:`${m.diff} day${m.diff === 1 ? '' : 's'} left` }
                  : m.diff <= 4 ? { color:'#D97706', dot:'#FFFBEB', label:`${m.diff} days left` }
                  :               { color:'#059669', dot:'#ECFDF5', label:`${m.diff} days left` };
    return `<tr>
      <td style="padding:10px 12px;border-bottom:1px solid #F1F5F9;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td valign="middle" style="padding-right:8px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td bgcolor="${urgency.dot}" width="9" height="9" style="background-color:${urgency.dot};border:2px solid ${urgency.color};border-radius:50%;width:9px;height:9px;font-size:0;line-height:0;">&nbsp;</td>
                </tr>
              </table>
            </td>
            <td valign="middle">
              <div style="font-size:13px;font-weight:600;color:#0F172A;">${m.name}</div>
              <div style="font-size:11px;color:#94A3B8;margin-top:1px;">${m.projectName}${m.accountableUser ? ' &nbsp;&middot;&nbsp; ' + m.accountableUser.name : ''}</div>
            </td>
          </tr>
        </table>
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #F1F5F9;font-size:12px;font-weight:700;color:#475569;text-align:right;">${fmtDate(m.endDate)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #F1F5F9;text-align:right;">
        <span style="font-size:11px;font-weight:700;color:${urgency.color};">${urgency.label}</span>
      </td>
    </tr>`;
  }).join('') : `<tr><td colspan="3" style="padding:14px;text-align:center;color:#94A3B8;font-size:12px;">No upcoming deadlines in the next 7 days</td></tr>`;

  // Portfolio table rows
  const portfolioRows = projectData.map(({ project, milestones, log }, i) => {
    const pct = milestones.length ? Math.round(milestones.filter(m => m.status === 'completed').length / milestones.length * 100) : 0;
    const del = milestones.filter(m => m.endDate && m.endDate < today && m.status !== 'completed').length;
    const done = milestones.filter(m => m.status === 'completed').length;
    const pctColor = log.overallStatus === 'delayed' ? '#DC2626' : log.overallStatus === 'at_risk' ? '#D97706' : '#059669';
    return `<tr bgcolor="${i % 2 === 1 ? '#FAFCFF' : '#FFFFFF'}" style="background-color:${i % 2 === 1 ? '#FAFCFF' : '#FFFFFF'};">
      <td style="padding:11px 14px;border-bottom:1px solid #F1F5F9;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td valign="middle" style="padding-right:9px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td bgcolor="#F1F5F9" width="24" height="24" style="background-color:#F1F5F9;border-radius:6px;text-align:center;vertical-align:middle;width:24px;height:24px;">
                    <span style="font-size:11px;font-weight:700;color:#475569;">${String(i + 1).padStart(2,'0')}</span>
                  </td>
                </tr>
              </table>
            </td>
            <td valign="middle">
              <div style="font-size:13px;font-weight:600;color:#0F172A;">${project.name}</div>
              <div style="font-size:11px;color:#94A3B8;">${project.status === 'on_hold' ? 'On Hold' : 'Active'}</div>
            </td>
          </tr>
        </table>
      </td>
      <td style="padding:11px 14px;border-bottom:1px solid #F1F5F9;">${statusPill(log.overallStatus)}</td>
      <td style="padding:11px 14px;border-bottom:1px solid #F1F5F9;font-size:12px;color:#475569;">${milestones.length} total &nbsp;·&nbsp; <span style="color:#059669;font-weight:700;">${done} done</span>${del ? ` &nbsp;·&nbsp; <span style="color:#DC2626;font-weight:700;">${del} delayed</span>` : ''}</td>
      <td style="padding:11px 14px;border-bottom:1px solid #F1F5F9;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;min-width:70px;">
          <tr>
            <td style="vertical-align:middle;padding-right:6px;">
              <table cellpadding="0" cellspacing="0" border="0" style="width:100%;height:5px;background-color:#E2E8F0;border-radius:10px;">
                <tr>
                  <td bgcolor="${pctColor}" width="${pct}%" style="background-color:${pctColor};height:5px;border-radius:10px;font-size:0;"></td>
                  <td></td>
                </tr>
              </table>
            </td>
            <td style="white-space:nowrap;font-size:11px;font-weight:700;color:${pctColor};text-align:right;">${pct}%</td>
          </tr>
        </table>
      </td>
      <td style="padding:11px 14px;border-bottom:1px solid #F1F5F9;font-size:12px;color:#475569;">${project.projectManager ? project.projectManager.name : '—'}</td>
    </tr>`;
  }).join('');

  const projectBlocks = projectData.map(({ project, milestones, log }, i) =>
    buildProjectBlock(project, milestones, log, today, i + 1, totalProjects)
  ).join('<div style="height:2px;background:#E8EDF4;"></div>');

  // ── Email-safe stat cards (table-based, no flex) ──
  const statCards = [
    ['Total Projects', totalProjects, '#1E3A5F'],
    ['Milestones', totalMilestones, '#059669'],
    ['Overdue', totalOverdue, '#DC2626'],
    ['Avg Progress', avgProgress + '%', '#2563EB'],
  ];

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px 8px;background-color:#E8EDF4;font-family:'Segoe UI',-apple-system,BlinkMacSystemFont,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#E8EDF4;">
<tr><td align="center" style="padding:0;">
<table role="presentation" width="680" cellpadding="0" cellspacing="0" border="0" style="max-width:680px;width:100%;">

  <!-- ═══ HEADER ═══ -->
  <tr>
    <td bgcolor="#0F1B2D" style="background-color:#0F1B2D;border-radius:12px 12px 0 0;padding:28px 32px 24px;">

      <!-- Brand row -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
        <tr>
          <!-- Logo + name -->
          <td valign="top" width="60%">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td valign="middle" style="padding-right:12px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td bgcolor="#059669" width="40" height="40"
                          style="background-color:#059669;border-radius:10px;text-align:center;vertical-align:middle;width:40px;height:40px;">
                        <span style="font-size:15px;font-weight:800;color:#ffffff;line-height:40px;display:block;">PL</span>
                      </td>
                    </tr>
                  </table>
                </td>
                <td valign="middle">
                  <div style="color:#ffffff;font-size:15px;font-weight:700;margin:0;">PLI Portal</div>
                  <div style="color:#7EA8C9;font-size:10px;text-transform:uppercase;letter-spacing:0.8px;margin-top:2px;">Project Management</div>
                </td>
              </tr>
            </table>
          </td>
          <!-- Date info -->
          <td valign="top" align="right" width="40%">
            <div style="color:#7EA8C9;font-size:9.5px;text-transform:uppercase;letter-spacing:1px;margin-bottom:3px;">Report Date</div>
            <div style="color:#ffffff;font-size:12.5px;font-weight:600;">${reportDate}</div>
            <div style="color:#7EA8C9;font-size:9.5px;text-transform:uppercase;letter-spacing:1px;margin-top:5px;margin-bottom:2px;">Sent At</div>
            <div style="color:#ffffff;font-size:12.5px;font-weight:600;">${reportTime} IST</div>
          </td>
        </tr>
      </table>

      <!-- Title -->
      <div style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.3px;margin-bottom:6px;">Daily Project Status Report</div>
      <div style="color:#9BBDD6;font-size:12px;margin-bottom:18px;">Consolidated portfolio overview &nbsp;&middot;&nbsp; ${recipientLabel}</div>

      <!-- Status chips — inline-block works in all clients -->
      <div>
        ${onTrack ? `<span style="display:inline-block;background-color:#1E3A5F;border:1px solid #2D5A8F;border-radius:20px;padding:4px 12px;font-size:11px;color:#D0E8F5;margin:3px 4px 3px 0;">&#9679;&nbsp;${onTrack} On Track</span>` : ''}
        ${atRisk  ? `<span style="display:inline-block;background-color:#3D2A0A;border:1px solid #7A5B1E;border-radius:20px;padding:4px 12px;font-size:11px;color:#F5D98A;margin:3px 4px 3px 0;">&#9679;&nbsp;${atRisk} At Risk</span>` : ''}
        ${delayed ? `<span style="display:inline-block;background-color:#3D0A0A;border:1px solid #8F2D2D;border-radius:20px;padding:4px 12px;font-size:11px;color:#F5B0B0;margin:3px 4px 3px 0;">&#9679;&nbsp;${delayed} Delayed</span>` : ''}
        ${onHold  ? `<span style="display:inline-block;background-color:#1A2233;border:1px solid #3A4A63;border-radius:20px;padding:4px 12px;font-size:11px;color:#94A3B8;margin:3px 4px 3px 0;">&#9679;&nbsp;${onHold} On Hold</span>` : ''}
      </div>
    </td>
  </tr>

  <!-- ═══ PORTFOLIO SUMMARY STATS ═══ -->
  <tr>
    <td bgcolor="#ffffff" style="background-color:#ffffff;border-left:1px solid #E2E8F0;border-right:1px solid #E2E8F0;padding:24px 32px;">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:#94A3B8;margin-bottom:14px;">Portfolio Overview</div>
      <!-- Stat cards via table -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
        <tr>
          ${statCards.map(([l, v, c]) => `
          <td width="25%" style="padding:0 5px 0 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td bgcolor="#F8FAFC" style="background-color:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:14px 10px;text-align:center;">
                  <div style="font-size:26px;font-weight:800;color:${c};letter-spacing:-1px;line-height:1;">${v}</div>
                  <div style="font-size:10px;color:#64748B;font-weight:500;text-transform:uppercase;letter-spacing:0.4px;margin-top:4px;">${l}</div>
                </td>
              </tr>
            </table>
          </td>`).join('')}
        </tr>
      </table>
      <!-- Portfolio Table -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        <thead><tr bgcolor="#F8FAFC" style="background-color:#F8FAFC;">
          <th style="padding:9px 14px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#94A3B8;border-bottom:2px solid #E2E8F0;">Project</th>
          <th style="padding:9px 14px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#94A3B8;border-bottom:2px solid #E2E8F0;">Status</th>
          <th style="padding:9px 14px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#94A3B8;border-bottom:2px solid #E2E8F0;">Milestones</th>
          <th style="padding:9px 14px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#94A3B8;border-bottom:2px solid #E2E8F0;">Progress</th>
          <th style="padding:9px 14px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#94A3B8;border-bottom:2px solid #E2E8F0;">Manager</th>
        </tr></thead>
        <tbody>${portfolioRows}</tbody>
      </table>
    </td>
  </tr>

  <!-- ═══ PROJECT SECTIONS ═══ -->
  <tr>
    <td style="border-left:1px solid #E2E8F0;border-right:1px solid #E2E8F0;padding-top:2px;">
      ${projectBlocks}
    </td>
  </tr>

  <!-- ═══ UPCOMING DEADLINES ═══ -->
  <tr>
    <td bgcolor="#ffffff" style="background-color:#ffffff;border-left:1px solid #E2E8F0;border-right:1px solid #E2E8F0;padding:22px 32px;padding-top:24px;">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:#94A3B8;margin-bottom:14px;">Upcoming Deadlines &mdash; All Projects (Next 7 Days)</div>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        <tbody>${upcomingRows}</tbody>
      </table>
    </td>
  </tr>

  <!-- ═══ FOOTER ═══ -->
  <tr>
    <td bgcolor="#0F1B2D" style="background-color:#0F1B2D;border-radius:0 0 12px 12px;padding:18px 32px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td valign="middle" width="60%">
            <div style="font-size:12px;font-weight:700;color:#9BBDD6;margin-bottom:3px;">PLI Portal &mdash; Project Management</div>
            <div style="font-size:11px;color:#4A6A87;line-height:1.6;">This is an automated consolidated daily report.<br>Manage settings: Admin &rarr; Project Management &rarr; PM Settings</div>
          </td>
          <td valign="middle" width="40%" align="right">
            <div style="font-size:11px;color:#4A6A87;line-height:1.6;text-align:right;">Generated: ${reportDate}<br>Recipient: ${recipientLabel}</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

async function runConsolidatedDailyReport() {
  console.log('[PM DailyReport] Running CONSOLIDATED report job...');
  try {
    const settings = await pmSettingsService.getSettings();

    // Fetch all active + on_hold projects
    const projects = await Project.findAll({
      where: { status: ['active', 'on_hold'] },
      include: [
        { model: User, as: 'projectManager', attributes: ['id', 'name', 'email'] },
        { model: User, as: 'owner', attributes: ['id', 'name', 'email'] },
      ],
    });

    if (!projects.length) {
      console.log('[PM DailyReport] No active/on-hold projects — skipping');
      return;
    }

    const today = new Date().toISOString().slice(0, 10);

    // ── GROUP A: MD + Director + CC emails → ALL projects ──
    // Normalise all to lowercase to prevent case-mismatch duplicates
    const groupAEmails = new Set((settings.reportCcEmails || []).map(e => e.toLowerCase()));
    const mdDirectors = await User.findAll({
      where: { role: ['md', 'director'], isActive: true },
      attributes: ['email'],
    });
    mdDirectors.forEach(u => { if (u.email) groupAEmails.add(u.email.toLowerCase()); });

    if (groupAEmails.size > 0) {
      const html = await buildConsolidatedEmailHtml(projects, 'MD / Director / Management');
      const subject = `Daily Project Status Report — All Projects — ${fmtDate(today)}`;
      await Promise.allSettled(Array.from(groupAEmails).map(email => sendEmail(email, subject, html)));
      console.log(`[PM DailyReport] Consolidated (all projects) sent to ${groupAEmails.size} recipients`);
    }

    // ── GROUP B: Per project manager → only THEIR projects ──
    const managerMap = new Map(); // managerId → { manager, projects[] }
    for (const project of projects) {
      if (!project.projectManager) continue;
      const mgr = project.projectManager;
      const key = String(mgr.id);
      if (!managerMap.has(key)) managerMap.set(key, { manager: mgr, projects: [] });
      managerMap.get(key).projects.push(project);
    }

    for (const [, { manager, projects: mgrProjects }] of managerMap) {
      if (!manager.email) continue;
      // Skip if already in Group A
      if (groupAEmails.has((manager.email || '').toLowerCase())) continue;
      const html = await buildConsolidatedEmailHtml(mgrProjects, `Project Manager — ${manager.name}`);
      const subject = `Daily Project Status Report — Your Projects — ${fmtDate(today)}`;
      await sendEmail(manager.email, subject, html).catch(e =>
        console.error(`[PM DailyReport] Failed for manager ${manager.name}:`, e.message)
      );
      console.log(`[PM DailyReport] Consolidated (own projects) sent to ${manager.name} (${mgrProjects.length} projects)`);
    }

    // ── CLIENT emails → separate per-project, but skip CC emails (they already got consolidated) ──
    for (const project of projects) {
      if (project.notifyClient && project.clientEmail) {
        await sendDailyReportForProject(project, { skipCcEmails: true }).catch(e =>
          console.error(`[PM DailyReport] Client email failed for ${project.name}:`, e.message)
        );
      }
    }

    console.log('[PM DailyReport] Consolidated job completed');
  } catch (err) {
    console.error('[PM DailyReport] Fatal error in consolidated job:', err.message);
  }
}

module.exports = { runAllDailyReports, sendDailyReportForProject, runConsolidatedDailyReport };
