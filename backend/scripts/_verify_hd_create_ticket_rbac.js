const { sequelize } = require('../test/_helpers');
const { Op } = require('sequelize');
const jwt = require('jsonwebtoken');
const User = require('../src/models/User');
const HdTicket = require('../src/models/helpdesk/HdTicket');

let pass = 0, fail = 0;
const check = (l, ok, d = '') => { if (ok) { pass++; console.log('  OK  ' + l); } else { fail++; console.log('  FAIL ' + l + '  ' + d); } };

function post(pathUrl, token, body) {
  const http = require('http');
  const data = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost', port: 5105, path: pathUrl, method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, (res) => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve({ status: res.statusCode, body: d })); });
    req.on('error', reject); req.write(data); req.end();
  });
}

(async () => {
  let fatal = null;
  const createdTicketIds = [];

  try {
    const employee = await User.findOne({ where: { role: 'employee', isActive: true, managerId: { [Op.ne]: null } } });
    if (!employee) throw new Error('Need an active employee with a manager to test');
    const empToken = jwt.sign({ id: employee.id }, process.env.JWT_SECRET, { expiresIn: '1h' });

    const candidates = await User.findAll({ where: { role: 'manager', isActive: true }, attributes: ['id', 'name'] });
    let manager = null, teammate = null;
    for (const m of candidates) {
      const rep = await User.findOne({ where: { managerId: m.id, isActive: true } });
      if (rep) { manager = m; teammate = rep; break; }
    }
    if (!manager) throw new Error('Need an active manager with at least one active direct report to test');
    const mgrToken = jwt.sign({ id: manager.id }, process.env.JWT_SECRET, { expiresIn: '1h' });

    // ═══ 1. Employee CAN create a ticket now, with no grant ═══
    const t1 = await post('/api/helpdesk/tickets', empToken, {
      title: '__TEST__ employee self-serve ticket', category: 'Hardware', priority: 'Medium', status: 'open', mode: 'E-Mail',
    });
    check('employee (no grant, no prior restriction bypass) can create a ticket (201)', t1.status === 201, t1.body);
    if (t1.status === 201) {
      const ticket1 = JSON.parse(t1.body).data;
      createdTicketIds.push(ticket1._id || ticket1.id);
    }

    // ═══ 2. Employee trying to set assigneeId directly is silently ignored ═══
    if (teammate) {
      const t2 = await post('/api/helpdesk/tickets', empToken, {
        title: '__TEST__ employee tries to self-assign a teammate', category: 'Hardware', priority: 'Medium', status: 'open', mode: 'E-Mail',
        teamManagerId: manager.id, assigneeId: teammate.id,
      });
      check('employee ticket with assigneeId in body still returns 201 (not rejected, just ignored)', t2.status === 201, t2.body);
      if (t2.status === 201) {
        const ticket2 = JSON.parse(t2.body).data;
        createdTicketIds.push(ticket2._id || ticket2.id);
        const row = await HdTicket.findByPk(ticket2._id || ticket2.id);
        check('the assigneeId the employee tried to set was NOT applied — ticket is unassigned', row.assigneeId === null);
        check('the teamManagerId the employee picked WAS applied', String(row.teamManagerId) === String(manager.id));
      }
    } else {
      check('(skipped — no teammate found under that manager to test with)', true);
    }

    // ═══ 3. A manager CAN still assign directly at creation, same as before ═══
    if (teammate) {
      const t3 = await post('/api/helpdesk/tickets', mgrToken, {
        title: '__TEST__ manager assigns directly', category: 'Hardware', priority: 'Medium', status: 'open', mode: 'E-Mail',
        teamManagerId: manager.id, assigneeId: teammate.id,
      });
      check('manager creating + directly assigning returns 201', t3.status === 201, t3.body);
      if (t3.status === 201) {
        const ticket3 = JSON.parse(t3.body).data;
        createdTicketIds.push(ticket3._id || ticket3.id);
        const row3 = await HdTicket.findByPk(ticket3._id || ticket3.id);
        check('manager\'s chosen assigneeId WAS applied', String(row3.assigneeId) === String(teammate.id));
      }
    }

  } catch (e) {
    fatal = e;
  } finally {
    if (createdTicketIds.length) await HdTicket.destroy({ where: { id: { [Op.in]: createdTicketIds } }, force: true }).catch(() => {});

    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    if (fatal) console.error('FATAL (inside try):', fatal.message, '\n', fatal.stack);
    await sequelize.close();
    process.exit(fail || fatal ? 1 : 0);
  }
})().catch(e => { console.error('FATAL', e.message, e.stack); process.exit(1); });
