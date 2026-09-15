/**
 * User Master "derived + override" (item 4c).
 *
 * GET /helpdesk/user-groups returns, per user, the group derived from the
 * user's KPI department, the explicit hd_group_id override, and the effective
 * group (override ?? derived). Setting and clearing the override go through
 * the existing single + bulk endpoints.
 *
 * Writes a `__TEST__` hd_group (removed again) and temporarily changes one
 * real user's hd_group_id, which is restored to its original value in finally.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const H = require('./_helpers');

const { HdGroup } = require('../src/models/helpdesk');
const ctrl = require('../src/controllers/helpdesk/hdUserGroup.controller');

const admin = { id: 'test-admin', isAdmin: true, permissions: {} };

async function call(handler, { body = {}, params = {} } = {}) {
  const res = H.mockRes();
  const next = H.mockNext();
  await handler({ body, params, query: {}, hdUser: admin }, res, next);
  if (next.error) throw next.error;
  return res;
}

async function rowFor(userId) {
  const res = await call(ctrl.listUserGroups);
  assert.equal(res.statusCode, 200);
  const row = res.body.data.find((u) => u._id === userId);
  assert.ok(row, 'user present in the user-groups list');
  return row;
}

test('User Master: derived group from department, override wins, clearing restores derived', async () => {
  const cleanup = H.createCleanup();
  try {
    // A department where no existing group is lower-id than ours can't be guaranteed,
    // so pick a department that has NO hd_group yet — then ours is the derived one.
    const [user] = await H.select(
      `SELECT u.id, u.departmentId, u.hd_group_id AS hdGroupId FROM users u
        WHERE u.isActive = 1 AND u.departmentId IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM hd_groups g WHERE g.department_id = u.departmentId)
        ORDER BY u.id LIMIT 1`);
    assert.ok(user, 'an active user whose department has no helpdesk group yet');
    const original = user.hdGroupId ?? null;
    cleanup.add(() => H.sequelize.query('UPDATE users SET hd_group_id = :g WHERE id = :id',
      { replacements: { g: original, id: user.id } }));

    const derived = await HdGroup.create({ name: H.tag('dept group'), departmentId: user.departmentId });
    cleanup.add(() => HdGroup.destroy({ where: { id: derived.id } }));
    const other = await HdGroup.create({ name: H.tag('override group') });
    cleanup.add(() => HdGroup.destroy({ where: { id: other.id } }));

    // Start from "no override".
    await call(ctrl.assignUserGroup, { params: { userId: user.id }, body: { groupId: null } });

    let row = await rowFor(user.id);
    assert.equal(row.departmentId, user.departmentId);
    assert.equal(row.derivedGroupId, derived.id);
    assert.equal(row.derivedGroupName, derived.name);
    assert.equal(row.overrideGroupId, null);
    assert.equal(row.overrideGroupName, null);
    assert.equal(row.effectiveGroupId, derived.id);
    assert.equal(row.effectiveGroupName, derived.name);
    assert.ok('hdGroupId' in row, 'legacy hdGroupId kept');

    // Set override (single endpoint) → effective = override.
    await call(ctrl.assignUserGroup, { params: { userId: user.id }, body: { groupId: other.id } });
    row = await rowFor(user.id);
    assert.equal(row.derivedGroupId, derived.id);
    assert.equal(row.overrideGroupId, other.id);
    assert.equal(row.overrideGroupName, other.name);
    assert.equal(row.effectiveGroupId, other.id);
    assert.equal(row.effectiveGroupName, other.name);

    // Clear override (single endpoint, null) → effective = derived.
    await call(ctrl.assignUserGroup, { params: { userId: user.id }, body: { groupId: null } });
    row = await rowFor(user.id);
    assert.equal(row.overrideGroupId, null);
    assert.equal(row.effectiveGroupId, derived.id);

    // Bulk endpoint: set then clear with null.
    let res = await call(ctrl.bulkAssignUserGroups, { body: { assignments: [{ userId: user.id, groupId: other.id }] } });
    assert.equal(res.statusCode, 200);
    assert.equal((await rowFor(user.id)).effectiveGroupId, other.id);
    res = await call(ctrl.bulkAssignUserGroups, { body: { assignments: [{ userId: user.id, groupId: null }] } });
    assert.equal(res.statusCode, 200);
    row = await rowFor(user.id);
    assert.equal(row.overrideGroupId, null);
    assert.equal(row.effectiveGroupId, derived.id);
  } finally {
    await cleanup.run();
    await H.closeDb();
  }
});
