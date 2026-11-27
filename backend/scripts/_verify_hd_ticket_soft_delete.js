const { sequelize } = require('../test/_helpers');
const { Op } = require('sequelize');
const jwt = require('jsonwebtoken');
const User = require('../src/models/User');
const HdTicket = require('../src/models/helpdesk/HdTicket');
const HdConversation = require('../src/models/helpdesk/HdConversation');

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
  let fatal = null;
  let ticketId = null;

  try {
    const admin = await User.findOne({ where: { role: 'admin', isActive: true } });
    if (!admin) throw new Error('Need an active admin user to test');
    const adminToken = jwt.sign({ id: admin.id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const employee = await User.findOne({ where: { role: 'employee', isActive: true } });
    const empToken = jwt.sign({ id: employee.id }, process.env.JWT_SECRET, { expiresIn: '1h' });

    // Create a ticket with a conversation reply, to prove children survive deletion.
    const createRes = await req('POST', '/api/helpdesk/tickets', adminToken, {
      title: '__TEST__ soft delete ticket', category: 'Hardware', priority: 'Medium', status: 'open', mode: 'E-Mail',
    });
    const ticket = JSON.parse(createRes.body).data;
    ticketId = ticket._id || ticket.id;
    await req('POST', `/api/helpdesk/tickets/${ticketId}/conversations`, adminToken, { message: '__TEST__ reply before delete' });

    // ═══ 1. Employee cannot delete ═══
    const empDelRes = await req('DELETE', `/api/helpdesk/tickets/${ticketId}`, empToken);
    check('non-admin cannot delete a ticket (403)', empDelRes.status === 403, empDelRes.body);

    // ═══ 2. Admin deletes — the row still physically exists in the DB (soft) ═══
    const delRes = await req('DELETE', `/api/helpdesk/tickets/${ticketId}`, adminToken);
    check('admin delete returns 200', delRes.status === 200, delRes.body);

    const rawRow = await HdTicket.findByPk(ticketId, { paranoid: false });
    check('the row still physically exists in the database after "delete"', !!rawRow);
    check('deletedAt is now set', !!rawRow.deleted_at);

    // ═══ 3. It disappears from every normal query ═══
    const normalFind = await HdTicket.findByPk(ticketId);
    check('a normal findByPk (paranoid default) no longer finds it', normalFind === null);

    const listRes = await req('GET', '/api/helpdesk/tickets?pageSize=200', adminToken);
    const listBody = JSON.parse(listRes.body);
    const foundInList = (listBody.data?.tickets || []).some(t => String(t._id || t.id) === String(ticketId));
    check('it does not appear in the normal ticket list', !foundInList);

    // ═══ 4. Its conversation reply survived — CASCADE never fired ═══
    const convCount = await HdConversation.count({ where: { ticketId } });
    check('its conversation reply SURVIVED the delete (no real CASCADE fired)', convCount === 1);

    // ═══ 5. Dashboard stats exclude it ═══
    const statsRes = await req('GET', '/api/helpdesk/dashboard/stats', adminToken);
    check('dashboard stats endpoint still responds 200 after a soft-deleted ticket exists', statsRes.status === 200, statsRes.body);
    const modeStatsRes = await req('GET', '/api/helpdesk/dashboard/mode-stats', adminToken);
    check('mode-stats (raw SQL) responds 200', modeStatsRes.status === 200, modeStatsRes.body);

    // ═══ 6. It appears in the deleted-tickets list ═══
    const deletedListRes = await req('GET', '/api/helpdesk/tickets/deleted', adminToken);
    check('GET /tickets/deleted returns 200', deletedListRes.status === 200, deletedListRes.body);
    const deletedBody = JSON.parse(deletedListRes.body);
    const foundInDeleted = (deletedBody.data?.tickets || []).some(t => String(t._id || t.id) === String(ticketId));
    check('the deleted ticket appears in the deleted-tickets list', foundInDeleted);

    // ═══ 7. Employee cannot restore ═══
    const empRestoreRes = await req('POST', `/api/helpdesk/tickets/${ticketId}/restore`, empToken);
    check('non-admin cannot restore a ticket (403)', empRestoreRes.status === 403, empRestoreRes.body);

    // ═══ 8. Admin restores — ticket reappears in normal queries, everything intact ═══
    const restoreRes = await req('POST', `/api/helpdesk/tickets/${ticketId}/restore`, adminToken);
    check('admin restore returns 200', restoreRes.status === 200, restoreRes.body);

    const restoredFind = await HdTicket.findByPk(ticketId);
    check('a normal findByPk now finds it again after restore', !!restoredFind);
    check('deletedAt is cleared after restore', restoredFind.deleted_at === null);

    const listRes2 = await req('GET', '/api/helpdesk/tickets?pageSize=200', adminToken);
    const listBody2 = JSON.parse(listRes2.body);
    const foundInListAfterRestore = (listBody2.data?.tickets || []).some(t => String(t._id || t.id) === String(ticketId));
    check('it reappears in the normal ticket list after restore', foundInListAfterRestore);

    const convCountAfter = await HdConversation.count({ where: { ticketId } });
    check('its conversation reply is still there after restore', convCountAfter === 1);

    // ═══ 9. Restoring an already-active ticket is rejected cleanly ═══
    const doubleRestoreRes = await req('POST', `/api/helpdesk/tickets/${ticketId}/restore`, adminToken);
    check('restoring a non-deleted ticket is rejected (400)', doubleRestoreRes.status === 400, doubleRestoreRes.body);

  } catch (e) {
    fatal = e;
  } finally {
    // Final cleanup — hard-remove the test ticket for real (bypassing paranoid).
    if (ticketId) {
      await HdConversation.destroy({ where: { ticketId }, force: true }).catch(() => {});
      await HdTicket.destroy({ where: { id: ticketId }, force: true, paranoid: false }).catch(() => {});
    }
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    if (fatal) console.error('FATAL (inside try):', fatal.message, '\n', fatal.stack);
    await sequelize.close();
    process.exit(fail || fatal ? 1 : 0);
  }
})().catch(e => { console.error('FATAL', e.message, e.stack); process.exit(1); });
