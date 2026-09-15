/**
 * Audit fixes (2026-09-14):
 *   G1 one membership rule: override group wins over department group; only the
 *      lowest-id group of a department is that department's group
 *   G2 capacity members follow the same rule
 *   G3 bulkAssign: body.groupId is adopted by group-less tickets (history logged),
 *      never replaces an existing group
 *   G4 raisedByTeam for an external requester email (no matching user) is null,
 *      never the creating agent's department
 *   G5 link script never links a second helpdesk profile to the same PM project
 *      and copies the master name on link
 *
 * Writes only `__TEST__` hd_groups / hd_projects / pm_projects / hd_tickets (+ history).
 * The one user whose hd_group_id is changed is restored in `finally`.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const H = require('./_helpers');

const { HdGroup, HdProject, HdTicket, HdTicketHistory, Project } = require('../src/models/helpdesk');
const User = require('../src/models/User');
const membership = require('../src/services/helpdesk/groupMembership.service');
const ticketCtrl = require('../src/controllers/helpdesk/ticket.controller');
const capacityCtrl = require('../src/controllers/helpdesk/capacity.controller');
const linkScript = require('../scripts/link-hd-projects');

async function call(handler, { body = {}, params = {}, query = {}, hdUser }) {
  const res = H.mockRes();
  const next = H.mockNext();
  await handler({ body, params, query, hdUser, user: { _id: hdUser && hdUser.id } }, res, next);
  if (next.called && next.error) throw next.error;
  return res;
}

test('Group rules: one membership rule, bulk group adoption, external requester, link guard', async (t) => {
  const cleanup = H.createCleanup();
  try {
    // A department with ≥2 active group-less users and no real group backing it.
    const [dept] = await H.select(
      `SELECT d.id, d.name FROM departments d
        WHERE NOT EXISTS (SELECT 1 FROM hd_groups g WHERE g.department_id = d.id)
          AND (SELECT COUNT(*) FROM users u WHERE u.departmentId = d.id AND u.isActive = 1 AND u.hd_group_id IS NULL) >= 2
        ORDER BY d.id LIMIT 1`);
    assert.ok(dept, 'a department with two active users and no helpdesk group');
    const [a, b] = await H.select(
      `SELECT id, name, email, role, departmentId, hd_group_id AS hdGroupId FROM users
        WHERE departmentId = :d AND isActive = 1 AND hd_group_id IS NULL ORDER BY id LIMIT 2`, { d: dept.id });

    const deptGroup  = await HdGroup.create({ name: H.tag('g1 dept'), departmentId: dept.id });
    cleanup.add(() => HdGroup.destroy({ where: { id: deptGroup.id } }));
    const laterGroup = await HdGroup.create({ name: H.tag('g1 dept later'), departmentId: dept.id }); // higher id, same dept
    cleanup.add(() => HdGroup.destroy({ where: { id: laterGroup.id } }));
    const otherGroup = await HdGroup.create({ name: H.tag('g1 other') });
    cleanup.add(() => HdGroup.destroy({ where: { id: otherGroup.id } }));

    // b gets an override to otherGroup (restored at the end)
    await User.update({ hdGroupId: otherGroup.id }, { where: { id: b.id } });
    cleanup.add(() => User.update({ hdGroupId: b.hdGroupId ?? null }, { where: { id: b.id } }));

    const hdAdmin = H.fakeHdUser(a, 'admin');

    await t.test('G1 isGroupMember: department group (lowest id) vs later group vs override', async () => {
      assert.equal(await membership.isGroupMember(a.id, deptGroup.id), true, 'a → department group');
      assert.equal(await membership.isGroupMember(a.id, laterGroup.id), false, 'only the lowest-id group backs a department');
      assert.equal(await membership.isGroupMember(b.id, deptGroup.id), false, 'override elsewhere removes b from the department group');
      assert.equal(await membership.isGroupMember(b.id, otherGroup.id), true, 'b → override group');
      assert.equal(await ticketCtrl.isGroupMember(b.id, deptGroup.id), false, 'ticket controller uses the same rule');
    });

    await t.test('G2 capacity members follow the same rule', async () => {
      const res = await call(capacityCtrl.getGroupCapacity, { params: { groupId: String(deptGroup.id) }, query: {}, hdUser: hdAdmin });
      assert.equal(res.statusCode, 200, JSON.stringify(res.body));
      const ids = res.body.data.members.map((m) => String(m.userId));
      assert.ok(ids.includes(String(a.id)), 'a listed');
      assert.ok(!ids.includes(String(b.id)), 'b (override elsewhere) not listed');
      const later = await call(capacityCtrl.getGroupCapacity, { params: { groupId: String(laterGroup.id) }, query: {}, hdUser: hdAdmin });
      assert.ok(!later.body.data.members.some((m) => String(m.userId) === String(a.id)), 'later group of same dept has no dept members');
    });

    const trackTicket = (id) => cleanup.add(async () => {
      await HdTicketHistory.destroy({ where: { ticketId: id } });
      await HdTicket.destroy({ where: { id } });
    });
    const newTicket = async (fields) => {
      const row = await HdTicket.create({
        reqNumber: `${H.TEST_PREFIX}${crypto.randomBytes(5).toString('hex')}`,
        title: H.tag('g ticket'), status: 'open', priority: 'medium', ...fields,
      });
      trackTicket(row.id);
      return row;
    };

    await t.test('G3 bulkAssign adopts body.groupId for group-less tickets only', async () => {
      const groupless = await newTicket({ groupId: null });
      const inOther   = await newTicket({ groupId: otherGroup.id });
      const res = await call(ticketCtrl.bulkAssign, {
        body: { ticketIds: [groupless.id, inOther.id], assigneeId: a.id, groupId: deptGroup.id }, hdUser: hdAdmin,
      });
      assert.equal(res.statusCode, 200, JSON.stringify(res.body));
      assert.equal(res.body.data.updated, 1);
      assert.deepEqual(res.body.data.skipped, [inOther.id], 'ticket in another group is not moved and a is not its member');

      const g = await HdTicket.findByPk(groupless.id);
      assert.equal(g.groupId, deptGroup.id, 'group adopted');
      assert.equal(String(g.assigneeId), String(a.id));
      const hist = await HdTicketHistory.count({ where: { ticketId: groupless.id, field: 'groupId' } });
      assert.equal(hist, 1, 'group adoption logged');
      assert.equal((await HdTicket.findByPk(inOther.id)).groupId, otherGroup.id, 'existing group never replaced');

      const bad = await call(ticketCtrl.bulkAssign, {
        body: { ticketIds: [groupless.id], assigneeId: a.id, groupId: 999999999 }, hdUser: hdAdmin,
      });
      assert.equal(bad.statusCode, 400);
      assert.equal(bad.body.message, 'Selected group does not exist');
    });

    await t.test('G4 external requester email → raisedByTeam null (not the agent\'s department)', async () => {
      const external = `__test__${crypto.randomBytes(4).toString('hex')}@example.invalid`;
      assert.equal(await ticketCtrl.resolveRequesterDepartmentName(external, a.id), null);
      assert.equal(await ticketCtrl.resolveRequesterDepartmentName(null, a.id), dept.name, 'no email → the creating user');
      const res = await call(ticketCtrl.createTicket, {
        body: { title: H.tag('external'), groupId: deptGroup.id, requesterEmail: external }, hdUser: hdAdmin,
      });
      assert.equal(res.statusCode, 201, JSON.stringify(res.body));
      trackTicket(res.body.data._id);
      assert.equal(res.body.data.raisedByTeam ?? null, null);
    });

    await t.test('G5 link script: one profile per master; master name copied on link', async () => {
      const masterName = H.tag('g5 master');
      const master = await Project.create({ name: masterName, description: 'master desc', status: 'Active', billingType: 'Non-Billable', projectType: 'Operations', createdById: (await H.pickUser('admin')).id });
      cleanup.add(async () => { await HdProject.destroy({ where: { pmProjectId: master.id } }); await Project.destroy({ where: { id: master.id } }); });

      const p1 = await HdProject.create({ name: `  ${masterName.toUpperCase()} `, description: 'stale', status: 'Active', groupId: deptGroup.id, publicToken: crypto.randomUUID() });
      const p2 = await HdProject.create({ name: masterName, status: 'Active', groupId: deptGroup.id, publicToken: crypto.randomUUID() });
      cleanup.add(() => HdProject.destroy({ where: { id: [p1.id, p2.id] } }));

      const rows = await linkScript.plan({ hdIds: [p1.id, p2.id] });
      const byId = new Map(rows.map((r) => [r.hd.id, r]));
      assert.equal(byId.get(p1.id).action, 'link');
      assert.equal(byId.get(p2.id).action, 'skip', 'second profile for the same master is skipped');
      assert.match(byId.get(p2.id).reason || '', /already has a helpdesk profile/);

      await linkScript.apply(rows);
      const linked = await HdProject.findByPk(p1.id);
      assert.equal(linked.pmProjectId, master.id);
      assert.equal(linked.name, masterName, 'name copied from master');
      assert.equal(linked.description, 'master desc');
      assert.equal((await HdProject.findByPk(p2.id)).pmProjectId, null);
    });
  } finally {
    await cleanup.run();
    await H.closeDb();
  }
});
