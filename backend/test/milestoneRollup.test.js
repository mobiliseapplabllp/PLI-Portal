'use strict';

/**
 * Sub-milestone weights auto-split + parent progress roll-up
 * (services/pm/milestone.service.js, migration 049).
 *
 *   equalSplit            n = 1, 3, 5, 6, 7 → always totals exactly 100.00
 *   worked example        parent 10% · 5 subs → 20% each; one sub at 50% → parent 10%
 *   add / delete          6th sub re-splits all; deleting one re-splits + recomputes
 *   guards                typing a sub weight → 400; typing progress on a parent with subs → 400
 *   echo                  sending the SAME stored value back is accepted (edit forms)
 *   no subs               a parent without subs keeps manual progress
 *   migration 049         second run changes 0 rows
 *
 * Runs against the shared UAT DB. Every row is __TEST__ prefixed and removed in
 * finally; ids from the service are read as `_id ?? id`.
 *
 *   node --test test/milestoneRollup.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { TEST_PREFIX, createCleanup, pickUser } = require('./_helpers');
const Project   = require('../src/models/pm/Project');
const Milestone = require('../src/models/pm/Milestone');
const svc       = require('../src/services/pm/milestone.service');
const migration049 = require('../migrations/049_milestone_weight_rollup');
delete process.env.SMTP_HOST; // the migration file re-loads .env

const idOf = (x) => x?._id ?? x?.id;
const sum  = (a) => Math.round(a.reduce((s, v) => s + v, 0) * 100) / 100;

async function makeProject(cleanup, admin) {
  const p = await Project.create({
    name: `${TEST_PREFIX} rollup ${Date.now()}`, status: 'In Progress',
    managerId: admin.id, createdById: admin.id,
  });
  cleanup.add(async () => {
    await Milestone.destroy({ where: { projectId: p.id, parentMilestoneId: { [require('sequelize').Op.ne]: null } } });
    await Milestone.destroy({ where: { projectId: p.id } });
    await p.destroy();
  });
  return p;
}

async function makeParent(projectId, weight = 10) {
  return Milestone.create({ projectId, name: `${TEST_PREFIX} phase`, weightPercentage: weight, isDefault: true, order: 1 });
}

const subsOf = (parentId) => Milestone.findAll({ where: { parentMilestoneId: parentId }, order: [['order', 'ASC']], raw: true });

test('milestone weight split + progress roll-up', async (t) => {
  const admin = await pickUser('admin');
  assert.ok(admin, 'UAT DB needs an active admin');

  await t.test('equalSplit always totals exactly 100.00', () => {
    assert.deepEqual(svc.equalSplit(1), [100]);
    assert.deepEqual(svc.equalSplit(3), [33.33, 33.33, 33.34]);
    assert.deepEqual(svc.equalSplit(5), [20, 20, 20, 20, 20]);
    for (const n of [1, 3, 5, 6, 7, 9]) assert.equal(sum(svc.equalSplit(n)), 100, `n=${n}`);
    assert.deepEqual(svc.equalSplit(0), []);
  });

  await t.test('worked example: 10% parent, 5 subs, one at 50% → parent 10%', async () => {
    const cleanup = createCleanup();
    try {
      const p = await makeProject(cleanup, admin);
      const parent = await makeParent(p.id, 10);
      const created = [];
      for (let i = 1; i <= 5; i++) {
        // a typed weight must be ignored — it is always derived
        created.push(await svc.createSubMilestone(p.id, parent.id, { name: `${TEST_PREFIX} sub ${i}`, weightPercentage: 77 }, admin));
      }
      const subs = await subsOf(parent.id);
      assert.deepEqual(subs.map((s) => Number(s.weightPercentage)), [20, 20, 20, 20, 20]);

      const res = await svc.updateMilestone(p.id, idOf(created[0]), { completionPercentage: 50 }, admin);
      assert.equal(res.parentMilestone.completionPercentage, 10, 'response carries the recomputed parent');
      await parent.reload();
      assert.equal(parent.completionPercentage, 10);

      for (const c of created) await svc.updateMilestone(p.id, idOf(c), { completionPercentage: 100 }, admin);
      await parent.reload();
      assert.equal(parent.completionPercentage, 100);
    } finally { await cleanup.run(); }
  });

  await t.test('adding a 6th sub re-splits all; deleting one re-splits and recomputes', async () => {
    const cleanup = createCleanup();
    try {
      const p = await makeProject(cleanup, admin);
      const parent = await makeParent(p.id, 10);
      const created = [];
      for (let i = 1; i <= 5; i++) created.push(await svc.createSubMilestone(p.id, parent.id, { name: `${TEST_PREFIX} s${i}` }, admin));
      await svc.updateMilestone(p.id, idOf(created[0]), { completionPercentage: 100 }, admin);
      await parent.reload();
      assert.equal(parent.completionPercentage, 20, '1 of 5 done');

      const sixth = await svc.createSubMilestone(p.id, parent.id, { name: `${TEST_PREFIX} s6` }, admin);
      let w = (await subsOf(parent.id)).map((s) => Number(s.weightPercentage));
      assert.equal(w.length, 6);
      assert.equal(sum(w), 100);
      assert.equal(sixth.parentMilestone.completionPercentage, 17, '100 × 16.66 ÷ 100 → 17');

      await svc.deleteMilestone(p.id, idOf(sixth), admin);
      await svc.deleteMilestone(p.id, idOf(created[4]), admin);
      w = (await subsOf(parent.id)).map((s) => Number(s.weightPercentage));
      assert.deepEqual(w, [25, 25, 25, 25]);
      await parent.reload();
      assert.equal(parent.completionPercentage, 25, '1 of 4 done');
    } finally { await cleanup.run(); }
  });

  await t.test('guards: typed sub weight and typed parent progress are refused; echoes pass', async () => {
    const cleanup = createCleanup();
    try {
      const p = await makeProject(cleanup, admin);
      const parent = await makeParent(p.id, 10);
      const a = await svc.createSubMilestone(p.id, parent.id, { name: `${TEST_PREFIX} a` }, admin);
      await svc.createSubMilestone(p.id, parent.id, { name: `${TEST_PREFIX} b` }, admin);

      await assert.rejects(svc.updateMilestone(p.id, idOf(a), { weightPercentage: 70 }, admin), /calculated automatically/);
      await assert.rejects(svc.updateMilestone(p.id, parent.id, { completionPercentage: 80 }, admin), /calculated from its sub-milestones/);

      // An edit form echoing the stored values back must still save the other fields
      const renamed = await svc.updateMilestone(p.id, idOf(a), { name: `${TEST_PREFIX} a2`, weightPercentage: 50 }, admin);
      assert.equal(renamed.name, `${TEST_PREFIX} a2`);
      await parent.reload();
      const same = await svc.updateMilestone(p.id, parent.id, { name: `${TEST_PREFIX} phase2`, completionPercentage: parent.completionPercentage }, admin);
      assert.equal(same.name, `${TEST_PREFIX} phase2`);

      // Parent weight (share of the project) is still editable
      const w = await svc.updateMilestone(p.id, parent.id, { weightPercentage: 15 }, admin);
      assert.equal(Number(w.weightPercentage), 15);
    } finally { await cleanup.run(); }
  });

  await t.test('a parent with no subs keeps manual progress', async () => {
    const cleanup = createCleanup();
    try {
      const p = await makeProject(cleanup, admin);
      const parent = await makeParent(p.id, 10);
      await svc.updateMilestone(p.id, parent.id, { completionPercentage: 40 }, admin);
      await parent.reload();
      assert.equal(parent.completionPercentage, 40);
    } finally { await cleanup.run(); }
  });

  await t.test('migration 049 fixes out-of-line rows and is idempotent', async () => {
    const cleanup = createCleanup();
    try {
      const p = await makeProject(cleanup, admin);
      const parent = await makeParent(p.id, 10);
      // Legacy shape: hand-typed sub weights and a parent % typed independently
      await Milestone.create({ projectId: p.id, parentMilestoneId: parent.id, name: `${TEST_PREFIX} l1`, weightPercentage: 70, completionPercentage: 100, order: 1 });
      await Milestone.create({ projectId: p.id, parentMilestoneId: parent.id, name: `${TEST_PREFIX} l2`, weightPercentage: null, completionPercentage: 0, order: 2 });
      await parent.update({ completionPercentage: 5 });

      // Scoped to this test project — the test must never rewrite real projects
      await migration049.run({ projectId: p.id });
      const w = (await subsOf(parent.id)).map((s) => Number(s.weightPercentage));
      assert.deepEqual(w, [50, 50]);
      await parent.reload();
      assert.equal(parent.completionPercentage, 50);

      const second = await migration049.run({ projectId: p.id });
      assert.equal(second.weightsChanged, 0);
      assert.equal(second.progressChanged, 0);
    } finally { await cleanup.run(); }
  });
});
