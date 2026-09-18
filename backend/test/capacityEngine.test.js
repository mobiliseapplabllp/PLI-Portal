'use strict';

/**
 * T1  capacityEngine.checkConflict suggestions on fixed calendars (pure — no DB).
 *
 * Calendar used throughout: 8 h/day, NO working Saturdays, Thu 2026-10-08 is a holiday.
 * October 2026 working days: 1 2 | 5 6 7 9 | 12 13 14 15 16 | 19 20 21 22 23 | 26 27 28 29 30
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

require('./_helpers');   // env + SMTP guard (no DB access in this file)
const E = require('../src/utils/capacityEngine');

const CAL = { hoursPerDay: 8, workingSaturdays: [], holidays: new Set(['2026-10-08']) };
const alloc = (hoursPerDay, allocationFrom, allocationTo = null) => ({ hoursPerDay, allocationFrom, allocationTo, projectId: 'p' });

describe('capacityEngine.checkConflict suggestions', () => {

  test('existing keys unchanged; ok result carries empty suggestions', () => {
    const r = E.checkConflict([alloc(4, '2026-10-01', '2026-10-31')], alloc(4, '2026-10-01', '2026-10-14'), CAL);
    assert.equal(r.ok, true);
    assert.deepEqual(Object.keys(r).sort(), ['capacity', 'message', 'ok', 'overDays', 'peak', 'ranges', 'remaining', 'suggestions']);
    assert.deepEqual(r.suggestions, { reduceTo: null, nextFreeDate: null, shortenTo: null, overloadHours: 0 });
  });

  test('conflict in the middle: reduceTo / shortenTo / nextFreeDate / overloadHours', () => {
    // 6h on 5–9 Oct; proposing 4h on 1–14 Oct → 10h on 5,6,7,9 (8th is a holiday)
    const existing = [alloc(6, '2026-10-05', '2026-10-09')];
    const r = E.checkConflict(existing, alloc(4, '2026-10-01', '2026-10-14'), CAL);
    assert.equal(r.ok, false);
    assert.equal(r.overDays, 4);
    assert.equal(r.peak, 10);
    assert.equal(r.remaining, 2);
    assert.deepEqual(r.suggestions, {
      reduceTo: 2,                    // 8 − busiest existing (6)
      shortenTo: '2026-10-02',        // last fitting day before the first over day (5 Oct)
      nextFreeDate: '2026-10-12',     // first start after the conflict where 4h fits ≥ 5 working days
      overloadHours: 2,               // 10 − 8
    });
    assert.equal(existing.length, 1, 'pure — existing not mutated');
  });

  test('hours alone exceed capacity (the exception case): nothing fits anywhere', () => {
    const r = E.checkConflict([], alloc(10, '2026-10-01', '2026-10-14'), CAL);
    assert.equal(r.ok, false);
    assert.deepEqual(r.suggestions, { reduceTo: 8, nextFreeDate: null, shortenTo: null, overloadHours: 2 });
  });

  test('over from the first day: shortenTo null, reduceTo null, nextFreeDate after the block', () => {
    // 8h on 1–9 Oct; proposing 4h on 1–9 Oct (6 working days) → over on every day
    const r = E.checkConflict([alloc(8, '2026-10-01', '2026-10-09')], alloc(4, '2026-10-01', '2026-10-09'), CAL);
    assert.equal(r.ok, false);
    assert.equal(r.overDays, 6);
    assert.deepEqual(r.suggestions, { reduceTo: null, nextFreeDate: '2026-10-12', shortenTo: null, overloadHours: 4 });
  });

  test('nextFreeDate needs the whole length OR ≥ 5 working days free', () => {
    // 8h on 1–9 Oct, then 8h open-ended from 19 Oct → free gap 12–16 Oct = exactly 5 working days
    const five = [alloc(8, '2026-10-01', '2026-10-09'), alloc(8, '2026-10-19', null)];
    const r5 = E.checkConflict(five, alloc(4, '2026-10-01', '2026-10-30'), CAL);
    assert.equal(r5.suggestions.nextFreeDate, '2026-10-12');

    // Existing resumes on 16 Oct → gap 12–15 Oct = 4 working days → no qualifying start ever (open-ended after)
    const four = [alloc(8, '2026-10-01', '2026-10-09'), alloc(8, '2026-10-16', null)];
    const r4 = E.checkConflict(four, alloc(4, '2026-10-01', '2026-10-30'), CAL);
    assert.equal(r4.suggestions.nextFreeDate, null);
    assert.equal(r4.suggestions.shortenTo, null);
    assert.equal(r4.suggestions.reduceTo, null);
  });

  test('short proposal: the whole length fitting is enough (< 5 days)', () => {
    // 8h on 1–2 Oct only; proposing 4h on 1–2 Oct (2 working days) → next start where 2 days fit = 5 Oct
    const r = E.checkConflict([alloc(8, '2026-10-01', '2026-10-02')], alloc(4, '2026-10-01', '2026-10-02'), CAL);
    assert.equal(r.ok, false);
    assert.equal(r.suggestions.nextFreeDate, '2026-10-05');
    assert.equal(r.suggestions.shortenTo, null);
  });

  test('holidays and Sundays are skipped when choosing dates', () => {
    // 8h on 1–7 Oct; proposing 4h on 1–9 Oct → 8 Oct is a holiday so nextFreeDate is 9 Oct, not 8 Oct
    const r = E.checkConflict([alloc(8, '2026-10-01', '2026-10-07')], alloc(4, '2026-10-01', '2026-10-09'), CAL);
    assert.equal(r.suggestions.nextFreeDate, '2026-10-09');
    // 6h on 5 Oct (Mon) only; proposing 4h on 3–7 Oct (Sat 3rd off, Sun 4th off) → shortenTo null: 5 Oct is the first working day
    const r2 = E.checkConflict([alloc(6, '2026-10-05', '2026-10-05')], alloc(4, '2026-10-03', '2026-10-07'), CAL);
    assert.equal(r2.suggestions.shortenTo, null);
    assert.equal(r2.suggestions.nextFreeDate, '2026-10-06');
  });

  test('reduceTo is rounded DOWN to 0.5 and mirrors `remaining`', () => {
    const r = E.checkConflict([alloc(5.3, '2026-10-01', '2026-10-31')], alloc(4, '2026-10-01', '2026-10-14'), CAL);
    assert.equal(r.remaining, 2.5);
    assert.equal(r.suggestions.reduceTo, 2.5);
    assert.equal(r.suggestions.overloadHours, 1.3);
  });
});
