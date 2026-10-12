const { sequelize } = require('../test/_helpers');
const ctrl = require('../src/controllers/helpdesk/ticket.controller');
const HdTicket = require('../src/models/helpdesk/HdTicket');
const { Op } = require('sequelize');

let pass = 0, fail = 0;
const check = (l, ok, d = '') => { if (ok) { pass++; console.log('  OK  ' + l); } else { fail++; console.log('  FAIL ' + l + '  ' + d); } };
const mkRes = () => ({ statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } });

(async () => {
  const [[manager]] = await sequelize.query("SELECT id, email FROM users WHERE managerId IS NULL LIMIT 1");
  const [[proj]] = await sequelize.query("SELECT id FROM pm_projects LIMIT 1");
  const mgrUser = { id: manager.id, email: manager.email, isAdmin: false, scope: 'group', permissions: { canAssign: true, canManageTickets: true } };

  try {
    // Software + no project → blocked
    const title1 = '__TEST__ SoftwareNoProject ' + Date.now();
    const res1 = mkRes();
    await ctrl.createTicket({ body: { title: title1, category: 'Software', priority: 'High' }, hdUser: mgrUser }, res1, () => {});
    check('Software + no project -> blocked (400)', res1.statusCode === 400, res1.statusCode);
    check('Software + no project -> not created', !(await HdTicket.findOne({ where: { title: title1 } })));

    // Software + project -> succeeds
    const title2 = '__TEST__ SoftwareWithProject ' + Date.now();
    const res2 = mkRes();
    await ctrl.createTicket({ body: { title: title2, category: 'Software', priority: 'High', projectId: proj.id }, hdUser: mgrUser }, res2, e => { if (e) console.error('next err:', e.message); });
    check('Software + project -> succeeds (201)', res2.statusCode === 201, JSON.stringify(res2.body));

    // Non-Software (General) + no project -> still allowed (unchanged behavior)
    const title3 = '__TEST__ GeneralNoProject ' + Date.now();
    const res3 = mkRes();
    await ctrl.createTicket({ body: { title: title3, category: 'General', priority: 'Medium' }, hdUser: mgrUser }, res3, e => { if (e) console.error('next err:', e.message); });
    check('General + no project -> still succeeds (201)', res3.statusCode === 201, JSON.stringify(res3.body));

  } finally {
    await HdTicket.destroy({ where: { title: { [Op.like]: '__TEST__%' } }, force: true });
    const leaked = await HdTicket.count({ where: { title: { [Op.like]: '__TEST__%' } } });
    console.log('Leak check — remaining __TEST__ tickets:', leaked);
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    await sequelize.close();
    process.exit(fail ? 1 : 0);
  }
})().catch(e => { console.error('FATAL', e.message, e.stack); process.exit(1); });
