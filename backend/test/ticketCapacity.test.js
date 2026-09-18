'use strict';

/**
 * T4  Helpdesk ticket capacity — the SAME rules as PM team allocation.
 *
 *   create over capacity          → 409 + conflict/suggestions/canRequestException
 *   update (assign + allocate)    → 409
 *   bulkAssign                    → the ticket is SKIPPED ('Assignee would be over capacity')
 *   derived hrs/day > exception cap → 400
 *   exception request             → ticket allocation written + approval row with ticketId
 *   D1  a pending ticket exception is NOT counted in loadAllocationsForUsers
 *   approve                       → counted again, with its over-capacity hours
 *   reject                        → previous ticket allocation restored
 *   migration 047 idempotent
 *
 * Runs against the shared UAT DB (test/_helpers.js loads .env and deletes
 * SMTP_HOST). Real users are READ-ONLY; every row created here is __TEST__
 * prefixed and removed in a finally block. The window is in 2033 (2031/2032 are
 * used by the other allocation tests) and the target user is chosen to have NO
 * counted allocation in it, so the arithmetic is deterministic.
 *
 *   node --test test/ticketCapacity.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { sequelize, models, TEST_PREFIX, mockRes, mockNext, createCleanup, closeDb, pickUser } = require('./_helpers');
const { HdTicket, HdTicketHistory, User } = models;
const PmAllocationApproval = require('../src/models/pm/PmAllocationApproval');
const PmAllocationHistory  = require('../src/models/pm/PmAllocationHistory');
const ctrl        = require('../src/controllers/helpdesk/ticket.controller');
const teamSvc     = require('../src/services/helpdesk/team.service');
const alloc       = require('../src/services/pm/allocation.service');
const projectSvc  = require('../src/services/pm/project.service');
const ticketExc   = require('../src/services/pm/ticketException.service');
const pmSettings  = require('../src/services/pm/pmSettings.service');
const E           = require('../src/utils/capacityEngine');
const migration047 = require('../migrations/047_ticket_allocation_exception');
const migration048 = require('../migrations/048_allocation_history_ticket');
// Every migration file calls dotenv.config() when required, which puts SMTP_HOST
// back after _helpers deleted it — drop it again so nothing here can send mail.
delete process.env.SMTP_HOST;

const FROM = '2033-03-07', TO = '2033-03-18';   // Mon 7 Mar 2033 → Fri 18 Mar 2033

// ─── Fixtures (Node 18.8's before() is unreliable → memoised, awaited by each test)

let fx;
function fixtures() {
  if (!fx) fx = (async () => {
    const policy   = await pmSettings.getExceptionPolicy();
    const calendar = await pmSettings.getCalendar();

    const approver = await pickUser(policy.roles[0]);
    assert.ok(approver, `UAT DB needs an active user with approver role "${policy.roles[0]}"`);

    // The helpdesk agent raising the requests — a manager who is NOT the approver
    let agent = await pickUser('manager', { where: { id: { [require('sequelize').Op.ne]: approver.id } } });
    if (!agent) agent = await pickUser('senior_manager');
    assert.ok(agent && String(agent.id) !== String(approver.id), 'need a manager distinct from the approver');

    // Target: an active employee with NO counted allocation in the window
    const candidates = await User.findAll({
      attributes: ['id', 'name', 'email', 'role', 'managerId'],
      where: { role: 'employee', isActive: true }, order: [['name', 'ASC']], limit: 40, raw: true,
    });
    let target = null;
    for (const c of candidates) {
      const load = await alloc.loadAllocationsForUsers([c.id], { countedOnly: true, calendar });
      if (E.summarise(load, calendar, FROM, TO).peakHours === 0) { target = c; break; }
    }
    assert.ok(target, 'no employee free in the 2033 window');

    return { policy, calendar, approver, agent, target, cap: calendar.hoursPerDay };
  })();
  return fx;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ALL_PERMS = { canManageTickets: true, canAssign: true, canApprove: true, canManageUsers: false, canViewReports: true, canManageKb: false, canManageProjects: true };

const hdUserFor = (u) => ({
  id: u.id, name: u.name, email: u.email, role: u.role, isAdmin: false, scope: 'group',
  permissions: ALL_PERMS, groupId: null, managerId: u.managerId ?? null, teamManagerId: u.managerId ?? null,
});

const req = (hdUser, { body = {}, query = {}, params = {} } = {}) => ({ hdUser, body, query, params, file: undefined });

async function run(handler, r) {
  const res = mockRes(); const next = mockNext();
  await handler(r, res, next);
  if (next.called && next.error) throw next.error;
  return res;
}

/** sendSuccess → renameIdsForClient renames every `id` to `_id`, so read both. */
const bodyId = (res) => res?.body?.data?._id ?? res?.body?.data?.id ?? null;

function registerTicket(cleanup, id) {
  if (id == null) throw new Error('registerTicket: missing ticket id — the row would leak');
  cleanup.add(async () => {
    await PmAllocationApproval.destroy({ where: { ticketId: id } });
    await PmAllocationHistory.destroy({ where: { ticketId: id } });
    await HdTicketHistory.destroy({ where: { ticketId: id } });
    await HdTicket.destroy({ where: { id } });
  });
}

/** A __TEST__ ticket written straight to the DB (bypasses the controller rules). */
async function seedTicket(cleanup, fields = {}) {
  const t = await HdTicket.create({
    reqNumber: `${TEST_PREFIX}${crypto.randomBytes(3).toString('hex')}`,
    title: `${TEST_PREFIX} ${fields.title || 'ticket'}`,
    status: 'open',
    ...fields,
  });
  registerTicket(cleanup, t.id);
  return t;
}

/** Fill the target's whole day over the window so anything else overloads them. */
const seedBaseline = (cleanup, f) => seedTicket(cleanup, {
  title: 'baseline', requesterId: f.agent.id, assigneeId: f.target.id,
  allocationMode: 'per_day', allocationHoursPerDay: f.cap, allocationFrom: FROM, allocationTo: TO,
});

/** Every assertion the PM 409 body makes, applied to a helpdesk 409 body. */
function assertConflictBody(res, f) {
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.success, false);
  assert.ok(res.body.message, 'message present');
  assert.equal(res.body.error.message, res.body.message, 'both body shapes carry the message');
  const c = res.body.conflict;
  assert.ok(c, 'conflict payload present');
  assert.deepEqual(Object.keys(c.suggestions).sort(), ['nextFreeDate', 'overloadHours', 'reduceTo', 'shortenTo']);
  assert.equal(c.canRequestException, true);
  assert.equal(c.exceptionMaxHoursPerDay, f.policy.maxHoursPerDay);
  assert.equal(c.capacity, f.cap);
  assert.ok(c.peak > f.cap, 'peak is over capacity');
  return c;
}

// ONE top-level test whose awaited subtests run strictly in order (Node 18.8).
test('helpdesk ticket capacity', async (t) => {
try {

await t.test('create over capacity → 409 with suggestions', async () => {
  const f = await fixtures();
  const cleanup = createCleanup();
  try {
    await seedBaseline(cleanup, f);

    const res = await run(ctrl.createTicket, req(hdUserFor(f.agent), {
      body: {
        title: `${TEST_PREFIX} over`, assigneeId: f.target.id,
        allocationMode: 'per_day', allocationHoursPerDay: 1, allocationFrom: FROM, allocationTo: TO,
      },
    }));
    if (res.statusCode === 201) registerTicket(cleanup, bodyId(res));
    const c = assertConflictBody(res, f);
    assert.equal(c.peak, f.cap + 1);
    assert.equal(c.suggestions.overloadHours, 1);

    // …and nothing was created
    assert.equal(await HdTicket.count({ where: { title: `${TEST_PREFIX} over` } }), 0);

    // An UNASSIGNED ticket has nobody to overload → still allowed
    const ok = await run(ctrl.createTicket, req(hdUserFor(f.agent), {
      body: {
        title: `${TEST_PREFIX} unassigned`,
        allocationMode: 'per_day', allocationHoursPerDay: 1, allocationFrom: FROM, allocationTo: TO,
      },
    }));
    assert.equal(ok.statusCode, 201);
    registerTicket(cleanup, bodyId(ok));
  } finally { await cleanup.run(); }
});

await t.test('update (assign + allocate) over capacity → 409; a fitting update still passes', async () => {
  const f = await fixtures();
  const cleanup = createCleanup();
  try {
    await seedBaseline(cleanup, f);
    const tk = await seedTicket(cleanup, { title: 'to-assign', requesterId: f.agent.id });

    const res = await run(ctrl.updateTicket, req(hdUserFor(f.agent), {
      params: { id: String(tk.id) },
      body: { assigneeId: f.target.id, allocationMode: 'per_day', allocationHoursPerDay: 2, allocationFrom: FROM, allocationTo: TO },
    }));
    const c = assertConflictBody(res, f);
    assert.equal(c.peak, f.cap + 2);
    await tk.reload();
    assert.equal(tk.allocationHoursPerDay, null, 'nothing was written');

    // The same edit in a window the person is free in is accepted
    const ok = await run(ctrl.updateTicket, req(hdUserFor(f.agent), {
      params: { id: String(tk.id) },
      body: { assigneeId: f.target.id, allocationMode: 'per_day', allocationHoursPerDay: 2, allocationFrom: '2033-06-06', allocationTo: '2033-06-10' },
    }));
    assert.equal(ok.statusCode, 200);
    await tk.reload();
    assert.equal(Number(tk.allocationHoursPerDay), 2);
  } finally { await cleanup.run(); }
});

await t.test('bulkAssign skips the over-capacity ticket instead of failing the batch', async () => {
  const f = await fixtures();
  const cleanup = createCleanup();
  try {
    await seedBaseline(cleanup, f);
    const a = await seedTicket(cleanup, { title: 'bulk-a', requesterId: f.agent.id });
    const b = await seedTicket(cleanup, { title: 'bulk-b', requesterId: f.agent.id });

    const res = await run(ctrl.bulkAssign, req(hdUserFor(f.agent), {
      body: {
        ticketIds: [a.id, b.id], assigneeId: f.target.id,
        allocationMode: 'per_day', allocationHoursPerDay: 1, allocationFrom: FROM, allocationTo: TO,
      },
    }));
    assert.equal(res.statusCode, 200, 'the batch itself succeeds');
    const d = res.body.data;
    assert.equal(d.updated, 0);
    assert.equal(d.skipped, 2);
    for (const id of [a.id, b.id]) {
      const row = d.skippedDetails.find((s) => String(s.ticketId) === String(id));
      assert.ok(row, `ticket ${id} reported`);
      assert.equal(row.reason, 'Assignee would be over capacity');
    }
    await a.reload();
    assert.equal(a.assigneeId, null, 'a skipped ticket is left untouched');
  } finally { await cleanup.run(); }
});

await t.test('a derived hrs/day above the exception cap is refused with 400', async () => {
  const f = await fixtures();
  const cleanup = createCleanup();
  try {
    const wd = E.workingDaysBetween(FROM, TO, f.calendar);
    const overCap = f.policy.maxHoursPerDay + 4;
    const res = await run(ctrl.createTicket, req(hdUserFor(f.agent), {
      body: {
        title: `${TEST_PREFIX} capped`, assigneeId: f.target.id,
        allocationMode: 'total', allocationTotalHours: overCap * wd, allocationFrom: FROM, allocationTo: TO,
      },
    }));
    if (res.statusCode === 201) registerTicket(cleanup, bodyId(res));
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error.message, res.body.message);
    assert.match(res.body.message, new RegExp(`^Exceeds the exception cap of ${f.policy.maxHoursPerDay} hrs/day: this would put `));
    assert.match(res.body.message, /hrs\/day on the person$/);
  } finally { await cleanup.run(); }
});

await t.test('exception request → approval row with ticketId; D1 pending is not counted; approve → counted', async () => {
  const f = await fixtures();
  const cleanup = createCleanup();
  try {
    await seedBaseline(cleanup, f);
    const tk = await seedTicket(cleanup, { title: 'exc-new', requesterId: f.agent.id, assigneeId: f.target.id });

    const res = await run(ctrl.requestTicketAllocationException, req(hdUserFor(f.agent), {
      params: { id: String(tk.id) },
      body: { allocationMode: 'per_day', allocationHoursPerDay: 2, allocationFrom: FROM, allocationTo: TO, reason: 'escalation' },
    }));
    assert.equal(res.statusCode, 201);

    const approval = await PmAllocationApproval.findOne({ where: { ticketId: tk.id } });
    assert.ok(approval, 'approval row created');
    assert.equal(approval.requestType, 'exception');
    assert.equal(approval.status, 'pending');
    assert.equal(approval.projectId, null);
    assert.equal(approval.memberId, null);
    assert.equal(approval.segmentId, null);
    assert.equal(String(approval.userId), String(f.target.id));
    assert.equal(String(approval.requestedById), String(f.agent.id));
    assert.equal(Number(approval.hoursPerDay), 2);
    assert.equal(Number(approval.overloadHours), 2);
    assert.equal(approval.fromDate, FROM);
    assert.equal(approval.toDate, TO);
    assert.deepEqual(approval.previousSnapshot, { ticket: null }, 'the request introduced the allocation');

    // The ticket carries the requested (over-capacity) allocation and reads as pending
    await tk.reload();
    assert.equal(Number(tk.allocationHoursPerDay), 2);
    assert.equal(tk.allocationFrom, FROM);
    assert.deepEqual(await ticketExc.ticketExceptionStatus(tk.id), { status: 'pending', approvalId: approval.id });

    // D1 — a pending ticket exception counts nowhere
    const pendingLoad = await alloc.loadAllocationsForUsers([f.target.id], { countedOnly: true, calendar: f.calendar });
    assert.equal(pendingLoad.filter(a => String(a.ticketId) === String(tk.id)).length, 0);
    assert.equal(E.summarise(pendingLoad, f.calendar, FROM, TO).peakHours, f.cap);

    // A second request while one is pending → 409
    const dup = await run(ctrl.requestTicketAllocationException, req(hdUserFor(f.agent), {
      params: { id: String(tk.id) },
      body: { allocationMode: 'per_day', allocationHoursPerDay: 2, allocationFrom: FROM, allocationTo: TO, reason: 'again' },
    }));
    assert.equal(dup.statusCode, 409);
    assert.equal(dup.body.error.message, dup.body.message);

    // The inbox shows it with the ticket ref alongside the usual fields
    const inbox = await projectSvc.listAllocationExceptions({ status: 'pending' }, f.approver);
    const row = inbox.find(r => String(r.id) === String(approval.id));
    assert.ok(row, 'ticket exception listed in the shared inbox');
    assert.deepEqual(row.ticket, { id: tk.id, reqNumber: tk.reqNumber, title: tk.title });
    assert.equal(row.project, null);
    assert.ok(row.load && typeof row.load.peakHours === 'number');
    assert.equal(typeof row.canDecide, 'boolean');
    assert.ok('decideBlockedReason' in row);

    // Approve → the ticket keeps the hours and counts again
    const decided = await projectSvc.decideAllocationException(approval.id, { action: 'approve', responseNote: 'ok' }, f.approver);
    assert.equal(decided.approval.status, 'approved');
    assert.equal(String(decided.ticket.id), String(tk.id));
    await tk.reload();
    assert.equal(Number(tk.allocationHoursPerDay), 2);
    assert.deepEqual(await ticketExc.ticketExceptionStatus(tk.id), { status: 'approved', approvalId: approval.id });

    const after = await alloc.loadAllocationsForUsers([f.target.id], { countedOnly: true, calendar: f.calendar });
    const line = after.find(a => String(a.ticketId) === String(tk.id));
    assert.ok(line, 'the approved ticket is counted');
    assert.equal(line.hoursPerDay, 2);
    assert.equal(E.summarise(after, f.calendar, FROM, TO).peakHours, f.cap + 2);
  } finally { await cleanup.run(); }
});

await t.test('reject restores the previous ticket allocation', async () => {
  const f = await fixtures();
  const cleanup = createCleanup();
  try {
    await seedBaseline(cleanup, f);
    const wd = E.workingDaysBetween(FROM, TO, f.calendar);
    const tk = await seedTicket(cleanup, {
      title: 'exc-existing', requesterId: f.agent.id, assigneeId: f.target.id,
      allocationMode: 'per_day', allocationHoursPerDay: 1, allocationTotalHours: wd, allocationFrom: FROM, allocationTo: TO,
    });

    const res = await run(ctrl.requestTicketAllocationException, req(hdUserFor(f.agent), {
      params: { id: String(tk.id) },
      body: { allocationMode: 'per_day', allocationHoursPerDay: 3, allocationFrom: FROM, allocationTo: TO, reason: 'needed' },
    }));
    assert.equal(res.statusCode, 201);
    const approval = await PmAllocationApproval.findOne({ where: { ticketId: tk.id } });
    assert.deepEqual(approval.previousSnapshot.ticket.allocationHoursPerDay, 1);
    await tk.reload();
    assert.equal(Number(tk.allocationHoursPerDay), 3);

    const decided = await projectSvc.decideAllocationException(approval.id, { action: 'reject', responseNote: 'no' }, f.approver);
    assert.equal(decided.approval.status, 'rejected');
    await tk.reload();
    assert.equal(Number(tk.allocationHoursPerDay), 1, 'previous allocation restored');
    assert.equal(Number(tk.allocationTotalHours), wd);
    assert.equal(tk.allocationFrom, FROM);
    assert.equal((await ticketExc.ticketExceptionStatus(tk.id)).status, 'none');

    // Restored → it counts again at its original hours
    const load = await alloc.loadAllocationsForUsers([f.target.id], { countedOnly: true, calendar: f.calendar });
    assert.equal(load.find(a => String(a.ticketId) === String(tk.id))?.hoursPerDay, 1);

    // Already decided → 409
    await assert.rejects(
      projectSvc.decideAllocationException(approval.id, { action: 'approve' }, f.approver),
      (e) => e.statusCode === 409,
    );
  } finally { await cleanup.run(); }
});

await t.test('an exception that is not needed is refused', async () => {
  const f = await fixtures();
  const cleanup = createCleanup();
  try {
    const tk = await seedTicket(cleanup, { title: 'exc-fits', requesterId: f.agent.id, assigneeId: f.target.id });
    const res = await run(ctrl.requestTicketAllocationException, req(hdUserFor(f.agent), {
      params: { id: String(tk.id) },
      body: { allocationMode: 'per_day', allocationHoursPerDay: 1, allocationFrom: FROM, allocationTo: TO, reason: 'why not' },
    }));
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.message, 'No exception needed — this allocation fits');
    assert.equal(res.body.error.message, res.body.message);

    // reason is required
    const noReason = await run(ctrl.requestTicketAllocationException, req(hdUserFor(f.agent), {
      params: { id: String(tk.id) },
      body: { allocationMode: 'per_day', allocationHoursPerDay: 1, allocationFrom: FROM, allocationTo: TO },
    }));
    assert.equal(noReason.statusCode, 400);
    assert.match(noReason.body.message, /reason/);
  } finally { await cleanup.run(); }
});

/**
 * Put a ticket into the PENDING-exception state through the real endpoint.
 * The ticket ends up assigned to `f.target` with over-capacity hours and an
 * undecided approval row. Returns { tk, approval }.
 */
async function withPendingException(cleanup, f, seed = {}) {
  await seedBaseline(cleanup, f);
  const wd = E.workingDaysBetween(FROM, TO, f.calendar);
  const tk = await seedTicket(cleanup, {
    title: 'pending-exc', requesterId: f.agent.id, assigneeId: f.target.id,
    allocationMode: 'per_day', allocationHoursPerDay: 1, allocationTotalHours: wd,
    allocationFrom: FROM, allocationTo: TO,
    ...seed,
  });
  const res = await run(ctrl.requestTicketAllocationException, req(hdUserFor(f.agent), {
    params: { id: String(tk.id) },
    body: { allocationMode: 'per_day', allocationHoursPerDay: 3, allocationFrom: FROM, allocationTo: TO, reason: 'urgent' },
  }));
  assert.equal(res.statusCode, 201);
  const approval = await PmAllocationApproval.findOne({ where: { ticketId: tk.id, status: 'pending' } });
  assert.ok(approval, 'pending approval row created');
  await tk.reload();          // the request wrote the requested (over-capacity) hours
  return { tk, approval };
}

await t.test('bulkAssign SKIPS a ticket with a pending allocation exception', async () => {
  const f = await fixtures();
  const cleanup = createCleanup();
  try {
    const { tk } = await withPendingException(cleanup, f);
    const before = { assigneeId: tk.assigneeId, hours: Number(tk.allocationHoursPerDay), from: tk.allocationFrom };

    // A ticket that is NOT pending rides along in the same batch, in a window the
    // target is free in, so the batch itself still does useful work.
    const ok = await seedTicket(cleanup, { title: 'bulk-ok', requesterId: f.agent.id });

    const res = await run(ctrl.bulkAssign, req(hdUserFor(f.agent), {
      body: {
        ticketIds: [tk.id, ok.id], assigneeId: f.target.id,
        allocationMode: 'per_day', allocationHoursPerDay: 1,
        allocationFrom: '2033-06-06', allocationTo: '2033-06-10',
      },
    }));
    assert.equal(res.statusCode, 200);
    const d = res.body.data;
    const skipped = d.skippedDetails.find((s) => String(s.ticketId) === String(tk.id));
    assert.ok(skipped, 'the pending ticket is reported');
    assert.equal(skipped.reason, 'Ticket has a pending allocation exception');
    assert.equal(d.updated, 1, 'the other ticket is still assigned');

    // …and nothing on the pending ticket was overwritten
    await tk.reload();
    assert.equal(String(tk.assigneeId), String(before.assigneeId));
    assert.equal(Number(tk.allocationHoursPerDay), before.hours);
    assert.equal(tk.allocationFrom, before.from);
    assert.equal((await ticketExc.ticketExceptionStatus(tk.id)).status, 'pending');
  } finally { await cleanup.run(); }
});

await t.test('reject restores the ASSIGNEE and the ORIGINAL team, not a re-derived one', async () => {
  const f = await fixtures();
  const cleanup = createCleanup();
  try {
    await seedBaseline(cleanup, f);
    const wd = E.workingDaysBetween(FROM, TO, f.calendar);

    // The ticket sits under a team manager that is deliberately NOT the assignee's
    // reporting manager, so restoring the snapshot and re-deriving from the
    // assignee give DIFFERENT answers — the assertion below can tell them apart.
    const derived = await teamSvc.resolveTeamFor({ assigneeId: f.agent.id });
    const ORIGINAL_TEAM = [f.approver.id, f.target.id, f.agent.id]
      .find((id) => String(id) !== String(derived.teamManagerId ?? ''));
    assert.ok(ORIGINAL_TEAM, 'need a team manager that differs from the re-derived one');
    assert.notEqual(String(ORIGINAL_TEAM), String(derived.teamManagerId ?? ''));

    // The ticket starts on the AGENT with a modest allocation…
    const tk = await seedTicket(cleanup, {
      title: 'exc-reassign', requesterId: f.agent.id, assigneeId: f.agent.id, teamManagerId: ORIGINAL_TEAM,
      allocationMode: 'per_day', allocationHoursPerDay: 1, allocationTotalHours: wd,
      allocationFrom: FROM, allocationTo: TO,
    });

    // …and the exception moves it to the (already full) target with more hours.
    const res = await run(ctrl.requestTicketAllocationException, req(hdUserFor(f.agent), {
      params: { id: String(tk.id) },
      body: { assigneeId: f.target.id, allocationMode: 'per_day', allocationHoursPerDay: 3, allocationFrom: FROM, allocationTo: TO, reason: 'cover' },
    }));
    assert.equal(res.statusCode, 201);
    await tk.reload();
    assert.equal(String(tk.assigneeId), String(f.target.id), 'reassigned while pending');

    const approval = await PmAllocationApproval.findOne({ where: { ticketId: tk.id } });
    assert.equal(String(approval.previousSnapshot.ticket.assigneeId), String(f.agent.id), 'snapshot captured the old assignee');
    assert.equal(String(approval.previousSnapshot.ticket.teamManagerId), String(ORIGINAL_TEAM), 'and the old team');

    await projectSvc.decideAllocationException(approval.id, { action: 'reject', responseNote: 'no' }, f.approver);
    await tk.reload();
    assert.equal(String(tk.assigneeId), String(f.agent.id), 'the reassignment is undone');
    assert.equal(Number(tk.allocationHoursPerDay), 1, 'and so is the allocation');
    // LITERAL expectation: the team the ticket actually had, not whatever
    // resolveTeamFor() would return now (which is `derived`, a different id).
    assert.equal(String(tk.teamManagerId ?? ''), String(ORIGINAL_TEAM), 'the original team is restored verbatim');

    // The decision is audited on BOTH trails — never a silent mutation
    const hist = await PmAllocationHistory.findAll({ where: { ticketId: tk.id }, raw: true });
    const rejectRow = hist.find(h => h.action === 'exception_reject');
    assert.ok(rejectRow, 'pm_allocation_history row written for the ticket');
    assert.equal(rejectRow.projectId, null);
    assert.equal(rejectRow.memberId, null);
    assert.equal(String(rejectRow.userId), String(approval.userId));

    const tkHist = await HdTicketHistory.findAll({ where: { ticketId: tk.id }, order: [['id', 'ASC']], raw: true });
    const assigneeRows = tkHist.filter(h => h.field === 'assigneeId');
    assert.equal(assigneeRows.length, 2, 'the REQUEST and the reject are both on the ticket timeline');
    assert.equal(String(assigneeRows[0].newValue), String(f.target.id), 'the request moved it');
    assert.equal(String(assigneeRows[1].newValue), String(f.agent.id), 'hd_ticket_history records the assignee going back');

    // The request is audited on the shared trail too
    assert.ok(hist.find(h => h.action === 'exception_request'), 'pm_allocation_history row for the request');
  } finally { await cleanup.run(); }
});

await t.test('the exception endpoint enforces the team rule (B6/B7)', async () => {
  const f = await fixtures();
  const cleanup = createCleanup();
  try {
    await seedBaseline(cleanup, f);
    const wd = E.workingDaysBetween(FROM, TO, f.calendar);
    const tk = await seedTicket(cleanup, {
      title: 'exc-team', requesterId: f.agent.id, assigneeId: f.agent.id,
      allocationMode: 'per_day', allocationHoursPerDay: 1, allocationTotalHours: wd,
      allocationFrom: FROM, allocationTo: TO,
    });

    // A REAL team (an active manager with active direct reports) that the chosen
    // assignee does not belong to — the 'Assignee is not in the selected team'
    // branch itself, not the easier "manager has no reports" rejection.
    let foreignTeam = null;
    for (const tm of await teamSvc.listTeams()) {
      const ids = (await teamSvc.teamMemberIds(tm.id)).map(String);
      if (ids.length > 1 && !ids.includes(String(f.agent.id))) { foreignTeam = tm; break; }
    }
    assert.ok(foreignTeam, 'UAT DB needs a team the agent is not a member of');

    const bad = await run(ctrl.requestTicketAllocationException, req(hdUserFor(f.agent), {
      params: { id: String(tk.id) },
      body: {
        assigneeId: f.agent.id, teamManagerId: foreignTeam.id,
        allocationMode: 'per_day', allocationHoursPerDay: 3, allocationFrom: FROM, allocationTo: TO, reason: 'nope',
      },
    }));
    assert.equal(bad.statusCode, 400);
    assert.equal(bad.body.error.message, bad.body.message, 'both body shapes carry the message');
    assert.equal(bad.body.message, 'Assignee is not in the selected team');
    assert.equal(await PmAllocationApproval.count({ where: { ticketId: tk.id } }), 0, 'no approval row was created');
    await tk.reload();
    assert.equal(String(tk.assigneeId), String(f.agent.id), 'the ticket was not touched');
    assert.equal(Number(tk.allocationHoursPerDay), 1);

    // The valid path still writes the team the shared rule resolves
    const ok = await run(ctrl.requestTicketAllocationException, req(hdUserFor(f.agent), {
      params: { id: String(tk.id) },
      body: {
        assigneeId: f.target.id,
        allocationMode: 'per_day', allocationHoursPerDay: 3, allocationFrom: FROM, allocationTo: TO, reason: 'cover',
      },
    }));
    assert.equal(ok.statusCode, 201);
    await tk.reload();
    const expected = await teamSvc.resolveTeamFor({ assigneeId: f.target.id });
    assert.equal(String(tk.assigneeId), String(expected.assigneeId));
    assert.equal(String(tk.teamManagerId ?? ''), String(expected.teamManagerId ?? ''));
  } finally { await cleanup.run(); }
});

await t.test('exceptionStatus is exposed by getTicket and (batched) by listTickets; a blocked edit says why', async () => {
  const f = await fixtures();
  const cleanup = createCleanup();
  try {
    const { tk, approval } = await withPendingException(cleanup, f);

    // getTicket
    const one = await run(ctrl.getTicket, req(hdUserFor(f.agent), { params: { id: String(tk.id) } }));
    assert.equal(one.statusCode, 200);
    assert.equal(one.body.data.exceptionStatus, 'pending');
    assert.equal(String(one.body.data.exceptionApprovalId), String(approval.id));

    // listTickets — every row carries the derived state
    const list = await run(ctrl.listTickets, req(hdUserFor(f.agent), { query: { search: tk.reqNumber } }));
    assert.equal(list.statusCode, 200);
    const row = list.body.data.tickets.find((x) => String(x._id ?? x.id) === String(tk.id));
    assert.ok(row, 'the ticket is listed');
    assert.equal(row.exceptionStatus, 'pending');

    // An edit while it is pending is refused with a reason the UI can branch on
    const blocked = await run(ctrl.updateTicket, req(hdUserFor(f.agent), {
      params: { id: String(tk.id) },
      body: { allocationMode: 'per_day', allocationHoursPerDay: 2, allocationFrom: FROM, allocationTo: TO },
    }));
    assert.equal(blocked.statusCode, 409);
    assert.equal(blocked.body.success, false);
    assert.equal(blocked.body.reason, 'pending_exception');
    assert.equal(String(blocked.body.exceptionApprovalId), String(approval.id));
    assert.equal(blocked.body.error.message, blocked.body.message);
    assert.match(blocked.body.message, /pending allocation exception/);

    // Once decided, the derived state follows through to the API
    await projectSvc.decideAllocationException(approval.id, { action: 'approve' }, f.approver);
    const after = await run(ctrl.getTicket, req(hdUserFor(f.agent), { params: { id: String(tk.id) } }));
    assert.equal(after.body.data.exceptionStatus, 'approved');
  } finally { await cleanup.run(); }
});

await t.test('listTickets derives exceptionStatus in ONE query — the count does not grow with rows', async () => {
  const f = await fixtures();
  const cleanup = createCleanup();
  try {
    await seedBaseline(cleanup, f);
    const tag = `batch${crypto.randomBytes(3).toString('hex')}`;
    const wd  = E.workingDaysBetween(FROM, TO, f.calendar);

    // THREE tickets, each with its own pending exception (a pending one is not
    // counted, so every request still only has to beat the baseline).
    const made = [];
    for (let i = 0; i < 3; i++) {
      const tk = await seedTicket(cleanup, {
        title: `${tag} ${i}`, requesterId: f.agent.id, assigneeId: f.target.id,
        allocationMode: 'per_day', allocationHoursPerDay: 1, allocationTotalHours: wd,
        allocationFrom: FROM, allocationTo: TO,
      });
      const r = await run(ctrl.requestTicketAllocationException, req(hdUserFor(f.agent), {
        params: { id: String(tk.id) },
        body: { allocationMode: 'per_day', allocationHoursPerDay: 3, allocationFrom: FROM, allocationTo: TO, reason: 'batch' },
      }));
      assert.equal(r.statusCode, 201);
      made.push(tk);
    }

    // Count the SQL that touches the approvals table while a page is built.
    let approvalQueries = 0;
    const prevLogging = sequelize.options.logging;
    sequelize.options.logging = (sql) => {
      if (/pm_allocation_approvals/i.test(String(sql))) approvalQueries += 1;
    };
    let one, three;
    try {
      approvalQueries = 0;
      const r1 = await run(ctrl.listTickets, req(hdUserFor(f.agent), { query: { search: `${tag} 0` } }));
      one = approvalQueries;
      assert.equal(r1.body.data.tickets.length, 1);

      approvalQueries = 0;
      const r3 = await run(ctrl.listTickets, req(hdUserFor(f.agent), { query: { search: tag } }));
      three = approvalQueries;
      assert.equal(r3.body.data.tickets.length, 3, 'all three rows are on the page');
      for (const row of r3.body.data.tickets) {
        assert.ok(made.some((tk) => String(tk.id) === String(row._id ?? row.id)), 'only the tagged tickets matched');
        assert.equal(row.exceptionStatus, 'pending');
      }
    } finally { sequelize.options.logging = prevLogging; }

    assert.ok(one > 0, 'the approvals table was queried at all (the counter works)');
    assert.equal(three, one, 'three rows cost the same number of approval queries as one');
  } finally { await cleanup.run(); }
});

await t.test('a fully rejected ticket reads exceptionStatus "none" with a NULL approvalId', async () => {
  const f = await fixtures();
  const cleanup = createCleanup();
  try {
    const { tk, approval } = await withPendingException(cleanup, f);
    await projectSvc.decideAllocationException(approval.id, { action: 'reject', responseNote: 'no' }, f.approver);

    // A decided-and-rejected row must not be handed back as "the ticket's exception"
    assert.deepEqual(await ticketExc.ticketExceptionStatus(tk.id), { status: 'none', approvalId: null });
    const one = await run(ctrl.getTicket, req(hdUserFor(f.agent), { params: { id: String(tk.id) } }));
    assert.equal(one.body.data.exceptionStatus, 'none');
    assert.equal(one.body.data.exceptionApprovalId, null);

    // …and the batched form agrees
    const map = await ticketExc.ticketExceptionStatuses([tk.id]);
    assert.equal(map.get(String(tk.id)), 'none');
  } finally { await cleanup.run(); }
});

await t.test('a request that only REASSIGNS an unallocated ticket is still undone by a reject', async () => {
  const f = await fixtures();
  const cleanup = createCleanup();
  try {
    await seedBaseline(cleanup, f);
    // No allocation at all, assigned to the agent — the old snapshot rule stored
    // NOTHING here, so a reject could not put the assignee back.
    const tk = await seedTicket(cleanup, {
      title: 'exc-null-snap', requesterId: f.agent.id, assigneeId: f.agent.id,
    });

    const res = await run(ctrl.requestTicketAllocationException, req(hdUserFor(f.agent), {
      params: { id: String(tk.id) },
      body: {
        assigneeId: f.target.id,
        allocationMode: 'per_day', allocationHoursPerDay: 3, allocationFrom: FROM, allocationTo: TO, reason: 'cover',
      },
    }));
    assert.equal(res.statusCode, 201);

    const approval = await PmAllocationApproval.findOne({ where: { ticketId: tk.id } });
    assert.ok(approval.previousSnapshot.ticket, 'the reassignment IS snapshotted even with no previous hours');
    assert.equal(approval.previousSnapshot.ticket.allocationHoursPerDay, null);
    assert.equal(String(approval.previousSnapshot.ticket.assigneeId), String(f.agent.id));
    await tk.reload();
    assert.equal(String(tk.assigneeId), String(f.target.id), 'reassigned while pending');

    await projectSvc.decideAllocationException(approval.id, { action: 'reject', responseNote: 'no' }, f.approver);
    await tk.reload();
    assert.equal(String(tk.assigneeId), String(f.agent.id), 'the reassignment is undone');
    assert.equal(tk.allocationHoursPerDay, null, 'and the introduced allocation is gone');
    assert.equal(tk.allocationTotalHours, null);
    assert.equal(tk.allocationFrom, null);
    assert.equal(tk.allocationTo, null);
  } finally { await cleanup.run(); }
});

await t.test('bulkAssign without dates keeps each ticket\'s total consistent with its OWN window', async () => {
  const f = await fixtures();
  const cleanup = createCleanup();
  try {
    // A window the target is free in, two tickets with DIFFERENT lengths.
    const aFrom = '2033-06-06', aTo = '2033-06-10';   // 5 working days
    const bFrom = '2033-06-06', bTo = '2033-06-08';   // 3 working days
    const aWd = E.workingDaysBetween(aFrom, aTo, f.calendar);
    const bWd = E.workingDaysBetween(bFrom, bTo, f.calendar);
    assert.notEqual(aWd, bWd, 'the two tickets must have different windows');

    // Each already carries a total that MATCHES its own window…
    const seed = { requesterId: f.agent.id, allocationMode: 'per_day', allocationHoursPerDay: 1 };
    const a = await seedTicket(cleanup, { ...seed, title: 'bulk-total-a', allocationFrom: aFrom, allocationTo: aTo, allocationTotalHours: aWd });
    const b = await seedTicket(cleanup, { ...seed, title: 'bulk-total-b', allocationFrom: bFrom, allocationTo: bTo, allocationTotalHours: bWd });

    // …and the batch sends hrs/day only — NO dates, so each keeps its own window
    // and its own (still correct) total. Whether the code recomputes per ticket or
    // leaves the stored total alone, the data must stay coherent.
    const res = await run(ctrl.bulkAssign, req(hdUserFor(f.agent), {
      body: { ticketIds: [a.id, b.id], assigneeId: f.target.id, allocationMode: 'per_day', allocationHoursPerDay: 1 },
    }));
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.updated, 2, res.body.data.skippedDetails?.map(s => s.reason).join('; '));

    await a.reload(); await b.reload();
    assert.equal(Number(a.allocationHoursPerDay), 1);
    assert.equal(a.allocationFrom, aFrom, 'its own window is untouched');
    assert.equal(a.allocationTo, aTo);
    assert.equal(Number(a.allocationTotalHours), aWd, 'total = hrs/day × THIS ticket\'s working days, never a shared null');
    assert.equal(Number(b.allocationTotalHours), bWd, '…and the shorter ticket keeps its own, smaller total');

    // Nothing changed about the total, so nothing may be logged about it
    for (const id of [a.id, b.id]) {
      const hist = await HdTicketHistory.findAll({ where: { ticketId: id, field: 'allocationTotalHours' }, raw: true });
      assert.equal(hist.length, 0, 'no spurious allocationTotalHours history row');
    }
  } finally { await cleanup.run(); }
});

await t.test('extending the DUE DATE re-checks capacity when the allocation has no explicit end', async () => {
  const f = await fixtures();
  const cleanup = createCleanup();
  try {
    await seedBaseline(cleanup, f);                       // fills FROM..TO
    // Allocated with NO allocationTo: the due date IS the end date.
    const tk = await seedTicket(cleanup, {
      title: 'due-date-end', requesterId: f.agent.id, assigneeId: f.target.id,
      allocationMode: 'per_day', allocationHoursPerDay: 1,
      allocationFrom: '2033-03-01', allocationTo: null, dueDate: '2033-03-04',
    });

    // Stretching the due date into the (full) baseline window is a capacity change
    const res = await run(ctrl.updateTicket, req(hdUserFor(f.agent), {
      params: { id: String(tk.id) }, body: { dueDate: TO },
    }));
    assertConflictBody(res, f);
    await tk.reload();
    assert.equal(E.iso(new Date(tk.dueDate)), '2033-03-04', 'the due date was not moved');

    // A due date that stays clear of the baseline is still accepted
    const ok = await run(ctrl.updateTicket, req(hdUserFor(f.agent), {
      params: { id: String(tk.id) }, body: { dueDate: '2033-03-03' },
    }));
    assert.equal(ok.statusCode, 200);
  } finally { await cleanup.run(); }
});

await t.test('migration 048 is idempotent — ticket rows are allowed in pm_allocation_history', async () => {
  await migration048.run();
  await migration048.run();
  const [cols] = await sequelize.query(
    `SELECT COLUMN_NAME c, IS_NULLABLE n FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pm_allocation_history'
        AND COLUMN_NAME IN ('ticketId', 'projectId', 'memberId')`
  );
  assert.equal(cols.length, 3);
  for (const c of cols) assert.equal(c.n, 'YES', `${c.c} accepts NULL`);
});

await t.test('migration 047 is idempotent and the column exists', async () => {
  await migration047.run();
  await migration047.run();
  const [cols] = await sequelize.query(
    `SELECT COLUMN_NAME c, IS_NULLABLE n FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pm_allocation_approvals'
        AND COLUMN_NAME IN ('ticketId', 'projectId')`
  );
  assert.equal(cols.length, 2);
  for (const c of cols) assert.equal(c.n, 'YES', `${c.c} accepts NULL`);
  const [[idx]] = await sequelize.query(
    `SELECT COUNT(*) cnt FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pm_allocation_approvals'
        AND INDEX_NAME = 'idx_pm_alloc_approvals_ticket'`
  );
  assert.ok(Number(idx.cnt) > 0, 'ticket index present');
});

} finally { await closeDb(); }
});
