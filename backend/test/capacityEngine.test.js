/**
 * capacityEngine — pure functions, no DB.
 * Facts verified by hand against the 2026 calendar:
 *   Sept 2026 starts on a Tuesday; Oct 2026 on a Thursday; Nov 2026 on a Sunday.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/utils/capacityEngine');

const CAL = { hoursPerDay: 8, workingSaturdays: [2, 4], holidays: ['2026-10-20', '2026-10-21'] };

const A = { projectId: 'A', hoursPerDay: 4, allocationFrom: '2026-09-01', allocationTo: '2026-10-31' };
const B = { projectId: 'B', hoursPerDay: 3, allocationFrom: '2026-09-15', allocationTo: '2026-11-30' };
const T = { projectId: 'T', hoursPerDay: 2, allocationFrom: '2026-09-20', allocationTo: '2026-09-25' };

test('local-time date safety: toDate/iso never shift a calendar date', () => {
  assert.equal(E.iso(E.toDate('2026-09-20')), '2026-09-20');
  assert.equal(E.toDate('2026-09-20').getDay(), 0);           // Sunday
  assert.equal(E.iso(E.toDate(new Date(2026, 8, 20, 23, 59))), '2026-09-20');
  assert.equal(E.toDate(null), null);
  assert.equal(E.toDate('not-a-date'), null);
});

test('normaliseCalendar: bare number = all Saturdays working, no holidays (Phase 0 compat)', () => {
  const cal = E.normaliseCalendar(8);
  assert.equal(cal.hoursPerDay, 8);
  assert.deepEqual(cal.workingSaturdays, [1, 2, 3, 4, 5]);
  assert.equal(cal.holidays.size, 0);
  assert.equal(E.isWorkingDay(E.toDate('2026-09-19'), 8), true);   // 3rd Saturday counted
  const full = E.normaliseCalendar(CAL);
  assert.ok(full.holidays instanceof Set);
  assert.ok(full.holidays.has('2026-10-20'));
});

test('isWorkingDay / dayKind follow the four rules in order', () => {
  assert.equal(E.isWorkingDay(E.toDate('2026-09-12'), CAL), true);    // 2nd Saturday works
  assert.equal(E.isWorkingDay(E.toDate('2026-09-19'), CAL), false);   // 3rd Saturday off
  assert.equal(E.isWorkingDay(E.toDate('2026-09-20'), CAL), false);   // Sunday
  assert.equal(E.isWorkingDay(E.toDate('2026-10-20'), CAL), false);   // Tuesday holiday
  assert.equal(E.dayKind(E.toDate('2026-09-12'), CAL), 'working');
  assert.equal(E.dayKind(E.toDate('2026-09-19'), CAL), 'saturday-off');
  assert.equal(E.dayKind(E.toDate('2026-09-20'), CAL), 'sunday');
  assert.equal(E.dayKind(E.toDate('2026-10-20'), CAL), 'holiday');
  assert.equal(E.saturdayOrdinal(E.toDate('2026-09-26')), 4);
});

test('getMonthlyCapacity: Sept 2026 = 24 days / 192h; Oct 2026 = 22 days / 176h', () => {
  const sep = E.getMonthlyCapacity(2026, 9, CAL);
  assert.equal(sep.workingDays, 24);
  assert.equal(sep.totalHours, 192);
  assert.equal(sep.sundays, 4);
  assert.equal(sep.saturdaysOff, 2);
  assert.equal(sep.saturdaysOn, 2);
  assert.deepEqual(sep.holidays, []);

  const oct = E.getMonthlyCapacity(2026, 10, CAL);
  assert.equal(oct.workingDays, 22);
  assert.equal(oct.totalHours, 176);
  assert.equal(oct.sundays, 4);
  assert.equal(oct.saturdaysOff, 3);
  assert.equal(oct.saturdaysOn, 2);
  assert.deepEqual(oct.holidays, ['2026-10-20', '2026-10-21']);
});

test('workingDaysBetween: 1 Sep - 31 Oct 2026 = 46; inverted or Sunday-only window = 0', () => {
  assert.equal(E.workingDaysBetween('2026-09-01', '2026-10-31', CAL), 46);
  assert.equal(E.workingDaysBetween('2026-10-31', '2026-09-01', CAL), 0);
  assert.equal(E.workingDaysBetween('2026-09-20', '2026-09-20', CAL), 0);
});

test('checkConflict: A+B+T over capacity on 5 days, one range 21-25 Sep', () => {
  const r = E.checkConflict([A, B], T, CAL);
  assert.equal(r.ok, false);
  assert.equal(r.overDays, 5);
  assert.equal(r.ranges.length, 1);
  assert.equal(r.ranges[0].from, '2026-09-21');
  assert.equal(r.ranges[0].to, '2026-09-25');
  assert.equal(r.peak, 9);
  assert.equal(r.remaining, 1);
  assert.equal(r.capacity, 8);
  assert.match(r.message, /5 working days/);
  assert.match(r.message, /9h \/ 8h/);
  assert.match(r.message, /Reduce to 1 hrs\/day/);
});

test('checkConflict: a holiday inside the window removes an over-day but keeps one range', () => {
  const cal = { ...CAL, holidays: [...CAL.holidays, '2026-09-23'] };
  const r = E.checkConflict([A, B], T, cal);
  assert.equal(r.ok, false);
  assert.equal(r.overDays, 4);
  assert.equal(r.ranges.length, 1);
});

test('checkConflict: within capacity is ok with remaining rounded down to 0.5', () => {
  const r = E.checkConflict([A], { hoursPerDay: 4, allocationFrom: '2026-09-01', allocationTo: '2026-09-30' }, CAL);
  assert.equal(r.ok, true);
  assert.equal(r.overDays, 0);
  assert.deepEqual(r.ranges, []);
  assert.equal(r.remaining, 4);
  assert.equal(r.message, null);
});

test('monthBreakdown Sept 2026: per-allocation days/hours/pct, total 145h / 75.5%, band over', () => {
  const bd = E.monthBreakdown([A, B, T], 2026, 9, CAL);
  const line = (id) => bd.lines.find(l => l.projectId === id);
  assert.equal(bd.lines.length, 3);
  assert.equal(line('A').workingDaysInMonth, 24);
  assert.equal(line('A').hours, 96);
  assert.equal(line('A').pct, 50);
  assert.equal(line('B').workingDaysInMonth, 13);
  assert.equal(line('B').hours, 39);
  assert.equal(line('T').workingDaysInMonth, 5);
  assert.equal(line('T').hours, 10);
  assert.equal(bd.totalHours, 145);
  assert.equal(bd.totalPct, 75.5);
  assert.equal(bd.peakHoursPerDay, 9);
  assert.equal(bd.overDays, 5);
  assert.equal(bd.peakDates[0], '2026-09-21');
  assert.equal(bd.isOverAllocated, true);
  assert.equal(bd.band, 'over');
  assert.equal(bd.lines[0].projectId, 'A');                // sorted by hours desc
});

test('monthBreakdown Oct 2026: 2 lines, A 88h, band high, not over', () => {
  const bd = E.monthBreakdown([A, B, T], 2026, 10, CAL);
  assert.equal(bd.lines.length, 2);
  assert.equal(bd.lines.find(l => l.projectId === 'A').hours, 88);
  assert.equal(bd.band, 'high');
  assert.equal(bd.isOverAllocated, false);
  assert.equal(bd.overDays, 0);
});

test('monthBreakdown: a month with nothing active has 0 lines and band free', () => {
  // A and T end in Sept/Oct; B runs to 30 Nov, so Nov holds only B and Dec holds nothing.
  const nov = E.monthBreakdown([A, T], 2026, 11, CAL);
  assert.equal(nov.lines.length, 0);
  assert.equal(nov.totalHours, 0);
  assert.equal(nov.band, 'free');

  const novWithB = E.monthBreakdown([A, B, T], 2026, 11, CAL);
  assert.equal(novWithB.lines.length, 1);
  assert.equal(novWithB.lines[0].projectId, 'B');
  assert.equal(novWithB.band, 'free');

  const dec = E.monthBreakdown([A, B, T], 2026, 12, CAL);
  assert.equal(dec.lines.length, 0);
  assert.equal(dec.band, 'free');
});

test('resolveAllocation: total mode derives hours/day from working days', () => {
  const r = E.resolveAllocation({ allocationMode: 'total', allocationTotalHours: 120, allocationFrom: '2026-09-01', allocationTo: '2026-10-31' }, CAL);
  assert.equal(r.ok, true);
  assert.equal(r.mode, 'total');
  assert.equal(r.workingDays, 46);
  assert.equal(r.hoursPerDay, 2.6);
  assert.equal(r.totalHours, 120);

  const three = E.resolveAllocation({ allocationMode: 'total', allocationTotalHours: 6, allocationFrom: '2026-09-21', allocationTo: '2026-09-23' }, CAL);
  assert.equal(three.ok, true);
  assert.equal(three.hoursPerDay, 2);
  assert.equal(three.workingDays, 3);
});

test('resolveAllocation: total mode rejections never throw', () => {
  const noEnd = E.resolveAllocation({ allocationMode: 'total', allocationTotalHours: 120, allocationFrom: '2026-09-01' }, CAL);
  assert.equal(noEnd.ok, false);
  assert.match(noEnd.error, /both/);

  const tiny = E.resolveAllocation({ allocationMode: 'total', allocationTotalHours: 0.5, allocationFrom: '2026-09-01', allocationTo: '2026-10-31' }, CAL);
  assert.equal(tiny.ok, false);
  assert.match(tiny.error, /0\.1/);

  const sunday = E.resolveAllocation({ allocationMode: 'total', allocationTotalHours: 4, allocationFrom: '2026-09-20', allocationTo: '2026-09-20' }, CAL);
  assert.equal(sunday.ok, false);
  assert.match(sunday.error, /no working days/);

  const inverted = E.resolveAllocation({ allocationMode: 'total', allocationTotalHours: 4, allocationFrom: '2026-10-31', allocationTo: '2026-09-01' }, CAL);
  assert.equal(inverted.ok, false);
  assert.match(inverted.error, /before start/);
});

test('resolveAllocation: per_day mode - 0.5 steps, total derived when dates exist, default mode', () => {
  const r = E.resolveAllocation({ allocationMode: 'per_day', hoursPerDay: 4, allocationFrom: '2026-09-01', allocationTo: '2026-10-31' }, CAL);
  assert.equal(r.ok, true);
  assert.equal(r.totalHours, 184);
  assert.equal(r.workingDays, 46);

  const bad = E.resolveAllocation({ allocationMode: 'per_day', hoursPerDay: 4.3 }, CAL);
  assert.equal(bad.ok, false);
  assert.match(bad.error, /0\.5/);

  const over = E.resolveAllocation({ allocationMode: 'per_day', hoursPerDay: 8.5 }, CAL);
  assert.equal(over.ok, false);

  const noMode = E.resolveAllocation({ hoursPerDay: 4 }, CAL);
  assert.equal(noMode.ok, true);
  assert.equal(noMode.mode, 'per_day');
  assert.equal(noMode.totalHours, null);
  assert.equal(noMode.workingDays, null);
});

test('toPct derives display % from capacity and never stores it', () => {
  assert.equal(E.toPct(4, CAL), 50);
  assert.equal(E.toPct(2.6, 8), 32.5);
  assert.equal(E.toPct(null, CAL), null);
});

test('summarise: peak/free hours and next free date over a window', () => {
  const s = E.summarise([A, B, T], CAL, '2026-09-21', '2026-09-30');
  assert.equal(s.capacity, 8);
  assert.equal(s.peakHours, 9);
  assert.equal(s.freeHours, 0);
  assert.equal(s.isOverAllocated, true);
  assert.equal(s.nextFreeDate, '2026-09-26');   // first day after T ends: A+B = 7h
  assert.equal(s.projectCount, 3);

  const empty = E.summarise([], CAL, '2026-09-01', '2026-09-30');
  assert.equal(empty.peakHours, 0);
  assert.equal(empty.freeHours, 8);
  assert.equal(empty.projectCount, 0);
});
