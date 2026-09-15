/**
 * core/rbac: permission map + requirePermission / can.
 *
 * The snapshot below was captured BEFORE PM routes moved from authorize(...roles)
 * to requirePermission(key) — by stubbing middleware/rbac.authorize through the
 * require cache and recording the roles each route passed. The test proves the
 * refactor changed no route's role list. No DB writes.
 */
const H = require('./_helpers');   // first: loads .env, disables SMTP
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('fs');
const path = require('path');

const { PERMISSIONS, requirePermission, can } = require('../src/core/rbac');
const { ForbiddenError } = require('../src/utils/errors');

after(() => H.closeDb());

/** (route file, METHOD, path) → sorted roles, as passed to authorize() before the refactor. */
const PRE_CHANGE_SNAPSHOT = {
  "pm/closure.routes.js GET /": ["admin","director","employee","final_approver","hr_admin","manager","md","senior_manager"],
  "pm/closure.routes.js PUT /": ["admin","manager","senior_manager"],
  "pm/closure.routes.js POST /close": ["admin","manager","senior_manager"],
  "pm/dailyLog.routes.js GET /": ["admin","director","employee","final_approver","hr_admin","manager","md","senior_manager"],
  "pm/dailyLog.routes.js GET /today": ["admin","director","employee","final_approver","hr_admin","manager","md","senior_manager"],
  "pm/dailyLog.routes.js POST /": ["admin","director","employee","final_approver","hr_admin","manager","md","senior_manager"],
  "pm/dailyLog.routes.js GET /:logId": ["admin","director","employee","final_approver","hr_admin","manager","md","senior_manager"],
  "pm/financial.routes.js GET /": ["admin","director","employee","final_approver","hr_admin","manager","md","senior_manager"],
  "pm/financial.routes.js PUT /": ["admin","manager","senior_manager"],
  "pm/index.js GET /my-tasks": ["admin","director","employee","final_approver","hr_admin","manager","md","senior_manager"],
  "pm/index.js GET /users/:userId/availability": ["admin","director","employee","final_approver","hr_admin","manager","md","senior_manager"],
  "pm/index.js GET /users/:userId/utilisation": ["admin","director","employee","final_approver","hr_admin","manager","md","senior_manager"],
  "pm/index.js GET /utilisation": ["admin","director","manager","md","senior_manager"],
  "pm/index.js GET /projects/raid-summary": ["admin","manager","senior_manager"],
  "pm/index.js GET /milestones/export": ["admin","director","employee","final_approver","hr_admin","manager","md","senior_manager"],
  "pm/index.js GET /milestones/import/template": ["admin","director","employee","final_approver","hr_admin","manager","md","senior_manager"],
  "pm/index.js POST /milestones/import/validate": ["admin"],
  "pm/index.js POST /milestones/import/commit": ["admin"],
  "pm/milestone.routes.js GET /export": ["admin","director","employee","final_approver","hr_admin","manager","md","senior_manager"],
  "pm/milestone.routes.js GET /import/template": ["admin","director","employee","final_approver","hr_admin","manager","md","senior_manager"],
  "pm/milestone.routes.js POST /import/validate": ["admin"],
  "pm/milestone.routes.js POST /import/commit": ["admin"],
  "pm/milestone.routes.js GET /": ["admin","director","employee","final_approver","hr_admin","manager","md","senior_manager"],
  "pm/milestone.routes.js POST /": ["admin"],
  "pm/milestone.routes.js PUT /:milestoneId": ["admin","manager","senior_manager"],
  "pm/milestone.routes.js DELETE /:milestoneId": ["admin"],
  "pm/milestone.routes.js PATCH /:milestoneId/status": ["admin","manager","senior_manager"],
  "pm/milestone.routes.js PATCH /:milestoneId/progress": ["admin","manager","senior_manager"],
  "pm/milestone.routes.js PATCH /:milestoneId/planned-dates": ["admin","manager","senior_manager"],
  "pm/milestone.routes.js PATCH /:milestoneId/actual-dates": ["admin","manager","senior_manager"],
  "pm/milestone.routes.js PATCH /:milestoneId/planned-dates/unlock": ["admin"],
  "pm/milestone.routes.js PATCH /:milestoneId/planned-dates/lock": ["admin"],
  "pm/milestone.routes.js POST /:milestoneId/sub": ["admin","manager","senior_manager"],
  "pm/pmConfig.routes.js GET /project-types": ["admin","director","employee","final_approver","hr_admin","manager","md","senior_manager"],
  "pm/pmConfig.routes.js POST /project-types": ["admin","director","manager","md","senior_manager"],
  "pm/pmConfig.routes.js PUT /project-types/:id": ["admin","director","manager","md","senior_manager"],
  "pm/pmConfig.routes.js DELETE /project-types/:id": ["admin","director","manager","md","senior_manager"],
  "pm/pmConfig.routes.js GET /statuses/all": ["admin","director","manager","md","senior_manager"],
  "pm/pmConfig.routes.js GET /statuses": ["admin","director","employee","final_approver","hr_admin","manager","md","senior_manager"],
  "pm/pmConfig.routes.js POST /statuses": ["admin","director","manager","md","senior_manager"],
  "pm/pmConfig.routes.js PUT /statuses/:id": ["admin","director","manager","md","senior_manager"],
  "pm/pmConfig.routes.js DELETE /statuses/:id": ["admin","director","manager","md","senior_manager"],
  "pm/pmConfig.routes.js GET /milestone-templates": ["admin","director","employee","final_approver","hr_admin","manager","md","senior_manager"],
  "pm/pmConfig.routes.js POST /milestone-templates": ["admin","director","manager","md","senior_manager"],
  "pm/pmConfig.routes.js PUT /milestone-templates/reorder": ["admin","director","manager","md","senior_manager"],
  "pm/pmConfig.routes.js PUT /milestone-templates/:id": ["admin","director","manager","md","senior_manager"],
  "pm/pmConfig.routes.js DELETE /milestone-templates/:id": ["admin","director","manager","md","senior_manager"],
  "pm/pmConfig.routes.js GET /milestone-templates/:projectType/validate": ["admin","director","manager","md","senior_manager"],
  "pm/pmConfig.routes.js GET /client-orgs": ["admin","director","manager","md","senior_manager"],
  "pm/pmConfig.routes.js POST /client-orgs": ["admin","director","manager","md","senior_manager"],
  "pm/pmConfig.routes.js DELETE /client-orgs/:id": ["admin","director","manager","md","senior_manager"],
  "pm/pmConfig.routes.js GET /member-roles": ["admin","director","employee","final_approver","hr_admin","manager","md","senior_manager"],
  "pm/pmConfig.routes.js POST /member-roles": ["admin","director","manager","md","senior_manager"],
  "pm/pmConfig.routes.js PUT /member-roles/:id": ["admin","director","manager","md","senior_manager"],
  "pm/pmConfig.routes.js DELETE /member-roles/:id": ["admin","director","manager","md","senior_manager"],
  "pm/pmConfig.routes.js GET /calendar": ["admin","director","employee","final_approver","hr_admin","manager","md","senior_manager"],
  "pm/pmConfig.routes.js PUT /calendar": ["admin"],
  "pm/pmConfig.routes.js GET /calendar/preview": ["admin","director","employee","final_approver","hr_admin","manager","md","senior_manager"],
  "pm/pmConfig.routes.js GET /calendar/working-days": ["admin","director","employee","final_approver","hr_admin","manager","md","senior_manager"],
  "pm/pmConfig.routes.js GET /holidays/import/template": ["admin","director","employee","final_approver","hr_admin","manager","md","senior_manager"],
  "pm/pmConfig.routes.js POST /holidays/import/validate": ["admin"],
  "pm/pmConfig.routes.js POST /holidays/import/commit": ["admin"],
  "pm/pmConfig.routes.js GET /holidays": ["admin","director","employee","final_approver","hr_admin","manager","md","senior_manager"],
  "pm/pmConfig.routes.js POST /holidays": ["admin"],
  "pm/pmConfig.routes.js PUT /holidays/:id": ["admin"],
  "pm/pmConfig.routes.js DELETE /holidays/:id": ["admin"],
  "pm/pmSettings.routes.js GET /": ["admin"],
  "pm/pmSettings.routes.js PUT /": ["admin"],
  "pm/pmSettings.routes.js POST /trigger-report": ["admin"],
  "pm/project.routes.js GET /": ["admin","director","employee","final_approver","hr_admin","manager","md","senior_manager"],
  "pm/project.routes.js POST /": ["admin","manager","senior_manager"],
  "pm/project.routes.js GET /:id": ["admin","director","employee","final_approver","hr_admin","manager","md","senior_manager"],
  "pm/project.routes.js GET /:id/summary": ["admin","director","employee","final_approver","hr_admin","manager","md","senior_manager"],
  "pm/project.routes.js PUT /:id": ["admin","manager","senior_manager"],
  "pm/project.routes.js DELETE /:id": ["admin"],
  "pm/project.routes.js GET /:id/helpdesk": ["admin","director","employee","final_approver","hr_admin","manager","md","senior_manager"],
  "pm/project.routes.js POST /:id/helpdesk": ["admin","manager","senior_manager"],
  "pm/project.routes.js PUT /:id/helpdesk": ["admin","manager","senior_manager"],
  "pm/project.routes.js DELETE /:id/helpdesk": ["admin","manager","senior_manager"],
  "pm/project.routes.js GET /:id/tasks": ["admin","director","employee","final_approver","hr_admin","manager","md","senior_manager"],
  "pm/project.routes.js GET /:id/members/availability": ["admin","director","employee","final_approver","hr_admin","manager","md","senior_manager"],
  "pm/project.routes.js GET /:id/members": ["admin","director","employee","final_approver","hr_admin","manager","md","senior_manager"],
  "pm/project.routes.js POST /:id/members": ["admin","manager","senior_manager"],
  "pm/project.routes.js PUT /:id/members/:memberId": ["admin","manager","senior_manager"],
  "pm/project.routes.js PATCH /:id/members/:memberId/confirm-hours": ["admin","manager","senior_manager"],
  "pm/project.routes.js DELETE /:id/members/:memberId": ["admin","manager","senior_manager"],
  "pm/project.routes.js GET /:id/recipients": ["admin","manager","senior_manager"],
  "pm/project.routes.js POST /:id/recipients": ["admin","manager","senior_manager"],
  "pm/project.routes.js DELETE /:id/recipients/:recipientId": ["admin","manager","senior_manager"],
  "pm/project.routes.js GET /:id/allocation-preview": ["admin","manager","senior_manager"],
  "pm/project.routes.js POST /:id/allocation-approval": ["admin","manager","senior_manager"],
  "pm/project.routes.js PATCH /:id/allocation-approval/:approvalId": ["admin","director","md","senior_manager"],
  "pm/project.routes.js GET /:id/allocation-approvals": ["admin","manager","senior_manager"],
  "pm/project.routes.js PATCH /:id/allocation-approvals/:approvalId": ["admin","manager","senior_manager"],
  "pm/raid.routes.js GET /": ["admin","director","employee","final_approver","hr_admin","manager","md","senior_manager"],
  "pm/raid.routes.js POST /": ["admin","manager","senior_manager"],
  "pm/raid.routes.js PUT /:itemId": ["admin","manager","senior_manager"],
  "pm/raid.routes.js DELETE /:itemId": ["admin","manager","senior_manager"],
  "pm/statusReport.routes.js GET /": ["admin","director","employee","final_approver","hr_admin","manager","md","senior_manager"],
  "pm/statusReport.routes.js POST /": ["admin","manager","senior_manager"],
  "pm/statusReport.routes.js PUT /:reportId": ["admin","manager","senior_manager"],
  "pm/statusReport.routes.js DELETE /:reportId": ["admin","manager","senior_manager"],
  "pm/task.routes.js GET /": ["admin","director","employee","final_approver","hr_admin","manager","md","senior_manager"],
  "pm/task.routes.js POST /": ["admin","director","employee","final_approver","hr_admin","manager","md","senior_manager"],
  "pm/task.routes.js PUT /:taskId": ["admin","director","employee","final_approver","hr_admin","manager","md","senior_manager"],
  "pm/task.routes.js DELETE /:taskId": ["admin","manager","senior_manager"],
  "pm/task.routes.js PATCH /:taskId/status": ["admin","director","employee","final_approver","hr_admin","manager","md","senior_manager"],
};

const ROUTES_DIR = path.join(__dirname, '..', 'src', 'routes');
const routeFiles = () => [
  ...fs.readdirSync(path.join(ROUTES_DIR, 'pm')).filter(f => f.endsWith('.js')).map(f => 'pm/' + f),
  ...fs.readdirSync(path.join(ROUTES_DIR, 'helpdesk')).filter(f => f.endsWith('.js')).map(f => 'helpdesk/' + f),
  'timeEntries.routes.js',
];

/** Walk each router's own routes; record roles for handlers built by requirePermission. */
function captureCurrent() {
  const snap = {};
  const keysUsed = new Set();
  for (const f of routeFiles()) {
    const router = require(path.join(ROUTES_DIR, f));
    for (const layer of router.stack) {
      if (!layer.route) continue;
      for (const m of Object.keys(layer.route.methods)) {
        for (const l of layer.route.stack) {
          if (!l.handle.permission) continue;
          const k = `${f} ${m.toUpperCase()} ${layer.route.path}`;
          assert.equal(snap[k], undefined, `duplicate route key ${k}`);
          keysUsed.add(l.handle.permission);
          snap[k] = [...PERMISSIONS[l.handle.permission]].sort();
        }
      }
    }
  }
  return { snap, keysUsed };
}

test('PM/helpdesk route role lists are identical to the pre-change snapshot', () => {
  const { snap } = captureCurrent();
  assert.equal(Object.keys(snap).length, Object.keys(PRE_CHANGE_SNAPSHOT).length);
  assert.deepEqual(snap, PRE_CHANGE_SNAPSHOT);
});

test('every requirePermission key used in routes exists, and no key is unused', () => {
  const { keysUsed } = captureCurrent();
  for (const k of keysUsed) assert.ok(Object.prototype.hasOwnProperty.call(PERMISSIONS, k), `missing key ${k}`);
  assert.deepEqual([...keysUsed].sort(), Object.keys(PERMISSIONS).sort());
  // Also by source: every requirePermission('<key>') literal resolves.
  for (const f of routeFiles()) {
    const src = fs.readFileSync(path.join(ROUTES_DIR, f), 'utf8');
    for (const [, key] of src.matchAll(/requirePermission\('([^']+)'\)/g)) {
      assert.ok(PERMISSIONS[key], `${f}: unknown key ${key}`);
    }
    assert.doesNotMatch(src, /\bauthorize\(/, `${f} still calls authorize() directly`);
  }
});

test('requirePermission: unknown key throws at definition time', () => {
  assert.throws(() => requirePermission('pm.nope.nothing'), /Unknown permission key/);
});

/** Run a middleware and return what it passed to next(). */
const run = (mw, user) => {
  let arg = 'not-called';
  mw({ user }, {}, (e) => { arg = e; });
  return arg;
};

test('requirePermission: allowed roles pass, denied roles get ForbiddenError', () => {
  const mw = requirePermission('pm.project.create');   // admin, manager, senior_manager
  assert.equal(mw.permission, 'pm.project.create');
  for (const role of ['admin', 'manager', 'senior_manager']) assert.equal(run(mw, { role }), undefined, role);
  for (const role of ['employee', 'hr_admin', 'final_approver', 'md', 'director']) {
    const e = run(mw, { role });
    assert.ok(e instanceof ForbiddenError, role);
    assert.equal(e.message, `Role '${role}' is not authorized for this action`);
  }
  assert.ok(run(mw, undefined) instanceof ForbiddenError);

  const team = requirePermission('pm.utilisation.viewTeam');   // + md, director
  assert.equal(run(team, { role: 'director' }), undefined);
  assert.ok(run(team, { role: 'employee' }) instanceof ForbiddenError);
});

test('can(user, key) uses the same map', () => {
  assert.equal(can({ role: 'admin' }, 'pm.settings.manage'), true);
  assert.equal(can({ role: 'manager' }, 'pm.settings.manage'), false);
  assert.equal(can({ role: 'md' }, 'pm.allocation.decide'), true);
  assert.equal(can({ role: 'manager' }, 'pm.allocation.decide'), false);
  assert.equal(can({ role: 'employee' }, 'pm.project.view'), true);
  assert.equal(can(null, 'pm.project.view'), false);
  assert.throws(() => can({ role: 'admin' }, 'bogus.key'), /Unknown permission key/);
});

test('PERMISSIONS role lists are frozen', () => {
  assert.ok(Object.isFrozen(PERMISSIONS));
  assert.throws(() => { 'use strict'; PERMISSIONS['pm.project.view'].push('x'); });
});
