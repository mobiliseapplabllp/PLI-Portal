/**
 * Teams & managers reuse (DB): helpdesk groups backed by KPI departments,
 * managers validated against users, ticket group auto-fill, raisedByTeam
 * derived from the requester's department, assignee-in-group checks and the
 * default-approver resolution.
 *
 * Writes only `__TEST__` hd_groups / hd_projects / hd_tickets (+ their history
 * and approvals) and removes them again. `departments` and `users` are never
 * written — the test picks existing users and only reads them.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const H = require('./_helpers');

// createTicket / requestApproval notify real users by email; never do that from a test process.
delete process.env.SMTP_HOST;

const { HdGroup, HdProject, HdTicket, HdTicketHistory, HdTicketApproval } = require('../src/models/helpdesk');
const ticketCtrl   = require('../src/controllers/helpdesk/ticket.controller');
const approvalCtrl = require('../src/controllers/helpdesk/approval.controller');
const { helpdeskAuth } = require('../src/middleware/helpdeskAuth');
const { NotFoundError } = require('../src/utils/errors');

const NOT_IN_GROUP = 'Assignee is not a member of the selected group';
const GROUP_REQUIRED = 'Select a servicing group for this ticket';

/** Run helpdeskAuth to completion (it resolves the group asynchronously). */
const runAuth = (user) => new Promise((resolve, reject) => {
  const req = { user };
  helpdeskAuth(req, {}, (e) => (e ? reject(e) : resolve(req.hdUser)));
});

/** Call a controller with a fake request; returns { res, next }. */
async function call(handler, { body = {}, params = {}, query = {}, hdUser }) {
  const res = H.mockRes();
  const next = H.mockNext();
  await handler({ body, params, query, hdUser, user: { _id: hdUser.id } }, res, next);
  return { res, next };
}

test('Teams & managers: departments back groups, managers default approvals', async (t) => {
  const cleanup = H.createCleanup();
  try {
    // ── Fixtures: a department with an active user whose manager is active ──
    const [dept] = await H.select(
      `SELECT d.id, d.name FROM departments d
        WHERE NOT EXISTS (SELECT 1 FROM hd_groups g WHERE g.department_id = d.id)
          AND EXISTS (SELECT 1 FROM users u JOIN users m ON m.id = u.managerId AND m.isActive = 1
                       WHERE u.departmentId = d.id AND u.isActive = 1 AND u.hd_group_id IS NULL)
        ORDER BY (SELECT COUNT(*) FROM users u WHERE u.departmentId = d.id AND u.isActive = 1) DESC, d.id
        LIMIT 1`);
    assert.ok(dept, 'a department with an active user who has an active reporting manager');

    const [insider] = await H.select(
      `SELECT u.id, u.name, u.email, u.role, u.managerId, u.departmentId FROM users u
         JOIN users m ON m.id = u.managerId AND m.isActive = 1
        WHERE u.departmentId = :d AND u.isActive = 1 AND u.hd_group_id IS NULL
        ORDER BY u.id LIMIT 1`, { d: dept.id });
    const [outsider] = await H.select(
      `SELECT u.id, u.name, u.email, u.role, u.departmentId, d.name AS departmentName FROM users u
         LEFT JOIN departments d ON d.id = u.departmentId
        WHERE u.isActive = 1 AND u.hd_group_id IS NULL AND (u.departmentId IS NULL OR u.departmentId <> :d)
        ORDER BY u.id LIMIT 1`, { d: dept.id });
    assert.ok(insider && outsider, 'an insider and an outsider user');

    // A user with no usable reporting manager — optional, drives the group_manager / none paths.
    const [orphan] = await H.select(
      `SELECT u.id, u.name, u.email, u.role FROM users u
         LEFT JOIN users m ON m.id = u.managerId AND m.isActive = 1
        WHERE u.isActive = 1 AND m.id IS NULL ORDER BY u.id LIMIT 1`);

    const group = await HdGroup.create({ name: H.tag('group'), departmentId: dept.id });
    cleanup.add(() => HdGroup.destroy({ where: { id: group.id } }));

    const project = await HdProject.create({
      name: H.tag('project'), groupId: group.id, publicToken: crypto.randomBytes(16).toString('hex'),
    });
    cleanup.add(() => HdProject.destroy({ where: { id: project.id } }));

    const trackTicket = (id) => cleanup.add(async () => {
      await HdTicketApproval.destroy({ where: { ticketId: id } });
      await HdTicketHistory.destroy({ where: { ticketId: id } });
      await HdTicket.destroy({ where: { id } });
    });
    const newTicket = async (fields) => {
      const row = await HdTicket.create({
        reqNumber: `${H.TEST_PREFIX}${crypto.randomBytes(5).toString('hex')}`, // ≤ 20 chars
        title: H.tag('ticket'), status: 'open', priority: 'medium', ...fields,
      });
      trackTicket(row.id);
      return row;
    };

    // Insider acts as an admin so every controller path is open to them.
    const hdInsider = H.fakeHdUser(insider, 'admin');

    await t.test('isGroupMember: department member true, other department false', async () => {
      assert.equal(await ticketCtrl.isGroupMember(insider.id, group.id), true);
      assert.equal(await ticketCtrl.isGroupMember(outsider.id, group.id), false);
      assert.equal(await ticketCtrl.isGroupMember(insider.id, 0), false);
      assert.equal(await ticketCtrl.isGroupMember(insider.id, 999999999), false, 'unknown group');
    });

    await t.test('createTicket: groupId auto-filled from the project, raisedByTeam = requester department', async () => {
      const { res, next } = await call(ticketCtrl.createTicket, {
        body: { title: H.tag('auto group'), projectId: project.id, raisedByTeam: 'Body Team' }, hdUser: hdInsider,
      });
      assert.equal(next.called, false, next.error?.message);
      assert.equal(res.statusCode, 201, JSON.stringify(res.body));
      trackTicket(res.body.data._id);
      assert.equal(res.body.data.groupId, group.id);
      assert.equal(res.body.data.projectId, project.id);
      assert.equal(res.body.data.raisedByTeam, dept.name);
    });

    await t.test('createTicket: requesterEmail (any case) picks that user\'s department; body value never used', async () => {
      const { res } = await call(ticketCtrl.createTicket, {
        body: { title: H.tag('on behalf'), groupId: group.id, raisedByTeam: 'Body Team', requesterEmail: outsider.email.toUpperCase() },
        hdUser: hdInsider,
      });
      assert.equal(res.statusCode, 201, JSON.stringify(res.body));
      trackTicket(res.body.data._id);
      assert.equal(res.body.data.raisedByTeam, outsider.departmentName || null);
      assert.equal(res.body.data.groupId, group.id);

      const noGroup = await call(ticketCtrl.createTicket, {
        body: { title: H.tag('no group'), requesterEmail: outsider.email }, hdUser: hdInsider,
      });
      assert.equal(noGroup.res.statusCode, 400, 'no project, no group sent → 400');
      assert.deepEqual(noGroup.res.body, { success: false, message: GROUP_REQUIRED, error: { message: GROUP_REQUIRED } });
    });

    await t.test('createTicket: assignee outside the group → 400; department member → 201', async () => {
      const bad = await call(ticketCtrl.createTicket, {
        body: { title: H.tag('bad assignee'), groupId: group.id, assigneeId: outsider.id }, hdUser: hdInsider,
      });
      assert.equal(bad.res.statusCode, 400);
      assert.deepEqual(bad.res.body, { success: false, message: NOT_IN_GROUP, error: { message: NOT_IN_GROUP } });

      const ok = await call(ticketCtrl.createTicket, {
        body: { title: H.tag('good assignee'), projectId: project.id, assigneeId: insider.id }, hdUser: hdInsider,
      });
      assert.equal(ok.res.statusCode, 201, JSON.stringify(ok.res.body));
      trackTicket(ok.res.body.data._id);
      assert.equal(ok.res.body.data.assigneeId, insider.id);
    });

    await t.test('updateTicket: untouched assignee/group never blocks; changing them into a mismatch or no group does', async () => {
      const legacy = await newTicket({ requesterId: insider.id, assigneeId: outsider.id, groupId: null });

      const title = await call(ticketCtrl.updateTicket, { params: { id: legacy.id }, body: { title: H.tag('renamed') }, hdUser: hdInsider });
      assert.equal(title.res.statusCode, 200, JSON.stringify(title.res.body));

      const same = await call(ticketCtrl.updateTicket, {
        params: { id: legacy.id }, body: { assigneeId: outsider.id, groupId: null, priority: 'high' }, hdUser: hdInsider,
      });
      assert.equal(same.res.statusCode, 200, 'same values re-sent are not a change');

      const back = await call(ticketCtrl.updateTicket, { params: { id: legacy.id }, body: { groupId: group.id }, hdUser: hdInsider });
      assert.equal(back.res.statusCode, 400);
      assert.deepEqual(back.res.body, { success: false, message: NOT_IN_GROUP, error: { message: NOT_IN_GROUP } });

      const fix = await call(ticketCtrl.updateTicket, { params: { id: legacy.id }, body: { groupId: group.id, assigneeId: insider.id }, hdUser: hdInsider });
      assert.equal(fix.res.statusCode, 200, JSON.stringify(fix.res.body));

      const clear = await call(ticketCtrl.updateTicket, { params: { id: legacy.id }, body: { groupId: null }, hdUser: hdInsider });
      assert.equal(clear.res.statusCode, 400, 'clearing the group is refused');
      assert.deepEqual(clear.res.body, { success: false, message: GROUP_REQUIRED, error: { message: GROUP_REQUIRED } });
    });

    await t.test('bulkAssign: skips tickets whose group excludes the assignee, assigns the rest', async () => {
      const grouped   = await newTicket({ requesterId: insider.id, groupId: group.id });
      const grouped2  = await newTicket({ requesterId: insider.id, groupId: group.id });
      const { res } = await call(ticketCtrl.bulkAssign, {
        body: { ticketIds: [grouped.id], assigneeId: outsider.id }, hdUser: hdInsider,
      });
      assert.equal(res.statusCode, 200, JSON.stringify(res.body));
      assert.equal(res.body.data.updated, 0);
      assert.deepEqual(res.body.data.skipped, [grouped.id]);
      assert.equal(res.body.data.skippedReason, NOT_IN_GROUP);
      assert.equal((await HdTicket.findByPk(grouped.id)).assigneeId, null);

      const ok = await call(ticketCtrl.bulkAssign, {
        body: { ticketIds: [grouped2.id], assigneeId: insider.id }, hdUser: hdInsider,
      });
      assert.equal(ok.res.body.data.updated, 1);
      assert.deepEqual(ok.res.body.data.skipped, []);
      assert.equal((await HdTicket.findByPk(grouped2.id)).assigneeId, insider.id);
    });

    await t.test('getDefaultApprover: requester with an active manager → reporting_manager', async () => {
      const ticket = await newTicket({ requesterId: insider.id, groupId: group.id });
      const { res, next } = await call(approvalCtrl.getDefaultApprover, { params: { ticketId: ticket.id }, hdUser: hdInsider });
      assert.equal(next.called, false, next.error?.message);
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.data.userId, insider.managerId);
      assert.equal(res.body.data.source, 'reporting_manager');
      assert.ok(res.body.data.name && res.body.data.email);

      const missing = await call(approvalCtrl.getDefaultApprover, { params: { ticketId: 0 }, hdUser: hdInsider });
      assert.ok(missing.next.error instanceof NotFoundError);
    });

    await t.test('getDefaultApprover: no reporting manager → group manager → none', { skip: !orphan && 'no active user without a usable manager' }, async () => {
      await HdGroup.update({ managerId: insider.managerId }, { where: { id: group.id } });
      const viaGroup = await newTicket({ requesterId: orphan.id, groupId: group.id });
      const g = await call(approvalCtrl.getDefaultApprover, { params: { ticketId: viaGroup.id }, hdUser: hdInsider });
      assert.equal(g.res.body.data.source, 'group_manager');
      assert.equal(g.res.body.data.userId, insider.managerId);

      const nobody = await newTicket({ requesterId: orphan.id, groupId: null });
      const n = await call(approvalCtrl.getDefaultApprover, { params: { ticketId: nobody.id }, hdUser: hdInsider });
      assert.deepEqual(n.res.body.data, { userId: null, name: null, email: null, source: null });

      const req400 = await call(approvalCtrl.requestApproval, { params: { ticketId: nobody.id }, body: {}, hdUser: hdInsider });
      assert.equal(req400.res.statusCode, 400);
      assert.match(req400.res.body.error.message, /No approver could be determined/);
      await HdGroup.update({ managerId: null }, { where: { id: group.id } });
    });

    await t.test('requestApproval: approverId optional → defaults to the reporting manager', async () => {
      const ticket = await newTicket({ requesterId: insider.id, groupId: group.id });
      const { res, next } = await call(approvalCtrl.requestApproval, { params: { ticketId: ticket.id }, body: { notes: 'auto' }, hdUser: hdInsider });
      assert.equal(next.called, false, next.error?.message);
      assert.equal(res.statusCode, 201, JSON.stringify(res.body));
      assert.equal(res.body.data.approverId, insider.managerId);
      assert.equal(res.body.data.approverSource, 'reporting_manager');
      assert.equal(res.body.data.status, 'pending');

      const manual = await call(approvalCtrl.requestApproval, { params: { ticketId: ticket.id }, body: { approverId: outsider.id }, hdUser: hdInsider });
      assert.equal(manual.res.statusCode, 201, JSON.stringify(manual.res.body));
      assert.equal(manual.res.body.data.approverSource, 'manual');
    });

    await t.test('route: GET /helpdesk/approvals/:ticketId/default-approver is mounted', () => {
      const router = require('../src/routes/helpdesk/approvals.routes');
      const layer = router.stack.find((l) => l.route && l.route.path === '/:ticketId/default-approver');
      assert.ok(layer, 'route registered');
      assert.ok(layer.route.methods.get);
    });

    await t.test('helpdeskAuth: no hd_group_id override → group backed by the user\'s department', async () => {
      const [first] = await H.select('SELECT id FROM hd_groups WHERE department_id = :d ORDER BY id LIMIT 1', { d: dept.id });
      const base = { _id: insider.id, role: 'employee', name: insider.name, email: insider.email };

      const viaDept = await runAuth({ ...base, departmentId: dept.id });
      assert.equal(viaDept.groupId, first.id);
      assert.equal(viaDept.departmentId, dept.id);

      const lookedUp = await runAuth(base); // departmentId absent → one users lookup
      assert.equal(lookedUp.groupId, first.id);
      assert.equal(lookedUp.departmentId, insider.departmentId);

      const override = await runAuth({ ...base, hdGroupId: 999999, departmentId: dept.id });
      assert.equal(override.groupId, 999999, 'override wins, no lookup');

      const [outGroup] = outsider.departmentId
        ? await H.select('SELECT id FROM hd_groups WHERE department_id = :d ORDER BY id LIMIT 1', { d: outsider.departmentId })
        : [];
      const other = await runAuth({ _id: outsider.id, role: 'employee', name: outsider.name, email: outsider.email });
      assert.equal(other.groupId, outGroup ? outGroup.id : null, 'outsider resolves to their own department group, or none');
      assert.notEqual(other.groupId, first.id);
    });
  } finally {
    await cleanup.run();
    await H.closeDb();
  }
});
