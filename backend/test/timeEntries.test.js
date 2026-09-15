/**
 * Time entries (actual hours) — controller CRUD/validation/ownership and the
 * actuals that utilisation attaches beside the plan (DB).
 *
 * Fixture (all `__TEST__`, removed in `finally`, newest-first):
 *   project A  — employee allocated 4h/day for the whole current month
 *   milestone  — under project A
 *   project B  — NO allocation (its entry must surface as `unplanned:true`)
 *   ticket     — assigned to employee at 2h/day for the whole month
 *
 * User choice: the LAST free employee (highest id). allocation.test.js and
 * utilisation.test.js take offsets 0 and 1 from the TOP of the free list, and
 * that list shifts as they insert — a fixed offset from the top can race onto
 * their user; the last element only moves if fewer than three users are free.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const H = require('./_helpers');

const Project       = require('../src/models/pm/Project');
const ProjectMember = require('../src/models/pm/ProjectMember');
const Milestone     = require('../src/models/pm/Milestone');
const HdTicket      = require('../src/models/helpdesk/HdTicket');
const TimeEntry     = require('../src/models/TimeEntry');
const ctrl          = require('../src/controllers/timeEntry.controller');
const util          = require('../src/services/pm/utilisation.service');

const pad = (n) => String(n).padStart(2, '0');
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Same filter as H.pickFreeUser, but the highest id — see the header note. */
async function pickLastFreeEmployee() {
  const [row] = await H.select(
    `SELECT u.id, u.name, u.email, u.role FROM users u
      WHERE u.role = 'employee' AND u.isActive = 1
        AND u.id NOT IN (
          SELECT m.userId FROM pm_project_members m JOIN pm_projects p ON p.id = m.projectId
           WHERE p.status NOT IN ('completed','cancelled','closed'))
        AND u.id NOT IN (
          SELECT t.assignee_id FROM hd_tickets t
           WHERE t.assignee_id IS NOT NULL AND t.allocation_hours_per_day IS NOT NULL
             AND t.status NOT IN ('closed','resolved'))
      ORDER BY u.id DESC LIMIT 1`);
  if (!row) throw new Error('No free active employee in the test DB');
  return row;
}

/** Drive a controller handler with a fake req; throws if it fell through to next(err). */
async function call(fn, { user, body = {}, query = {}, params = {} }) {
  const res = H.mockRes();
  const next = H.mockNext();
  await fn({ user, body, query, params }, res, next);
  if (next.called) throw next.error;
  return res;
}

test('time entries: CRUD, validation, ownership and utilisation actuals', async (t) => {
  const cleanup = H.createCleanup();
  try {
    const managerRow = await H.pickUser('manager');
    const manager    = H.fakeUser(managerRow, 'manager');
    const admin      = H.fakeUser(managerRow, 'admin');          // role override — same person, admin hat
    const employee   = await pickLastFreeEmployee();
    const me         = H.fakeUser(employee, 'employee');
    const [otherRow] = await H.select(
      `SELECT id, name, email, role FROM users WHERE role = 'employee' AND isActive = 1 AND id <> :id ORDER BY id LIMIT 1`,
      { id: employee.id });
    assert.ok(otherRow, 'need a second active employee');
    const other = H.fakeUser(otherRow, 'employee');

    const now      = new Date();
    const monthKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
    const mStart   = `${monthKey}-01`;
    const mEnd     = isoOf(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    const today    = isoOf(now);
    const tomorrow = isoOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));

    // ── Fixture ──────────────────────────────────────────────────────────────
    const projectA = await Project.create({
      name: H.tag('time A'), managerId: managerRow.id, createdById: managerRow.id,
      status: 'In Progress', billingType: 'Non-Billable',
    });
    cleanup.add(async () => {
      await ProjectMember.destroy({ where: { projectId: projectA.id } });
      await Project.destroy({ where: { id: projectA.id } });
    });
    const projectB = await Project.create({
      name: H.tag('time B'), managerId: managerRow.id, createdById: managerRow.id,
      status: 'In Progress', billingType: 'Non-Billable',
    });
    cleanup.add(() => Project.destroy({ where: { id: projectB.id } }));

    await ProjectMember.create({
      projectId: projectA.id, userId: employee.id, hoursPerDay: 4, allocationMode: 'per_day',
      allocationFrom: mStart, allocationTo: mEnd, hoursConfirmed: true,
    });

    const milestone = await Milestone.create({ projectId: projectA.id, name: H.tag('time ms'), isDefault: false });
    cleanup.add(() => Milestone.destroy({ where: { id: milestone.id } }));

    const reqNumber = ('__TEST__' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5)).slice(0, 20);
    const ticket = await HdTicket.create({
      reqNumber, title: '__TEST__ time entry ticket', status: 'open', priority: 'medium',
      assigneeId: employee.id, allocationMode: 'per_day', allocationHoursPerDay: 2,
      allocationFrom: mStart, allocationTo: mEnd,
    });
    cleanup.add(() => HdTicket.destroy({ where: { id: ticket.id } }));

    const entityIds = [String(ticket.id), milestone.id, projectA.id, projectB.id];
    cleanup.add(() => TimeEntry.destroy({ where: { entityId: entityIds } }));

    const post = (user, body) => call(ctrl.create, { user, body });
    let ticketEntryId;

    await t.test('POST: one entry per entity type → 201 with the documented shape', async () => {
      const r1 = await post(me, { entityType: 'ticket', entityId: ticket.id, date: mStart, hours: 1.5, note: 'triage' });
      assert.equal(r1.statusCode, 201, JSON.stringify(r1.body));
      assert.equal(r1.body.success, true);
      const e = r1.body.data;
      assert.ok(e._id && !('id' in e));
      assert.equal(e.entityType, 'ticket');
      assert.equal(e.entityId, String(ticket.id));
      assert.equal(e.userId, String(employee.id));
      assert.equal(e.userName, employee.name);
      assert.equal(e.date, mStart);
      assert.equal(e.hours, 1.5);
      assert.equal(e.note, 'triage');
      assert.equal(e.createdById, String(employee.id));
      assert.ok(e.createdAt);
      ticketEntryId = e._id;

      const r2 = await post(me, { entityType: 'milestone', entityId: milestone.id, date: today, hours: 2 });
      assert.equal(r2.statusCode, 201, JSON.stringify(r2.body));
      assert.equal(r2.body.data.note, null);

      const r3 = await post(me, { entityType: 'project', entityId: projectA.id, date: mStart, hours: 3 });
      assert.equal(r3.statusCode, 201, JSON.stringify(r3.body));

      // Project the employee is NOT allocated to — must still be accepted.
      const r4 = await post(me, { entityType: 'project', entityId: projectB.id, date: mStart, hours: 1 });
      assert.equal(r4.statusCode, 201, JSON.stringify(r4.body));
    });

    await t.test('POST validation: 400s use the unified { success:false, message, error:{ message } }', async () => {
      const bad = async (body, re) => {
        const r = await post(me, body);
        assert.equal(r.statusCode, 400, JSON.stringify(r.body));
        assert.deepEqual(Object.keys(r.body).sort(), ['error', 'message', 'success']);
        assert.deepEqual(r.body.error, { message: r.body.message });
        assert.equal(r.body.success, false);
        assert.match(r.body.message, re);
      };
      await bad({ entityType: 'ticket', entityId: ticket.id, date: mStart, hours: 0.3 }, /steps of 0.25/);
      await bad({ entityType: 'ticket', entityId: ticket.id, date: mStart, hours: 0 }, /between 0.25 and 24/);
      await bad({ entityType: 'ticket', entityId: ticket.id, date: mStart, hours: 24.25 }, /between 0.25 and 24/);
      await bad({ entityType: 'ticket', entityId: ticket.id, date: mStart, hours: 'abc' }, /number/);
      await bad({ entityType: 'ticket', entityId: ticket.id, date: tomorrow, hours: 1 }, /future/);
      await bad({ entityType: 'ticket', entityId: ticket.id, date: '13/09/2026', hours: 1 }, /YYYY-MM-DD/);
      await bad({ entityType: 'ticket', entityId: ticket.id, date: mStart, hours: 1, note: 'x'.repeat(501) }, /500/);
      await bad({ entityType: 'epic', entityId: ticket.id, date: mStart, hours: 1 }, /entityType/);
      await bad({ entityType: 'ticket', date: mStart, hours: 1 }, /entityId/);
    });

    await t.test('POST unknown entity → 404 for every type', async () => {
      const ghost = '00000000-0000-4000-8000-000000000000';
      for (const [entityType, entityId] of [['ticket', 999999999], ['milestone', ghost], ['project', ghost]]) {
        const r = await post(me, { entityType, entityId, date: mStart, hours: 1 });
        assert.equal(r.statusCode, 404, `${entityType}: ${JSON.stringify(r.body)}`);
        assert.equal(r.body.success, false);
      }
    });

    await t.test('POST userId: employee cannot log for others (403); manager can (201)', async () => {
      const r1 = await post(me, { entityType: 'ticket', entityId: ticket.id, date: mStart, hours: 1, userId: otherRow.id });
      assert.equal(r1.statusCode, 403);
      const r2 = await post(manager, { entityType: 'ticket', entityId: ticket.id, date: today, hours: 0.25, userId: employee.id });
      assert.equal(r2.statusCode, 201, JSON.stringify(r2.body));
      assert.equal(r2.body.data.userId, String(employee.id));
      assert.equal(r2.body.data.createdById, String(managerRow.id));
      const r3 = await post(manager, { entityType: 'ticket', entityId: ticket.id, date: today, hours: 1, userId: '00000000-0000-4000-8000-000000000000' });
      assert.equal(r3.statusCode, 404);
    });

    await t.test('GET list: both params required; ordered date desc', async () => {
      const r0 = await call(ctrl.list, { user: me, query: { entityType: 'ticket' } });
      assert.equal(r0.statusCode, 400);
      assert.deepEqual(Object.keys(r0.body).sort(), ['error', 'message', 'success']);
      assert.deepEqual(r0.body.error, { message: r0.body.message });
      const r = await call(ctrl.list, { user: other, query: { entityType: 'ticket', entityId: ticket.id } });
      assert.equal(r.statusCode, 200);
      const rows = r.body.data;
      assert.equal(rows.length, 2);
      assert.ok(rows[0].date >= rows[1].date);
      for (const row of rows) {
        assert.deepEqual(Object.keys(row).sort(),
          ['_id', 'createdAt', 'createdById', 'date', 'entityId', 'entityType', 'hours', 'note', 'updatedAt', 'userId', 'userName'].sort());
      }
    });

    await t.test('GET summary: totals, byUser, byDate', async () => {
      const r = await call(ctrl.summary, { user: other, query: { entityType: 'ticket', entityId: ticket.id } });
      assert.equal(r.statusCode, 200);
      const s = r.body.data;
      assert.equal(s.totalHours, 1.75);
      assert.equal(s.entries, 2);
      assert.deepEqual(s.byUser, [{ userId: String(employee.id), name: employee.name, hours: 1.75 }]);
      const dates = s.byDate.map(d => d.date);
      assert.deepEqual(dates, [...new Set([today, mStart])].sort().reverse());
      assert.equal(s.byDate.reduce((a, d) => a + d.hours, 0), 1.75);
    });

    await t.test('PUT: other employee 403, owner 200 with validation, admin 200', async () => {
      const r1 = await call(ctrl.update, { user: other, params: { id: ticketEntryId }, body: { hours: 2 } });
      assert.equal(r1.statusCode, 403);
      const r2 = await call(ctrl.update, { user: me, params: { id: ticketEntryId }, body: { hours: 0.1 } });
      assert.equal(r2.statusCode, 400);
      const r3 = await call(ctrl.update, { user: me, params: { id: ticketEntryId }, body: { hours: 2, note: 'fixed' } });
      assert.equal(r3.statusCode, 200, JSON.stringify(r3.body));
      assert.equal(r3.body.data.hours, 2);
      assert.equal(r3.body.data.note, 'fixed');
      const r4 = await call(ctrl.update, { user: admin, params: { id: ticketEntryId }, body: { hours: 2.5 } });
      assert.equal(r4.statusCode, 200);
      const r5 = await call(ctrl.update, { user: me, params: { id: '00000000-0000-4000-8000-000000000000' }, body: { hours: 1 } });
      assert.equal(r5.statusCode, 404);
    });

    await t.test('DELETE: other employee 403, owner 200', async () => {
      const r1 = await call(ctrl.remove, { user: other, params: { id: ticketEntryId } });
      assert.equal(r1.statusCode, 403);
      const r2 = await call(ctrl.remove, { user: me, params: { id: ticketEntryId } });
      assert.equal(r2.statusCode, 200);
      assert.equal(r2.body.data._id, ticketEntryId);
      const r3 = await call(ctrl.remove, { user: me, params: { id: ticketEntryId } });
      assert.equal(r3.statusCode, 404);
      const list = await call(ctrl.list, { user: me, query: { entityType: 'ticket', entityId: ticket.id } });
      assert.equal(list.body.data.length, 1);
    });

    // Remaining entries for the employee this month:
    //   ticket 0.25 (manager-logged) · milestone 2 (→ project A) · project A 3 · project B 1 (unplanned)
    await t.test('getUserUtilisation: actualHours per line, milestone rolled into project, unplanned line, totals', async () => {
      const u = await util.getUserUtilisation(employee.id, monthKey);
      const pmA = u.lines.find(l => l.source === 'project' && l.refId === projectA.id);
      const hd  = u.lines.find(l => l.source === 'helpdesk' && String(l.refId) === String(ticket.id));
      const pmB = u.lines.find(l => l.source === 'project' && l.refId === projectB.id);
      assert.ok(pmA && hd && pmB, JSON.stringify(u.lines.map(l => [l.source, l.refId, l.unplanned])));
      assert.equal(pmA.actualHours, 5);           // 3 direct + 2 via milestone
      assert.equal(pmA.unplanned, undefined);
      assert.ok(pmA.hours > 0, 'planned hours untouched');
      assert.equal(hd.actualHours, 0.25);
      assert.equal(pmB.unplanned, true);
      assert.equal(pmB.actualHours, 1);
      assert.equal(pmB.hours, 0);
      assert.equal(pmB.pct, 0);
      assert.equal(pmB.hoursPerDay, null);
      assert.equal(pmB.name, projectB.name);
      assert.equal(u.actualPmHours, 6);
      assert.equal(u.actualHdHours, 0.25);
      assert.equal(u.actualTotalHours, 6.25);
      assert.equal(u.actualPct, Math.round((6.25 / u.capacity.totalHours) * 1000) / 10);
      // Planned totals exclude the unplanned line.
      assert.equal(u.totalHours, u.pmHours + u.hdHours);
      assert.equal(u.pmHours, pmA.hours);
    });

    await t.test('getTeamUtilisation: cell carries actualTotalHours / actualPct', async () => {
      const team = await util.getTeamUtilisation({ userIds: [employee.id], from: monthKey, to: monthKey });
      const cell = team.users[0].cells[0];
      assert.equal(cell.actualTotalHours, 6.25);
      assert.equal(cell.actualPmHours, 6);
      assert.equal(cell.actualHdHours, 0.25);
      assert.equal(cell.actualPct, Math.round((6.25 / team.months[0].totalHours) * 1000) / 10);
      assert.ok(cell.totalHours > 0);
    });
  } finally {
    await cleanup.run();
    await H.closeDb();
  }
});
