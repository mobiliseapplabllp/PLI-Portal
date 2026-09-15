/**
 * Helpdesk module smoke test — READ-ONLY. Every helpdesk model loads and can
 * query its table, every route module under routes/helpdesk requires cleanly,
 * and the option read paths answer 200 to a fake request.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const H = require('./_helpers');

const ROUTES_DIR = path.join(__dirname, '..', 'src', 'routes', 'helpdesk');

test('Helpdesk module smoke (read-only)', async (t) => {
  try {
    await t.test('every helpdesk model loads and findOne succeeds', async () => {
      const models = require('../src/models/helpdesk');
      const names = Object.keys(models).filter(k => k.startsWith('Hd'));
      assert.ok(names.length >= 12, `found ${names.length} helpdesk models`);
      for (const name of names) {
        const M = models[name];
        assert.equal(typeof M.findOne, 'function', `${name} is a Sequelize model`);
        await assert.doesNotReject(M.findOne(), `${name}.findOne`);
      }
      assert.ok(models.HdTicket.associations.assigneeUser, 'HdTicket.assigneeUser');
      assert.ok(models.HdTicket.associations.conversations, 'HdTicket.conversations');
      assert.ok(models.User.associations.hdGroup, 'User.hdGroup');
      for (const attr of ['allocationHoursPerDay', 'allocationFrom', 'allocationTo', 'allocationMode', 'allocationTotalHours']) {
        assert.ok(models.HdTicket.rawAttributes[attr], `HdTicket.${attr}`);
      }
    });

    await t.test('every route module under routes/helpdesk requires cleanly', () => {
      const files = fs.readdirSync(ROUTES_DIR).filter(f => f.endsWith('.js'));
      assert.ok(files.includes('index.js'));
      for (const f of files) {
        const router = require(path.join(ROUTES_DIR, f));
        assert.equal(typeof router, 'function', `${f} exports an express Router`);
        assert.ok(Array.isArray(router.stack) && router.stack.length > 0, `${f} registers routes`);
      }
    });

    await t.test('fakeHdUser matches the helpdeskAuth projection', async () => {
      const adminRow = await H.pickUser('admin');
      const hd = H.fakeHdUser(adminRow, 'admin');
      assert.equal(hd.id, adminRow.id);
      assert.equal(hd.isAdmin, true);
      assert.equal(hd.scope, 'all');
      assert.equal(hd.permissions.canManageTickets, true);
      const emp = H.fakeHdUser(adminRow, 'employee');
      assert.equal(emp.isAdmin, false);
      assert.equal(emp.scope, 'own');
      assert.equal(emp.permissions.canAssign, false);
    });

    await t.test('hdOption.controller read paths → 200', async () => {
      const ctrl = require('../src/controllers/helpdesk/hdOption.controller');
      const HdOption = require('../src/models/helpdesk/HdOption');
      const adminRow = await H.pickUser('admin');
      const req = (query) => ({ query, params: {}, user: H.fakeUser(adminRow, 'admin'), hdUser: H.fakeHdUser(adminRow, 'admin') });

      const res = H.mockRes(); const next = H.mockNext();
      await ctrl.listAllOptions(req({}), res, next);
      assert.equal(next.called, false, next.error && next.error.message);
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
      assert.equal(typeof res.body.data, 'object');

      const res2 = H.mockRes(); const next2 = H.mockNext();
      await ctrl.listOptions(req({ type: HdOption.VALID_TYPES[0] }), res2, next2);
      assert.equal(res2.statusCode, 200);
      assert.ok(Array.isArray(res2.body.data));

      const res3 = H.mockRes(); const next3 = H.mockNext();
      await ctrl.listOptions(req({ type: 'not-a-type' }), res3, next3);
      assert.equal(res3.statusCode, 400);
    });
  } finally {
    await H.closeDb();
  }
});
