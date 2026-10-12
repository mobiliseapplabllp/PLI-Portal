const { sequelize } = require('../test/_helpers');
const ctrl = require('../src/controllers/helpdesk/ticket.controller');
const HdTicket = require('../src/models/helpdesk/HdTicket');
const HdTicketAllocationProposal = require('../src/models/helpdesk/HdTicketAllocationProposal');
const PmSettings = require('../src/models/pm/PmSettings');
const { Op } = require('sequelize');

let pass = 0, fail = 0;
const check = (l, ok, d = '') => { if (ok) { pass++; console.log('  OK  ' + l); } else { fail++; console.log('  FAIL ' + l + '  ' + d); } };
const mkRes = () => ({ statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } });

(async () => {
  const [[manager]] = await sequelize.query("SELECT id, email FROM users WHERE managerId IS NULL LIMIT 1");
  const [[employee]] = await sequelize.query('SELECT id, email FROM users WHERE managerId = ? LIMIT 1', { replacements: [manager.id] });
  console.log('DEBUG manager=', manager.id, manager.email, ' employee=', employee?.id, employee?.email);
  const mgrUser = { id: manager.id, email: manager.email, isAdmin: false, scope: 'group', permissions: { canAssign: true, canManageTickets: true } };
  const empUser = { id: employee.id, email: employee.email, isAdmin: false, scope: 'own', permissions: { canAssign: false } };

  let createdTicketId = null;
  try {
    // ── REGRESSION: flag OFF — behaves exactly as before (immediate confirm) ──
    await PmSettings.update({ ticketAllocationAgreementEnabled: false }, { where: { id: 1 } });
    const title1 = '__TEST__ AllocAgreement OFF ' + Date.now();
    const res1 = mkRes();
    await ctrl.createTicket({ body: { title: title1, priority: 'High', assigneeId: employee.id, allocationTotalHours: 8, allocationFrom: '2026-10-10', allocationTo: '2026-10-10' }, hdUser: mgrUser }, res1, e => { if (e) console.error('next(err) create1:', e.message); });
    check('flag OFF: create succeeds', res1.statusCode === 201, res1.statusCode);
    const t1 = await HdTicket.findOne({ where: { title: title1 } });
    check('flag OFF: allocation written immediately', t1 && Number(t1.allocationTotalHours) === 8);
    check('flag OFF: agreement status = confirmed', t1 && t1.allocationAgreementStatus === 'confirmed', t1?.allocationAgreementStatus);
    if (t1) await t1.destroy({ force: true });

    // ── NEGOTIATION: flag ON ──
    await PmSettings.update({ ticketAllocationAgreementEnabled: true }, { where: { id: 1 } });
    const svc = require('../src/services/helpdesk/ticketAllocationAgreement.service');
    console.log('DEBUG isEnabled() =', await svc.isEnabled());
    const title2 = '__TEST__ AllocAgreement ON ' + Date.now();
    const res2 = mkRes();
    await ctrl.createTicket({ body: { title: title2, priority: 'High', assigneeId: employee.id, allocationTotalHours: 18, allocationFrom: '2026-10-07', allocationTo: '2026-10-09' }, hdUser: mgrUser }, res2, e => { if (e) console.error('next(err) create2:', e.message); });
    check('flag ON: create succeeds', res2.statusCode === 201, JSON.stringify(res2.body));
    const ticket = await HdTicket.findOne({ where: { title: title2 } });
    createdTicketId = ticket?.id;
    check('flag ON: allocation NOT written yet', ticket && ticket.allocationTotalHours === null, ticket?.allocationTotalHours);
    check('flag ON: status = pending_employee', ticket && ticket.allocationAgreementStatus === 'pending_employee', ticket?.allocationAgreementStatus);

    const proposals1 = await HdTicketAllocationProposal.findAll({ where: { ticketId: ticket.id } });
    check('one pending proposal created', proposals1.length === 1 && proposals1[0].status === 'pending');

    // Employee disagrees with a counter
    const res3 = mkRes();
    await ctrl.respondTicketAllocation({ params: { id: ticket.id }, body: { action: 'disagree', counter: { totalHours: 15, allocationFrom: '2026-10-07', allocationTo: '2026-10-11' } }, hdUser: empUser }, res3, e => { if (e) console.error('next(err) respond1:', e.message); });
    check('employee disagree+counter succeeds', res3.statusCode === 200, JSON.stringify(res3.body));
    await ticket.reload();
    check('status -> pending_manager', ticket.allocationAgreementStatus === 'pending_manager', ticket.allocationAgreementStatus);

    // Employee can't double-respond while it's the manager's turn
    const res3b = mkRes();
    await ctrl.respondTicketAllocation({ params: { id: ticket.id }, body: { action: 'agree' }, hdUser: empUser }, res3b, (err) => {
      if (err) res3b.status(err.statusCode || 500).json({ success: false, message: err.message });
    });
    check('employee cannot respond while pending_manager (403)', res3b.statusCode === 403, res3b.statusCode);

    // Manager accepts the employee's counter
    const res4 = mkRes();
    await ctrl.respondTicketAllocation({ params: { id: ticket.id }, body: { action: 'agree' }, hdUser: mgrUser }, res4, e => { if (e) console.error('next(err) respond2:', e.message); });
    check('manager agree succeeds', res4.statusCode === 200, JSON.stringify(res4.body));
    await ticket.reload();
    check('status -> confirmed', ticket.allocationAgreementStatus === 'confirmed', ticket.allocationAgreementStatus);
    check('real allocation now written (15 hrs)', Number(ticket.allocationTotalHours) === 15, ticket.allocationTotalHours);
    check('real allocation dates written', ticket.allocationFrom === '2026-10-07' && ticket.allocationTo === '2026-10-11');

    const history = await HdTicketAllocationProposal.findAll({ where: { ticketId: ticket.id }, order: [['id', 'ASC']] });
    check('full history has 2 rows (manager initial, employee counter)', history.length === 2, history.length);
    check('row1 (manager) rejected', history[0].status === 'rejected');
    check('row2 (employee counter) accepted', history[1].status === 'accepted');

  } finally {
    if (createdTicketId) await HdTicketAllocationProposal.destroy({ where: { ticketId: createdTicketId }, force: true });
    if (createdTicketId) await HdTicket.destroy({ where: { id: createdTicketId }, force: true });
    await HdTicket.destroy({ where: { title: { [Op.like]: '__TEST__%' } }, force: true });
    await PmSettings.update({ ticketAllocationAgreementEnabled: false }, { where: { id: 1 } });
    const leaked = await HdTicket.count({ where: { title: { [Op.like]: '__TEST__%' } } });
    console.log('Leak check — remaining __TEST__ tickets:', leaked);
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    await sequelize.close();
    process.exit(fail ? 1 : 0);
  }
})().catch(e => { console.error('FATAL', e.message, e.stack); process.exit(1); });
