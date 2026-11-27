const { sequelize } = require('../test/_helpers');
const { Op } = require('sequelize');
const jwt = require('jsonwebtoken');
const User = require('../src/models/User');
const HdTicket = require('../src/models/helpdesk/HdTicket');
const HdConversation = require('../src/models/helpdesk/HdConversation');
const HdTicketHistory = require('../src/models/helpdesk/HdTicketHistory');

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
  const createdConvIds = [];
  let fatal = null;

  try {
    const admin = await User.findOne({ where: { role: 'admin', isActive: true } });
    if (!admin) throw new Error('Need an active admin user to test');
    const employee = await User.findOne({ where: { role: 'employee', isActive: true } });
    if (!employee) throw new Error('Need an active employee to test');
    const adminToken = jwt.sign({ id: admin.id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const empToken = jwt.sign({ id: employee.id }, process.env.JWT_SECRET, { expiresIn: '1h' });

    const ticket = await HdTicket.create({
      reqNumber: `__TEST__-${Date.now()}`, title: '__TEST__ edit conversation ticket',
      category: 'Hardware', priority: 'Medium', status: 'open', requesterId: employee.id, raisedByTeam: 'Operations',
    });
    createdTicketIds.push(ticket.id);

    // Employee posts a reply
    const postRes = await req('POST', `/api/helpdesk/tickets/${ticket.id}/conversations`, empToken, { message: 'original message' });
    check('reply posted (201)', postRes.status === 201, postRes.body);
    const conv = JSON.parse(postRes.body).data;
    const convId = conv._id || conv.id;
    createdConvIds.push(convId);

    // ═══ 1. A DIFFERENT user cannot edit someone else's reply ═══
    const otherEmp = await User.findOne({ where: { role: 'employee', isActive: true, id: { [Op.ne]: employee.id } } });
    if (otherEmp) {
      const otherToken = jwt.sign({ id: otherEmp.id }, process.env.JWT_SECRET, { expiresIn: '1h' });
      const forbiddenRes = await req('PUT', `/api/helpdesk/tickets/conversations/${convId}`, otherToken, { message: 'hijacked' });
      check('a different user cannot edit someone else\'s reply (403)', forbiddenRes.status === 403, forbiddenRes.body);
    } else {
      check('(skipped — only one employee user exists to test ownership with)', true);
    }

    // ═══ 2. Author CAN edit their own reply while the ticket is open ═══
    const editRes = await req('PUT', `/api/helpdesk/tickets/conversations/${convId}`, empToken, { message: 'edited message' });
    check('author editing their own reply returns 200', editRes.status === 200, editRes.body);

    const afterEdit = await HdConversation.findByPk(convId);
    check('message was actually updated in the DB', afterEdit.message === 'edited message');

    // ═══ 3. The edit is logged to hd_ticket_history (old -> new, append-only audit) ═══
    const historyRows = await HdTicketHistory.findAll({ where: { ticketId: ticket.id, field: 'conversation_message' } });
    check('exactly one history row was created for this edit', historyRows.length === 1, `found ${historyRows.length}`);
    if (historyRows.length) {
      check('history row records the OLD message', historyRows[0].oldValue === 'original message');
      check('history row records the NEW message', historyRows[0].newValue === 'edited message');
      check('history row records WHO edited it', String(historyRows[0].changedBy) === String(employee.id));
    }

    // ═══ 4. Admin CAN also edit (override), same as the original design ═══
    const adminEditRes = await req('PUT', `/api/helpdesk/tickets/conversations/${convId}`, adminToken, { message: 'admin override' });
    check('admin can edit any reply (200)', adminEditRes.status === 200, adminEditRes.body);

    // ═══ 5. Editing is blocked once the ticket is closed ═══
    await ticket.update({ status: 'closed' });
    const closedEditRes = await req('PUT', `/api/helpdesk/tickets/conversations/${convId}`, empToken, { message: 'too late' });
    check('editing a reply on a CLOSED ticket is blocked (409)', closedEditRes.status === 409, closedEditRes.body);

    const afterClosedAttempt = await HdConversation.findByPk(convId);
    check('message unchanged after the blocked attempt', afterClosedAttempt.message === 'admin override');

  } catch (e) {
    fatal = e;
  } finally {
    if (createdTicketIds.length) {
      await HdTicketHistory.destroy({ where: { ticketId: { [Op.in]: createdTicketIds } }, force: true }).catch(() => {});
      await HdConversation.destroy({ where: { ticketId: { [Op.in]: createdTicketIds } }, force: true }).catch(() => {});
      await HdTicket.destroy({ where: { id: { [Op.in]: createdTicketIds } }, force: true }).catch(() => {});
    }
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    if (fatal) console.error('FATAL (inside try):', fatal.message, '\n', fatal.stack);
    await sequelize.close();
    process.exit(fail || fatal ? 1 : 0);
  }
})().catch(e => { console.error('FATAL', e.message, e.stack); process.exit(1); });
