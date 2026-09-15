/**
 * Capacity-based assignee suggestion (DB) — controllers/helpdesk/capacity.controller.js.
 *
 * No real hd_group has >= 2 members in the test DB, so the test creates a temp
 * `__TEST__` group and temporarily attaches 2–3 allocation-free employees that
 * have NO helpdesk group (hd_group_id restored to NULL afterwards). One of
 * them then gets a temp 8h/day project membership over the window.
 * Everything is removed in `finally`.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const H = require('./_helpers');

const Project       = require('../src/models/pm/Project');
const ProjectMember = require('../src/models/pm/ProjectMember');
const HdGroup       = require('../src/models/helpdesk/HdGroup');
const pmSettingsService = require('../src/services/pm/pmSettings.service');
const ctrl = require('../src/controllers/helpdesk/capacity.controller');

const FROM = '2026-10-05', TO = '2026-10-16';   // two full working weeks

const call = async (handler, { params = {}, query = {} }, hdUser) => {
  const res = H.mockRes(); const next = H.mockNext();
  await handler({ params, query, hdUser, user: hdUser }, res, next);
  if (next.called) throw next.error;
  return res;
};

/** Allocation-free, group-free active employees beyond the offsets other test files use (0 and 1). */
async function pickGroupFreeUsers(count) {
  const rows = await H.select(
    `SELECT u.id, u.name, u.email, u.role, u.hd_group_id AS hdGroupId FROM users u
      WHERE u.role = 'employee' AND u.isActive = 1
        AND u.id NOT IN (
          SELECT m.userId FROM pm_project_members m JOIN pm_projects p ON p.id = m.projectId
           WHERE p.status NOT IN ('completed','cancelled','closed'))
        AND u.id NOT IN (
          SELECT t.assignee_id FROM hd_tickets t
           WHERE t.assignee_id IS NOT NULL AND t.allocation_hours_per_day IS NOT NULL
             AND t.status NOT IN ('closed','resolved'))
      ORDER BY u.id LIMIT 20 OFFSET 2`);
  const free = rows.filter(r => r.hdGroupId == null).slice(0, count);
  if (free.length < 2) throw new Error('Need >= 2 allocation-free employees without a helpdesk group');
  return free;
}

test('capacity suggestion: group members, sorting, suggested, validation, allocation impact', async (t) => {
  const cleanup = H.createCleanup();
  try {
    const managerRow = await H.pickUser('manager');
    const hdUser     = H.fakeHdUser(managerRow, 'manager');
    const cal        = await pmSettingsService.getCalendar();
    const cap        = cal.hoursPerDay;

    const group = await HdGroup.create({ name: H.tag('capacity group').slice(0, 120) });
    cleanup.add(() => HdGroup.destroy({ where: { id: group.id } }));

    const users = await pickGroupFreeUsers(4);
    const ids   = users.map(u => String(u.id));
    await H.sequelize.query('UPDATE users SET hd_group_id = :gid WHERE id IN (:ids) AND hd_group_id IS NULL',
      { replacements: { gid: group.id, ids } });
    cleanup.add(() => H.sequelize.query('UPDATE users SET hd_group_id = NULL WHERE id IN (:ids) AND hd_group_id = :gid',
      { replacements: { gid: group.id, ids } }));

    const isSortedByAvailability = (members) => members.every((m, i) => {
      if (i === 0) return true;
      const p = members[i - 1];
      return p.freeHours > m.freeHours ||
        (p.freeHours === m.freeHours && (p.openTickets < m.openTickets ||
          (p.openTickets === m.openTickets && p.name.localeCompare(m.name) <= 0)));
    });

    await t.test('group route → 200, all members free, sorted, suggested = first <= 3', async () => {
      const res = await call(ctrl.getGroupCapacity, { params: { groupId: String(group.id) }, query: { from: FROM, to: TO } }, hdUser);
      assert.equal(res.statusCode, 200);
      const d = res.body.data;
      assert.equal(d.from, FROM); assert.equal(d.to, TO);
      assert.equal(typeof d.capacity, 'number'); assert.equal(d.capacity, cap);
      assert.equal(d.groupId, group.id); assert.equal(d.groupName, group.name);
      assert.equal(d.members.length, ids.length);
      assert.deepEqual([...d.members.map(m => m.userId)].sort(), [...ids].sort());
      for (const m of d.members) {
        assert.equal(m.freeHours, cap);
        assert.equal(m.peakHours, 0);
        assert.equal(m.isOverAllocated, false);
        assert.equal(m.allocationsCount, 0);
        assert.equal(typeof m.openTickets, 'number');
        assert.ok(m.name && m.email);
      }
      assert.ok(isSortedByAvailability(d.members));
      assert.deepEqual(d.suggested, d.members.slice(0, 3).map(m => m.userId));
      assert.ok(d.suggested.length <= 3 && d.suggested.length >= 2);
    });

    await t.test('defaults: no from/to → today + 14 days', async () => {
      const res = await call(ctrl.getGroupCapacity, { params: { groupId: String(group.id) }, query: {} }, hdUser);
      assert.equal(res.statusCode, 200);
      const { from, to } = res.body.data;
      assert.match(from, /^\d{4}-\d{2}-\d{2}$/);
      const [y, m, d] = from.split('-').map(Number);
      const exp = new Date(y, m - 1, d + 14);
      assert.equal(to, `${exp.getFullYear()}-${String(exp.getMonth() + 1).padStart(2, '0')}-${String(exp.getDate()).padStart(2, '0')}`);
    });

    await t.test('bad dates → 400', async () => {
      for (const query of [{ from: 'nope' }, { from: '2026-13-01' }, { to: '2026-02-30' }, { from: '2026-10-10', to: '2026-10-01' }]) {
        const res = await call(ctrl.getGroupCapacity, { params: { groupId: String(group.id) }, query }, hdUser);
        assert.equal(res.statusCode, 400, JSON.stringify(query));
        assert.equal(res.body.success, false);
      }
      const res = await call(ctrl.getUsersCapacity, { query: { userIds: ids[0], from: 'x' } }, hdUser);
      assert.equal(res.statusCode, 400);
    });

    await t.test('unknown group → 404; userIds missing → 400', async () => {
      const res = await call(ctrl.getGroupCapacity, { params: { groupId: '999999999' }, query: {} }, hdUser);
      assert.equal(res.statusCode, 404);
      const res2 = await call(ctrl.getUsersCapacity, { query: {} }, hdUser);
      assert.equal(res2.statusCode, 400);
    });

    await t.test('userIds variant with two ids → both present, unknown ids dropped', async () => {
      const res = await call(ctrl.getUsersCapacity, { query: { userIds: `${ids[0]},${ids[1]},not-a-user`, from: FROM, to: TO } }, hdUser);
      assert.equal(res.statusCode, 200);
      const d = res.body.data;
      assert.equal(d.groupId, null); assert.equal(d.groupName, null);
      assert.deepEqual(d.members.map(m => m.userId).sort(), [ids[0], ids[1]].sort());
      assert.deepEqual(d.suggested.sort(), [ids[0], ids[1]].sort());
    });

    await t.test('an 8h/day allocation over the window drops freeHours to 0 and demotes the member', async () => {
      const victim = ids[ids.length - 1];
      const project = await Project.create({
        name: H.tag('capacity'), managerId: managerRow.id, createdById: managerRow.id,
        status: 'In Progress', billingType: 'Non-Billable',
      });
      cleanup.add(async () => {
        await ProjectMember.destroy({ where: { projectId: project.id } });
        await Project.destroy({ where: { id: project.id } });
      });
      await ProjectMember.create({
        projectId: project.id, userId: victim, role: 'Developer',
        hoursPerDay: cap, hoursConfirmed: true, allocationMode: 'per_day',
        allocationFrom: FROM, allocationTo: TO,
      });

      const res = await call(ctrl.getGroupCapacity, { params: { groupId: String(group.id) }, query: { from: FROM, to: TO } }, hdUser);
      assert.equal(res.statusCode, 200);
      const d = res.body.data;
      const me = d.members.find(m => m.userId === victim);
      assert.ok(me);
      assert.equal(me.freeHours, 0);
      assert.equal(me.peakHours, cap);
      assert.equal(me.allocationsCount, 1);
      assert.equal(me.isOverAllocated, false);
      assert.equal(me.nextFreeDate, null);
      assert.equal(d.members[d.members.length - 1].userId, victim, 'fully allocated member sorts last');
      assert.ok(isSortedByAvailability(d.members));
      if (ids.length >= 4) assert.ok(!d.suggested.includes(victim), 'not suggested when 3 freer members exist');
      else assert.equal(d.suggested[d.suggested.length - 1], victim);

      // Outside the window the member is free again.
      const later = await call(ctrl.getGroupCapacity, { params: { groupId: String(group.id) }, query: { from: '2026-11-02', to: '2026-11-06' } }, hdUser);
      assert.equal(later.body.data.members.find(m => m.userId === victim).freeHours, cap);
    });
  } finally {
    await cleanup.run();
    await H.closeDb();
  }
});
