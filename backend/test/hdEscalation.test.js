/**
 * Helpdesk SLA escalation job (DB).
 *
 * Writes only `__TEST__` hd_groups / hd_tickets (+ their history) and removes
 * them again. Every runEscalation call is scoped with `ticketIds` so real
 * tickets are never scanned or marked. The email sender is a stub — no mail.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const H = require('./_helpers');

delete process.env.SMTP_HOST;
delete process.env.HD_ESCALATION_ENABLED;

const { HdGroup, HdTicket, HdTicketHistory } = require('../src/models/helpdesk');
const { runEscalation } = require('../src/jobs/hdEscalation.job');

const DAY = 24 * 60 * 60 * 1000;

test('hdEscalation job', async (t) => {
  const cleanup = H.createCleanup();
  try {
    const [manager] = await H.select(
      "SELECT id, name, email FROM users WHERE isActive = 1 AND email IS NOT NULL AND email <> '' ORDER BY id LIMIT 1"
    );
    assert.ok(manager, 'need an active user to act as group manager');

    const group = await HdGroup.create({ name: H.tag('escGroup'), managerId: manager.id });
    cleanup.add(() => HdGroup.destroy({ where: { id: group.id } }));
    const noMgrGroup = await HdGroup.create({ name: H.tag('escNoMgr') });
    cleanup.add(() => HdGroup.destroy({ where: { id: noMgrGroup.id } }));

    const ids = [];
    const newTicket = async (fields, { ageUpdatedDays } = {}) => {
      const row = await HdTicket.create({
        reqNumber: `${H.TEST_PREFIX}${crypto.randomBytes(5).toString('hex')}`,
        title: H.tag('escTicket'), status: 'open', priority: 'medium', groupId: group.id, ...fields,
      });
      ids.push(row.id);
      cleanup.add(async () => {
        await HdTicketHistory.destroy({ where: { ticketId: row.id } });
        await HdTicket.destroy({ where: { id: row.id } });
      });
      if (ageUpdatedDays) {
        await H.sequelize.query(
          'UPDATE hd_tickets SET updated_at = DATE_SUB(updated_at, INTERVAL :d DAY) WHERE id = :id',
          { replacements: { d: ageUpdatedDays, id: row.id } }
        );
      }
      return HdTicket.findByPk(row.id);
    };
    const reload = (row) => HdTicket.findByPk(row.id);

    const now = new Date();
    const overdue2  = await newTicket({ dueDate: new Date(now - 2 * DAY) });
    const overdue30 = await newTicket({ dueDate: new Date(now - 30 * DAY) });
    const stale3    = await newTicket({}, { ageUpdatedDays: 3 });
    const fresh     = await newTicket({});
    const closed    = await newTicket({ dueDate: new Date(now - 2 * DAY), status: 'closed' });

    const before = {};
    for (const r of [overdue2, overdue30, stale3, fresh]) before[r.id] = r.updated_at.getTime();

    const sent = [];
    const sender = async (ticket, to, opts) => { sent.push({ id: ticket.id, to, opts }); return true; };

    await t.test('send=false (default env): marks breached, escalates none', async () => {
      const s = await runEscalation({ now, ticketIds: ids, sender }); // HD_ESCALATION_ENABLED unset
      assert.deepEqual(s, { scanned: 3, breached: 3, newlyMarked: 3, escalated: 0, skippedNoManager: 0, skippedOld: 0, failed: 0 });
      assert.equal(sent.length, 0);
      for (const r of [overdue2, overdue30, stale3]) {
        const x = await reload(r);
        assert.equal(x.slaBreached, true);
        assert.ok(x.slaBreachAt, 'slaBreachAt set');
        assert.equal(x.escalatedAt, null);
        assert.equal(x.updated_at.getTime(), before[r.id], 'updatedAt not bumped by marking');
      }
      assert.equal((await reload(fresh)).slaBreached, false);
      assert.equal((await reload(closed)).slaBreached, false);
    });

    await t.test('dryRun: counts only, no writes, no send', async () => {
      const s = await runEscalation({ now, ticketIds: ids, sender, send: true, dryRun: true });
      assert.equal(s.escalated, 2);
      assert.equal(s.skippedOld, 1);
      assert.equal(sent.length, 0);
      assert.equal((await reload(overdue2)).escalatedAt, null);
    });

    await t.test('send=true: overdue-2d + stale-3d escalated once, 30d skippedOld', async () => {
      const s = await runEscalation({ now, ticketIds: ids, sender, send: true });
      assert.deepEqual(s, { scanned: 3, breached: 3, newlyMarked: 0, escalated: 2, skippedNoManager: 0, skippedOld: 1, failed: 0 });
      assert.deepEqual(sent.map(x => x.id).sort((a, b) => a - b), [overdue2.id, stale3.id].sort((a, b) => a - b));
      assert.ok(sent.every(x => x.to.email === manager.email && x.opts.reason));

      for (const r of [overdue2, stale3]) {
        const x = await reload(r);
        assert.ok(x.escalatedAt, 'escalatedAt set');
        assert.equal(x.escalatedToId, manager.id);
        assert.equal(x.updated_at.getTime(), before[r.id], 'updatedAt not bumped by escalation');
        const hist = await HdTicketHistory.findAll({ where: { ticketId: r.id, field: 'escalation' } });
        assert.equal(hist.length, 1);
        assert.equal(hist[0].newValue, `Escalated to ${manager.name}`);
      }
      const old = await reload(overdue30);
      assert.equal(old.slaBreached, true);
      assert.equal(old.escalatedAt, null);
      assert.equal(await HdTicketHistory.count({ where: { ticketId: overdue30.id } }), 0);

      const f = await reload(fresh);
      assert.equal(f.slaBreached, false);
      assert.equal(f.escalatedAt, null);
      assert.equal(f.updated_at.getTime(), before[fresh.id]);
      const c = await reload(closed);
      assert.equal(c.slaBreached, false);
      assert.equal(c.escalatedAt, null);
    });

    await t.test('second run escalates nothing', async () => {
      const n = sent.length;
      const s = await runEscalation({ now, ticketIds: ids, sender, send: true });
      assert.equal(s.escalated, 0);
      assert.equal(s.newlyMarked, 0);
      assert.equal(sent.length, n);
      assert.equal(await HdTicketHistory.count({ where: { ticketId: [overdue2.id, stale3.id], field: 'escalation' } }), 2);
    });

    await t.test('no group manager -> skippedNoManager; failed send -> retried later', async () => {
      const noMgr   = await newTicket({ dueDate: new Date(now - DAY), groupId: noMgrGroup.id });
      const noGroup = await newTicket({ dueDate: new Date(now - DAY), groupId: null });
      const failing = await newTicket({ dueDate: new Date(now - DAY) });
      const scope = [noMgr.id, noGroup.id, failing.id];

      const s = await runEscalation({ now, ticketIds: scope, send: true, sender: async () => false });
      assert.deepEqual(s, { scanned: 3, breached: 3, newlyMarked: 3, escalated: 0, skippedNoManager: 2, skippedOld: 0, failed: 1 });
      const fx = await reload(failing);
      assert.equal(fx.escalatedAt, null);
      assert.equal(fx.escalatedToId, null);
      assert.equal(fx.slaBreached, true);

      const s2 = await runEscalation({ now, ticketIds: [failing.id], send: true, sender });
      assert.equal(s2.escalated, 1);
      assert.ok((await reload(failing)).escalatedAt);
    });

    await t.test('empty ticketIds scope scans nothing', async () => {
      const s = await runEscalation({ now, ticketIds: [], send: true, sender });
      assert.equal(s.scanned, 0);
    });
  } finally {
    await cleanup.run();
    await H.closeDb();
  }
});
