'use strict';

/**
 * T2 — ticket visibility under the TEAM rule (B4)
 * T3 — create / update / bulkAssign team rules (B5–B7) + B12 PM project ref
 *
 * Runs against the shared UAT DB (see test/_helpers.js): real users are only
 * READ; every ticket created here is prefixed __TEST__ and removed in finally.
 *
 *   node --test test/ticketTeam.test.js
 */

const { describe, it: test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { sequelize, models, TEST_PREFIX, mockRes, mockNext, createCleanup, closeDb } = require('./_helpers');
const { HdTicket, HdTicketHistory, User, Project: PmProject } = models;
const ctrl = require('../src/controllers/helpdesk/ticket.controller');

// ─── Fixtures (read-only picks from the employee master) ─────────────────────

const fx = {};   // manager, report, outsider, lonelyManager (may be null), pmProject (may be null)

describe('helpdesk ticket team rules', () => {

before(async () => {
  // A real active manager who has ≥1 active direct report, plus one such report
  const [[m]] = await sequelize.query(`
    SELECT m.id, m.name, m.email, m.role, m.managerId
      FROM users m
      JOIN users r ON r.managerId = m.id AND r.isActive = 1
     WHERE m.isActive = 1 AND m.role = 'manager'
     GROUP BY m.id, m.name, m.email, m.role, m.managerId
     ORDER BY COUNT(r.id) DESC LIMIT 1`);
  assert.ok(m, 'need an active manager with ≥1 active direct report');
  fx.manager = m;

  fx.report = await User.findOne({
    attributes: ['id', 'name', 'email', 'role', 'managerId'],
    where: { managerId: m.id, isActive: true }, order: [['name', 'ASC']], raw: true,
  });
  assert.ok(fx.report, 'manager must have a direct report');

  // Someone outside that team: active, not the manager, not reporting to them
  const [[o]] = await sequelize.query(`
    SELECT id, name, email, role, managerId FROM users
     WHERE isActive = 1 AND role = 'employee' AND id <> ? AND (managerId IS NULL OR managerId <> ?)
     ORDER BY name LIMIT 1`, { replacements: [m.id, m.id] });
  assert.ok(o, 'need an active employee outside the team');
  fx.outsider = o;

  // A manager-role user with NO active direct reports (optional fixture)
  const [[n]] = await sequelize.query(`
    SELECT m.id, m.name, m.email, m.role, m.managerId FROM users m
     WHERE m.isActive = 1 AND m.role = 'manager'
       AND NOT EXISTS (SELECT 1 FROM users r WHERE r.managerId = m.id AND r.isActive = 1)
     LIMIT 1`);
  fx.lonelyManager = n || null;

  fx.pmProject = await PmProject.findOne({ attributes: ['id', 'name'], raw: true });
});

after(closeDb);

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ALL_PERMS = { canManageTickets: true, canAssign: true, canApprove: true, canManageUsers: false, canViewReports: true, canManageKb: false, canManageProjects: true };
const NO_PERMS  = { canManageTickets: false, canAssign: false, canApprove: false, canManageUsers: false, canViewReports: false, canManageKb: false, canManageProjects: false };

/** Build req.hdUser the way helpdeskAuth does (scope from role). */
function hdUserFor(u, { scope, isAdmin = false } = {}) {
  const s = scope || (u.role === 'manager' ? 'group' : 'own');
  return {
    id: u.id, name: u.name, email: u.email, role: u.role, isAdmin, scope: s,
    permissions: s === 'own' ? NO_PERMS : ALL_PERMS,
    groupId: null, managerId: u.managerId ?? null, teamManagerId: u.managerId ?? null,
  };
}

const req = (hdUser, { body = {}, query = {}, params = {} } = {}) => ({ hdUser, body, query, params, file: undefined });

async function run(handler, r) {
  const res = mockRes(); const next = mockNext();
  await handler(r, res, next);
  if (next.called && next.error) throw next.error;
  return res;
}

/** Create a __TEST__ ticket directly (bypasses controller rules) and register cleanup. */
async function seedTicket(cleanup, fields) {
  const t = await HdTicket.create({
    reqNumber: `${TEST_PREFIX}${crypto.randomBytes(3).toString('hex')}`,
    title: `${TEST_PREFIX} ${fields.title || 'ticket'}`,
    ...fields,
  });
  registerTicket(cleanup, t.id);
  return t;
}

function registerTicket(cleanup, id) {
  cleanup.add(async () => {
    await HdTicketHistory.destroy({ where: { ticketId: id } });
    await HdTicket.destroy({ where: { id } });
  });
}

const idsOf = (res) => new Set((res.body.data.tickets || []).map((t) => t._id ?? t.id));
const LIST_Q = { search: TEST_PREFIX, pageSize: 100 };

// ─── T2 — visibility ─────────────────────────────────────────────────────────

test('T2 visibility: manager with reports sees team tickets and NOT others', async () => {
  const cleanup = createCleanup();
  try {
    const teamTicket   = await seedTicket(cleanup, { title: 'team',   teamManagerId: fx.manager.id, requesterId: fx.outsider.id });
    const reportTicket = await seedTicket(cleanup, { title: 'report', assigneeId: fx.report.id,     requesterId: fx.outsider.id });
    const otherTicket  = await seedTicket(cleanup, { title: 'other',  requesterId: fx.outsider.id,  assigneeId: fx.outsider.id });

    const res = await run(ctrl.listTickets, req(hdUserFor(fx.manager), { query: LIST_Q }));
    assert.equal(res.statusCode, 200);
    const ids = idsOf(res);
    assert.ok(ids.has(teamTicket.id),   'team_manager_id = me is visible');
    assert.ok(ids.has(reportTicket.id), 'assignee ∈ my direct reports is visible');
    assert.ok(!ids.has(otherTicket.id), 'ticket of someone outside my team is NOT visible');

    // Include shape (B9): teamManager {id,name} present on the team ticket
    const row = res.body.data.tickets.find((t) => (t._id ?? t.id) === teamTicket.id);
    assert.equal(row.teamManager?._id ?? row.teamManager?.id, fx.manager.id);
    assert.equal(row.teamManager?.name, fx.manager.name);

    // exportTickets uses the same helper → same visible set (Excel buffer returned)
    const exp = await run(ctrl.exportTickets, req(hdUserFor(fx.manager), { query: LIST_Q }));
    assert.equal(exp.statusCode, 200);
    assert.ok(Buffer.isBuffer(exp.body) || exp.body instanceof Uint8Array, 'export returns a workbook buffer');
  } finally { await cleanup.run(); }
});

test('T2 visibility: manager with no reports and no team tickets sees only own — never everything', async () => {
  if (!fx.lonelyManager) { console.log('  [skip] no active manager without reports on this DB'); return; }
  const cleanup = createCleanup();
  try {
    const teamTicket = await seedTicket(cleanup, { title: 'team',  teamManagerId: fx.manager.id, requesterId: fx.outsider.id });
    const ownTicket  = await seedTicket(cleanup, { title: 'lonely', requesterId: fx.lonelyManager.id });

    const res = await run(ctrl.listTickets, req(hdUserFor(fx.lonelyManager), { query: LIST_Q }));
    const ids = idsOf(res);
    assert.ok(ids.has(ownTicket.id),   'own ticket visible');
    assert.ok(!ids.has(teamTicket.id), 'another team\'s ticket NOT visible');
  } finally { await cleanup.run(); }
});

test('T2 visibility: employee (scope own) sees own tickets only', async () => {
  const cleanup = createCleanup();
  try {
    const teamTicket = await seedTicket(cleanup, { title: 'team', teamManagerId: fx.manager.id, requesterId: fx.report.id });
    const ownTicket  = await seedTicket(cleanup, { title: 'own',  requesterId: fx.outsider.id });

    const res = await run(ctrl.listTickets, req(hdUserFor(fx.outsider), { query: LIST_Q }));
    const ids = idsOf(res);
    assert.ok(ids.has(ownTicket.id));
    assert.ok(!ids.has(teamTicket.id));
  } finally { await cleanup.run(); }
});

// ─── T3 — create / update / bulkAssign rules ─────────────────────────────────

const both400 = (res, msg) => {
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, msg);
  assert.equal(res.body.error?.message, msg);
};

test('T3 createTicket: assignee only → team derived from assignee\'s manager; body.groupId ignored', async () => {
  const cleanup = createCleanup();
  try {
    const res = await run(ctrl.createTicket, req(hdUserFor(fx.manager), {
      body: { title: `${TEST_PREFIX} derive team`, assigneeId: fx.report.id, groupId: 999999 },
    }));
    assert.equal(res.statusCode, 201, JSON.stringify(res.body));
    const id = res.body.data._id ?? res.body.data.id;
    registerTicket(cleanup, id);

    const row = await HdTicket.findByPk(id, { raw: true });
    assert.equal(row.assigneeId, fx.report.id);
    assert.equal(row.teamManagerId, fx.manager.id, 'team = assignee.managerId');
    assert.equal(row.groupId, null, 'groupId never written');
  } finally { await cleanup.run(); }
});

test('T3 createTicket: assignee outside the selected team → 400 with both message shapes', async () => {
  const res = await run(ctrl.createTicket, req(hdUserFor(fx.manager), {
    body: { title: `${TEST_PREFIX} bad team`, teamManagerId: fx.manager.id, assigneeId: fx.outsider.id },
  }));
  both400(res, 'Assignee is not in the selected team');
});

test('T3 createTicket: team manager with no reports (≠ assignee) → 400', async () => {
  if (!fx.lonelyManager) { console.log('  [skip] no active manager without reports on this DB'); return; }
  const res = await run(ctrl.createTicket, req(hdUserFor(fx.manager), {
    body: { title: `${TEST_PREFIX} lonely`, teamManagerId: fx.lonelyManager.id },
  }));
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.message && res.body.error?.message === res.body.message);
});

test('T3 createTicket: teamManagerId === assigneeId is allowed for any active user', async () => {
  const cleanup = createCleanup();
  try {
    const res = await run(ctrl.createTicket, req(hdUserFor(fx.manager), {
      body: { title: `${TEST_PREFIX} self team`, teamManagerId: fx.outsider.id, assigneeId: fx.outsider.id },
    }));
    assert.equal(res.statusCode, 201, JSON.stringify(res.body));
    registerTicket(cleanup, res.body.data._id ?? res.body.data.id);
    assert.equal(res.body.data.teamManagerId, fx.outsider.id);
  } finally { await cleanup.run(); }
});

test('B12 createTicket: projectId as PM UUID → pm_project_id; legacy INT → project_id', async () => {
  if (!fx.pmProject) { console.log('  [skip] no pm_projects rows on this DB'); return; }
  const cleanup = createCleanup();
  try {
    const res = await run(ctrl.createTicket, req(hdUserFor(fx.manager), {
      body: { title: `${TEST_PREFIX} pm project`, projectId: fx.pmProject.id },
    }));
    assert.equal(res.statusCode, 201, JSON.stringify(res.body));
    const id = res.body.data._id ?? res.body.data.id;
    registerTicket(cleanup, id);

    const row = await HdTicket.findByPk(id, { raw: true });
    assert.equal(row.pmProjectId, fx.pmProject.id);
    assert.equal(row.projectId, null);

    // list include shows pmProject {id,name}; ?projectId=<uuid> filter matches it
    const list = await run(ctrl.listTickets, req(hdUserFor(fx.manager, { scope: 'all' }), { query: { ...LIST_Q, projectId: fx.pmProject.id } }));
    const found = list.body.data.tickets.find((x) => (x._id ?? x.id) === id);
    assert.ok(found, '?projectId=<PM uuid> matches pm_project_id');
    assert.equal(found.pmProject?.name, fx.pmProject.name);

    const bad = await run(ctrl.createTicket, req(hdUserFor(fx.manager), { body: { title: `${TEST_PREFIX} bad proj`, projectId: 'not-a-ref' } }));
    assert.equal(bad.statusCode, 400);
    assert.equal(bad.body.message, bad.body.error.message);
  } finally { await cleanup.run(); }
});

test('T3 updateTicket: team change with an assignee outside it → 400; clearing assignee keeps team; groupId ignored', async () => {
  const cleanup = createCleanup();
  try {
    const tk = await seedTicket(cleanup, { title: 'upd', assigneeId: fx.outsider.id, teamManagerId: fx.outsider.id, requesterId: fx.outsider.id });

    const bad = await run(ctrl.updateTicket, req(hdUserFor(fx.manager), { params: { id: tk.id }, body: { teamManagerId: fx.manager.id } }));
    both400(bad, 'Assignee is not in the selected team');

    const ok = await run(ctrl.updateTicket, req(hdUserFor(fx.manager), { params: { id: tk.id }, body: { assigneeId: null, groupId: 999999 } }));
    assert.equal(ok.statusCode, 200, JSON.stringify(ok.body));
    let row = await HdTicket.findByPk(tk.id, { raw: true });
    assert.equal(row.assigneeId, null);
    assert.equal(row.teamManagerId, fx.outsider.id, 'clearing assignee keeps team');
    assert.equal(row.groupId, null, 'groupId not writable');

    // Now the team can change without an assignee
    const mv = await run(ctrl.updateTicket, req(hdUserFor(fx.manager), { params: { id: tk.id }, body: { teamManagerId: fx.manager.id } }));
    assert.equal(mv.statusCode, 200, JSON.stringify(mv.body));
    row = await HdTicket.findByPk(tk.id, { raw: true });
    assert.equal(row.teamManagerId, fx.manager.id);

    // Pick-up by a team member keeps the team; history logged under teamManagerId
    const pick = await run(ctrl.updateTicket, req(hdUserFor(fx.manager), { params: { id: tk.id }, body: { assigneeId: fx.report.id } }));
    assert.equal(pick.statusCode, 200, JSON.stringify(pick.body));
    row = await HdTicket.findByPk(tk.id, { raw: true });
    assert.equal(row.assigneeId, fx.report.id);
    assert.equal(row.teamManagerId, fx.manager.id);

    const hist = await run(ctrl.getHistory, req(hdUserFor(fx.manager), { params: { id: tk.id } }));
    const teamRow = hist.body.data.find((h) => h.field === 'teamManagerId' && h.newValue === fx.manager.id);
    assert.ok(teamRow, 'teamManagerId change is in history');
    assert.equal(teamRow.newDisplay, fx.manager.name, 'history label resolves to the manager name');
  } finally { await cleanup.run(); }
});

test('T3 bulkAssign: outsider → all skipped with skippedDetails; team member → assigned + team set', async () => {
  const cleanup = createCleanup();
  try {
    const a = await seedTicket(cleanup, { title: 'bulk a', requesterId: fx.outsider.id });
    const b = await seedTicket(cleanup, { title: 'bulk b', requesterId: fx.outsider.id });

    const skip = await run(ctrl.bulkAssign, req(hdUserFor(fx.manager), {
      body: { ticketIds: [a.id, b.id, 999999999], assigneeId: fx.outsider.id, teamManagerId: fx.manager.id },
    }));
    assert.equal(skip.statusCode, 200, JSON.stringify(skip.body));
    assert.equal(skip.body.data.updated, 0);
    const reasons = Object.fromEntries(skip.body.data.skippedDetails.map((s) => [String(s.ticketId), s.reason]));
    assert.equal(reasons[String(a.id)], 'Assignee is not in the selected team');
    assert.equal(reasons[String(b.id)], 'Assignee is not in the selected team');
    assert.equal(reasons['999999999'], 'Ticket not found');

    const ok = await run(ctrl.bulkAssign, req(hdUserFor(fx.manager), {
      body: { ticketIds: [a.id, b.id], assigneeId: fx.report.id },
    }));
    assert.equal(ok.statusCode, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.data.updated, 2);
    assert.deepEqual(ok.body.data.skippedDetails, []);
    for (const id of [a.id, b.id]) {
      const row = await HdTicket.findByPk(id, { raw: true });
      assert.equal(row.assigneeId, fx.report.id);
      assert.equal(row.teamManagerId, fx.manager.id, 'team_manager_id set from assignee\'s manager');
      assert.equal(row.groupId, null);
    }

    const bad = await run(ctrl.bulkAssign, req(hdUserFor(fx.manager), {
      body: { ticketIds: [a.id], assigneeId: fx.report.id, teamManagerId: '00000000-0000-0000-0000-000000000000' },
    }));
    both400(bad, 'Team manager not found or inactive');
  } finally { await cleanup.run(); }
});

}); // describe
