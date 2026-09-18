'use strict';

/**
 * T1  team.service membership rule against real users (read-only)
 * B2  /helpdesk/teams endpoint shapes (controller called directly with doubles)
 * B3  helpdeskAuth exposes managerId / teamManagerId
 * T4  migration 043 is idempotent (run() twice) and the columns exist
 */

const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');

const { sequelize, mockRes, mockNext, closeDb } = require('./_helpers');
const teamService  = require('../src/services/helpdesk/team.service');
const teamCtrl     = require('../src/controllers/helpdesk/team.controller');
const { helpdeskAuth } = require('../src/middleware/helpdeskAuth');
const migration043 = require('../migrations/043_hd_ticket_team_manager');

const collator = new Intl.Collator('en', { sensitivity: 'base' });

/** Shared fixtures — all real, read-only. */
let teams;         // listTeams()
let manager;       // first team's manager row
let team;          // getTeamMembers(manager.id)
let outsider;      // active user NOT in manager's team

// Node 18.8's before() hook does not reliably run ahead of suite tests, so the
// fixtures are a memoised promise every test awaits first.
let fixturesP;
function fixtures() {
  if (!fixturesP) fixturesP = (async () => {
    teams = await teamService.listTeams();
    assert.ok(teams.length > 0, 'UAT DB must have at least one manager with active reports');
    manager = teams[0];
    team    = await teamService.getTeamMembers(manager.id);
    assert.ok(team, 'getTeamMembers must find the manager returned by listTeams');

    const memberIds = new Set(team.members.map(m => m.id));
    const [rows] = await sequelize.query(
      `SELECT id FROM users WHERE isActive = 1 AND id <> ? AND (managerId IS NULL OR managerId <> ?) LIMIT 1`,
      { replacements: [manager.id, manager.id] }
    );
    outsider = rows[0] || null;
    if (outsider) assert.ok(!memberIds.has(outsider.id));
  })();
  return fixturesP;
}

describe('helpdesk teams', () => {

after(closeDb);

// ── T1 · team.service ───────────────────────────────────────────────────────
describe('T1 team.service', () => {
  test('listTeams: every row has ≥1 report, memberCount excludes self, sorted by name', async () => {
    await fixtures();
    for (const t of teams) {
      assert.ok(t.memberCount >= 1, `${t.name} has no reports`);
      assert.deepEqual(Object.keys(t).sort(), ['departmentName', 'designation', 'email', 'id', 'memberCount', 'name']);
    }
    assert.equal(team.members.length - 1, manager.memberCount, 'memberCount must exclude the manager');
    const names = teams.map(t => t.name);
    assert.deepEqual(names, [...names].sort(collator.compare), 'teams must be sorted by name');
  });

  test('listTeams({ departmentId }) only returns managers of that department', async () => {
    await fixtures();
    const [[m]] = await sequelize.query('SELECT departmentId FROM users WHERE id = ?', { replacements: [manager.id] });
    if (!m.departmentId) return; // nothing to filter on for this manager
    const filtered = await teamService.listTeams({ departmentId: m.departmentId });
    assert.ok(filtered.some(t => t.id === manager.id));
    const [rows] = await sequelize.query(
      'SELECT id FROM users WHERE id IN (?) AND departmentId <> ?',
      { replacements: [filtered.map(t => t.id), m.departmentId] }
    );
    assert.equal(rows.length, 0, 'a manager from another department leaked through the filter');
  });

  test('getTeamMembers: manager first, reports sorted by name, unknown → null', async () => {
    await fixtures();
    assert.deepEqual(Object.keys(team.manager).sort(), ['email', 'id', 'name']);
    assert.equal(team.members[0].id, manager.id);
    assert.equal(team.members[0].isManager, true);
    for (const m of team.members) {
      assert.deepEqual(Object.keys(m).sort(), ['designation', 'email', 'id', 'isManager', 'name', 'role']);
      assert.equal('passwordHash' in m, false);
    }
    const reports = team.members.slice(1);
    assert.ok(reports.every(r => r.isManager === false));
    const names = reports.map(r => r.name);
    assert.deepEqual(names, [...names].sort(collator.compare));
    assert.equal(await teamService.getTeamMembers('__TEST__-no-such-user'), null);
  });

  test('isInTeam: manager, each report → true; outsider / unknown → false', async () => {
    await fixtures();
    assert.equal(await teamService.isInTeam(manager.id, manager.id), true);
    for (const m of team.members) assert.equal(await teamService.isInTeam(m.id, manager.id), true, m.name);
    if (outsider) assert.equal(await teamService.isInTeam(outsider.id, manager.id), false);
    assert.equal(await teamService.isInTeam('__TEST__-nobody', manager.id), false);
    assert.equal(await teamService.isInTeam(manager.id, null), false);
  });

  test('teamMemberIds: [managerId, ...reports] matching getTeamMembers; unknown/inactive → []', async () => {
    await fixtures();
    const ids = await teamService.teamMemberIds(manager.id);
    assert.equal(ids[0], manager.id);
    assert.deepEqual([...ids].sort(), team.members.map(m => m.id).sort());
    assert.deepEqual(await teamService.teamMemberIds('__TEST__-nobody'), []);
    assert.deepEqual(await teamService.teamMemberIds(null), []);

    const [[inactive]] = await sequelize.query('SELECT id FROM users WHERE isActive = 0 LIMIT 1');
    if (inactive) assert.deepEqual(await teamService.teamMemberIds(inactive.id), []);
  });

  test('managerOf: report → manager id; unknown → null', async () => {
    await fixtures();
    const report = team.members.find(m => !m.isManager);
    assert.equal(await teamService.managerOf(report.id), manager.id);
    assert.equal(await teamService.managerOf('__TEST__-nobody'), null);
    assert.equal(await teamService.managerOf(null), null);
  });
});

// ── B2 · endpoint shapes ────────────────────────────────────────────────────
describe('B2 /helpdesk/teams endpoints', () => {
  test('GET /helpdesk/teams → success body, ids renamed to _id', async () => {
    await fixtures();
    const res = mockRes(); const next = mockNext();
    await teamCtrl.listTeams({ query: {} }, res, next);
    assert.equal(next.called, false);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.data));
    assert.deepEqual(Object.keys(res.body.data[0]).sort(), ['_id', 'departmentName', 'designation', 'email', 'memberCount', 'name']);
  });

  test('GET /helpdesk/teams/:managerId/members → manager + members, manager first', async () => {
    await fixtures();
    const res = mockRes(); const next = mockNext();
    await teamCtrl.getTeamMembers({ params: { managerId: manager.id } }, res, next);
    assert.equal(next.called, false);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.manager._id, manager.id);
    assert.equal(res.body.data.members[0].isManager, true);
    assert.equal(res.body.data.members[0]._id, manager.id);
    assert.deepEqual(Object.keys(res.body.data.members[0]).sort(), ['_id', 'designation', 'email', 'isManager', 'name', 'role']);
  });

  test('GET /helpdesk/teams/:managerId/members → 404 with message + error.message', async () => {
    await fixtures();
    const res = mockRes(); const next = mockNext();
    await teamCtrl.getTeamMembers({ params: { managerId: '__TEST__-nobody' } }, res, next);
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.success, false);
    assert.equal(res.body.message, 'Team manager not found');
    assert.equal(res.body.error.message, 'Team manager not found');
  });
});

// ── B3 · helpdeskAuth ───────────────────────────────────────────────────────
describe('B3 helpdeskAuth req.hdUser', () => {
  test('uses req.user.managerId when present (no lookup); teamManagerId = managerId; groupId kept', async () => {
    await fixtures();
    const report = team.members.find(m => !m.isManager);
    const req = { user: { _id: report.id, name: report.name, email: report.email, role: 'employee', managerId: manager.id, hdGroupId: 7 } };
    const next = mockNext();
    await helpdeskAuth(req, mockRes(), next);
    assert.equal(next.called, true); assert.equal(next.error, undefined);
    assert.equal(req.hdUser.id, report.id);
    assert.equal(req.hdUser.managerId, manager.id);
    assert.equal(req.hdUser.teamManagerId, manager.id);
    assert.equal(req.hdUser.groupId, 7);
    assert.equal(req.hdUser.scope, 'own');
  });

  test('looks managerId up once when req.user lacks the property', async () => {
    await fixtures();
    const report = team.members.find(m => !m.isManager);
    const req = { user: { _id: report.id, name: report.name, email: report.email, role: 'manager' } };
    const next = mockNext();
    await helpdeskAuth(req, mockRes(), next);
    assert.equal(next.error, undefined);
    assert.equal(req.hdUser.managerId, manager.id);
    assert.equal(req.hdUser.teamManagerId, manager.id);
    assert.equal(req.hdUser.groupId, null);
    assert.equal(req.hdUser.scope, 'group'); // role→scope mapping unchanged
  });

  test('null managerId when user has no manager or is unknown', async () => {
    await fixtures();
    const req = { user: { _id: '__TEST__-nobody', name: 'x', email: 'x', role: 'employee' } };
    const next = mockNext();
    await helpdeskAuth(req, mockRes(), next);
    assert.equal(next.error, undefined);
    assert.equal(req.hdUser.managerId, null);
    assert.equal(req.hdUser.teamManagerId, null);
  });
});

// ── T4 · migration 043 idempotence ─────────────────────────────────────────
describe('T4 migration 043', () => {
  test('run() twice without error; columns are CHAR(36) utf8mb4_bin and indexed', async () => {
    await fixtures();
    const silent = () => {};
    const origLog = console.log; console.log = silent;
    try {
      await migration043.run();
      await migration043.run();
    } finally { console.log = origLog; }

    const [cols] = await sequelize.query(
      `SELECT TABLE_NAME t, COLUMN_NAME c, COLUMN_TYPE ty, COLLATION_NAME co, IS_NULLABLE n
         FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND ((TABLE_NAME = 'hd_tickets'  AND COLUMN_NAME IN ('team_manager_id', 'pm_project_id'))
            OR (TABLE_NAME = 'hd_projects' AND COLUMN_NAME = 'pm_project_id'))`
    );
    assert.equal(cols.length, 3, 'expected exactly three new columns');
    for (const c of cols) {
      assert.equal(c.ty, 'char(36)', `${c.t}.${c.c}`);
      assert.equal(c.co, 'utf8mb4_bin', `${c.t}.${c.c}`);
      assert.equal(c.n, 'YES', `${c.t}.${c.c}`);
    }
    const [idx] = await sequelize.query(
      `SELECT TABLE_NAME t, INDEX_NAME i FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND INDEX_NAME IN ('idx_hd_tickets_team_manager', 'idx_hd_tickets_pm_project', 'idx_hd_projects_pm_project_id')`
    );
    assert.equal(new Set(idx.map(r => r.i)).size, 3, 'all three indexes must exist');

    // Backfill invariant: no ticket whose assignee has a manager is left without a team.
    const [[gap]] = await sequelize.query(
      `SELECT COUNT(*) n FROM hd_tickets t JOIN users u ON u.id = t.assignee_id
        WHERE t.team_manager_id IS NULL AND u.managerId IS NOT NULL`
    );
    assert.equal(Number(gap.n), 0);
  });
});

}); // helpdesk teams
