'use strict';

/**
 * T2  Allocation exceptions — service layer against the shared UAT DB.
 *
 *   request → member pending + approval row (exception)
 *   D1  other-project capacity check ignores the pending row
 *   D2  cap enforced (exceptionMaxHoursPerDay)
 *   "fits" → 400 no exception needed
 *   D3  requester cannot decide own; non-approver role 403
 *   approve → member active/approved/confirmed; then counted with its hours
 *   already decided → 409
 *   reject → snapshot restored (existing member) / row deleted (new member)
 *   list → approvers see all, requester sees own, others see none; enrichment shape
 *   migration 044 idempotent
 *
 * Every row is __TEST__-prefixed and removed in finally. Real users are read-only.
 * The window is far in the future (2031) and the target user is chosen to have
 * NO counted allocation in it, so the arithmetic is deterministic.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { sequelize, pickUser, createCleanup, closeDb, TEST_PREFIX } = require('./_helpers');
const Project              = require('../src/models/pm/Project');
const ProjectMember        = require('../src/models/pm/ProjectMember');
const PmAllocationApproval = require('../src/models/pm/PmAllocationApproval');
const AllocationSegment    = require('../src/models/pm/AllocationSegment');
const PmAllocationHistory  = require('../src/models/pm/PmAllocationHistory');
const User                 = require('../src/models/User');
const svc                  = require('../src/services/pm/project.service');
const pmSettings           = require('../src/services/pm/pmSettings.service');
const E                    = require('../src/utils/capacityEngine');
const migration044         = require('../migrations/044_allocation_exception');

const FROM = '2031-03-03', TO = '2031-03-14';   // Mon 3 Mar 2031 → Fri 14 Mar 2031

// Node 18.8's before() hook is unreliable → memoised fixtures every test awaits.
let fx;
function fixtures() {
  if (!fx) fx = (async () => {
    const policy   = await pmSettings.getExceptionPolicy();
    const calendar = await pmSettings.getCalendar();
    const approverRole = policy.roles[0];
    const approver = await pickUser(approverRole);
    assert.ok(approver, `UAT DB needs an active user with approver role "${approverRole}"`);
    // Requester: a manager who is NOT an approver when possible (so approver ≠ requester)
    let requester = await pickUser('manager');
    if (!requester || String(requester.id) === String(approver.id)) requester = await pickUser('senior_manager');
    assert.ok(requester && String(requester.id) !== String(approver.id), 'need a manager distinct from the approver');
    const outsiderRole = ['employee', 'hr_admin', 'sales_director', 'final_approver'].find(r => !policy.roles.includes(r));
    const outsider = await pickUser(outsiderRole);
    assert.ok(outsider, `need an active user with non-approver role "${outsiderRole}"`);

    // Target: an active employee with NO counted allocation in the window
    const candidates = await User.findAll({
      attributes: ['id', 'name', 'email', 'role'], where: { role: 'employee', isActive: true },
      order: [['name', 'ASC']], limit: 40, raw: true,
    });
    let target = null;
    for (const c of candidates) {
      const others = await svc.getOtherActiveAllocations(c.id, calendar);
      if (E.summarise(others, calendar, FROM, TO).peakHours === 0) { target = c; break; }
    }
    assert.ok(target, 'no employee free in the 2031 window');
    return { policy, calendar, approver, requester, outsider, target, cap: calendar.hoursPerDay };
  })();
  return fx;
}

async function makeProject(cleanup, name, managerId) {
  const p = await Project.create({ name: `${TEST_PREFIX} ${name} ${Date.now()}`, status: 'In Progress', managerId, createdById: managerId });
  cleanup.add(async () => {
    // history + segments too (migration 045) — otherwise every run leaves orphan rows behind
    await PmAllocationHistory.destroy({ where: { projectId: p.id } });
    await PmAllocationApproval.destroy({ where: { projectId: p.id } });
    await AllocationSegment.destroy({ where: { projectId: p.id } });
    await ProjectMember.destroy({ where: { projectId: p.id } });
    await p.destroy();
  });
  return p;
}

const overHours = (cap) => cap + 2;   // always over capacity on its own, well under the 12h default cap

// Node 18.8 runs a describe()'s tests concurrently and its top-level hooks are unreliable →
// ONE top-level test whose awaited subtests run strictly in order (they share one target user).
test('allocation exceptions', async (t) => {
try {

await t.test('request → member pending + approval row; D1 pending row ignored elsewhere; approve → active', async () => {
  const f = await fixtures();
  const cleanup = createCleanup();
  try {
    const projectA = await makeProject(cleanup, 'ExcA', f.requester.id);
    const hours = overHours(f.cap);

    const r0 = await svc.requestAllocationException(projectA.id, {
      userId: f.target.id, hoursPerDay: hours, allocationFrom: FROM, allocationTo: TO, role: 'Dev', reason: 'crunch',
    }, f.requester);
    const { member, approval, project, user, overload } = r0;

    assert.equal(member.projectId, projectA.id);
    assert.equal(member.exceptionStatus, 'pending');
    assert.equal(member.allocationStatus, 'pending');
    assert.equal(member.hoursConfirmed, false);
    assert.equal(Number(member.hoursPerDay), hours);
    assert.equal(member.exceptionApprovalId, approval.id);
    assert.equal(approval.requestType, 'exception');
    assert.equal(approval.status, 'pending');
    assert.equal(approval.memberId, member.id);
    assert.equal(approval.requestedById, String(f.requester.id));
    assert.equal(Number(approval.overloadHours), 2);
    // B2/segments: previousSnapshot is { memberCreated, segment } — a new member + new period
    assert.deepEqual(approval.previousSnapshot, { memberCreated: true, segment: null }, 'new member + new period → nothing to restore');
    assert.equal(approval.segmentId, r0.segment.id);
    assert.equal(r0.segment.memberId, member.id);
    assert.equal(r0.segment.exceptionStatus, 'pending');
    assert.equal(Number(r0.segment.hoursPerDay), hours);
    assert.equal(r0.segment.exceptionApprovalId, approval.id);
    assert.equal(approval.reason, 'crunch');
    assert.equal(project.id, projectA.id);
    assert.equal(String(user.id), String(f.target.id));
    assert.equal(overload.overloadHours, 2);
    assert.equal(overload.exceptionMaxHoursPerDay, f.policy.maxHoursPerDay);

    // D1 — the pending row is invisible to capacity checks
    const others = await svc.getOtherActiveAllocations(f.target.id, f.calendar);
    assert.ok(!others.some(o => o.memberId === member.id), 'pending row must not be counted');
    // …so a full-capacity allocation on another project still fits
    const projectB = await makeProject(cleanup, 'ExcB', f.requester.id);
    const mB = await svc.addMember(projectB.id, { userId: f.target.id, hoursPerDay: f.cap, allocationFrom: FROM, allocationTo: TO }, f.requester);
    assert.equal(Number(mB.hoursPerDay), f.cap);
    await mB.destroy();

    // Editing the pending row through the normal path is refused (409)
    await assert.rejects(
      svc.updateMember(projectA.id, member.id, { role: 'Lead' }, f.requester),
      (e) => e.statusCode === 409
    );

    // D3 — requester cannot decide own (make the requester an approver-role user to reach the self check)
    const selfProject = await makeProject(cleanup, 'ExcSelf', f.approver.id);
    const own = await svc.requestAllocationException(selfProject.id, {
      userId: f.target.id, hoursPerDay: hours, allocationFrom: '2031-04-01', allocationTo: '2031-04-10', reason: 'own',
    }, f.approver);
    await assert.rejects(
      svc.decideAllocationException(own.approval.id, { action: 'approve' }, f.approver),
      (e) => e.statusCode === 403 && /own/.test(e.message)
    );
    // non-approver role → 403
    await assert.rejects(
      svc.decideAllocationException(approval.id, { action: 'approve' }, f.outsider),
      (e) => e.statusCode === 403
    );
    // bad action → 400
    await assert.rejects(
      svc.decideAllocationException(approval.id, { action: 'maybe' }, f.approver),
      (e) => e.statusCode === 400
    );

    // approve
    const decided = await svc.decideAllocationException(approval.id, { action: 'approve', responseNote: 'ok' }, f.approver);
    assert.equal(decided.approval.status, 'approved');
    assert.equal(decided.approval.approverNote, 'ok');
    assert.equal(decided.approval.approvedById, String(f.approver.id));
    assert.equal(decided.member.exceptionStatus, 'approved');
    assert.equal(decided.member.allocationStatus, 'active');
    assert.equal(decided.member.hoursConfirmed, true);
    assert.equal(decided.member.exceptionApprovalId, approval.id);
    assert.equal(decided.project.id, projectA.id);
    assert.equal(String(decided.requester.id), String(f.requester.id));

    // now it counts, with its over-capacity hours
    const after = await svc.getOtherActiveAllocations(f.target.id, f.calendar);
    const mine = after.find(o => o.memberId === member.id);
    assert.ok(mine, 'approved row must be counted');
    assert.equal(mine.hoursPerDay, hours);
    assert.equal(mine.exceptionStatus, 'approved');

    // role-only edit of an approved row is allowed (no re-check); the exception survives
    const edited = await svc.updateMember(projectA.id, member.id, { role: 'Lead' }, f.requester);
    assert.equal(edited.role, 'Lead');
    assert.equal(edited.exceptionStatus, 'approved');

    // already decided → 409
    await assert.rejects(
      svc.decideAllocationException(approval.id, { action: 'reject' }, f.approver),
      (e) => e.statusCode === 409
    );
  } finally { await cleanup.run(); }
});

await t.test('D2 cap enforced; "fits" → 400 no exception needed; validation errors', async () => {
  const f = await fixtures();
  const cleanup = createCleanup();
  try {
    const p = await makeProject(cleanup, 'ExcCap', f.requester.id);
    const base = { userId: f.target.id, allocationFrom: FROM, allocationTo: TO, reason: 'r' };

    await assert.rejects(
      svc.requestAllocationException(p.id, { ...base, hoursPerDay: f.policy.maxHoursPerDay + 1 }, f.requester),
      (e) => e.statusCode === 400 && e.message === `Exceeds the exception cap of ${f.policy.maxHoursPerDay} hrs/day`
    );
    // total mode that derives to more than the cap is refused too
    const wd = E.workingDaysBetween(FROM, TO, f.calendar);
    await assert.rejects(
      svc.requestAllocationException(p.id, { ...base, allocationMode: 'total', allocationTotalHours: (f.policy.maxHoursPerDay + 2) * wd }, f.requester),
      (e) => e.statusCode === 400 && /exception cap/.test(e.message)
    );
    // TOTAL daily load over the cap is refused even when this request alone is under it:
    // existing cap-1 hrs elsewhere + (cap - 2) requested here > maxHoursPerDay (12 by default, cap 8)
    {
      const other = await makeProject(cleanup, 'ExcCapOther', f.requester.id);
      const m = await svc.addMember(other.id, { userId: f.target.id, hoursPerDay: f.cap - 1, allocationFrom: FROM, allocationTo: TO }, f.requester);
      cleanup.add(() => m.destroy());
      await assert.rejects(
        svc.requestAllocationException(p.id, { ...base, hoursPerDay: f.policy.maxHoursPerDay - 2 }, f.requester),
        (e) => e.statusCode === 400 && /exception cap/.test(e.message) && /on the person/.test(e.message)
      );
      await m.destroy();
    }
    // fits → not an exception
    await assert.rejects(
      svc.requestAllocationException(p.id, { ...base, hoursPerDay: 4 }, f.requester),
      (e) => e.statusCode === 400 && e.message === 'No exception needed — this allocation fits'
    );
    // reason / dates / user required
    await assert.rejects(svc.requestAllocationException(p.id, { ...base, reason: '  ', hoursPerDay: 10 }, f.requester), (e) => e.statusCode === 400 && /reason/.test(e.message));
    await assert.rejects(svc.requestAllocationException(p.id, { ...base, allocationTo: null, hoursPerDay: 10 }, f.requester), (e) => e.statusCode === 400);
    await assert.rejects(svc.requestAllocationException(p.id, { ...base, userId: null, hoursPerDay: 10 }, f.requester), (e) => e.statusCode === 400);
    // permission = same as addMember
    await assert.rejects(svc.requestAllocationException(p.id, { ...base, hoursPerDay: 10 }, f.outsider), (e) => e.statusCode === 403);
    await assert.rejects(svc.requestAllocationException('00000000-0000-0000-0000-000000000000', { ...base, hoursPerDay: 10 }, f.requester), (e) => e.statusCode === 404);
    // nothing was written
    assert.equal(await ProjectMember.count({ where: { projectId: p.id } }), 0);
    assert.equal(await PmAllocationApproval.count({ where: { projectId: p.id } }), 0);
  } finally { await cleanup.run(); }
});

await t.test('reject: new member row deleted; existing member restored from snapshot', async () => {
  const f = await fixtures();
  const cleanup = createCleanup();
  try {
    const p = await makeProject(cleanup, 'ExcRej', f.requester.id);
    const hours = overHours(f.cap);

    // new member → deleted on reject
    const r1 = await svc.requestAllocationException(p.id, { userId: f.target.id, hoursPerDay: hours, allocationFrom: FROM, allocationTo: TO, reason: 'x' }, f.requester);
    const d1 = await svc.decideAllocationException(r1.approval.id, { action: 'reject', responseNote: 'no' }, f.approver);
    assert.equal(d1.approval.status, 'rejected');
    assert.equal(d1.member, null);
    assert.equal(await ProjectMember.findByPk(r1.member.id), null, 'new member row must be deleted');

    // existing member (4h, confirmed) → request 10h on the same row → reject → back to 4h
    const m0 = await svc.addMember(p.id, { userId: f.target.id, hoursPerDay: 4, allocationFrom: FROM, allocationTo: TO, role: 'QA' }, f.requester);
    const r2 = await svc.requestAllocationException(p.id, { userId: f.target.id, memberId: m0.id, hoursPerDay: hours, allocationFrom: FROM, allocationTo: TO, reason: 'y' }, f.requester);
    assert.equal(r2.member.id, m0.id, 'same row re-used');
    assert.equal(Number(r2.member.hoursPerDay), hours);
    // the snapshot is of the SEGMENT that was re-used (the member already existed)
    assert.equal(r2.approval.previousSnapshot.memberCreated, false);
    assert.equal(Number(r2.approval.previousSnapshot.segment.hoursPerDay), 4);
    assert.equal(r2.approval.previousSnapshot.segment.fromDate, FROM);
    assert.equal(r2.member.role, 'QA');
    // a second request while one is pending → 409
    await assert.rejects(
      svc.requestAllocationException(p.id, { userId: f.target.id, hoursPerDay: hours, allocationFrom: FROM, allocationTo: TO, reason: 'z' }, f.requester),
      (e) => e.statusCode === 409
    );
    const d2 = await svc.decideAllocationException(r2.approval.id, { action: 'reject' }, f.approver);
    assert.equal(d2.approval.status, 'rejected');
    assert.equal(d2.member.id, m0.id);
    assert.equal(Number(d2.member.hoursPerDay), 4);
    assert.equal(d2.member.role, 'QA');
    assert.equal(d2.member.exceptionStatus, 'none');
    assert.equal(d2.member.exceptionApprovalId, null);
    assert.equal(d2.member.allocationStatus, 'active');
    assert.equal(d2.member.hoursConfirmed, true);
    const fresh = await ProjectMember.findByPk(m0.id);
    assert.equal(Number(fresh.hoursPerDay), 4);
    assert.equal(fresh.exceptionStatus, 'none');
  } finally { await cleanup.run(); }
});

await t.test('list: approvers see all, requester sees own, others see none; enrichment shape', async () => {
  const f = await fixtures();
  const cleanup = createCleanup();
  try {
    const p = await makeProject(cleanup, 'ExcList', f.requester.id);
    const hours = overHours(f.cap);
    const { approval } = await svc.requestAllocationException(p.id, { userId: f.target.id, hoursPerDay: hours, allocationFrom: FROM, allocationTo: TO, reason: 'list' }, f.requester);

    const asApprover = await svc.listAllocationExceptions({ status: 'pending' }, f.approver);
    const row = asApprover.find(a => a.id === approval.id);
    assert.ok(row, 'approver sees the pending request');
    assert.deepEqual(row.project, { id: p.id, name: p.name });
    assert.deepEqual(row.user, { id: f.target.id, name: f.target.name, email: f.target.email });
    assert.deepEqual(row.requester, { id: f.requester.id, name: f.requester.name });
    assert.equal(row.approver, null);
    assert.equal(row.hoursPerDay, hours);
    assert.equal(row.overloadHours, 2);
    assert.deepEqual(Object.keys(row.load).sort(), ['capacity', 'freeHours', 'isOverAllocated', 'peakHours']);
    assert.equal(row.load.capacity, f.cap);
    assert.equal(row.load.peakHours, 0, 'load excludes the pending row itself');
    assert.equal(row.load.freeHours, f.cap);
    assert.equal(row.load.isOverAllocated, false);
    assert.equal(row.requestedBy, undefined);
    assert.ok(!('approvedBy' in row));
    assert.ok(asApprover.every(a => a.requestType === 'exception'), 'capacity_release rows never appear');

    const asRequester = await svc.listAllocationExceptions({}, f.requester);
    assert.ok(asRequester.some(a => a.id === approval.id), 'requester sees own');
    assert.ok(asRequester.every(a => String(a.requestedById) === String(f.requester.id)), 'requester sees ONLY own');

    const asOutsider = await svc.listAllocationExceptions({}, f.outsider);
    assert.ok(!asOutsider.some(a => a.id === approval.id), 'non-approver, non-requester does not see it');

    await assert.rejects(svc.listAllocationExceptions({ status: 'weird' }, f.approver), (e) => e.statusCode === 400);

    const decided = await svc.listAllocationExceptions({ status: 'decided' }, f.approver);
    assert.ok(!decided.some(a => a.id === approval.id), 'pending row not in decided tab');
  } finally { await cleanup.run(); }
});

await t.test('assertNoConflict 409 carries suggestions + canRequestException + exceptionMaxHoursPerDay', async () => {
  const f = await fixtures();
  const cleanup = createCleanup();
  try {
    const pA = await makeProject(cleanup, 'Exc409A', f.requester.id);
    const pB = await makeProject(cleanup, 'Exc409B', f.requester.id);
    // fill the person on A, then 1h more on B over the same window must 409
    await svc.addMember(pA.id, { userId: f.target.id, hoursPerDay: f.cap, allocationFrom: FROM, allocationTo: TO }, f.requester);
    await assert.rejects(
      svc.addMember(pB.id, { userId: f.target.id, hoursPerDay: 1, allocationFrom: FROM, allocationTo: TO }, f.requester),
      (e) => {
        assert.equal(e.statusCode, 409);
        const c = e.conflict;
        assert.equal(c.capacity, f.cap);
        assert.equal(c.peak, f.cap + 1);
        assert.equal(c.remaining, 0);
        assert.equal(c.canRequestException, true);
        assert.equal(c.exceptionMaxHoursPerDay, f.policy.maxHoursPerDay);
        assert.deepEqual(Object.keys(c.suggestions).sort(), ['nextFreeDate', 'overloadHours', 'reduceTo', 'shortenTo']);
        assert.equal(c.suggestions.overloadHours, 1);
        assert.equal(c.suggestions.reduceTo, null);
        assert.equal(c.suggestions.shortenTo, null);
        // A ends Fri 14 Mar 2031; Sat 15 is the 3rd Saturday (off by default policy), Sun 16 off → Mon 17
        assert.equal(c.suggestions.nextFreeDate, E.isWorkingDay(new Date(2031, 2, 15), f.calendar) ? '2031-03-15' : '2031-03-17');
        return true;
      }
    );
  } finally { await cleanup.run(); }
});

await t.test('migration 044 is idempotent and the columns exist', async () => {
  await migration044.run();
  await migration044.run();
  const [cols] = await sequelize.query(
    `SELECT TABLE_NAME t, COLUMN_NAME c FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND (
        (TABLE_NAME = 'pm_project_members'       AND COLUMN_NAME IN ('exceptionStatus','exceptionApprovalId')) OR
        (TABLE_NAME = 'pm_allocation_approvals'  AND COLUMN_NAME IN ('requestType','overloadHours','memberId','previousSnapshot')) OR
        (TABLE_NAME = 'pm_settings'              AND COLUMN_NAME IN ('exceptionApproverRoles','exceptionMaxHoursPerDay')))`
  );
  assert.equal(cols.length, 8, `expected 8 columns, got ${cols.map(c => `${c.t}.${c.c}`).join(', ')}`);
  const s = await pmSettings.getSettings();
  assert.ok(Array.isArray(s.exceptionApproverRoles) && s.exceptionApproverRoles.length > 0);
  assert.equal(typeof s.exceptionMaxHoursPerDay, 'number');
});

} finally { await closeDb(); }
});
