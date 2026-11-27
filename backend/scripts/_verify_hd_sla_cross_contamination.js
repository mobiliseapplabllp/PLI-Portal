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
  // Snapshot original values so we always restore, regardless of pass/fail.
  const originalByPriority = {};

  try {
    const admin = await User.findOne({ where: { role: 'admin', isActive: true } });
    if (!admin) throw new Error('Need an active admin user to test');
    const token = jwt.sign({ id: admin.id }, process.env.JWT_SECRET, { expiresIn: '1h' });

    const before = await HdSlaPolicy.findAll({ order: [['id', 'ASC']] });
    check('exactly 4 policies exist to test cross-contamination with', before.length === 4, `found ${before.length}`);
    before.forEach(p => { originalByPriority[p.priority] = { resolutionHours: Number(p.resolutionHours), atRiskThresholdHours: Number(p.atRiskThresholdHours) }; });

    // ═══ 1. Update ONLY 'Critical' — every other priority's DB row must be byte-for-byte unchanged ═══
    const critical = before.find(p => p.priority === 'Critical');
    await req('PUT', `/api/helpdesk/sla-policies/${critical.id}`, token, { resolutionHours: 2, atRiskThresholdHours: 0.5 });

    const afterCriticalEdit = await HdSlaPolicy.findAll();
    for (const p of afterCriticalEdit) {
      if (p.priority === 'Critical') {
        check(`Critical itself WAS updated (resolutionHours=2)`, Number(p.resolutionHours) === 2);
      } else {
        const orig = originalByPriority[p.priority];
        check(`${p.priority} untouched after editing Critical (resolutionHours still ${orig.resolutionHours})`,
          Number(p.resolutionHours) === orig.resolutionHours && Number(p.atRiskThresholdHours) === orig.atRiskThresholdHours);
      }
    }

    // ═══ 2. Update ONLY 'Low' next — Critical's just-changed value must survive, others still untouched ═══
    const low = before.find(p => p.priority === 'Low');
    await req('PUT', `/api/helpdesk/sla-policies/${low.id}`, token, { resolutionHours: 72, atRiskThresholdHours: 12 });

    const afterLowEdit = await HdSlaPolicy.findAll();
    for (const p of afterLowEdit) {
      if (p.priority === 'Low') {
        check(`Low itself WAS updated (resolutionHours=72)`, Number(p.resolutionHours) === 72);
      } else if (p.priority === 'Critical') {
        check(`Critical's earlier edit SURVIVED a later edit to Low`, Number(p.resolutionHours) === 2 && Number(p.atRiskThresholdHours) === 0.5);
      } else {
        const orig = originalByPriority[p.priority];
        check(`${p.priority} still untouched after editing Low`,
          Number(p.resolutionHours) === orig.resolutionHours && Number(p.atRiskThresholdHours) === orig.atRiskThresholdHours);
      }
    }

    // ═══ 3. Real ticket data: each priority auto-computes its OWN due date, not a shared one ═══
    const high = before.find(p => p.priority === 'High');
    const medium = before.find(p => p.priority === 'Medium');
    const beforeCreate = Date.now();

    const ticketsByPriority = {};
    for (const [bodyPriority, policyRow] of [['critical', critical], ['high', high], ['medium', medium], ['low', low]]) {
      const res = await req('POST', '/api/helpdesk/tickets', token, {
        title: `__TEST__ sla cross-check ${bodyPriority}`, category: 'Hardware', priority: bodyPriority, status: 'open', mode: 'E-Mail',
      });
      const t = JSON.parse(res.body).data;
      createdTicketIds.push(t._id || t.id);
      ticketsByPriority[bodyPriority] = t;
    }

    // Re-fetch current (possibly edited above) hours for the expected-vs-actual check
    const freshPolicies = await HdSlaPolicy.findAll();
    const hoursFor = (name) => Number(freshPolicies.find(p => p.priority === name).resolutionHours);

    for (const [bodyPriority, policyName] of [['critical', 'Critical'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low']]) {
      const t = ticketsByPriority[bodyPriority];
      const expectedMs = beforeCreate + hoursFor(policyName) * 60 * 60 * 1000;
      const actualMs = new Date(t.dueDate).getTime();
      check(`${policyName} ticket's due date matches ONLY its own policy (${hoursFor(policyName)}h), not another priority's`,
        Math.abs(actualMs - expectedMs) < 60000, `diff=${actualMs - expectedMs}ms`);
    }

    // Cross-check: no two different-priority tickets should land on the same due date
    const allDue = Object.values(ticketsByPriority).map(t => new Date(t.dueDate).getTime());
    const distinctDue = new Set(allDue);
    check('all 4 tickets got DIFFERENT due dates (one per priority, not all sharing one value)', distinctDue.size === 4, `got ${distinctDue.size} distinct values`);

  } catch (e) {
    fatal = e;
  } finally {
    // Restore every policy to its original snapshot, regardless of outcome.
    for (const [priority, orig] of Object.entries(originalByPriority)) {
      await HdSlaPolicy.update(orig, { where: { priority } }).catch(() => {});
    }
    if (createdTicketIds.length) await HdTicket.destroy({ where: { id: { [Op.in]: createdTicketIds } }, force: true }).catch(() => {});

    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    if (fatal) console.error('FATAL (inside try):', fatal.message, '\n', fatal.stack);
    await sequelize.close();
    process.exit(fail || fatal ? 1 : 0);
  }
})().catch(e => { console.error('FATAL', e.message, e.stack); process.exit(1); });
