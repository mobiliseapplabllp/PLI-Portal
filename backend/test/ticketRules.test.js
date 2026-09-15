/**
 * Ticket rules (operations consolidation, items 1b/1d/1f/2a/2b/2c/2x):
 *   R1 servicing group required on createTicket (body or project profile)
 *   R2 updateTicket: touching assignee/group needs a group + member assignee
 *   R3 raisedByTeam always derived from the requester; never writable
 *   R4 bulkAssign skips group-less tickets with a reason
 *   R5 bulk upload rows need a group; assignee must be a member
 *   R6 widget ticket takes the profile's group; legacy no-group still accepted (warned)
 *   R7 helpdesk project group required (helpdesk door + PM door)
 *   R8 PM rename syncs the linked hd_projects name/description
 *   R9 GET /helpdesk/projects is master-backed (linked flag, master name)
 *   R10 ticket list/detail show the master project name
 *
 * Writes only `__TEST__` hd_groups / hd_projects / pm_projects / hd_tickets
 * (+ history) and removes them again. users / departments are read only.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const H = require('./_helpers');

delete process.env.SMTP_HOST; // never send email from tests

const { HdGroup, HdProject, HdTicket, HdTicketHistory, HdTicketApproval, HdAttachment, Project } = require('../src/models/helpdesk');
const Milestone      = require('../src/models/pm/Milestone');
const ticketCtrl     = require('../src/controllers/helpdesk/ticket.controller');
const hdCtrl         = require('../src/controllers/helpdesk/hdProject.controller');
const widgetCtrl     = require('../src/controllers/helpdesk/widget.controller');
const projectService = require('../src/services/pm/project.service');

const GROUP_REQUIRED   = 'Select a servicing group for this ticket';
const NOT_IN_GROUP     = 'Assignee is not a member of the selected group';
const NO_GROUP_REASON  = 'Ticket has no servicing group';
const PROJECT_GROUP_REQUIRED = 'Select a support group for this project';
const both = (message) => ({ success: false, message, error: { message } });

async function call(handler, { body = {}, params = {}, query = {}, hdUser }) {
  const res = H.mockRes();
  const next = H.mockNext();
  await handler({ body, params, query, hdUser, user: { _id: hdUser && hdUser.id } }, res, next);
  return { res, next };
}

test('Ticket rules: groups, teams, project master', async (t) => {
  const cleanup = H.createCleanup();
  try {
    // ── Fixtures ────────────────────────────────────────────────────────────
    const [dept] = await H.select(
      `SELECT d.id, d.name FROM departments d
        WHERE NOT EXISTS (SELECT 1 FROM hd_groups g WHERE g.department_id = d.id)
          AND EXISTS (SELECT 1 FROM users u WHERE u.departmentId = d.id AND u.isActive = 1 AND u.hd_group_id IS NULL)
        ORDER BY (SELECT COUNT(*) FROM users u WHERE u.departmentId = d.id AND u.isActive = 1) DESC, d.id
        LIMIT 1`);
    assert.ok(dept, 'a department with an active user');
    const [insider] = await H.select(
      `SELECT id, name, email, role, departmentId FROM users
        WHERE departmentId = :d AND isActive = 1 AND hd_group_id IS NULL ORDER BY id LIMIT 1`, { d: dept.id });
    const [outsider] = await H.select(
      `SELECT id, name, email, role FROM users
        WHERE isActive = 1 AND hd_group_id IS NULL AND (departmentId IS NULL OR departmentId <> :d)
        ORDER BY id LIMIT 1`, { d: dept.id });
    assert.ok(insider && outsider, 'an insider and an outsider');
    const [noDeptUser] = await H.select(
      `SELECT id, email FROM users WHERE isActive = 1 AND departmentId IS NULL AND email IS NOT NULL ORDER BY id LIMIT 1`);

    const adminRow = await H.pickUser('admin');
    const admin    = H.fakeUser(adminRow, 'admin');
    const hdAdmin  = H.fakeHdUser(insider, 'admin'); // insider acting as helpdesk admin

    const group = await HdGroup.create({ name: H.tag('rules group'), departmentId: dept.id });
    cleanup.add(() => HdGroup.destroy({ where: { id: group.id } }));

    const trackTicket = (id) => cleanup.add(async () => {
      await HdTicketApproval.destroy({ where: { ticketId: id } });
      await HdTicketHistory.destroy({ where: { ticketId: id } });
      await HdAttachment.destroy({ where: { ticketId: id } });
      await HdTicket.destroy({ where: { id } });
    });
    const newTicket = async (fields) => {
      const row = await HdTicket.create({
        reqNumber: `${H.TEST_PREFIX}${crypto.randomBytes(5).toString('hex')}`,
        title: H.tag('ticket'), status: 'open', priority: 'medium', ...fields,
      });
      trackTicket(row.id);
      return row;
    };
    const dropPm = (id) => cleanup.add(async () => {
      const profiles = await HdProject.findAll({ where: { pmProjectId: id }, attributes: ['id'] });
      for (const p of profiles) {
        const tickets = await HdTicket.findAll({ where: { projectId: p.id }, attributes: ['id'] });
        for (const tk of tickets) {
          await HdTicketHistory.destroy({ where: { ticketId: tk.id } });
          await HdTicket.destroy({ where: { id: tk.id } });
        }
      }
      await Milestone.destroy({ where: { projectId: id } });
      await HdProject.destroy({ where: { pmProjectId: id } });
      await Project.destroy({ where: { id } });
    });

    // Linked profile via the PM door (Operations master + profile with group)
    const master = await projectService.createProject(
      { name: H.tag('rules master'), projectType: 'Operations', enableHelpdesk: true, helpdeskGroupId: group.id, managerId: adminRow.id },
      admin
    );
    dropPm(master.id);
    const profile = await HdProject.findOne({ where: { pmProjectId: master.id } });
    assert.ok(profile && profile.groupId === group.id);

    // Legacy unlinked profile without a group
    const legacy = await HdProject.create({ name: H.tag('rules legacy'), status: 'Active', publicToken: crypto.randomUUID() });
    cleanup.add(async () => {
      const tickets = await HdTicket.findAll({ where: { projectId: legacy.id }, attributes: ['id'] });
      for (const tk of tickets) { await HdTicketHistory.destroy({ where: { ticketId: tk.id } }); await HdTicket.destroy({ where: { id: tk.id } }); }
      await HdProject.destroy({ where: { id: legacy.id } });
    });

    // ── R1 ──────────────────────────────────────────────────────────────────
    await t.test('R1 createTicket: no group and no project group → 400 (both shapes)', async () => {
      const none = await call(ticketCtrl.createTicket, { body: { title: H.tag('no group') }, hdUser: hdAdmin });
      assert.equal(none.res.statusCode, 400);
      assert.deepEqual(none.res.body, both(GROUP_REQUIRED));

      const legacyProject = await call(ticketCtrl.createTicket, { body: { title: H.tag('legacy proj'), projectId: legacy.id }, hdUser: hdAdmin });
      assert.equal(legacyProject.res.statusCode, 400, 'project without a group supplies none');
      assert.deepEqual(legacyProject.res.body, both(GROUP_REQUIRED));
    });

    await t.test('R1 createTicket: project-supplied group → 201; outsider assignee → 400', async () => {
      const ok = await call(ticketCtrl.createTicket, { body: { title: H.tag('proj group'), projectId: profile.id }, hdUser: hdAdmin });
      assert.equal(ok.next.called, false, ok.next.error && ok.next.error.message);
      assert.equal(ok.res.statusCode, 201, JSON.stringify(ok.res.body));
      trackTicket(ok.res.body.data._id);
      assert.equal(ok.res.body.data.groupId, group.id);

      const bad = await call(ticketCtrl.createTicket, {
        body: { title: H.tag('proj bad assignee'), projectId: profile.id, assigneeId: outsider.id }, hdUser: hdAdmin,
      });
      assert.equal(bad.res.statusCode, 400);
      assert.deepEqual(bad.res.body, both(NOT_IN_GROUP));
    });

    // ── R3 ──────────────────────────────────────────────────────────────────
    await t.test('R3 raisedByTeam: body value ignored on create; derived from requester department (null when none)', async () => {
      const mine = await call(ticketCtrl.createTicket, {
        body: { title: H.tag('team'), groupId: group.id, raisedByTeam: 'Body Team' }, hdUser: hdAdmin,
      });
      assert.equal(mine.res.statusCode, 201, JSON.stringify(mine.res.body));
      trackTicket(mine.res.body.data._id);
      assert.equal(mine.res.body.data.raisedByTeam, dept.name);

      if (noDeptUser) {
        const other = await call(ticketCtrl.createTicket, {
          body: { title: H.tag('team none'), groupId: group.id, raisedByTeam: 'Body Team', requesterEmail: noDeptUser.email }, hdUser: hdAdmin,
        });
        assert.equal(other.res.statusCode, 201, JSON.stringify(other.res.body));
        trackTicket(other.res.body.data._id);
        assert.equal(other.res.body.data.raisedByTeam, null, 'requester without department → null, never the body');
      }
    });

    await t.test('R3 updateTicket: raisedByTeam in body is ignored (200, unchanged, no history)', async () => {
      const tk = await newTicket({ requesterId: insider.id, groupId: group.id, raisedByTeam: 'Original' });
      const r = await call(ticketCtrl.updateTicket, { params: { id: tk.id }, body: { raisedByTeam: 'Hacked', priority: 'high' }, hdUser: hdAdmin });
      assert.equal(r.res.statusCode, 200, JSON.stringify(r.res.body));
      const fresh = await HdTicket.findByPk(tk.id);
      assert.equal(fresh.raisedByTeam, 'Original');
      assert.equal(fresh.priority, 'high');
      assert.equal(await HdTicketHistory.count({ where: { ticketId: tk.id, field: 'raisedByTeam' } }), 0);
    });

    // ── R2 ──────────────────────────────────────────────────────────────────
    await t.test('R2 updateTicket on a group-less ticket: status-only 200; touching assignee 400; with group + member 200', async () => {
      const tk = await newTicket({ requesterId: insider.id, groupId: null });

      const status = await call(ticketCtrl.updateTicket, { params: { id: tk.id }, body: { status: 'in-progress' }, hdUser: hdAdmin });
      assert.equal(status.res.statusCode, 200, JSON.stringify(status.res.body));

      const assign = await call(ticketCtrl.updateTicket, { params: { id: tk.id }, body: { assigneeId: insider.id }, hdUser: hdAdmin });
      assert.equal(assign.res.statusCode, 400);
      assert.deepEqual(assign.res.body, both(GROUP_REQUIRED));
      assert.equal((await HdTicket.findByPk(tk.id)).assigneeId, null);

      // Unassigning a legacy group-less ticket is allowed (no group needed to remove someone).
      await HdTicket.update({ assigneeId: outsider.id }, { where: { id: tk.id } });
      const unassign = await call(ticketCtrl.updateTicket, { params: { id: tk.id }, body: { assigneeId: null }, hdUser: hdAdmin });
      assert.equal(unassign.res.statusCode, 200, JSON.stringify(unassign.res.body));
      assert.equal((await HdTicket.findByPk(tk.id)).assigneeId, null);

      const outsiderWithGroup = await call(ticketCtrl.updateTicket, { params: { id: tk.id }, body: { groupId: group.id, assigneeId: outsider.id }, hdUser: hdAdmin });
      assert.equal(outsiderWithGroup.res.statusCode, 400);
      assert.deepEqual(outsiderWithGroup.res.body, both(NOT_IN_GROUP));

      const fixed = await call(ticketCtrl.updateTicket, { params: { id: tk.id }, body: { groupId: group.id, assigneeId: insider.id }, hdUser: hdAdmin });
      assert.equal(fixed.res.statusCode, 200, JSON.stringify(fixed.res.body));

      const clear = await call(ticketCtrl.updateTicket, { params: { id: tk.id }, body: { groupId: '' }, hdUser: hdAdmin });
      assert.equal(clear.res.statusCode, 400);
      assert.deepEqual(clear.res.body, both(GROUP_REQUIRED));
      assert.equal((await HdTicket.findByPk(tk.id)).groupId, group.id);
    });

    // ── R4 ──────────────────────────────────────────────────────────────────
    await t.test('R4 bulkAssign: group-less tickets skipped with a reason; members assigned', async () => {
      const grouped   = await newTicket({ requesterId: insider.id, groupId: group.id });
      const ungrouped = await newTicket({ requesterId: insider.id, groupId: null });
      const { res } = await call(ticketCtrl.bulkAssign, { body: { ticketIds: [grouped.id, ungrouped.id], assigneeId: insider.id }, hdUser: hdAdmin });
      assert.equal(res.statusCode, 200, JSON.stringify(res.body));
      assert.equal(res.body.data.updated, 1);
      assert.deepEqual(res.body.data.skipped, [ungrouped.id]);
      assert.equal(res.body.data.skippedReason, NO_GROUP_REASON);
      assert.deepEqual(res.body.data.skippedDetails, [{ ticketId: ungrouped.id, reason: NO_GROUP_REASON }]);
      assert.equal((await HdTicket.findByPk(grouped.id)).assigneeId, insider.id);
      assert.equal((await HdTicket.findByPk(ungrouped.id)).assigneeId, null, 'group-less ticket not assigned');

      const g2 = await newTicket({ requesterId: insider.id, groupId: group.id });
      const u2 = await newTicket({ requesterId: insider.id, groupId: null });
      const mixed = await call(ticketCtrl.bulkAssign, { body: { ticketIds: [g2.id, u2.id], assigneeId: outsider.id }, hdUser: hdAdmin });
      assert.equal(mixed.res.body.data.updated, 0);
      const details = [...mixed.res.body.data.skippedDetails].sort((a, b) => a.ticketId - b.ticketId);
      assert.deepEqual(details, [{ ticketId: g2.id, reason: NOT_IN_GROUP }, { ticketId: u2.id, reason: NO_GROUP_REASON }]);
    });

    // ── R5 ──────────────────────────────────────────────────────────────────
    await t.test('R5 bulkUpload: row without group → error; non-member assignee → error; project group + derived team → created', async () => {
      const titleNoGroup = H.tag('bulk nogroup');
      const titleBadAsg  = H.tag('bulk badasg');
      const titleOk      = H.tag('bulk ok');
      cleanup.add(async () => {
        const rows = await HdTicket.findAll({ where: { title: [titleNoGroup, titleBadAsg, titleOk] }, attributes: ['id'] });
        for (const r of rows) { await HdTicketHistory.destroy({ where: { ticketId: r.id } }); await HdTicket.destroy({ where: { id: r.id } }); }
      });
      const { res } = await call(ticketCtrl.bulkUpload, {
        body: { rows: [
          { 'Title *': titleNoGroup },
          { title: titleBadAsg, group_name: group.name, assignee_email: outsider.email },
          { title: titleOk, project_name: profile.name, assignee_email: insider.email, raised_by_team: 'Column Team' },
        ] },
        hdUser: hdAdmin,
      });
      assert.equal(res.statusCode, 200, JSON.stringify(res.body));
      assert.equal(res.body.data.created, 1, JSON.stringify(res.body.data.errors));
      assert.deepEqual(res.body.data.errors, [
        { row: 1, field: 'group_name', msg: GROUP_REQUIRED },
        { row: 2, field: 'assignee_email', msg: NOT_IN_GROUP },
      ]);
      const created = await HdTicket.findOne({ where: { title: titleOk } });
      assert.ok(created);
      assert.equal(created.groupId, group.id, 'group from the project profile');
      assert.equal(created.projectId, profile.id);
      assert.equal(created.assigneeId, insider.id);
      assert.equal(created.raisedByTeam, dept.name, 'column ignored; uploader department');
      assert.equal(await HdTicket.count({ where: { title: [titleNoGroup, titleBadAsg] } }), 0);
    });

    // ── R6 ──────────────────────────────────────────────────────────────────
    await t.test('R6 widget: group from profile; legacy profile without group still accepted + warned', async () => {
      const email = `${crypto.randomBytes(4).toString('hex')}@example.invalid`;
      const hdDoor = await call(hdCtrl.createProject, { body: { name: H.tag('rules widget'), groupId: group.id }, hdUser: hdAdmin });
      assert.equal(hdDoor.res.statusCode, 201, JSON.stringify(hdDoor.res.body));
      dropPm(hdDoor.res.body.data.pmProjectId);

      const ok = await call(widgetCtrl.submitWidgetTicket, {
        body: { token: hdDoor.res.body.data.publicToken, name: 'W', email, title: H.tag('widget'), category: 'General' },
      });
      assert.equal(ok.next.called, false, ok.next.error && ok.next.error.message);
      assert.equal(ok.res.statusCode, 201, JSON.stringify(ok.res.body));
      assert.equal((await HdTicket.findByPk(ok.res.body.data._id)).groupId, group.id);

      const warnings = [];
      const origWarn = console.warn;
      console.warn = (...a) => warnings.push(a.join(' '));
      let legacyRes;
      try {
        legacyRes = await call(widgetCtrl.submitWidgetTicket, {
          body: { token: legacy.publicToken, name: 'W', email, title: H.tag('widget legacy'), category: 'General' },
        });
      } finally { console.warn = origWarn; }
      assert.equal(legacyRes.res.statusCode, 201, JSON.stringify(legacyRes.res.body));
      assert.equal((await HdTicket.findByPk(legacyRes.res.body.data._id)).groupId, null);
      assert.ok(warnings.some((w) => w.includes(`id=${legacy.id}`)), 'warning names the profile');
    });

    // ── R7 ──────────────────────────────────────────────────────────────────
    await t.test('R7 project group required: helpdesk door create/update, PM createProject + enableHelpdesk', async () => {
      const noGroupName = H.tag('rules nogroup');
      const create = await call(hdCtrl.createProject, { body: { name: noGroupName }, hdUser: hdAdmin });
      assert.equal(create.res.statusCode, 400);
      assert.deepEqual(create.res.body, both(PROJECT_GROUP_REQUIRED));
      assert.equal(await Project.count({ where: { name: noGroupName } }), 0);

      const upd = await call(hdCtrl.updateProject, { params: { id: profile.id }, body: { groupId: null }, hdUser: hdAdmin });
      assert.equal(upd.res.statusCode, 400);
      assert.deepEqual(upd.res.body, both(PROJECT_GROUP_REQUIRED));
      assert.equal((await HdProject.findByPk(profile.id)).groupId, group.id);

      await assert.rejects(
        projectService.createProject({ name: noGroupName, projectType: 'Operations', enableHelpdesk: true }, admin),
        (e) => e.statusCode === 400 && e.message === PROJECT_GROUP_REQUIRED
      );
      assert.equal(await Project.count({ where: { name: noGroupName } }), 0, 'no master left behind');

      const plain = await projectService.createProject({ name: H.tag('rules plain'), projectType: 'Operations' }, admin);
      dropPm(plain.id);
      await assert.rejects(
        projectService.enableHelpdesk(plain.id, '', admin),
        (e) => e.statusCode === 400 && e.message === PROJECT_GROUP_REQUIRED
      );
      assert.equal(await HdProject.count({ where: { pmProjectId: plain.id } }), 0);
    });

    // ── R8 ──────────────────────────────────────────────────────────────────
    await t.test('R8 PM updateProject rename → linked hd_projects name/description synced', async () => {
      const renamed = H.tag('rules renamed');
      await projectService.updateProject(master.id, { name: renamed, description: 'synced desc' }, admin);
      const fresh = await HdProject.findByPk(profile.id);
      assert.equal(fresh.name, renamed);
      assert.equal(fresh.description, 'synced desc');

      await projectService.updateProject(master.id, { status: 'On Hold' }, admin);
      assert.equal((await HdProject.findByPk(profile.id)).name, renamed, 'non-name updates leave the copy alone');
    });

    // ── R9 ──────────────────────────────────────────────────────────────────
    await t.test('R9 GET /helpdesk/projects: linked items carry master name + linked flag; unlinked profiles listed', async () => {
      const masterName = H.tag('rules master-only');
      await Project.update({ name: masterName }, { where: { id: master.id } }); // hd copy now stale

      const { res } = await call(hdCtrl.listProjects, { query: {}, hdUser: hdAdmin });
      assert.equal(res.statusCode, 200);
      const linkedRow = res.body.data.find((p) => p._id === profile.id);
      assert.ok(linkedRow, 'linked profile listed by profile id');
      assert.equal(linkedRow.name, masterName, 'name from master');
      assert.equal(linkedRow.linked, true);
      assert.equal(linkedRow.pmProjectId, master.id);
      assert.equal(linkedRow.projectType, 'Operations');
      assert.equal(linkedRow.projectStatus, 'On Hold', 'PM lifecycle status from master');
      assert.equal(linkedRow.status, profile.status, 'status stays the helpdesk (accepting tickets) status');
      assert.equal(linkedRow.groupId, group.id);
      assert.ok(linkedRow.publicToken);

      const legacyRow = res.body.data.find((p) => p._id === legacy.id);
      assert.ok(legacyRow, 'unlinked profile listed');
      assert.equal(legacyRow.linked, false);
      assert.equal(legacyRow.name, legacy.name);
      assert.equal(legacyRow.pmProjectId, null);

      const scoped = await call(hdCtrl.listProjects, { query: { groupId: String(group.id) }, hdUser: hdAdmin });
      const ids = scoped.res.body.data.map((p) => p._id);
      assert.ok(ids.includes(profile.id));
      assert.ok(!ids.includes(legacy.id), 'groupId filter applies to both sources');

      const one = await call(hdCtrl.getProject, { params: { id: profile.id }, hdUser: hdAdmin });
      assert.equal(one.res.body.data.name, masterName);
      assert.equal(one.res.body.data.linked, true);
    });

    // ── R10 ─────────────────────────────────────────────────────────────────
    await t.test('R10 ticket list + detail show the master project name when linked', async () => {
      const masterName = H.tag('rules ticket-master');
      await Project.update({ name: masterName }, { where: { id: master.id } });
      const tk = await newTicket({ requesterId: insider.id, groupId: group.id, projectId: profile.id });

      const list = await call(ticketCtrl.listTickets, { query: { projectId: String(profile.id) }, hdUser: hdAdmin });
      assert.equal(list.next.called, false, list.next.error && list.next.error.message);
      const row = list.res.body.data.tickets.find((x) => x._id === tk.id);
      assert.ok(row);
      assert.equal(row.project.name, masterName);
      assert.equal(row.project._id, profile.id);

      const detail = await call(ticketCtrl.getTicket, { params: { id: tk.id }, hdUser: hdAdmin });
      assert.equal(detail.next.called, false, detail.next.error && detail.next.error.message);
      assert.equal(detail.res.body.data.project.name, masterName);
    });
  } finally {
    try { await cleanup.run(); } finally { await H.closeDb(); }
  }
});
