/**
 * Hours-based allocation through services/pm/project.service.js (DB).
 * Creates two temp projects and memberships for one allocation-free employee;
 * removes everything in `finally`.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const H = require('./_helpers');

const Project       = require('../src/models/pm/Project');
const ProjectMember = require('../src/models/pm/ProjectMember');
const projectService   = require('../src/services/pm/project.service');
const pmSettingsService = require('../src/services/pm/pmSettings.service');
const { workingDaysBetween } = require('../src/utils/capacityEngine');
const { AllocationConflictError, ValidationError } = require('../src/utils/errors');

const SEP = { from: '2026-09-01', to: '2026-09-30' };

test('project member allocation (hours/day, total mode, conflicts, confirmation)', async (t) => {
  const cleanup = H.createCleanup();
  try {
    const managerRow = await H.pickUser('manager');
    const manager    = H.fakeUser(managerRow, 'manager');
    // Offset 0 here; utilisation.test.js uses offset 1 — disjoint whichever inserts first.
    const employee   = await H.pickFreeUser(0, 'employee');
    const cal        = await pmSettingsService.getCalendar();
    const cap        = cal.hoursPerDay;
    assert.ok(cap >= 5, `test needs capacity >= 5h/day, got ${cap}`);

    const makeProject = async (label) => {
      const p = await Project.create({
        name: H.tag(label), managerId: managerRow.id, createdById: managerRow.id,
        status: 'In Progress', billingType: 'Non-Billable',
      });
      cleanup.add(async () => {
        await ProjectMember.destroy({ where: { projectId: p.id } });
        await Project.destroy({ where: { id: p.id } });
      });
      return p;
    };
    const projA = await makeProject('alloc A');
    const projB = await makeProject('alloc B');

    let memberA, memberB;

    await t.test('addMember 4h/day → hoursPerDay 4, allocationPct derived, hoursConfirmed true', async () => {
      memberA = await projectService.addMember(projA.id, {
        userId: employee.id, role: 'Developer', hoursPerDay: 4, allocationFrom: SEP.from, allocationTo: SEP.to,
      }, manager);
      assert.equal(Number(memberA.hoursPerDay), 4);
      assert.equal(Number(memberA.allocationPct), Math.round((4 / cap) * 100));
      assert.equal(memberA.hoursConfirmed, true);
      assert.equal(memberA.allocationMode, 'per_day');
      assert.equal(Number(memberA.allocationTotalHours), 4 * workingDaysBetween(SEP.from, SEP.to, cal));
    });

    await t.test('overlapping allocation that exceeds capacity → AllocationConflictError 409 naming dates', async () => {
      const tooMany = cap - 4 + 1;
      await assert.rejects(
        projectService.addMember(projB.id, { userId: employee.id, hoursPerDay: tooMany, allocationFrom: SEP.from, allocationTo: SEP.to }, manager),
        (err) => {
          assert.ok(err instanceof AllocationConflictError, `expected AllocationConflictError, got ${err && err.name}: ${err && err.message}`);
          assert.equal(err.statusCode, 409);
          assert.match(err.message, /Sep/);
          assert.match(err.message, /Over capacity on \d+ working day/);
          assert.equal(err.conflict.capacity, cap);
          assert.ok(err.conflict.overDays > 0);
          assert.ok(Array.isArray(err.conflict.ranges) && err.conflict.ranges.length >= 1);
          return true;
        }
      );
      assert.equal(await ProjectMember.count({ where: { projectId: projB.id } }), 0, 'no row written on conflict');
    });

    await t.test('the same window at exactly the remaining capacity → ok', async () => {
      memberB = await projectService.addMember(projB.id, {
        userId: employee.id, hoursPerDay: cap - 4, allocationFrom: SEP.from, allocationTo: SEP.to,
      }, manager);
      assert.equal(Number(memberB.hoursPerDay), cap - 4);
    });

    await t.test('updateMember does not conflict with its own row', async () => {
      const updated = await projectService.updateMember(projB.id, memberB.id, { hoursPerDay: cap - 4, responsibilities: 'unchanged hours' }, manager);
      assert.equal(Number(updated.hoursPerDay), cap - 4);
      assert.equal(updated.responsibilities, 'unchanged hours');
    });

    await t.test('total mode: 120h over 1 Sep – 31 Oct → hoursPerDay derived, allocationMode total', async () => {
      const from = '2026-09-01', to = '2026-10-31';
      const wd = workingDaysBetween(from, to, cal);
      const updated = await projectService.updateMember(projB.id, memberB.id, {
        allocationMode: 'total', allocationTotalHours: 120, allocationFrom: from, allocationTo: to,
      }, manager);
      assert.equal(updated.allocationMode, 'total');
      assert.equal(Number(updated.allocationTotalHours), 120);
      assert.equal(Number(updated.hoursPerDay), Math.round((120 / wd) * 10) / 10);
      assert.equal(Number(updated.allocationPct), Math.round((Number(updated.hoursPerDay) / cap) * 100));
      assert.equal(updated.hoursConfirmed, true);
    });

    await t.test('hoursPerDay 4.3 → ValidationError (0.5 steps)', async () => {
      await assert.rejects(
        projectService.updateMember(projB.id, memberB.id, { hoursPerDay: 4.3 }, manager),
        (err) => { assert.ok(err instanceof ValidationError); assert.match(err.message, /0\.5/); return true; }
      );
    });

    await t.test('confirmMemberHours flips hoursConfirmed', async () => {
      await ProjectMember.update({ hoursConfirmed: false }, { where: { id: memberA.id } });
      const before = await ProjectMember.findByPk(memberA.id);
      assert.equal(before.hoursConfirmed, false);
      const confirmed = await projectService.confirmMemberHours(projA.id, memberA.id, manager);
      assert.equal(confirmed.hoursConfirmed, true);
      assert.equal((await ProjectMember.findByPk(memberA.id)).hoursConfirmed, true);
    });

    await t.test('toAllocation exposes the engine shape with isEstimated derived from hoursConfirmed', async () => {
      const row = await ProjectMember.findByPk(memberA.id, { include: [{ model: Project, as: 'project' }] });
      const a = projectService.toAllocation(row, cal);
      assert.equal(a.projectId, projA.id);
      assert.equal(a.hoursPerDay, 4);
      assert.equal(a.isEstimated, false);
      assert.equal(a.allocationPct, Math.round((4 / cap) * 1000) / 10);
    });
  } finally {
    await cleanup.run();
    await H.closeDb();
  }
});
