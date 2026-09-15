/**
 * PM module smoke test — READ-ONLY. Every PM model loads and can query its
 * table, every route module under routes/pm requires cleanly, and the read
 * paths of the config/calendar controllers answer 200 to a fake request.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const H = require('./_helpers');

const MODELS_DIR = path.join(__dirname, '..', 'src', 'models', 'pm');
const ROUTES_DIR = path.join(__dirname, '..', 'src', 'routes', 'pm');

test('PM module smoke (read-only)', async (t) => {
  try {
    await t.test('every model in src/models/pm loads and findOne succeeds', async () => {
      const files = fs.readdirSync(MODELS_DIR).filter(f => f.endsWith('.js'));
      assert.ok(files.length >= 15, `found ${files.length} PM models`);
      for (const f of files) {
        const M = require(path.join(MODELS_DIR, f));
        assert.equal(typeof M.findOne, 'function', `${f} is a Sequelize model`);
        await assert.doesNotReject(M.findOne(), `${f}.findOne`);
      }
      const assoc = require('../src/models/associations');
      for (const k of ['Project', 'ProjectMember', 'Milestone', 'PmHoliday', 'PmSettings', 'PmMilestoneDateLog']) {
        assert.ok(assoc[k], `associations exports ${k}`);
      }
      assert.ok(assoc.Project.associations.members, 'Project.members');
      assert.ok(assoc.ProjectMember.associations.project, 'ProjectMember.project');
      assert.ok(assoc.Project.associations.milestones, 'Project.milestones');
    });

    await t.test('every route module under routes/pm requires cleanly', () => {
      const files = fs.readdirSync(ROUTES_DIR).filter(f => f.endsWith('.js'));
      assert.ok(files.includes('index.js'));
      for (const f of files) {
        const router = require(path.join(ROUTES_DIR, f));
        assert.equal(typeof router, 'function', `${f} exports an express Router`);
        assert.ok(Array.isArray(router.stack) && router.stack.length > 0, `${f} registers routes`);
      }
    });

    await t.test('config.controller read paths → 200', async () => {
      const ctrl = require('../src/controllers/pm/config.controller');
      const admin = H.fakeUser(await H.pickUser('admin'), 'admin');
      for (const [name, query] of [['getProjectTypes', {}], ['getStatuses', { scope: 'project' }], ['getAllStatuses', {}],
                                   ['getMilestoneTemplates', {}], ['getMemberRoles', {}]]) {
        const res = H.mockRes(); const next = H.mockNext();
        await ctrl[name]({ query, params: {}, user: admin }, res, next);
        assert.equal(next.called, false, `${name}: ${next.error && next.error.message}`);
        assert.equal(res.statusCode, 200, name);
        assert.equal(res.body.success, true, name);
      }
    });

    await t.test('calendar.controller / pmSettings read paths → 200', async () => {
      const cal = require('../src/controllers/pm/calendar.controller');
      const admin = H.fakeUser(await H.pickUser('admin'), 'admin');
      const res = H.mockRes(); const next = H.mockNext();
      await cal.getCalendarPreview({ query: { month: '2026-09' }, user: admin }, res, next);
      assert.equal(next.called, false, next.error && next.error.message);
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.data.days.length, 30);
      const res2 = H.mockRes(); const next2 = H.mockNext();
      await cal.getHolidays({ query: { year: '2026' }, user: admin }, res2, next2);
      assert.equal(res2.statusCode, 200);
      assert.ok(Array.isArray(res2.body.data));

      const settings = await require('../src/services/pm/pmSettings.service').getSettings();
      assert.equal(settings.id, 1);
      assert.ok(Number(settings.workingHoursPerDay) > 0);
    });

    await t.test('utilisation / project controllers export their handlers', () => {
      const util = require('../src/controllers/pm/utilisation.controller');
      const proj = require('../src/controllers/pm/project.controller');
      assert.equal(typeof util.getUserUtilisation, 'function');
      assert.equal(typeof util.getTeamUtilisation, 'function');
      assert.equal(typeof proj.getUserAvailability, 'function');
      for (const k of ['addMember', 'updateMember', 'confirmMemberHours', 'removeMember']) {
        assert.equal(typeof require('../src/services/pm/project.service')[k], 'function', k);
      }
    });
  } finally {
    await H.closeDb();
  }
});
