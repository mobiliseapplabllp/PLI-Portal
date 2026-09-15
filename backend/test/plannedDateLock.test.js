/**
 * Planned-date lock / admin unlock through services/pm/milestone.service.js (DB).
 * Temp project + milestone; date logs are deleted by milestoneId, then the
 * milestone, then the project.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const H = require('./_helpers');

const Project            = require('../src/models/pm/Project');
const Milestone          = require('../src/models/pm/Milestone');
const PmMilestoneDateLog = require('../src/models/pm/PmMilestoneDateLog');
const svc = require('../src/services/pm/milestone.service');
const { ValidationError, ForbiddenError } = require('../src/utils/errors');

test('planned dates lock after first write; admin unlock is reasoned, audited and single-use', async (t) => {
  const cleanup = H.createCleanup();
  try {
    const managerRow = await H.pickUser('manager');
    const manager    = H.fakeUser(managerRow, 'manager');
    const admin      = H.fakeUser(await H.pickUser('admin'), 'admin');
    const reason     = H.tag('re-baseline reason');

    const project = await Project.create({
      name: H.tag('date lock'), managerId: managerRow.id, createdById: managerRow.id, status: 'In Progress',
    });
    cleanup.add(() => Project.destroy({ where: { id: project.id } }));

    const milestone = await Milestone.create({
      projectId: project.id, name: H.tag('milestone'), isDefault: true, status: 'not_started', order: 1,
    });
    cleanup.add(() => Milestone.destroy({ where: { id: milestone.id } }));
    cleanup.add(() => PmMilestoneDateLog.destroy({ where: { milestoneId: milestone.id } }));

    const pid = project.id, mid = milestone.id;
    const reload = () => Milestone.findByPk(mid);

    await t.test('manager sets plannedEndDate the first time', async () => {
      const r = await svc.updateMilestonePlannedDates(pid, mid, { plannedEndDate: '2026-10-15' }, manager);
      assert.equal(String(r.plannedEndDate).slice(0, 10), '2026-10-15');
      assert.equal((await reload()).plannedDatesUnlockedAt, null);
    });

    await t.test('second change while locked → ValidationError mentioning locked', async () => {
      await assert.rejects(
        svc.updateMilestonePlannedDates(pid, mid, { plannedEndDate: '2026-10-20' }, manager),
        (e) => e instanceof ValidationError && /locked/i.test(e.message)
      );
      assert.equal(String((await reload()).plannedEndDate).slice(0, 10), '2026-10-15', 'unchanged');
    });

    await t.test('setting a still-empty field (plannedStartDate) is allowed while plannedEndDate is locked', async () => {
      const r = await svc.updateMilestonePlannedDates(pid, mid, { plannedStartDate: '2026-09-01' }, manager);
      assert.equal(String(r.plannedStartDate).slice(0, 10), '2026-09-01');
    });

    await t.test('manager cannot unlock → ForbiddenError', async () => {
      await assert.rejects(svc.unlockPlannedDates(pid, mid, reason, manager), ForbiddenError);
    });

    await t.test('admin unlock without a reason → ValidationError', async () => {
      await assert.rejects(svc.unlockPlannedDates(pid, mid, '', admin), ValidationError);
      await assert.rejects(svc.unlockPlannedDates(pid, mid, '   ', admin), ValidationError);
      assert.equal((await reload()).plannedDatesUnlockedAt, null);
    });

    await t.test('admin unlock with a reason → ok, idempotent', async () => {
      const r = await svc.unlockPlannedDates(pid, mid, reason, admin);
      assert.ok(r.plannedDatesUnlockedAt);
      assert.equal(String(r.plannedDatesUnlockedBy), String(admin._id));
      const again = await svc.unlockPlannedDates(pid, mid, reason + ' again', admin);
      assert.equal(String(again.plannedDatesUnlockedAt), String(r.plannedDatesUnlockedAt));
    });

    await t.test('manager change succeeds once and the milestone re-locks', async () => {
      const r = await svc.updateMilestonePlannedDates(pid, mid, { plannedEndDate: '2026-10-20', reason: reason + ' edit' }, manager);
      assert.equal(String(r.plannedEndDate).slice(0, 10), '2026-10-20');
      const row = await reload();
      assert.equal(row.plannedDatesUnlockedAt, null);
      assert.equal(row.plannedDatesUnlockedBy, null);
      await assert.rejects(
        svc.updateMilestonePlannedDates(pid, mid, { plannedEndDate: '2026-10-25' }, manager),
        (e) => e instanceof ValidationError && /locked/i.test(e.message)
      );
    });

    await t.test('admin lockPlannedDates is a no-op when already locked and reversible when unlocked', async () => {
      await assert.rejects(svc.lockPlannedDates(pid, mid, manager), ForbiddenError);
      const noop = await svc.lockPlannedDates(pid, mid, admin);
      assert.equal(noop.plannedDatesUnlockedAt, null);
      await svc.unlockPlannedDates(pid, mid, reason + ' relock', admin);
      const locked = await svc.lockPlannedDates(pid, mid, admin);
      assert.equal(locked.plannedDatesUnlockedAt, null);
    });

    await t.test('audit trail in pm_milestone_date_logs', async () => {
      const logs = await PmMilestoneDateLog.findAll({ where: { milestoneId: mid }, order: [['createdAt', 'ASC']] });
      const unlocks = logs.filter(l => l.field === 'plannedDatesUnlock');
      assert.equal(unlocks.length, 2, 'one per effective unlock (idempotent repeat not logged)');
      assert.equal(unlocks[0].reason, reason);
      assert.equal(String(unlocks[0].changedById), String(admin._id));
      assert.equal(unlocks[0].oldValue, null);
      assert.equal(unlocks[0].newValue, null);

      const endChanges = logs.filter(l => l.field === 'plannedEndDate');
      assert.equal(endChanges.length, 2);
      assert.equal(endChanges[0].oldValue, null);
      assert.equal(String(endChanges[0].newValue).slice(0, 10), '2026-10-15');
      assert.equal(String(endChanges[1].oldValue).slice(0, 10), '2026-10-15');
      assert.equal(String(endChanges[1].newValue).slice(0, 10), '2026-10-20');
      assert.equal(endChanges[1].reason, reason + ' edit');
      assert.equal(String(endChanges[1].changedById), String(manager._id));

      assert.equal(logs.filter(l => l.field === 'plannedStartDate').length, 1);
      assert.equal(logs.filter(l => l.field === 'plannedDatesLock').length, 1);
    });
  } finally {
    await cleanup.run();
    await H.closeDb();
  }
});
