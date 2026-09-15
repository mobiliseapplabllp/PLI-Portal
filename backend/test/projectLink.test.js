/**
 * ONE PROJECT MASTER — hd_projects.pm_project_id link (migration 043).
 *
 * Writes only `__TEST__` rows and removes every one of them in `finally`
 * (hd_tickets, hd_projects, pm_projects, pm_milestones).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const H = require('./_helpers');

const projectService = require('../src/services/pm/project.service');
const pmCtrl = require('../src/controllers/pm/project.controller');
const hdCtrl = require('../src/controllers/helpdesk/hdProject.controller');
const { HdProject, HdTicket, HdGroup, Project } = require('../src/models/helpdesk');
const Milestone = require('../src/models/pm/Milestone');
const linkScript = require('../scripts/link-hd-projects');

const OPS = 'Operations';

/** Remove a PM project and everything hanging off it (only for rows this test created). */
const dropPm = (id) => async () => {
  await Milestone.destroy({ where: { projectId: id } });
  await HdProject.destroy({ where: { pmProjectId: id } });
  await Project.destroy({ where: { id } });
};

test('ONE PROJECT MASTER — helpdesk profile link', async (t) => {
  const cleanup = H.createCleanup();
  try {
    const adminRow = await H.pickUser('admin');
    const admin    = H.fakeUser(adminRow, 'admin');
    const hdAdmin  = H.fakeHdUser(adminRow, 'admin');
    // A helpdesk profile always needs a group — use a temp one.
    const group    = await HdGroup.create({ name: H.tag('link group') });
    cleanup.add(() => HdGroup.destroy({ where: { id: group.id } }));
    const groupId  = group.id;
    const GROUP_REQUIRED = 'Select a support group for this project';

    // ── 1. PM door: createProject with enableHelpdesk ────────────────────────
    let opsProject, demoProject;
    await t.test('createProject: Operations + enableHelpdesk → profile, token, ZERO milestones', async () => {
      opsProject = await projectService.createProject(
        { name: H.tag('ops'), projectType: OPS, enableHelpdesk: true, helpdeskGroupId: groupId, managerId: adminRow.id },
        admin
      );
      cleanup.add(dropPm(opsProject.id));
      assert.equal(opsProject.projectType, OPS);
      assert.equal(opsProject.billingType, 'Non-Billable');

      const profile = await HdProject.findOne({ where: { pmProjectId: opsProject.id } });
      assert.ok(profile, 'hd_projects row created');
      assert.equal(profile.name, opsProject.name);
      assert.equal(profile.groupId, groupId);
      assert.match(profile.publicToken, /^[0-9a-f-]{36}$/);
      assert.equal(String(profile.managerId), String(adminRow.id));

      const ms = await Milestone.count({ where: { projectId: opsProject.id } });
      assert.equal(ms, 0, 'Operations project must not get the Development fallback milestone');
    });

    await t.test('createProject: enableHelpdesk without a group → 400 ValidationError, nothing created', async () => {
      const name = H.tag('ops-nogroup');
      await assert.rejects(
        projectService.createProject({ name, projectType: OPS, enableHelpdesk: true, managerId: adminRow.id }, admin),
        (e) => e.statusCode === 400 && e.message === GROUP_REQUIRED
      );
      const leaked = await Project.findAll({ where: { name } });
      for (const p of leaked) cleanup.add(dropPm(p.id));
      assert.equal(leaked.length, 0, 'master not created when the group is missing');
    });

    await t.test('createProject: Demo type (no helpdesk) still gets its template milestones', async () => {
      demoProject = await projectService.createProject({ name: H.tag('demo'), projectType: 'Demo' }, admin);
      cleanup.add(dropPm(demoProject.id));
      const ms = await Milestone.count({ where: { projectId: demoProject.id } });
      assert.ok(ms > 0, `Demo project has ${ms} milestone(s)`);
      assert.equal(await HdProject.count({ where: { pmProjectId: demoProject.id } }), 0, 'no profile without enableHelpdesk');
    });

    await t.test('getProjects: Operations hidden by default, shown with includeOperations=1 or projectType', async () => {
      const ids = (rows) => rows.map(p => p.id);
      const def = await projectService.getProjects({}, admin);
      assert.ok(!ids(def).includes(opsProject.id), 'default list excludes Operations');
      assert.ok(ids(def).includes(demoProject.id), 'default list keeps Demo');

      const all = await projectService.getProjects({ includeOperations: '1' }, admin);
      assert.ok(ids(all).includes(opsProject.id), 'includeOperations=1 includes Operations');

      const onlyOps = await projectService.getProjects({ projectType: OPS }, admin);
      assert.ok(ids(onlyOps).includes(opsProject.id));
      assert.ok(!ids(onlyOps).includes(demoProject.id));
    });

    // ── 2. PM helpdesk-profile endpoints via the controller ─────────────────
    const call = async (fn, { params = {}, body = {}, query = {} } = {}) => {
      const res = H.mockRes(); const next = H.mockNext();
      await fn({ params, body, query, user: admin, hdUser: hdAdmin }, res, next);
      if (next.called) throw next.error;
      return res;
    };

    await t.test('GET/POST/PUT/DELETE /pm/projects/:id/helpdesk', async () => {
      // Demo project has no profile yet
      let r = await call(pmCtrl.getHelpdeskProfile, { params: { id: demoProject.id } });
      assert.equal(r.statusCode, 200);
      assert.deepEqual(r.body.data, { enabled: false, profile: null });

      // POST without a group → 400
      r = await call(pmCtrl.enableHelpdesk, { params: { id: demoProject.id }, body: {} });
      assert.equal(r.statusCode, 400);
      assert.equal(r.body.success, false);
      assert.equal(r.body.message || r.body.error?.message, GROUP_REQUIRED);
      assert.equal(await HdProject.count({ where: { pmProjectId: demoProject.id } }), 0);

      // POST → 201 with profile
      r = await call(pmCtrl.enableHelpdesk, { params: { id: demoProject.id }, body: { groupId } });
      assert.equal(r.statusCode, 201, JSON.stringify(r.body));
      assert.equal(r.body.data.enabled, true);
      assert.equal(r.body.data.profile.groupId, groupId);
      assert.equal(r.body.data.profile.groupName, group.name);
      assert.match(r.body.data.profile.publicToken, /^[0-9a-f-]{36}$/);
      // sendSuccess renames id → _id for the client
      assert.ok(r.body.data.profile._id, 'profile._id present');

      // POST again → 409 flat body
      r = await call(pmCtrl.enableHelpdesk, { params: { id: demoProject.id }, body: { groupId } });
      assert.equal(r.statusCode, 409);
      assert.equal(r.body.success, false);
      assert.ok(r.body.message);

      // PUT groupId → null is refused: a profile always keeps a group
      r = await call(pmCtrl.updateHelpdeskProfile, { params: { id: demoProject.id }, body: { groupId: null } });
      assert.equal(r.statusCode, 400);
      assert.equal(r.body.message || r.body.error?.message, GROUP_REQUIRED);

      // GET reflects the unchanged group
      r = await call(pmCtrl.getHelpdeskProfile, { params: { id: demoProject.id } });
      assert.equal(r.body.data.enabled, true);
      assert.equal(r.body.data.profile.groupId, groupId);

      // DELETE with a ticket → 409
      const profile = await HdProject.findOne({ where: { pmProjectId: demoProject.id } });
      const reqNumber = ('__TEST__' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5)).slice(0, 20);
      const ticket = await HdTicket.create({ reqNumber, title: '__TEST__ link ticket', status: 'open', priority: 'medium', projectId: profile.id });
      cleanup.add(() => HdTicket.destroy({ where: { id: ticket.id } }));
      r = await call(pmCtrl.disableHelpdesk, { params: { id: demoProject.id } });
      assert.equal(r.statusCode, 409);
      assert.equal(r.body.success, false);
      assert.ok(await HdProject.findByPk(profile.id), 'profile survives a refused delete');

      // Remove the ticket → DELETE works, PM project untouched
      await HdTicket.destroy({ where: { id: ticket.id } });
      r = await call(pmCtrl.disableHelpdesk, { params: { id: demoProject.id } });
      assert.equal(r.statusCode, 200);
      assert.equal(await HdProject.count({ where: { pmProjectId: demoProject.id } }), 0);
      assert.ok(await Project.findByPk(demoProject.id), 'PM master never deleted');

      // 404 on unknown project
      r = await call(pmCtrl.getHelpdeskProfile, { params: { id: '00000000-0000-0000-0000-000000000000' } });
      assert.equal(r.statusCode, 404);
      assert.equal(r.body.success, false);
    });

    // ── 3. Helpdesk door: hdProject.controller ──────────────────────────────
    let hdCreated;
    await t.test('hdProject.createProject creates PM master (Operations) + profile in one go', async () => {
      const noGroupName = H.tag('hd-nogroup');
      const bad = await call(hdCtrl.createProject, { body: { name: noGroupName } });
      assert.equal(bad.statusCode, 400);
      assert.deepEqual(bad.body, { success: false, message: GROUP_REQUIRED, error: { message: GROUP_REQUIRED } });
      assert.equal(await Project.count({ where: { name: noGroupName } }), 0, 'no master created without a group');

      const name = H.tag('hd-door');
      const r = await call(hdCtrl.createProject, { body: { name, description: 'via helpdesk', groupId } });
      assert.equal(r.statusCode, 201, JSON.stringify(r.body));
      hdCreated = r.body.data;
      assert.ok(hdCreated.pmProjectId, 'profile.pmProjectId set');
      assert.ok(hdCreated.pmProject, 'response carries pmProject');
      assert.equal(hdCreated.pmProject._id, hdCreated.pmProjectId);
      assert.equal(hdCreated.pmProject.projectType, OPS);
      cleanup.add(dropPm(hdCreated.pmProjectId));

      const master = await Project.findByPk(hdCreated.pmProjectId);
      assert.equal(master.name, name);
      assert.equal(master.status, 'Active');
      assert.equal(master.billingType, 'Non-Billable');
      assert.equal(String(master.managerId), String(adminRow.id));
      assert.equal(String(master.createdById), String(adminRow.id));
      assert.equal(await Milestone.count({ where: { projectId: master.id } }), 0);
    });

    await t.test('hdProject list/get read through the master name; update writes to master', async () => {
      const renamed = H.tag('hd-renamed');
      await Project.update({ name: renamed, status: 'On Hold' }, { where: { id: hdCreated.pmProjectId } });

      let r = await call(hdCtrl.listProjects, { query: {} });
      assert.equal(r.statusCode, 200);
      const row = r.body.data.find(p => p._id === hdCreated._id);
      assert.ok(row, 'created profile is listed');
      assert.equal(row.name, renamed, 'list shows master name');
      assert.equal(row.projectStatus, 'On Hold', 'list shows master lifecycle status as projectStatus');
      assert.equal(row.pmProject._id, hdCreated.pmProjectId);
      assert.equal(row.linked, true);
      assert.equal(row.projectType, OPS);

      r = await call(hdCtrl.getProject, { params: { id: hdCreated._id } });
      assert.equal(r.body.data.name, renamed);

      const updated = H.tag('hd-updated');
      r = await call(hdCtrl.updateProject, { params: { id: hdCreated._id }, body: { name: updated, status: 'Active', description: 'd2' } });
      assert.equal(r.statusCode, 200, JSON.stringify(r.body));
      assert.equal(r.body.data.name, updated);
      const master = await Project.findByPk(hdCreated.pmProjectId);
      assert.equal(master.name, updated, 'hd update wrote through to the master');
      assert.equal(master.status, 'Active');
      assert.equal(master.description, 'd2');
      const cache = await HdProject.findByPk(hdCreated._id);
      assert.equal(cache.name, updated, 'hd cache column updated too');
    });

    await t.test('hdProject.deleteProject: 409 with tickets; deletes profile only, never the master', async () => {
      const reqNumber = ('__TEST__' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5)).slice(0, 20);
      const ticket = await HdTicket.create({ reqNumber, title: '__TEST__ hd delete', status: 'open', priority: 'medium', projectId: hdCreated._id });
      cleanup.add(() => HdTicket.destroy({ where: { id: ticket.id } }));
      let r = await call(hdCtrl.deleteProject, { params: { id: hdCreated._id } });
      assert.equal(r.statusCode, 409);
      assert.deepEqual(r.body, { success: false, message: 'Project has tickets; disable instead', error: { message: 'Project has tickets; disable instead' } });

      await HdTicket.destroy({ where: { id: ticket.id } });
      r = await call(hdCtrl.deleteProject, { params: { id: hdCreated._id } });
      assert.equal(r.statusCode, 200);
      assert.equal(await HdProject.count({ where: { id: hdCreated._id } }), 0);
      assert.ok(await Project.findByPk(hdCreated.pmProjectId), 'master still exists');
    });

    // ── 4. Link script: dry run + apply on temp rows ────────────────────────
    await t.test('link-hd-projects: matches by name, creates Operations for unmatched, idempotent', async () => {
      const crypto = require('crypto');
      const matchName = H.tag('link-match');
      const pmMatch = await Project.create({ name: matchName, status: 'Active', billingType: 'Non-Billable', createdById: adminRow.id });
      cleanup.add(dropPm(pmMatch.id));
      const hdMatch = await HdProject.create({ name: `  ${matchName.toUpperCase()}  `, status: 'Active', publicToken: crypto.randomUUID() });
      cleanup.add(() => HdProject.destroy({ where: { id: hdMatch.id } }));
      const hdNew = await HdProject.create({ name: H.tag('link-new'), status: 'On Hold', managerId: adminRow.id, publicToken: crypto.randomUUID() });
      cleanup.add(() => HdProject.destroy({ where: { id: hdNew.id } }));
      const hdIds = [hdMatch.id, hdNew.id];

      // dry run = plan only, writes nothing
      let rows = await linkScript.plan({ hdIds });
      assert.equal(rows.length, 2);
      const pMatch = rows.find(r => r.hd.id === hdMatch.id);
      const pNew   = rows.find(r => r.hd.id === hdNew.id);
      assert.equal(pMatch.action, 'link');
      assert.equal(pMatch.pm.id, pmMatch.id);
      assert.equal(pNew.action, 'create');
      assert.equal(pNew.create.status, 'On Hold');
      assert.equal(String(pNew.create.managerId), String(adminRow.id));
      assert.equal((await HdProject.findByPk(hdMatch.id)).pmProjectId, null, 'dry run wrote nothing');

      // apply
      const summary = await linkScript.apply(rows);
      assert.deepEqual(summary, { linked: 2, created: 1, skipped: 0, failed: 0 });
      assert.equal((await HdProject.findByPk(hdMatch.id)).pmProjectId, pmMatch.id);
      const createdId = (await HdProject.findByPk(hdNew.id)).pmProjectId;
      assert.ok(createdId);
      cleanup.add(dropPm(createdId));
      const created = await Project.findByPk(createdId);
      assert.equal(created.name, hdNew.name);
      assert.equal(created.projectType, OPS);
      assert.equal(created.status, 'On Hold');
      assert.equal(created.billingType, 'Non-Billable');
      assert.equal(String(created.managerId), String(adminRow.id));
      assert.equal(created.createdById, null);
      assert.equal(await Milestone.count({ where: { projectId: createdId } }), 0);

      // idempotent: nothing left to do for these rows
      rows = await linkScript.plan({ hdIds });
      assert.equal(rows.length, 0);
    });
  } finally {
    try { await cleanup.run(); } finally { await H.closeDb(); }
  }
});
