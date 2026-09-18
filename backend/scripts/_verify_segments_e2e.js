'use strict';

/**
 * P5 — time-phased allocation (segments) END-TO-END through the REAL controllers
 * against the UAT DB. Every row is __TEST__-prefixed and removed in `finally`.
 *
 *   node scripts/_verify_segments_e2e.js
 *
 *   1  create project + member with a period (legacy addMember body) → 1 segment + mirrored summary
 *   2  add a 2nd period (POST segments)
 *   3  overlapping period → 400 "Overlaps an existing period …"
 *   4  conflict on another project → 409 with conflict.suggestions
 *   5  grid apply splits a segment spanning two months
 *   6  release from a date → later periods trimmed / removed
 *   7  exception request on a segment → approval.segmentId, pending; approve → approved (mirror follows)
 *   8  exception request that CREATES the member → reject → member row gone
 *   9  preview shows `segments` per member line
 *  10  utilisation lines carry segmentId (B3)
 *  11  capacity release approval trims/splits the period to the window
 *  12  backfill: a legacy member row with hours and no segment → migration 045 → 1 segment
 */

const path = require('path');
const assert = require('node:assert/strict');
const { pickUser, mockRes, mockNext, createCleanup, closeDb, TEST_PREFIX } = require('../test/_helpers');
const Project              = require('../src/models/pm/Project');
const ProjectMember        = require('../src/models/pm/ProjectMember');
const AllocationSegment    = require('../src/models/pm/AllocationSegment');
const PmAllocationApproval = require('../src/models/pm/PmAllocationApproval');
const PmAllocationHistory  = require('../src/models/pm/PmAllocationHistory');
const User                 = require('../src/models/User');
const ctrl                 = require('../src/controllers/pm/project.controller');
const projectSvc           = require('../src/services/pm/project.service');
const allocSvc             = require('../src/services/pm/allocation.service');
const utilisationSvc       = require('../src/services/pm/utilisation.service');
const pmSettings           = require('../src/services/pm/pmSettings.service');
const E                    = require('../src/utils/capacityEngine');

// Far-future windows so the arithmetic is deterministic (Mon 3 Mar 2031 …)
const P1_FROM = '2031-03-03', P1_TO = '2031-03-14';
const P2_FROM = '2031-03-17', P2_TO = '2031-03-28';
const SPAN_FROM = '2031-04-15', SPAN_TO = '2031-05-15';

const results = [];
const ok = (id, msg) => { results.push({ id, ok: true, msg }); console.log(`  PASS ${id}  ${msg}`); };
const fail = (id, msg) => { results.push({ id, ok: false, msg }); console.log(`  FAIL ${id}  ${msg}`); };

/** Call a controller like Express would; returns { status, body, error }. */
async function call(handler, { user, params = {}, body = {}, query = {} }) {
  const res = mockRes(); const next = mockNext();
  await handler({ user, params, body, query }, res, next);
  return { status: next.called ? (next.error?.statusCode || 500) : res.statusCode, body: res.body, error: next.error };
}
/** Response data with the client-side `_id` rename undone (sendSuccess renames id → _id). */
const unrename = (v) => {
  if (Array.isArray(v)) return v.map(unrename);
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    const out = {};
    for (const [k, x] of Object.entries(v)) out[k === '_id' ? 'id' : k] = unrename(x);
    return out;
  }
  return v;
};
const data = (r) => unrename(r.body?.data);
const asReqUser = (u) => ({ ...u, _id: u.id });

async function makeProject(cleanup, name, managerId, extra = {}) {
  const p = await Project.create({
    name: `${TEST_PREFIX} ${name} ${Date.now()}`, status: 'In Progress', managerId, createdById: managerId,
    startDate: '2031-03-01', endDate: '2031-08-31', ...extra,
  });
  cleanup.add(async () => {
    await PmAllocationHistory.destroy({ where: { projectId: p.id } });
    await PmAllocationApproval.destroy({ where: { projectId: p.id } });
    await AllocationSegment.destroy({ where: { projectId: p.id } });
    await ProjectMember.destroy({ where: { projectId: p.id } });
    await p.destroy();
  });
  return p;
}

async function run() {
  console.log('\n=== SEGMENTS E2E (real controllers, UAT DB, __TEST__ rows) ===\n');
  const cleanup = createCleanup();
  try {
    // ── fixtures (real users, read-only) ───────────────────────────────────
    const calendar = await pmSettings.getCalendar();
    const cap = calendar.hoursPerDay;
    const policy = await pmSettings.getExceptionPolicy();
    const approverRole = policy.roles[0];
    const approver = await pickUser(approverRole);
    assert.ok(approver, `need an active "${approverRole}" user`);
    let manager = await pickUser('manager');
    if (!manager || String(manager.id) === String(approver.id)) manager = await pickUser('senior_manager');
    assert.ok(manager && String(manager.id) !== String(approver.id), 'need a manager distinct from the approver');
    const candidates = await User.findAll({ attributes: ['id', 'name', 'email', 'role'], where: { role: 'employee', isActive: true }, order: [['name', 'ASC']], limit: 60, raw: true });
    let target = null;
    for (const c of candidates) {
      const others = await allocSvc.loadSegmentsForUsers([c.id], { calendar });
      if (E.summarise(others, calendar, '2031-01-01', '2031-12-31', 365).peakHours === 0) { target = c; break; }
    }
    assert.ok(target, 'no employee free in 2031');
    const mgr = asReqUser(manager), apr = asReqUser(approver);
    console.log(`  fixtures: manager=${manager.name} approver=${approver.name} target=${target.name} cap=${cap}h/day\n`);

    // ── 1 create project + member with a period (legacy body) ──────────────
    const pA = await makeProject(cleanup, 'SegA', manager.id);
    let r = await call(ctrl.addMember, { user: mgr, params: { id: pA.id }, body: { userId: target.id, role: 'Dev', allocationMode: 'per_day', hoursPerDay: 4, allocationFrom: P1_FROM, allocationTo: P1_TO } });
    assert.equal(r.status, 201, `addMember → ${r.status} ${JSON.stringify(r.body)} ${r.error?.stack || ''}`);
    const member = data(r);
    assert.equal(member.segments.length, 1);
    assert.equal(Number(member.segments[0].hoursPerDay), 4);
    assert.equal(String(member.segments[0].fromDate).slice(0, 10), P1_FROM);
    assert.equal(Number(member.hoursPerDay), 4, 'summary hoursPerDay mirrored');
    assert.equal(String(member.allocationFrom).slice(0, 10), P1_FROM); assert.equal(String(member.allocationTo).slice(0, 10), P1_TO);
    assert.equal(member.hoursConfirmed, true);
    const seg1 = member.segments[0];
    ok('1', `addMember (legacy body) → member ${member.id.slice(0, 8)} with 1 segment; summary mirrored (4h ${P1_FROM}→${P1_TO})`);

    // ── 2 add a 2nd period ─────────────────────────────────────────────────
    r = await call(ctrl.addSegment, { user: mgr, params: { id: pA.id, memberId: member.id }, body: { fromDate: P2_FROM, toDate: P2_TO, hoursPerDay: 2 } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const seg2 = data(r);
    r = await call(ctrl.listSegments, { user: mgr, params: { id: pA.id, memberId: member.id } });
    assert.equal(r.status, 200); assert.equal(data(r).length, 2);
    let m = await ProjectMember.findByPk(member.id);
    assert.equal(String(m.allocationTo), P2_TO, 'summary allocationTo = max(toDate)');
    ok('2', `POST segments → 2 periods; summary allocationTo → ${P2_TO}`);

    // ── 3 overlap → 400 ────────────────────────────────────────────────────
    r = await call(ctrl.addSegment, { user: mgr, params: { id: pA.id, memberId: member.id }, body: { fromDate: '2031-03-10', toDate: '2031-03-20', hoursPerDay: 1 } });
    assert.equal(r.status, 400); assert.match(r.body.message, /Overlaps an existing period/); assert.equal(r.body.error.message, r.body.message);
    const overlapMsg = r.body.message;
    // legacy PUT member with allocation fields on a multi-period member → 400
    r = await call(ctrl.updateMember, { user: mgr, params: { id: pA.id, memberId: member.id }, body: { hoursPerDay: 3 } });
    assert.equal(r.status, 400); assert.match(r.body.message, /several periods/);
    // role-only PUT still fine
    r = await call(ctrl.updateMember, { user: mgr, params: { id: pA.id, memberId: member.id }, body: { role: 'Lead' } });
    assert.equal(r.status, 200); assert.equal(data(r).role, 'Lead'); assert.equal(data(r).segments.length, 2);
    ok('3', `overlapping period → 400 "${overlapMsg}"; PUT member hours on 2 periods → 400 "several periods"; role-only PUT → 200`);

    // ── 4 conflict on another project → 409 with suggestions ───────────────
    const pB = await makeProject(cleanup, 'SegB', manager.id);
    r = await call(ctrl.addMember, { user: mgr, params: { id: pB.id }, body: { userId: target.id, hoursPerDay: cap - 2, allocationFrom: P1_FROM, allocationTo: P1_TO } });
    assert.equal(r.status, 409, JSON.stringify(r.body));
    assert.equal(r.body.conflict.peak, cap + 2);
    assert.deepEqual(Object.keys(r.body.conflict.suggestions).sort(), ['nextFreeDate', 'overloadHours', 'reduceTo', 'shortenTo']);
    assert.equal(r.body.conflict.suggestions.reduceTo, cap - 4);
    assert.equal(r.body.conflict.canRequestException, true);
    assert.equal(r.body.error.message, r.body.message);
    assert.equal(await ProjectMember.count({ where: { projectId: pB.id } }), 0, 'no member row left behind on 409');
    ok('4', `addMember on project B (${cap - 2}h over 4h) → 409 peak ${r.body.conflict.peak}h, suggestions.reduceTo=${r.body.conflict.suggestions.reduceTo}, no member row left`);

    // ── 5 grid apply splits a segment spanning Apr/May ─────────────────────
    r = await call(ctrl.addSegment, { user: mgr, params: { id: pA.id, memberId: member.id }, body: { fromDate: SPAN_FROM, toDate: SPAN_TO, hoursPerDay: 2 } });
    assert.equal(r.status, 201);
    r = await call(ctrl.applyAllocationGrid, { user: mgr, params: { id: pA.id }, body: { changes: [{ memberId: member.id, month: '2031-05', hoursPerDay: 4 }] } });
    assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(data(r).errors.length, 0); assert.equal(data(r).applied.length, 1);
    let segs = await allocSvc.listSegments(pA.id, member.id);
    const aprPart = segs.find(s => s.fromDate === SPAN_FROM);
    const mayPart = segs.find(s => s.fromDate === '2031-05-01');
    assert.ok(aprPart && aprPart.toDate === '2031-04-30' && aprPart.hoursPerDay === 2, 'before-part keeps 2h and ends 30 Apr');
    assert.ok(mayPart && mayPart.toDate === '2031-05-31' && mayPart.hoursPerDay === 4, 'May month segment at 4h');
    r = await call(ctrl.getAllocationGrid, { user: mgr, params: { id: pA.id }, query: { from: '2031-03', to: '2031-05' } });
    assert.equal(r.status, 200);
    const row = data(r).rows.find(x => x.memberId === member.id);
    const mar = row.cells.find(c => c.month === '2031-03'), may = row.cells.find(c => c.month === '2031-05');
    assert.equal(mar.mixed, true); assert.equal(may.hoursPerDay, 4); assert.equal(may.segmentId, mayPart.id);
    r = await call(ctrl.applyAllocationGrid, { user: mgr, params: { id: pA.id }, body: { changes: 'nope' } });
    assert.equal(r.status, 400);
    ok('5', `grid apply May=4h split ${SPAN_FROM}→${SPAN_TO}: [${aprPart.fromDate}→${aprPart.toDate} 2h] + [${mayPart.fromDate}→${mayPart.toDate} 4h]; grid Mar cell mixed=true`);

    // ── 6 release from 2031-03-20 ──────────────────────────────────────────
    r = await call(ctrl.releaseMember, { user: mgr, params: { id: pA.id, memberId: member.id }, body: { fromDate: '2031-03-20' } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    segs = await allocSvc.listSegments(pA.id, member.id);
    assert.equal(segs.length, 2); assert.ok(segs.every(s => s.toDate < '2031-03-20'));
    assert.equal(segs.find(s => s.id === seg2.id).toDate, '2031-03-19');
    m = await ProjectMember.findByPk(member.id);
    assert.equal(String(m.allocationTo), '2031-03-19');
    r = await call(ctrl.getAllocationHistory, { user: mgr, params: { id: pA.id }, query: { memberId: member.id } });
    assert.equal(r.status, 200); assert.ok(data(r).some(h => h.action === 'release'));
    ok('6', `release from 2031-03-20 → ${data(r).filter(h => h.action === 'release').length} history 'release' rows; ${segs.length} periods left, last ends ${m.allocationTo}`);

    // ── 7 exception on an existing segment → approve ───────────────────────
    const excHours = cap + 2;
    r = await call(ctrl.requestAllocationException, { user: mgr, params: { id: pA.id }, body: { userId: target.id, memberId: member.id, segmentId: seg1.id, hoursPerDay: excHours, reason: 'crunch' } });
    assert.equal(r.status, 201, JSON.stringify(r.body) + (r.error?.stack || ''));
    const { approval, segment } = data(r);
    assert.equal(approval.segmentId, seg1.id); assert.equal(approval.previousSnapshot.memberCreated, false);
    assert.equal(approval.previousSnapshot.segment.hoursPerDay, 4);
    assert.equal(segment.exceptionStatus, 'pending'); assert.equal(Number(segment.hoursPerDay), excHours);
    assert.equal(data(r).member.exceptionStatus, 'pending', 'summary mirrors pending');
    // pending segment is not counted; the rest still is
    let counted = await allocSvc.loadSegmentsForUsers([target.id], { calendar });
    assert.ok(!counted.some(a => a.segmentId === seg1.id));
    // second request while pending → 409
    r = await call(ctrl.requestAllocationException, { user: mgr, params: { id: pA.id }, body: { userId: target.id, hoursPerDay: excHours, allocationFrom: '2031-06-02', allocationTo: '2031-06-06', reason: 'again' } });
    assert.equal(r.status, 409);
    r = await call(ctrl.decideAllocationException, { user: apr, params: { approvalId: approval.id }, body: { action: 'approve', responseNote: 'ok' } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(data(r).segment.exceptionStatus, 'approved'); assert.equal(data(r).member.exceptionStatus, 'approved');
    counted = await allocSvc.loadSegmentsForUsers([target.id], { calendar });
    assert.equal(counted.find(a => a.segmentId === seg1.id)?.hoursPerDay, excHours, 'approved segment counts with its hours');
    const hist = await allocSvc.listHistory(pA.id, { memberId: member.id });
    assert.ok(hist.some(h => h.action === 'exception_request' && h.segmentId === seg1.id));
    assert.ok(hist.some(h => h.action === 'exception_approve' && h.segmentId === seg1.id));
    ok('7', `exception on segment ${seg1.id.slice(0, 8)} (${excHours}h) → approval.segmentId set, pending (not counted) → approved (counted at ${excHours}h), history rows`);

    // ── 8 exception that creates the member → reject → member gone ─────────
    const pC = await makeProject(cleanup, 'SegC', manager.id);
    r = await call(ctrl.requestAllocationException, { user: mgr, params: { id: pC.id }, body: { userId: target.id, hoursPerDay: excHours, allocationFrom: '2031-07-01', allocationTo: '2031-07-10', reason: 'new' } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const created = data(r);
    assert.equal(created.approval.previousSnapshot.memberCreated, true); assert.equal(created.approval.previousSnapshot.segment, null);
    r = await call(ctrl.decideAllocationException, { user: apr, params: { approvalId: created.approval.id }, body: { action: 'reject' } });
    assert.equal(r.status, 200); assert.equal(data(r).member, null);
    assert.equal(await ProjectMember.findByPk(created.member.id), null, 'member row deleted');
    assert.equal(await AllocationSegment.findByPk(created.segment.id), null, 'segment deleted');
    // cancel path on an EXISTING segment restores it
    r = await call(ctrl.requestAllocationException, { user: mgr, params: { id: pA.id }, body: { userId: target.id, segmentId: seg2.id, hoursPerDay: excHours, reason: 'cancel me' } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    r = await call(ctrl.cancelAllocationException, { user: mgr, params: { approvalId: data(r).approval.id } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const restored = (await allocSvc.listSegments(pA.id, member.id)).find(s => s.id === seg2.id);
    assert.equal(restored.hoursPerDay, 2); assert.equal(restored.exceptionStatus, 'none'); assert.equal(restored.toDate, '2031-03-19');
    ok('8', 'exception creating the member → reject → member + segment deleted; cancel on an existing segment → period restored (2h, none)');

    // ── 9 preview shows segments ───────────────────────────────────────────
    r = await call(ctrl.getAllocationPreview, { user: mgr, params: { id: pA.id }, query: {} });
    assert.equal(r.status, 200, r.error?.stack);
    const line = data(r).find(l => l.memberId === member.id);
    assert.ok(Array.isArray(line.segments) && line.segments.length === 2);
    const SEG_KEYS = ['segmentId', 'fromDate', 'toDate', 'hoursPerDay', 'peakHours', 'isOverAllocated', 'overOnItsOwn', 'invalidDates', 'suggestions', 'conflicts'];
    for (const s of line.segments) for (const k of SEG_KEYS) assert.ok(k in s, `segment result lacks ${k}`);
    const excLine = line.segments.find(s => s.segmentId === seg1.id);
    assert.equal(excLine.overOnItsOwn, true); assert.equal(excLine.exceptionStatus, 'approved');
    assert.equal(line.hoursPerDay != null, true, 'member-level summary fields kept');
    assert.ok(line.allAllocations.every(a => 'segmentId' in a));
    ok('9', `preview line has ${line.segments.length} segment results (one over on its own: ${excLine.hoursPerDay}h approved) + member-level fields`);

    // members availability + user availability through the loader
    r = await call(ctrl.getMembersAvailability, { user: mgr, params: { id: pA.id } });
    assert.equal(r.status, 200); const av = data(r).find(x => String(x.userId) === String(target.id));
    // Availability deliberately counts BOTH project segments and helpdesk tickets.
    // Only project-sourced lines are keyed by segmentId — a ticket has no segment.
    const projectAllocs = (list) => list.filter(a => a.source !== 'helpdesk');
    assert.ok(projectAllocs(av.allocations).every(a => a.segmentId)); assert.ok(av.user?.name);
    r = await call(ctrl.getUserAvailability, { user: mgr, params: { userId: target.id }, query: { fromDate: P1_FROM, toDate: P1_TO } });
    assert.equal(r.status, 200); assert.ok(projectAllocs(data(r).allocations).every(a => a.segmentId));
    ok('9b', `members/availability + users/:id/availability project allocations keyed by segmentId (${projectAllocs(av.allocations).length} project + ${av.allocations.length - projectAllocs(av.allocations).length} ticket lines)`);

    // ── 10 utilisation lines carry segmentId (B3) ──────────────────────────
    const util = await utilisationSvc.getUserUtilisation(target.id, '2031-03', calendar);
    const pmLines = util.lines.filter(l => l.source === 'project');
    if (pmLines.length && pmLines.every(l => l.segmentId)) ok('10', `utilisation 2031-03: ${pmLines.length} project lines, all carry segmentId (refId=projectId)`);
    else fail('10', `utilisation lines without segmentId (B3 not landed?): ${JSON.stringify(pmLines.map(l => ({ refId: l.refId, segmentId: l.segmentId })))}`);

    // ── 11 capacity release approval trims/splits the period ───────────────
    // seg1 is 2031-03-03→03-14 at excHours (approved exception); release 03-10→03-14 to 2h
    r = await call(ctrl.requestAllocationApproval, { user: mgr, params: { id: pA.id }, body: { userId: target.id, hoursPerDay: 2, fromDate: '2031-03-10', toDate: '2031-03-14', reason: 'need him' } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    r = await call(ctrl.respondToAllocationApproval, { user: apr, params: { id: pA.id, approvalId: data(r).id }, body: { action: 'approve' } });
    assert.equal(r.status, 200, JSON.stringify(r.body) + (r.error?.stack || ''));
    segs = await allocSvc.listSegments(pA.id, member.id);
    const head = segs.find(s => s.fromDate === P1_FROM), tail = segs.find(s => s.fromDate === '2031-03-10');
    assert.ok(head && head.toDate === '2031-03-09' && head.hoursPerDay === excHours, 'before-part keeps original hours');
    assert.ok(tail && tail.toDate === '2031-03-14' && tail.hoursPerDay === 2 && tail.exceptionStatus === 'none', 'window part at 2h');
    // window overlapping TWO periods → 409 restriction, approval stays pending
    r = await call(ctrl.requestAllocationApproval, { user: mgr, params: { id: pA.id }, body: { userId: target.id, hoursPerDay: 1, fromDate: '2031-03-05', toDate: '2031-03-12', reason: 'x' } });
    const twoId = data(r).id;
    r = await call(ctrl.respondToAllocationApproval, { user: apr, params: { id: pA.id, approvalId: twoId }, body: { action: 'approve' } });
    assert.equal(r.status, 409); assert.match(r.body.message, /Several periods overlap/);
    assert.equal((await PmAllocationApproval.findByPk(twoId)).status, 'pending');
    ok('11', `capacity release 03-10→03-14 @2h split the period: [${head.fromDate}→${head.toDate} ${head.hoursPerDay}h] + [${tail.fromDate}→${tail.toDate} ${tail.hoursPerDay}h]; window over 2 periods → 409, approval left pending`);

    // ── 12 backfill: legacy member row → migration 045 → 1 segment ─────────
    const migration045 = require(path.join(__dirname, '../migrations/045_allocation_segments'));
    const pD = await makeProject(cleanup, 'SegD', manager.id, { startDate: '2031-09-01', endDate: '2031-09-30' });
    const legacy = await ProjectMember.create({ projectId: pD.id, userId: target.id, role: 'Legacy', hoursPerDay: 3, allocationFrom: '2031-09-15', allocationTo: '2031-09-01', hoursConfirmed: false });
    const origLog = console.log; console.log = () => {};
    try { await migration045.run(); await migration045.run(); } finally { console.log = origLog; }
    const back = await AllocationSegment.findAll({ where: { memberId: legacy.id } });
    assert.equal(back.length, 1, 'exactly one backfilled segment after two runs');
    assert.equal(Number(back[0].hoursPerDay), 3); assert.equal(back[0].hoursConfirmed, false);
    assert.ok(String(back[0].fromDate) <= String(back[0].toDate), 'reversed dates → fallback window');
    ok('12', `migration 045 (run twice) backfilled 1 segment for a reversed-dates legacy member: ${back[0].fromDate}→${back[0].toDate} 3h unconfirmed`);

    // ── removeMember → history 'remove', segments cascade ──────────────────
    r = await call(ctrl.removeMember, { user: mgr, params: { id: pA.id, memberId: member.id } });
    assert.equal(r.status, 200, r.error?.stack);
    assert.equal(await AllocationSegment.count({ where: { memberId: member.id } }), 0);
    assert.ok((await PmAllocationHistory.findAll({ where: { memberId: member.id, action: 'remove', segmentId: null } })).length === 1);
    ok('13', 'removeMember → history remove row (member + segments snapshot), segments cascaded');
  } finally {
    await cleanup.run();
    await closeDb();
  }

  const failed = results.filter(r => !r.ok);
  console.log(`\n=== ${results.length - failed.length}/${results.length} checks passed ${failed.length ? '— FAILURES: ' + failed.map(f => f.id).join(', ') : '— ALL OK'} ===\n`);
  process.exit(failed.length ? 1 : 0);
}

run().catch(async (e) => {
  console.error('\nFAILED:', e.stack || e.message);
  try { await closeDb(); } catch { /* ignore */ }
  process.exit(1);
});
