/**
 * Helpdesk SLA escalation job — hourly at :15 (Asia/Kolkata).
 *
 * 1. BREACH MARKING (always on). An OPEN ticket (status not resolved/closed) is
 *    breached when
 *      (a) it has a due date and the due date has passed, or
 *      (b) it has no due date and has not been updated for 48 hours.
 *    Every breached open ticket gets sla_breached = 1 (+ sla_breach_at = the
 *    breach moment if unset) so the helpdesk dashboards count it.
 *
 * 2. ESCALATION (only when HD_ESCALATION_ENABLED=true). A breached ticket is
 *    emailed ONCE to its group manager (hdEmail.sendEscalation) when
 *      - escalated_at IS NULL                        (never escalated before)
 *      - the breach happened within the last 7 days  (no backlog flood on first deploy)
 *      - its group has a manager who is an active user
 *    On a successful send escalated_at / escalated_to_id are stored and a ticket
 *    history row "Escalated to <manager>" is written. No group / no active
 *    manager -> skipped and logged. A failed send leaves escalated_at NULL so
 *    the next run retries.
 *
 * All writes use `silent: true` AND assign updated_at to itself (the column is
 * ON UPDATE CURRENT_TIMESTAMP) so updated_at is NOT bumped — otherwise marking
 * a ticket would reset rule (b)'s 48-hour clock.
 *
 * ENV
 *   HD_ESCALATION_ENABLED=true   send escalation emails (default: off — marking only)
 */
const cron = require('node-cron');
const { Op, QueryTypes } = require('sequelize');
// config/database exports the Sequelize INSTANCE — never destructure it.
const sequelize = require('../config/database');
const { HdTicket, HdGroup, HdTicketHistory } = require('../models/helpdesk');
const hdEmail = require('../services/helpdesk/hdEmail.service');

const HOUR = 60 * 60 * 1000;
const STALE_MS = 48 * HOUR;
const RECENT_MS = 7 * 24 * HOUR;
const CLOSED_STATUSES = [HdTicket.TICKET_STATUS.RESOLVED, HdTicket.TICKET_STATUS.CLOSED];

// hd_tickets.updated_at is `ON UPDATE CURRENT_TIMESTAMP` in MySQL, so `silent: true` alone
// is not enough — the column must be assigned to itself or MySQL bumps it anyway.
const KEEP_UPDATED_AT = () => ({ updated_at: sequelize.col('updated_at') });

/** When did this ticket breach? null = not breached. */
function breachMoment(ticket, now) {
  if (ticket.dueDate) {
    const due = new Date(ticket.dueDate);
    return due < now ? due : null;
  }
  // HdTicket maps timestamps as `updatedAt: 'updated_at'`, so the attribute is `updated_at`.
  const staleAt = new Date(new Date(ticket.updated_at || ticket.updatedAt).getTime() + STALE_MS);
  return staleAt < now ? staleAt : null;
}

/** Active managers of the given groups -> Map(groupId -> { id, name, email }). */
async function loadManagers(groupIds) {
  const managers = new Map();
  if (!groupIds.length) return managers;
  const groups = await HdGroup.findAll({
    where: { id: groupIds, managerId: { [Op.ne]: null } },
    attributes: ['id', 'managerId'],
  });
  const managerIds = [...new Set(groups.map(g => g.managerId))];
  if (!managerIds.length) return managers;
  const users = await sequelize.query(
    'SELECT id, name, email FROM users WHERE id IN (:ids) AND isActive = 1',
    { type: QueryTypes.SELECT, replacements: { ids: managerIds } }
  );
  const byId = new Map(users.map(u => [u.id, u]));
  for (const g of groups) {
    const u = byId.get(g.managerId);
    if (u && u.email) managers.set(g.id, u);
  }
  return managers;
}

/**
 * One escalation pass.
 *
 * @param {object}   [opts]
 * @param {Date}     [opts.now]       reference time
 * @param {boolean}  [opts.send]      send escalations (default: HD_ESCALATION_ENABLED === 'true')
 * @param {boolean}  [opts.dryRun]    compute counts only — no writes, no email
 * @param {number[]} [opts.ticketIds] restrict the scan to these ticket ids (tests)
 * @param {Function} [opts.sender]    (ticket, manager, { reason }) => Promise<boolean>; default hdEmail.sendEscalation
 * @returns {Promise<{scanned:number, breached:number, newlyMarked:number, escalated:number, skippedNoManager:number, skippedOld:number, failed:number}>}
 */
async function runEscalation({
  now = new Date(),
  send = process.env.HD_ESCALATION_ENABLED === 'true',
  dryRun = false,
  ticketIds,
  sender = (...args) => hdEmail.sendEscalation(...args),
} = {}) {
  const stats = { scanned: 0, breached: 0, newlyMarked: 0, escalated: 0, skippedNoManager: 0, skippedOld: 0, failed: 0 };

  // Open + candidate-breached in SQL; breachMoment() re-checks in JS.
  const where = {
    status: { [Op.notIn]: CLOSED_STATUSES },
    [Op.or]: [
      { dueDate: { [Op.lt]: now } },
      { dueDate: null, updated_at: { [Op.lt]: new Date(now.getTime() - STALE_MS) } },
    ],
  };
  if (Array.isArray(ticketIds)) {
    if (!ticketIds.length) return stats;
    where.id = ticketIds;
  }

  const tickets = await HdTicket.findAll({ where, order: [['id', 'ASC']] });
  stats.scanned = tickets.length;

  const breached = [];
  for (const t of tickets) {
    const at = breachMoment(t, now);
    if (at) breached.push({ ticket: t, at });
  }
  stats.breached = breached.length;

  // 1. Mark breaches (always, independent of the send flag).
  for (const { ticket, at } of breached) {
    if (ticket.slaBreached) continue;
    stats.newlyMarked++;
    if (dryRun) continue;
    await HdTicket.update(
      { slaBreached: true, slaBreachAt: ticket.slaBreachAt || at, ...KEEP_UPDATED_AT() },
      { where: { id: ticket.id }, silent: true }
    );
  }

  if (!send) return stats;

  // 2. Escalate once per ticket to the group manager.
  const candidates = breached.filter(b => !b.ticket.escalatedAt);
  const managers = await loadManagers([...new Set(candidates.map(b => b.ticket.groupId).filter(Boolean))]);
  const recentCutoff = new Date(now.getTime() - RECENT_MS);

  for (const { ticket, at } of candidates) {
    if (at < recentCutoff) { stats.skippedOld++; continue; }

    const manager = ticket.groupId ? managers.get(ticket.groupId) : null;
    if (!manager) {
      stats.skippedNoManager++;
      console.warn(`[HD Escalation] ${ticket.reqNumber}: no group or no active group manager — not escalated`);
      continue;
    }
    if (dryRun) { stats.escalated++; continue; }

    // Claim first (atomic) so two app instances can never both send for one ticket.
    const [claimed] = await HdTicket.update(
      { escalatedAt: now, escalatedToId: manager.id, ...KEEP_UPDATED_AT() },
      { where: { id: ticket.id, escalatedAt: null }, silent: true }
    );
    if (!claimed) continue;

    const reason = ticket.dueDate
      ? `it is past its due date (${new Date(ticket.dueDate).toISOString().slice(0, 16).replace('T', ' ')} UTC) and is still ${ticket.status}`
      : `it has had no update for more than 48 hours and is still ${ticket.status}`;

    let ok = false;
    try {
      ok = await sender(ticket, { name: manager.name, email: manager.email }, { reason });
    } catch (err) {
      console.error(`[HD Escalation] ${ticket.reqNumber}: send threw — ${err.message}`);
    }

    if (!ok) {
      // Release the claim so the next run retries.
      await HdTicket.update(
        { escalatedAt: null, escalatedToId: null, ...KEEP_UPDATED_AT() },
        { where: { id: ticket.id }, silent: true }
      );
      stats.failed++;
      continue;
    }

    stats.escalated++;
    try {
      await HdTicketHistory.create({
        ticketId: ticket.id,
        field: 'escalation',
        oldValue: null,
        newValue: `Escalated to ${manager.name}`,
        changedBy: null, // system
        changedAt: now,
      });
    } catch (err) {
      console.error(`[HD Escalation] ${ticket.reqNumber}: history write failed — ${err.message}`);
    }
  }

  return stats;
}

let running = false;

function startHdEscalationJob() {
  cron.schedule('15 * * * *', async () => {
    if (running) return;
    running = true;
    try {
      const send = process.env.HD_ESCALATION_ENABLED === 'true';
      const s = await runEscalation({ send });
      console.log(
        `[HD Escalation] scanned=${s.scanned} breached=${s.breached} newlyMarked=${s.newlyMarked} ` +
        `escalated=${s.escalated} skippedNoManager=${s.skippedNoManager} skippedOld=${s.skippedOld} ` +
        `failed=${s.failed} send=${send}`
      );
    } catch (err) {
      console.error('[HD Escalation] Run failed:', err.message);
    } finally {
      running = false;
    }
  }, { timezone: 'Asia/Kolkata' });
  console.log(`[HD Escalation] Scheduled hourly at :15 IST (emails ${process.env.HD_ESCALATION_ENABLED === 'true' ? 'ENABLED' : 'disabled — marking only'})`);
}

module.exports = { runEscalation, startHdEscalationJob, breachMoment };
