'use strict';

/**
 * T3  Allocation segments — allocation.service against the shared UAT DB.
 *
 *   S1  overlap → 400 "Overlaps an existing period dd Mon–dd Mon"
 *   add / update / remove + S3 summary mirror on pm_project_members
 *   S2  conflict 409 with suggestions; own segment excluded on update
 *   grid: gridFor shape; applyGrid updates an exact month, splits a spanning segment, clears a cell
 *   release: spanning segment ended at fromDate−1, future ones removed
 *   history rows for every write (by:{id,name})
 *   exception primitives on a segment: pending never counted / blocks edits; approved counted; mirror follows
 *   utilisation.loadAllocations PM lines keyed by segmentId
 *   migration 045 idempotent + backfill of a reversed-dates member (fallback dates)
 *
 * Every row is __TEST__-prefixed and removed in finally. Real users are read-only.
 * Windows are in 2032 (allocationException.test.js uses 2031) and the target user
 * is chosen to have NO counted allocation in them, so the arithmetic is deterministic.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { sequelize, pickUser, createCleanup, closeDb, TEST_PREFIX } = require('./_helpers');
const Project              = require('../src/models/pm/Project');
const ProjectMember        = require('../src/models/pm/ProjectMember');
const AllocationSegment    = require('../src/models/pm/AllocationSegment');
const PmAllocationHistory  = require('../src/models/pm/PmAllocationHistory');
const PmAllocationApproval = require('../src/models/pm/PmAllocationApproval');
const User                 = require('../src/models/User');
const svc                  = require('../src/services/pm/allocation.service');
const utilisation          = require('../src/services/pm/utilisation.service');
const pmSettings           = require('../src/services/pm/pmSettings.service');
const E                    = require('../src/utils/capacityEngine');
const migration045         = require('../migrations/045_allocation_segments');

// Mon 1 Mar 2032 … ; a second window in May 2032 for the "other project" cases
const FROM = '2032-03-01', TO = '2032-03-12';
const FROM2 = '2032-03-15', TO2 = '2032-03-26';
const PROBE_FROM = '2032-01-01', PROBE_TO = '2032-08-31';

// Node 18.8's before() hook is unreliable → memoised fixtures every test awaits.
let fx;
function fixtures() {
  if (!fx) fx = (async () => {
    const calendar = await pmSettings.getCalendar();
    const policy   = await pmSettings.getExceptionPolicy();
    const manager  = await pickUser('manager') || await pickUser('senior_manager') || await pickUser('admin');
    assert.ok(manager, 'UAT DB needs an active manager/senior_manager/admin');
    const outsider = await pickUser('employee');
    assert.ok(outsider, 'UAT DB needs an active employee');

    // Target: an active employee with NO counted allocation anywhere in 2032
    const candidates = await User.findAll({
      attributes: ['id', 'name', 'email', 'role'], where: { role: 'employee', isActive: true },
      order: [['name', 'DESC']], limit: 40, raw: true,
    });
    let target = null;
    for (const c of candidates) {
      const others = await svc.loadSegmentsForUsers([c.id], { calendar });
      if (E.summarise(others, calendar, PROBE_FROM, PROBE_TO).peakHours === 0) { target = c; break; }
    }
    assert.ok(target, 'no employee free in the 2032 window');
    return { calendar, policy, manager, outsider, target, cap: calendar.hoursPerDay };
  })();
  return fx;
}

async function makeProject(cleanup, name, managerId, extra = {}) {
  const p = await Project.create({ name: `${TEST_PREFIX} ${name} ${Date.now()}`, status: 'In Progress', managerId, createdById: managerId, ...extra });
  cleanup.add(async () => {
    await PmAllocationHistory.destroy({ where: { projectId: p.id } });
    await PmAllocationApproval.destroy({ where: { projectId: p.id } });
    await AllocationSegment.destroy({ where: { projectId: p.id } });
    await ProjectMember.destroy({ where: { projectId: p.id } });
    await p.destroy();
  });
  return p;
}
const makeMember = (projectId, userId, role = 'Dev') => ProjectMember.create({ projectId, userId, role });
const fresh = (id) => ProjectMember.findByPk(id);
const history = (projectId, memberId) => PmAllocationHistory.findAll({ where: { projectId, memberId }, order: [['createdAt', 'ASC']], raw: true });

// Node 18.8 runs a describe()'s tests concurrently (its concurrency option is ignored) and its
// top-level hooks are unreliable → ONE top-level test whose awaited subtests run strictly in order.
test('allocation segments', async (t) => {
try {

await t.test('S1 overlap 400; add/update/remove + S3 summary mirror; history rows', async () => {
  const f = await fixtures();
  const cleanup = createCleanup();
  try {
    const p = await makeProject(cleanup, 'SegA', f.manager.id);
    const m = await makeMember(p.id, f.target.id);

    // permission: outsider (employee, not PM) → 403; unknown member → 404
    await assert.rejects(svc.addSegment(p.id, m.id, { fromDate: FROM, toDate: TO, hoursPerDay: 4 }, f.outsider), (e) => e.statusCode === 403);
    await assert.rejects(svc.addSegment(p.id, '00000000-0000-0000-0000-000000000000', { fromDate: FROM, toDate: TO, hoursPerDay: 4 }, f.manager), (e) => e.statusCode === 404);
    // validation: dates required / reversed / amount required
    await assert.rejects(svc.addSegment(p.id, m.id, { fromDate: FROM, hoursPerDay: 4 }, f.manager), (e) => e.statusCode === 400);
    await assert.rejects(svc.addSegment(p.id, m.id, { fromDate: TO, toDate: FROM, hoursPerDay: 4 }, f.manager), (e) => e.statusCode === 400 && /before/.test(e.message));
    await assert.rejects(svc.addSegment(p.id, m.id, { fromDate: FROM, toDate: TO }, f.manager), (e) => e.statusCode === 400 && /hoursPerDay/.test(e.message));

    // add
    const s1 = await svc.addSegment(p.id, m.id, { fromDate: FROM, toDate: TO, hoursPerDay: 4, note: 'first' }, f.manager);
    assert.equal(s1.memberId, m.id);
    assert.equal(s1.projectId, p.id);
    assert.equal(String(s1.userId), String(f.target.id));
    assert.equal(s1.fromDate, FROM); assert.equal(s1.toDate, TO);
    assert.equal(s1.hoursPerDay, 4);
    assert.equal(s1.allocationMode, 'per_day');
    assert.equal(s1.allocationTotalHours, 4 * E.workingDaysBetween(FROM, TO, f.calendar));
    assert.equal(s1.hoursConfirmed, true);
    assert.equal(s1.exceptionStatus, 'none');
    assert.equal(s1.note, 'first');
    assert.equal(String(s1.createdById), String(f.manager.id));

    // S3 mirror after add
    let mm = await fresh(m.id);
    assert.equal(mm.allocationFrom, FROM); assert.equal(mm.allocationTo, TO);
    assert.equal(Number(mm.hoursPerDay), 4);
    assert.equal(Number(mm.allocationPct), Math.round(4 / f.cap * 100));
    assert.equal(mm.hoursConfirmed, true);
    assert.equal(mm.exceptionStatus, 'none');
    assert.equal(mm.allocationStatus, 'active');

    // S1 — overlapping (touching the last day) → 400 with the dd Mon–dd Mon message
    await assert.rejects(
      svc.addSegment(p.id, m.id, { fromDate: TO, toDate: TO2, hoursPerDay: 2 }, f.manager),
      (e) => e.statusCode === 400 && e.message === `Overlaps an existing period ${E.toDate(FROM).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}–${E.toDate(TO).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`
    );
    // adjacent (next day) is fine — second period, estimated (hoursConfirmed:false), total mode
    const wd2 = E.workingDaysBetween(FROM2, TO2, f.calendar);
    const s2 = await svc.addSegment(p.id, m.id, { fromDate: FROM2, toDate: TO2, allocationMode: 'total', allocationTotalHours: 2 * wd2, hoursConfirmed: false }, f.manager);
    assert.equal(s2.allocationMode, 'total');
    assert.equal(s2.hoursPerDay, 2);
    assert.equal(s2.hoursConfirmed, false);

    // list
    const list = await svc.listSegments(p.id, m.id);
    assert.deepEqual(list.map(s => s.id), [s1.id, s2.id]);

    // S3 mirror across two segments: min/max dates; hours = active today → next upcoming (s1, 2032) ; confirmed = all
    mm = await fresh(m.id);
    assert.equal(mm.allocationFrom, FROM); assert.equal(mm.allocationTo, TO2);
    assert.equal(Number(mm.hoursPerDay), 4, 'next upcoming segment drives hoursPerDay');
    assert.equal(mm.hoursConfirmed, false, 'one unconfirmed → member not confirmed');

    // update s1: move end date only → total re-derived, hours kept; overlapping s2 → 400; own segment excluded from overlap
    const s1b = await svc.updateSegment(p.id, m.id, s1.id, { toDate: '2032-03-10' }, f.manager);
    assert.equal(s1b.toDate, '2032-03-10');
    assert.equal(s1b.hoursPerDay, 4);
    assert.equal(s1b.allocationTotalHours, 4 * E.workingDaysBetween(FROM, '2032-03-10', f.calendar));
    await assert.rejects(svc.updateSegment(p.id, m.id, s1.id, { toDate: FROM2 }, f.manager), (e) => e.statusCode === 400 && /Overlaps/.test(e.message));
    const s1c = await svc.updateSegment(p.id, m.id, s1.id, { toDate: TO, hoursPerDay: 3 }, f.manager);
    assert.equal(s1c.hoursPerDay, 3);
    assert.equal(s1c.toDate, TO);
    // no-op update → no new history row
    const hBefore = (await history(p.id, m.id)).length;
    await svc.updateSegment(p.id, m.id, s1.id, { hoursPerDay: 3 }, f.manager);
    assert.equal((await history(p.id, m.id)).length, hBefore, 'no-op update writes no history');

    // confirm s2 → member confirmed
    const s2c = await svc.confirmSegment(p.id, m.id, s2.id, f.manager);
    assert.equal(s2c.hoursConfirmed, true);
    assert.equal((await fresh(m.id)).hoursConfirmed, true);

    // quickEnd s2 — a 'total' segment keeps its TOTAL and re-derives hours/day over the shorter window
    const END2 = '2032-03-19';
    const q = await svc.quickEnd(s2.id, END2, f.manager);
    assert.equal(q.toDate, END2);
    assert.equal(q.allocationTotalHours, 2 * wd2);
    assert.equal(q.hoursPerDay, Math.round((2 * wd2) / E.workingDaysBetween(FROM2, END2, f.calendar) * 10) / 10);
    assert.equal((await fresh(m.id)).allocationTo, END2);
    // …and when that would exceed capacity it is refused (1-day window ⇒ the whole total in one day)
    await assert.rejects(svc.quickEnd(s2.id, FROM2, f.manager), (e) => e.statusCode === 409 || e.statusCode === 400);

    // remove s2 → mirror back to s1 only; remove s1 → cleared
    await svc.removeSegment(p.id, m.id, s2.id, f.manager);
    mm = await fresh(m.id);
    assert.equal(mm.allocationTo, TO);
    assert.equal(Number(mm.hoursPerDay), 3);
    await assert.rejects(svc.removeSegment(p.id, m.id, s2.id, f.manager), (e) => e.statusCode === 404);
    await svc.removeSegment(p.id, m.id, s1.id, f.manager);
    mm = await fresh(m.id);
    assert.equal(mm.hoursPerDay, null); assert.equal(mm.allocationFrom, null); assert.equal(mm.allocationTo, null);
    assert.equal(mm.allocationPct, null); assert.equal(mm.hoursConfirmed, false);
    assert.equal(mm.role, 'Dev', 'member row itself survives');

    // history: add, add, update, update, confirm, update(quickEnd), remove, remove — with by:{id,name}
    const rows = await svc.listHistory(p.id, { memberId: m.id });
    const actions = rows.map(r => r.action).reverse();   // listHistory is newest first
    assert.deepEqual(actions, ['add', 'add', 'update', 'update', 'confirm', 'update', 'remove', 'remove']);
    assert.ok(rows.every(r => r.by && String(r.by.id) === String(f.manager.id) && r.by.name));
    assert.ok(rows.every(r => String(r.userId) === String(f.target.id) && r.memberId === m.id && r.segmentId));
    const add1 = rows.find(r => r.action === 'add' && r.segmentId === s1.id);
    assert.equal(add1.before, null);
    assert.equal(add1.after.hoursPerDay, 4);
    assert.equal(add1.note, 'first');
    const upd = rows.filter(r => r.action === 'update' && r.segmentId === s1.id)[1];   // newest-first → [1] is the toDate move
    assert.equal(upd.before.toDate, TO); assert.equal(upd.after.toDate, '2032-03-10');
    // limit honoured
    assert.equal((await svc.listHistory(p.id, { memberId: m.id, limit: 2 })).length, 2);
  } finally { await cleanup.run(); }
});

await t.test('S2 conflict 409 with suggestions; own segment excluded; loader shape', async () => {
  const f = await fixtures();
  const cleanup = createCleanup();
  try {
    const pA = await makeProject(cleanup, 'Seg409A', f.manager.id);
    const pB = await makeProject(cleanup, 'Seg409B', f.manager.id);
    const mA = await makeMember(pA.id, f.target.id);
    const mB = await makeMember(pB.id, f.target.id);

    const sA = await svc.addSegment(pA.id, mA.id, { fromDate: FROM, toDate: TO, hoursPerDay: f.cap }, f.manager);

    // loader shape
    const allocs = await svc.loadSegmentsForUsers([f.target.id], { calendar: f.calendar });
    const mine = allocs.find(a => a.segmentId === sA.id);
    assert.ok(mine);
    assert.deepEqual(Object.keys(mine).sort(), [
      'allocationFrom', 'allocationMode', 'allocationPct', 'allocationTo', 'allocationTotalHours', 'exceptionStatus',
      'hoursConfirmed', 'hoursPerDay', 'isEstimated', 'memberId', 'projectId', 'projectManagerId', 'projectName',
      'projectStatus', 'segmentId', 'source', 'userId',
    ]);
    assert.equal(mine.source, 'project');   // helpdesk ticket lines carry source 'helpdesk'
    assert.equal(mine.memberId, mA.id);
    assert.equal(mine.projectName, pA.name);
    assert.equal(mine.projectStatus, 'In Progress');
    assert.equal(String(mine.projectManagerId), String(f.manager.id));
    assert.equal(mine.hoursPerDay, f.cap);
    assert.equal(mine.allocationPct, 100);
    assert.equal(mine.isEstimated, false);
    // excludeSegmentId
    assert.ok(!(await svc.loadSegmentsForUsers([f.target.id], { calendar: f.calendar, excludeSegmentId: sA.id })).some(a => a.segmentId === sA.id));
    assert.deepEqual(await svc.loadSegmentsForUsers([], {}), []);

    // 1h more on B over the same window → 409 with suggestions + exception cap
    await assert.rejects(
      svc.addSegment(pB.id, mB.id, { fromDate: FROM, toDate: TO, hoursPerDay: 1 }, f.manager),
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
        assert.ok(c.suggestions.nextFreeDate > TO, 'next free date is after A ends');
        return true;
      }
    );
    assert.equal(await AllocationSegment.count({ where: { memberId: mB.id } }), 0, 'nothing written on 409');

    // own segment is excluded on update: raising A to cap again (same) / lowering / re-dating all fine
    const upd = await svc.updateSegment(pA.id, mA.id, sA.id, { hoursPerDay: f.cap - 1 }, f.manager);
    assert.equal(upd.hoursPerDay, f.cap - 1);
    // now 1h on B fits; 2h does not
    const sB = await svc.addSegment(pB.id, mB.id, { fromDate: FROM, toDate: TO, hoursPerDay: 1 }, f.manager);
    await assert.rejects(svc.updateSegment(pB.id, mB.id, sB.id, { hoursPerDay: 2 }, f.manager), (e) => e.statusCode === 409 && e.conflict.suggestions.reduceTo === 1);
    // shrinking B to a non-overlapping window lets it grow
    const moved = await svc.updateSegment(pB.id, mB.id, sB.id, { fromDate: FROM2, toDate: TO2, hoursPerDay: f.cap }, f.manager);
    assert.equal(moved.hoursPerDay, f.cap);

    // utilisation B3: PM lines keyed by segmentId, refId = projectId
    const byUser = await utilisation.loadAllocations([f.target.id]);
    const lines = (byUser.get(String(f.target.id)) || []).filter(l => l.source === 'project');
    const lA = lines.find(l => l.segmentId === sA.id);
    assert.ok(lA, 'utilisation line keyed by segmentId');
    assert.equal(lA.refId, pA.id);
    assert.equal(lA.memberId, mA.id);
    assert.equal(lA.hoursPerDay, f.cap - 1);
    assert.equal(lA.allocationFrom, FROM);
    assert.equal(lA.exceptionStatus, 'none');
    const u = await utilisation.getUserUtilisation(f.target.id, '2032-03');
    assert.ok(u.lines.some(l => l.segmentId === sA.id) && u.lines.some(l => l.segmentId === sB.id));
    assert.deepEqual(u.pendingExceptionLines, []);
  } finally { await cleanup.run(); }
});

await t.test('grid: gridFor shape; applyGrid exact-month update, split of a spanning segment, clear; per-change errors', async () => {
  const f = await fixtures();
  const cleanup = createCleanup();
  try {
    const p = await makeProject(cleanup, 'SegGrid', f.manager.id, { startDate: '2032-01-01', endDate: '2032-04-30' });
    const m = await makeMember(p.id, f.target.id, 'QA');
    // one segment spanning Feb 10 → Apr 20
    const span = await svc.addSegment(p.id, m.id, { fromDate: '2032-02-10', toDate: '2032-04-20', hoursPerDay: 4 }, f.manager);

    // default range = project dates
    let g = await svc.gridFor(p.id, {});
    assert.equal(g.from, '2032-01'); assert.equal(g.to, '2032-04');
    assert.equal(g.capacity, f.cap);
    assert.deepEqual(g.months.map(x => x.key), ['2032-01', '2032-02', '2032-03', '2032-04']);
    assert.ok(g.months.every(x => x.label && x.workingDays > 0 && x.capacityHours === Math.round(x.workingDays * f.cap * 10) / 10));
    assert.equal(g.rows.length, 1);
    const row = g.rows[0];
    assert.equal(row.memberId, m.id); assert.equal(String(row.userId), String(f.target.id));
    assert.equal(row.name, f.target.name); assert.equal(row.role, 'QA');
    assert.deepEqual(row.cells.map(c => [c.month, c.hoursPerDay, c.segmentId, c.mixed, c.exceptionStatus, c.conflict]), [
      ['2032-01', null, null, false, 'none', false],
      ['2032-02', 4, span.id, false, 'none', false],
      ['2032-03', 4, span.id, false, 'none', false],
      ['2032-04', 4, span.id, false, 'none', false],
    ]);
    assert.equal(row.cells[1].peakHours, 4);
    assert.equal(row.cells[0].peakHours, 0);
    // explicit range accepts YYYY-MM and YYYY-MM-DD; invalid → 400; too large → 400
    g = await svc.gridFor(p.id, { from: '2032-03-05', to: '2032-05' });
    assert.deepEqual(g.months.map(x => x.key), ['2032-03', '2032-04', '2032-05']);
    await assert.rejects(svc.gridFor(p.id, { from: '2032-13', to: '2032-05' }), (e) => e.statusCode === 400);
    await assert.rejects(svc.gridFor(p.id, { from: '2032-01', to: '2035-01' }), (e) => e.statusCode === 400);

    // applyGrid: March cell → 6h. Span is NOT exactly March → split: Feb part (4h) | March 6h | Apr part (4h)
    let r = await svc.applyGrid(p.id, { changes: [{ memberId: m.id, month: '2032-03', hoursPerDay: 6 }] }, f.manager);
    assert.equal(r.errors.length, 0);
    assert.equal(r.applied.length, 1);
    assert.ok(r.applied[0].segmentId);
    let segs = await svc.listSegments(p.id, m.id);
    assert.deepEqual(segs.map(s => [s.fromDate, s.toDate, s.hoursPerDay]), [
      ['2032-02-10', '2032-02-29', 4],
      ['2032-03-01', '2032-03-31', 6],
      ['2032-04-01', '2032-04-20', 4],
    ]);
    assert.equal(segs[0].id, span.id, 'before-part keeps the original row');
    assert.equal(segs[1].id, r.applied[0].segmentId);
    assert.equal(segs[0].allocationTotalHours, 4 * E.workingDaysBetween('2032-02-10', '2032-02-29', f.calendar));
    // S3 mirror
    let mm = await fresh(m.id);
    assert.equal(mm.allocationFrom, '2032-02-10'); assert.equal(mm.allocationTo, '2032-04-20');
    assert.equal(Number(mm.hoursPerDay), 4, 'next upcoming (Feb part) drives the summary');

    // exact single month → update in place (same id)
    r = await svc.applyGrid(p.id, { changes: [{ memberId: m.id, month: '2032-03', hoursPerDay: 5 }] }, f.manager);
    assert.equal(r.errors.length, 0);
    assert.equal(r.applied[0].segmentId, segs[1].id);
    assert.equal((await svc.listSegments(p.id, m.id))[1].hoursPerDay, 5);

    // grid now shows the three cells with their own segments, none mixed
    g = await svc.gridFor(p.id, { from: '2032-02', to: '2032-04' });
    assert.deepEqual(g.rows[0].cells.map(c => [c.hoursPerDay, c.mixed, c.exact]), [[4, false, false], [5, false, true], [4, false, false]]);

    // a month with two segments → mixed
    await svc.updateSegment(p.id, m.id, segs[2].id, { toDate: '2032-04-10' }, f.manager);
    const extra = await svc.addSegment(p.id, m.id, { fromDate: '2032-04-11', toDate: '2032-04-20', hoursPerDay: 2 }, f.manager);
    g = await svc.gridFor(p.id, { from: '2032-04', to: '2032-04' });
    const apr = g.rows[0].cells[0];
    assert.equal(apr.mixed, true); assert.equal(apr.hoursPerDay, null); assert.equal(apr.segmentId, null);
    assert.deepEqual(apr.segmentIds.sort(), [segs[2].id, extra.id].sort());
    // applying to a mixed month replaces both (both fully inside April → removed) with one April segment
    r = await svc.applyGrid(p.id, { changes: [{ memberId: m.id, month: '2032-04', hoursPerDay: 3 }] }, f.manager);
    assert.equal(r.errors.length, 0);
    segs = await svc.listSegments(p.id, m.id);
    assert.deepEqual(segs.map(s => [s.fromDate, s.toDate, s.hoursPerDay]), [
      ['2032-02-10', '2032-02-29', 4], ['2032-03-01', '2032-03-31', 5], ['2032-04-01', '2032-04-30', 3],
    ]);

    // clear March (null) → exact month removed; partial success with a bad change in the same batch
    r = await svc.applyGrid(p.id, { changes: [
      { memberId: m.id, month: '2032-03', hoursPerDay: null },
      { memberId: m.id, month: '2032-05', hoursPerDay: 99 },           // > cap → 400 per change
      { memberId: '00000000-0000-0000-0000-000000000000', month: '2032-05', hoursPerDay: 1 },
    ] }, f.manager);
    assert.equal(r.applied.length, 1);
    assert.equal(r.errors.length, 2);
    assert.equal(r.errors[0].month, '2032-05'); assert.equal(r.errors[0].status, 400);
    assert.equal(r.errors[1].status, 404);
    segs = await svc.listSegments(p.id, m.id);
    assert.deepEqual(segs.map(s => s.fromDate), ['2032-02-10', '2032-04-01']);

    // conflict inside applyGrid → per-change 409 with conflict payload, nothing written
    const pX = await makeProject(cleanup, 'SegGridX', f.manager.id);
    const mX = await makeMember(pX.id, f.target.id);
    await svc.addSegment(pX.id, mX.id, { fromDate: '2032-05-01', toDate: '2032-05-31', hoursPerDay: f.cap }, f.manager);
    r = await svc.applyGrid(p.id, { changes: [{ memberId: m.id, month: '2032-05', hoursPerDay: 1 }] }, f.manager);
    assert.equal(r.applied.length, 0);
    assert.equal(r.errors[0].status, 409);
    assert.equal(r.errors[0].conflict.peak, f.cap + 1);
    assert.equal(await AllocationSegment.count({ where: { memberId: m.id, fromDate: '2032-05-01' } }), 0);

    // permission / validation at the top level
    await assert.rejects(svc.applyGrid(p.id, { changes: [] }, f.manager), (e) => e.statusCode === 400);
    await assert.rejects(svc.applyGrid(p.id, { changes: [{ memberId: m.id, month: '2032-02', hoursPerDay: 1 }] }, f.outsider), (e) => e.statusCode === 403);

    // history has grid notes
    const h = await history(p.id, m.id);
    assert.ok(h.some(x => x.action === 'add' && /Grid 2032-03: split/.test(x.note)));
    assert.ok(h.some(x => x.action === 'update' && /Grid 2032-03: trimmed/.test(x.note)));
    assert.ok(h.some(x => x.action === 'remove' && /Grid 2032-03/.test(x.note)));
  } finally { await cleanup.run(); }
});

await t.test('release: spanning segment ended at fromDate−1, future ones removed, past untouched; confirmAllSegments', async () => {
  const f = await fixtures();
  const cleanup = createCleanup();
  try {
    const p = await makeProject(cleanup, 'SegRel', f.manager.id);
    const m = await makeMember(p.id, f.target.id);
    const past   = await svc.addSegment(p.id, m.id, { fromDate: '2032-01-05', toDate: '2032-01-30', hoursPerDay: 2, hoursConfirmed: false }, f.manager);
    const span   = await svc.addSegment(p.id, m.id, { fromDate: '2032-02-01', toDate: '2032-03-31', hoursPerDay: 3, hoursConfirmed: false }, f.manager);
    const future = await svc.addSegment(p.id, m.id, { fromDate: '2032-04-01', toDate: '2032-04-30', hoursPerDay: 4 }, f.manager);

    const all = await svc.confirmAllSegments(p.id, m.id, f.manager);
    assert.equal(all.length, 3);
    assert.ok(all.every(s => s.hoursConfirmed === true));
    assert.equal((await fresh(m.id)).hoursConfirmed, true);

    await assert.rejects(svc.releaseMember(p.id, m.id, { fromDate: 'nope' }, f.manager), (e) => e.statusCode === 400);
    const res = await svc.releaseMember(p.id, m.id, { fromDate: '2032-03-10' }, f.manager);
    assert.deepEqual(res, { ended: 1, removed: 1 });
    const segs = await svc.listSegments(p.id, m.id);
    assert.deepEqual(segs.map(s => [s.id, s.fromDate, s.toDate]), [
      [past.id, '2032-01-05', '2032-01-30'],
      [span.id, '2032-02-01', '2032-03-09'],
    ]);
    assert.equal(segs[1].allocationTotalHours, 3 * E.workingDaysBetween('2032-02-01', '2032-03-09', f.calendar));
    assert.equal(await AllocationSegment.findByPk(future.id), null);
    const mm = await fresh(m.id);
    assert.equal(mm.allocationTo, '2032-03-09');
    assert.equal(mm.allocationFrom, '2032-01-05');
    const h = await history(p.id, m.id);
    assert.equal(h.filter(x => x.action === 'release').length, 2);
    assert.equal(h.filter(x => x.action === 'confirm').length, 2, 'only the two unconfirmed segments logged a confirm');
    // releasing again from a date after everything → nothing to do
    assert.deepEqual(await svc.releaseMember(p.id, m.id, { fromDate: '2032-06-01' }, f.manager), { ended: 0, removed: 0 });
  } finally { await cleanup.run(); }
});

await t.test('exception primitives on a segment: pending never counted and blocks edits; approved counted; mirror + history helpers', async () => {
  const f = await fixtures();
  const cleanup = createCleanup();
  try {
    const p = await makeProject(cleanup, 'SegExc', f.manager.id);
    const m = await makeMember(p.id, f.target.id);
    const base = await svc.addSegment(p.id, m.id, { fromDate: FROM, toDate: TO, hoursPerDay: 4 }, f.manager);

    // a PENDING exception segment (as project.service.requestAllocationException will write it)
    const approval = await PmAllocationApproval.create({
      requestType: 'exception', projectId: p.id, userId: f.target.id, requestedById: f.manager.id, memberId: m.id,
      allocationPct: 100, hoursPerDay: f.cap + 2, fromDate: FROM2, toDate: TO2, status: 'pending', reason: 'crunch', overloadHours: 2,
    });
    const pend = await AllocationSegment.create({
      memberId: m.id, projectId: p.id, userId: f.target.id, fromDate: FROM2, toDate: TO2,
      allocationMode: 'per_day', hoursPerDay: f.cap + 2, hoursConfirmed: false, exceptionStatus: 'pending', exceptionApprovalId: approval.id,
    });
    await approval.update({ segmentId: pend.id });
    await svc.mirrorMemberSummary(m.id);
    await svc.logAllocation({ projectId: p.id, memberId: m.id, segmentId: pend.id, userId: f.target.id, action: 'exception_request', after: svc.snapshotOfSegment(pend), byId: f.manager.id, note: 'crunch' });
    await assert.rejects(svc.logAllocation({ projectId: p.id, memberId: m.id, userId: f.target.id, action: 'bogus' }), (e) => e.statusCode === 400);

    // mirror: pending wins, approval id follows, allocationStatus pending, dates span both
    let mm = await fresh(m.id);
    assert.equal(mm.exceptionStatus, 'pending');
    assert.equal(mm.exceptionApprovalId, approval.id);
    assert.equal(mm.allocationStatus, 'pending');
    assert.equal(mm.hoursConfirmed, false);
    assert.equal(mm.allocationTo, TO2);

    // D1 — pending never counted; countedOnly:false returns it
    assert.ok(!(await svc.loadSegmentsForUsers([f.target.id], { calendar: f.calendar })).some(a => a.segmentId === pend.id));
    assert.ok((await svc.loadSegmentsForUsers([f.target.id], { calendar: f.calendar, countedOnly: false })).some(a => a.segmentId === pend.id));
    // utilisation: pending line only in pendingExceptionLines
    const u = await utilisation.getUserUtilisation(f.target.id, '2032-03');
    assert.ok(!u.lines.some(l => l.segmentId === pend.id));
    assert.ok(u.pendingExceptionLines.some(l => l.segmentId === pend.id && l.counted === false));
    // edits on the pending segment → 409; release touching it → 409; grid touching it → per-change 409
    await assert.rejects(svc.updateSegment(p.id, m.id, pend.id, { hoursPerDay: 1 }, f.manager), (e) => e.statusCode === 409 && /pending/.test(e.message));
    await assert.rejects(svc.removeSegment(p.id, m.id, pend.id, f.manager), (e) => e.statusCode === 409);
    await assert.rejects(svc.releaseMember(p.id, m.id, { fromDate: FROM2 }, f.manager), (e) => e.statusCode === 409);
    const g = await svc.applyGrid(p.id, { changes: [{ memberId: m.id, month: '2032-03', hoursPerDay: 1 }] }, f.manager);
    assert.equal(g.errors[0]?.status, 409);
    // the listing carries the approval include
    const listed = (await svc.listSegments(p.id, m.id)).find(s => s.id === pend.id);
    assert.equal(listed.exceptionApproval.id, approval.id);
    assert.equal(listed.exceptionApproval.status, 'pending');
    // grid cell shows the exception chip
    const grid = await svc.gridFor(p.id, { from: '2032-03', to: '2032-03' });
    assert.equal(grid.rows[0].cells[0].exceptionStatus, 'pending');
    assert.equal(grid.rows[0].cells[0].mixed, true);

    // approve (as decide will do): segment approved + confirmed → counted with its over-cap hours
    await pend.update({ exceptionStatus: 'approved', hoursConfirmed: true });
    await approval.update({ status: 'approved', approvedById: f.outsider.id });
    await svc.mirrorMemberSummary(m.id);
    mm = await fresh(m.id);
    assert.equal(mm.exceptionStatus, 'approved');
    assert.equal(mm.allocationStatus, 'active');
    assert.equal(mm.hoursConfirmed, true);
    const counted = await svc.loadSegmentsForUsers([f.target.id], { calendar: f.calendar });
    const mine = counted.find(a => a.segmentId === pend.id);
    assert.equal(mine.hoursPerDay, f.cap + 2);
    assert.equal(mine.exceptionStatus, 'approved');
    // an approved segment can have its note edited without a capacity re-check…
    const noted = await svc.updateSegment(p.id, m.id, pend.id, { note: 'ok' }, f.manager);
    assert.equal(noted.exceptionStatus, 'approved'); assert.equal(noted.note, 'ok');
    // …but touching its allocation re-checks (over cap → 409) and, when it fits, drops the exception
    await assert.rejects(svc.updateSegment(p.id, m.id, pend.id, { toDate: '2032-03-31' }, f.manager), (e) => e.statusCode === 400 || e.statusCode === 409);
    const lowered = await svc.updateSegment(p.id, m.id, pend.id, { hoursPerDay: 2 }, f.manager);
    assert.equal(lowered.exceptionStatus, 'none'); assert.equal(lowered.exceptionApprovalId, null);
    assert.equal((await fresh(m.id)).exceptionStatus, 'none');

    // reject-restore is project.service's job (B2); the primitive it uses — snapshot + mirror — round-trips
    const snap = svc.snapshotOfSegment(base);
    assert.deepEqual(Object.keys(snap).sort(), ['allocationMode', 'allocationTotalHours', 'exceptionApprovalId', 'exceptionStatus', 'fromDate', 'hoursConfirmed', 'hoursPerDay', 'note', 'toDate']);
    const hist = await svc.listHistory(p.id, { memberId: m.id });
    assert.ok(hist.some(h => h.action === 'exception_request' && h.segmentId === pend.id && h.note === 'crunch'));
  } finally { await cleanup.run(); }
});

await t.test('migration 045 idempotent; backfills ONE segment per member incl. a reversed-dates member (fallback dates)', async () => {
  const f = await fixtures();
  const cleanup = createCleanup();
  try {
    const p = await makeProject(cleanup, 'SegMig', f.manager.id, { startDate: '2020-01-01', endDate: '2020-06-30' });
    // legacy member row: hours but REVERSED dates (like CRM portal / Aditya on UAT) — no segment yet
    const reversed = await ProjectMember.create({
      projectId: p.id, userId: f.target.id, role: 'Dev', hoursPerDay: 3, hoursConfirmed: false,
      allocationFrom: '2026-09-01', allocationTo: '2026-08-31', allocationMode: 'per_day',
    });
    // legacy member row with VALID dates and only a legacy % (no hoursPerDay)
    const pct = await ProjectMember.create({ projectId: p.id, userId: f.outsider.id, role: 'QA', allocationPct: 50, allocationFrom: '2032-06-01', allocationTo: '2032-06-30' });
    // member with no hours at all → no segment
    const none = await ProjectMember.create({ projectId: p.id, userId: f.manager.id, role: 'PM' });

    const r1 = await migration045.run();
    const r2 = await migration045.run();
    assert.equal(r2.created, 0, 'second run creates nothing');
    assert.equal(r2.membersWithoutSegment, 0);
    assert.ok(r1.created >= 2);

    // tables + column exist
    const [cols] = await sequelize.query(
      `SELECT TABLE_NAME t, COLUMN_NAME c FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND (
        (TABLE_NAME = 'pm_allocation_segments' AND COLUMN_NAME IN ('id','memberId','projectId','userId','fromDate','toDate','allocationMode','hoursPerDay','allocationTotalHours','hoursConfirmed','exceptionStatus','exceptionApprovalId','note','createdById')) OR
        (TABLE_NAME = 'pm_allocation_history'  AND COLUMN_NAME IN ('id','projectId','memberId','segmentId','userId','action','before','after','byId','note')) OR
        (TABLE_NAME = 'pm_allocation_approvals' AND COLUMN_NAME = 'segmentId'))`
    );
    assert.equal(cols.length, 14 + 10 + 1, cols.map(c => `${c.t}.${c.c}`).join(','));
    const [[fk]] = await sequelize.query(
      `SELECT COUNT(*) n FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'pm_allocation_segments' AND REFERENCED_TABLE_NAME = 'pm_project_members' AND DELETE_RULE = 'CASCADE'`
    );
    assert.equal(Number(fk.n), 1, 'memberId FK ON DELETE CASCADE');

    // reversed → fallback: fromDate = max(project.startDate, today) = today; toDate = endDate(2020) < from → +90 days
    const today = E.iso(new Date());
    const segR = await AllocationSegment.findAll({ where: { memberId: reversed.id } });
    assert.equal(segR.length, 1, 'exactly one segment for the reversed member');
    assert.equal(segR[0].fromDate, today);
    assert.equal(segR[0].toDate, E.iso(new Date(E.toDate(today).getTime() + 90 * 86400000)));
    assert.equal(Number(segR[0].hoursPerDay), 3);
    assert.equal(segR[0].hoursConfirmed, false);
    assert.equal(segR[0].exceptionStatus, 'none');
    assert.ok(r1.reversed.some(x => x.memberId === reversed.id), 'reversed row is reported by the migration');

    // valid dates + legacy % → hours = pct × cap / 100 (0.5 steps), dates copied
    const segP = await AllocationSegment.findAll({ where: { memberId: pct.id } });
    assert.equal(segP.length, 1);
    assert.equal(segP[0].fromDate, '2032-06-01'); assert.equal(segP[0].toDate, '2032-06-30');
    assert.equal(Number(segP[0].hoursPerDay), Math.round(50 * f.cap / 100 * 2) / 2);
    // no hours → no segment
    assert.equal(await AllocationSegment.count({ where: { memberId: none.id } }), 0);

    // FK cascade: deleting the member removes its segment
    await pct.destroy();
    assert.equal(await AllocationSegment.count({ where: { memberId: pct.id } }), 0);
  } finally { await cleanup.run(); }
});

} finally { await closeDb(); }
});
