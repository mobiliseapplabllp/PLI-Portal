const { sequelize } = require('../test/_helpers');
const { Op } = require('sequelize');
const jwt = require('jsonwebtoken');
const User = require('../src/models/User');
const HdTicket = require('../src/models/helpdesk/HdTicket');
const HdSlaPolicy = require('../src/models/helpdesk/HdSlaPolicy');

let pass = 0, fail = 0;
const check = (l, ok, d = '') => { if (ok) { pass++; console.log('  OK  ' + l); } else { fail++; console.log('  FAIL ' + l + '  ' + d); } };

function req(method, pathUrl, token, body) {
  const http = require('http');
  const data = body ? JSON.stringify(body) : null;
  const headers = { Authorization: 'Bearer ' + token };
  if (data) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(data); }
  return new Promise((resolve, reject) => {
    const r = http.request({ hostname: 'localhost', port: 5105, path: pathUrl, method, headers },
      (res) => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve({ status: res.statusCode, body: d })); });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}

(async () => {
  const createdTicketIds = [];
  let fatal = null;

  try {
    const admin = await User.findOne({ where: { role: 'admin', isActive: true } });
    if (!admin) throw new Error('Need an active admin user to test');
    const adminToken = jwt.sign({ id: admin.id }, process.env.JWT_SECRET, { expiresIn: '1h' });

    // ═══ 1. GET is open to any authenticated user ═══
    const listRes = await req('GET', '/api/helpdesk/sla-policies', adminToken);
    check('GET /sla-policies returns 200', listRes.status === 200, listRes.body);
    const policies = JSON.parse(listRes.body).data;
    check('all 4 seeded priorities present', policies.length === 4);
    const highPolicy = policies.find(p => p.priority === 'High');
    check('High policy has the seeded 8-hour resolution window', Number(highPolicy.resolutionHours) === 8);

    // ═══ 2. Admin can update a policy ═══
    const updRes = await req('PUT', `/api/helpdesk/sla-policies/${highPolicy._id || highPolicy.id}`, adminToken, { resolutionHours: 6, atRiskThresholdHours: 1.5 });
    check('PUT updates the policy (200)', updRes.status === 200, updRes.body);
    const updated = JSON.parse(updRes.body).data;
    check('resolutionHours actually changed', Number(updated.resolutionHours) === 6);

    // ═══ 3. A ticket created with NO explicit dueDate auto-computes one from the policy ═══
    const beforeCreate = Date.now();
    const createRes = await req('POST', '/api/helpdesk/tickets', adminToken, {
      title: '__TEST__ sla auto due date', category: 'Hardware', priority: 'high', status: 'open', mode: 'E-Mail',
    });
    check('ticket create (no dueDate given) returns 201', createRes.status === 201, createRes.body);
    const ticket = JSON.parse(createRes.body).data;
    createdTicketIds.push(ticket._id || ticket.id);
    check('dueDate was auto-computed (not null)', !!ticket.dueDate);
    if (ticket.dueDate) {
      const expectedMs = beforeCreate + 6 * 60 * 60 * 1000;
      const actualMs = new Date(ticket.dueDate).getTime();
      check('auto-computed dueDate is ~6 hours out (matches the updated policy)', Math.abs(actualMs - expectedMs) < 60000, `diff=${actualMs - expectedMs}ms`);
    }

    // ═══ 4. An EXPLICIT dueDate always overrides the policy ═══
    const explicitDue = new Date(Date.now() + 999 * 60 * 60 * 1000).toISOString();
    const createRes2 = await req('POST', '/api/helpdesk/tickets', adminToken, {
      title: '__TEST__ sla explicit due date wins', category: 'Hardware', priority: 'high', status: 'open', mode: 'E-Mail', dueDate: explicitDue,
    });
    const ticket2 = JSON.parse(createRes2.body).data;
    createdTicketIds.push(ticket2._id || ticket2.id);
    check('explicit dueDate is respected exactly, policy does NOT override it', new Date(ticket2.dueDate).getTime() === new Date(explicitDue).getTime());

    // ═══ 5. Deactivating a policy stops auto-computing dueDate for that priority ═══
    await req('PUT', `/api/helpdesk/sla-policies/${highPolicy._id || highPolicy.id}`, adminToken, { isActive: false });
    const createRes3 = await req('POST', '/api/helpdesk/tickets', adminToken, {
      title: '__TEST__ sla inactive policy', category: 'Hardware', priority: 'high', status: 'open', mode: 'E-Mail',
    });
    const ticket3 = JSON.parse(createRes3.body).data;
    createdTicketIds.push(ticket3._id || ticket3.id);
    check('with the policy inactive, dueDate is left null (same as before this feature existed)', !ticket3.dueDate);

    // restore
    await req('PUT', `/api/helpdesk/sla-policies/${highPolicy._id || highPolicy.id}`, adminToken, { resolutionHours: 8, atRiskThresholdHours: 2, isActive: true });

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
