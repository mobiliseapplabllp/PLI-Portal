/**
 * Working calendar — pmSettings.service + calendar.controller (DB).
 * Restores pm_settings to its original values and deletes the holiday it
 * creates. The holiday is placed in March 2027 so it cannot disturb the
 * Sept–Nov 2026 arithmetic other (concurrently running) test files rely on.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const H = require('./_helpers');

const PmHoliday = require('../src/models/pm/PmHoliday');
const pmSettingsService = require('../src/services/pm/pmSettings.service');
const ctrl = require('../src/controllers/pm/calendar.controller');
const { ValidationError } = require('../src/utils/errors');

/** First Mon–Fri in March 2027 that has no holiday row yet. */
async function freeWeekdayInMarch2027() {
  const taken = new Set((await PmHoliday.findAll({ where: { year: 2027 }, attributes: ['date'] })).map(r => String(r.date).slice(0, 10)));
  for (let d = 1; d <= 31; d++) {
    const date = `2027-03-${String(d).padStart(2, '0')}`;
    const dow = new Date(2027, 2, d).getDay();
    if (dow >= 1 && dow <= 5 && !taken.has(date)) return date;
  }
  throw new Error('March 2027 has no free weekday');
}

test('calendar policy and holidays', async (t) => {
  const cleanup = H.createCleanup();
  try {
    const admin = H.fakeUser(await H.pickUser('admin'), 'admin');
    const original = await pmSettingsService.getCalendar();

    await t.test('getCalendar() shape', async () => {
      assert.equal(typeof original.hoursPerDay, 'number');
      assert.ok(original.hoursPerDay >= 4 && original.hoursPerDay <= 12);
      assert.ok(Array.isArray(original.workingSaturdays));
      original.workingSaturdays.forEach(n => assert.ok(Number.isInteger(n) && n >= 1 && n <= 5));
      assert.ok(original.holidays instanceof Set);
      for (const h of original.holidays) assert.match(h, /^\d{4}-\d{2}-\d{2}$/);
    });

    await t.test('updateCalendar rejects [1,3,6] and [2,2]; accepts [2,4]', async () => {
      // Restore is registered BEFORE the first write so it runs even if the write half-succeeds.
      cleanup.add(() => pmSettingsService.updateCalendar({ hoursPerDay: original.hoursPerDay, workingSaturdays: original.workingSaturdays }));

      await assert.rejects(
        pmSettingsService.updateCalendar({ hoursPerDay: original.hoursPerDay, workingSaturdays: [1, 3, 6] }),
        (e) => e instanceof ValidationError && /between 1 and 5/.test(e.message)
      );
      await assert.rejects(
        pmSettingsService.updateCalendar({ hoursPerDay: original.hoursPerDay, workingSaturdays: [2, 2] }),
        ValidationError
      );
      await assert.rejects(
        pmSettingsService.updateCalendar({ hoursPerDay: 4.3, workingSaturdays: [2, 4] }),
        (e) => e instanceof ValidationError && /steps of 0\.5/.test(e.message)
      );
      const after = await pmSettingsService.getCalendar();
      assert.deepEqual(after.workingSaturdays, original.workingSaturdays, 'rejected writes must not persist');

      const ok = await pmSettingsService.updateCalendar({ hoursPerDay: original.hoursPerDay, workingSaturdays: [4, 2] });
      assert.deepEqual(ok.workingSaturdays, [2, 4]);                  // sorted copy
      assert.deepEqual((await pmSettingsService.getCalendar()).workingSaturdays, [2, 4]);

      await cleanup.run();                                            // restore now, not just at the end
      assert.deepEqual((await pmSettingsService.getCalendar()).workingSaturdays, original.workingSaturdays);
    });

    await t.test('calendar.controller getCalendar → 200 with policy only', async () => {
      const res = H.mockRes(); const next = H.mockNext();
      await ctrl.getCalendar({ user: admin }, res, next);
      assert.equal(next.called, false);
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.hoursPerDay, original.hoursPerDay);
      assert.equal('holidays' in res.body.data, false);
    });

    const date = await freeWeekdayInMarch2027();
    const name = H.tag('holiday');
    let holidayId;

    await t.test('createHoliday → 201', async () => {
      // Registered before the call: if create succeeds but the assertion fails, the row still goes.
      cleanup.add(() => PmHoliday.destroy({ where: { date, name } }));
      const res = H.mockRes(); const next = H.mockNext();
      await ctrl.createHoliday({ body: { date, name }, user: admin }, res, next);
      assert.equal(next.called, false, next.error && next.error.message);
      assert.equal(res.statusCode, 201);
      assert.equal(res.body.data.date, date);
      assert.equal(res.body.data.year, 2027);
      assert.equal(res.body.data.isOptional, false);
      holidayId = res.body.data._id ?? res.body.data.id;
      assert.ok(holidayId);
    });

    await t.test('duplicate date → 409 flat PM shape', async () => {
      const res = H.mockRes(); const next = H.mockNext();
      await ctrl.createHoliday({ body: { date, name: name + ' dup' }, user: admin }, res, next);
      assert.equal(res.statusCode, 409);
      assert.equal(res.body.success, false);
      assert.match(res.body.message, new RegExp(date));
    });

    await t.test('invalid body → 400', async () => {
      const res = H.mockRes(); const next = H.mockNext();
      await ctrl.createHoliday({ body: { date: '2027-02-30', name: 'x' }, user: admin }, res, next);
      assert.equal(res.statusCode, 400);
      assert.equal(res.body.success, false);
    });

    await t.test('preview shows the day as kind holiday and it counts against capacity', async () => {
      const res = H.mockRes(); const next = H.mockNext();
      await ctrl.getCalendarPreview({ query: { month: '2027-03' }, user: admin }, res, next);
      assert.equal(next.called, false);
      assert.equal(res.statusCode, 200);
      const day = res.body.data.days.find(d => d.date === date);
      assert.ok(day, 'day present in grid');
      assert.equal(day.kind, 'holiday');
      assert.equal(day.holidayName, name);
      assert.ok(res.body.data.holidays.some(h => h.date === date));
      assert.equal(res.body.data.daysInMonth, 31);
      assert.equal(res.body.data.workingDays + res.body.data.sundays + res.body.data.saturdaysOff + res.body.data.holidays.filter(h => !h.isOptional).length, 31);
    });

    await t.test('getCalendar() now includes the holiday; getWorkingDays subtracts it', async () => {
      const cal = await pmSettingsService.getCalendar();
      assert.ok(cal.holidays.has(date));
      const res = H.mockRes(); const next = H.mockNext();
      await ctrl.getWorkingDays({ query: { from: date, to: date }, user: admin }, res, next);
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.data.workingDays, 0);
      assert.equal(res.body.data.capacityHours, 0);
    });

    await t.test('deleteHoliday → 200, then 404', async () => {
      const res = H.mockRes(); const next = H.mockNext();
      await ctrl.deleteHoliday({ params: { id: holidayId }, user: admin }, res, next);
      assert.equal(res.statusCode, 200);
      assert.equal(await PmHoliday.count({ where: { id: holidayId } }), 0);
      const res2 = H.mockRes(); const next2 = H.mockNext();
      await ctrl.deleteHoliday({ params: { id: holidayId }, user: admin }, res2, next2);
      assert.equal(res2.statusCode, 404);
    });
  } finally {
    await cleanup.run();
    await H.closeDb();
  }
});
