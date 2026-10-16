const { sequelize } = require('../test/_helpers');
const ctrl = require('../src/controllers/helpdesk/ticket.controller');
const HdTicket = require('../src/models/helpdesk/HdTicket');
const PmSettings = require('../src/models/pm/PmSettings');

let pass = 0, fail = 0;
const check = (l, ok, d = '') => { if (ok) { pass++; console.log('  OK  ' + l); } else { fail++; console.log('  FAIL ' + l + '  ' + d); } };
const mkRes = () => ({ statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } });

(async () => {
  const [[manager]] = await sequelize.query("SELECT id, email FROM users WHERE managerId IS NULL LIMIT 1");
  const [[employee]] = await sequelize.query('SELECT id, email FROM users WHERE managerId = ? LIMIT 1', { replacements: [manager.id] });
  const mgrUser = { id: manager.id, email: manager.email, isAdmin: false, scope: 'group', permissions: { canAssign: true } };

  const originalFlag = (await PmSettings.findByPk(1))?.ticketAllocationAgreementEnabled;
  let createdTicketId = null;
  try {
    // This test is about the preview endpoint itself, not the agreement flow —
    // force the flag off so the ticket's allocation is written immediately,
    // regardless of whatever the real flag is currently set to live.
    await PmSettings.update({ ticketAllocationAgreementEnabled: false }, { where: { id: 1 } });

    const title = '__TEST__ AllocPreview ' + Date.now();
    const res1 = mkRes();
    await ctrl.createTicket({ body: { title, priority: 'High', assigneeId: employee.id, allocationTotalHours: 4, allocationFrom: '2026-11-02', allocationTo: '2026-11-02' }, hdUser: mgrUser }, res1, () => {});
    const ticket = await HdTicket.findOne({ where: { title } });
    createdTicketId = ticket?.id;
    check('ticket created for preview test', !!ticket);

    // Within-capacity preview (1 hr/day over 5 days = modest)
    const res2 = mkRes();
    await ctrl.previewAllocationCapacity({ params: { id: ticket.id }, body: { allocationTotalHours: 5, allocationFrom: '2026-11-03', allocationTo: '2026-11-07' } }, res2, e => { if (e) console.error('next err:', e.message); });
    check('within-capacity preview returns 200', res2.statusCode === 200, JSON.stringify(res2.body));
    check('within-capacity preview says overCapacity:false', res2.body?.data?.overCapacity === false, JSON.stringify(res2.body));

    // Wildly over-capacity preview (500 hrs in 1 day)
    const res3 = mkRes();
    await ctrl.previewAllocationCapacity({ params: { id: ticket.id }, body: { allocationTotalHours: 500, allocationFrom: '2026-11-10', allocationTo: '2026-11-10' } }, res3, e => { if (e) console.error('next err:', e.message); });
    check('over-capacity preview returns 200 (never blocks)', res3.statusCode === 200, JSON.stringify(res3.body));
    check('over-capacity preview says overCapacity:true', res3.body?.data?.overCapacity === true, JSON.stringify(res3.body));
    check('over-capacity preview carries a clear message', !!res3.body?.data?.message, JSON.stringify(res3.body));

    // Confirm NOTHING was written to the ticket itself by the preview (read-only)
    await ticket.reload();
    check('preview never writes to the ticket (still original 4 hrs)', Number(ticket.allocationTotalHours) === 4, ticket.allocationTotalHours);

  } finally {
    if (createdTicketId) await HdTicket.destroy({ where: { id: createdTicketId }, force: true });
    await PmSettings.update({ ticketAllocationAgreementEnabled: originalFlag }, { where: { id: 1 } });
    console.log('Restored flag to original value:', originalFlag);
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    await sequelize.close();
    process.exit(fail ? 1 : 0);
  }
})().catch(e => { console.error('FATAL', e.message, e.stack); process.exit(1); });
