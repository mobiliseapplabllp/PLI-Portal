/**
 * Utilisation across PM + helpdesk (DB).
 * One allocation-free employee gets a temp 4h/day Sept project membership and
 * a temp helpdesk ticket at 2h/day for 21-25 Sep. Everything is removed in
 * `finally`.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const H = require('./_helpers');

const Project       = require('../src/models/pm/Project');
const ProjectMember = require('../src/models/pm/ProjectMember');
const HdTicket      = require('../src/models/helpdesk/HdTicket');
const projectService    = require('../src/services/pm/project.service');
const pmSettingsService = require('../src/services/pm/pmSettings.service');
const util = require('../src/services/pm/utilisation.service');
const { workingDaysBetween } = require('../src/utils/capacityEngine');
const { ValidationError } = require('../src/utils/errors');

test('user and team utilisation combine project and helpdesk allocations', async (t) => {
  const cleanup = H.createCleanup();
  try {
    const managerRow = await H.pickUser('manager');
    const manager    = H.fakeUser(managerRow, 'manager');
    // Offset 1: allocation.test.js takes offset 0 in its own process.
    const employee   = await H.pickFreeUser(1, 'employee');
    const uid        = employee.id;
    const cal        = await pmSettingsService.getCalendar();

    const project = await Project.create({
      name: H.tag('utilisation'), managerId: managerRow.id, createdById: managerRow.id,
      status: 'In Progress', billingType: 'Non-Billable',
    });
    cleanup.add(async () => {
      await ProjectMember.destroy({ where: { projectId: project.id } });
      await Project.destroy({ where: { id: project.id } });
    });
    await projectService.addMember(project.id, {
      userId: uid, hoursPerDay: 4, allocationFrom: '2026-09-01', allocationTo: '2026-09-30',
    }, manager);

    // req_number is STRING(20): '__TEST__' + up to 12 chars.
    const reqNumber = ('__TEST__' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5)).slice(0, 20);
    const ticket = await HdTicket.create({
      reqNumber, title: '__TEST__ utilisation ticket', status: 'open', priority: 'medium',
      assigneeId: uid, allocationMode: 'per_day', allocationHoursPerDay: 2,
      allocationFrom: '2026-09-21', allocationTo: '2026-09-25',
    });
    cleanup.add(() => HdTicket.destroy({ where: { id: ticket.id } }));

    const pmDays = workingDaysBetween('2026-09-01', '2026-09-30', cal);
    const hdDays = workingDaysBetween('2026-09-21', '2026-09-25', cal);
    assert.ok(pmDays > 0 && hdDays > 0);

    await t.test('getUserUtilisation: one project line + one helpdesk line, pm/hd split, peak >= 6', async () => {
      const u = await util.getUserUtilisation(uid, '2026-09');
      assert.equal(u.userId, String(uid));
      assert.equal(u.user.email, employee.email);
      assert.equal(u.year, 2026);
      assert.equal(u.month, 9);
      assert.equal(u.lines.length, 2);
      const pm = u.lines.find(l => l.source === 'project');
      const hd = u.lines.find(l => l.source === 'helpdesk');
      assert.ok(pm && hd);
      assert.equal(pm.refId, project.id);
      assert.equal(pm.workingDaysInMonth, pmDays);
      assert.equal(pm.hours, 4 * pmDays);
      assert.equal(pm.isEstimated, false);
      assert.equal(hd.refId, ticket.id);
      assert.match(hd.name, new RegExp(reqNumber));
      assert.equal(hd.workingDaysInMonth, hdDays);
      assert.equal(hd.hours, 2 * hdDays);
      assert.equal(u.pmHours, 4 * pmDays);
      assert.equal(u.hdHours, 2 * hdDays);
      assert.equal(u.totalHours, u.pmHours + u.hdHours);
      assert.ok(u.peakHoursPerDay >= 6, `peak ${u.peakHoursPerDay}`);
      assert.equal(u.capacity.workingDays, pmDays);
    });

    await t.test('getTeamUtilisation: 3 months, Nov free, per-month summary', async () => {
      const team = await util.getTeamUtilisation({ userIds: [uid], from: '2026-09', to: '2026-11' });
      assert.equal(team.months.length, 3);
      assert.deepEqual(team.months.map(m => m.month), ['2026-09', '2026-10', '2026-11']);
      assert.equal(team.users.length, 1);
      const cells = team.users[0].cells;
      assert.equal(cells.length, 3);
      assert.equal(cells[0].month, '2026-09');
      assert.equal(cells[0].pmHours, 4 * pmDays);
      assert.equal(cells[0].hdHours, 2 * hdDays);
      assert.equal(cells[2].band, 'free');
      assert.equal(cells[2].totalHours, 0);
      assert.equal(team.months[2].summary.freeCount, 1);
      assert.equal(team.months[2].summary.userCount, 1);
      assert.equal(team.calendar.hoursPerDay, cal.hoursPerDay);
    });

    await t.test('range validation: > 12 months, inverted range, bad format', async () => {
      await assert.rejects(util.getTeamUtilisation({ userIds: [uid], from: '2026-01', to: '2027-01' }),
        (e) => e instanceof ValidationError && /maximum 12 months/.test(e.message));
      await assert.rejects(util.getTeamUtilisation({ userIds: [uid], from: '2026-10', to: '2026-09' }), ValidationError);
      await assert.rejects(util.getUserUtilisation(uid, '2026-13'), ValidationError);
      await assert.rejects(util.getUserUtilisation(uid, 'Sept 2026'), ValidationError);
      assert.equal(util.monthRange('2026-11', '2027-02').length, 4);
    });

    await t.test('closing the ticket drops hdHours to 0', async () => {
      await ticket.update({ status: 'closed' });
      assert.ok(ticket.closedAt, 'beforeUpdate hook stamps closedAt');
      const u = await util.getUserUtilisation(uid, '2026-09');
      assert.equal(u.hdHours, 0);
      assert.equal(u.lines.length, 1);
      assert.equal(u.lines[0].source, 'project');
      assert.equal(u.pmHours, 4 * pmDays);
    });
  } finally {
    await cleanup.run();
    await H.closeDb();
  }
});
