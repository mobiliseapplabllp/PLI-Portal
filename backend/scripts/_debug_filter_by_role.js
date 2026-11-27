require('dotenv').config();
const sequelize = require('../src/config/database');
const jwt = require('jsonwebtoken');
const http = require('http');
const User = require('../src/models/User');

function get(pathUrl, token) {
  return new Promise((resolve, reject) => {
    http.get({ hostname: 'localhost', port: 5105, path: pathUrl, headers: { Authorization: 'Bearer ' + token } }, (res) => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve({ status: res.statusCode, body: d }));
    }).on('error', reject);
  });
}

(async () => {
  const specificUsers = {
    admin: '0815da95-a95c-4250-9510-83177ab0a9dc',    // ASHISH SHARMA
    manager: '85464438-019f-4452-a0c7-79c0c057e2bb',  // KAMAL SHARMA — known to have tickets
    employee: '006f3741-d2fc-4cd3-a699-ab4ee05c5c12', // PRAKASH
  };
  for (const [role, id] of Object.entries(specificUsers)) {
    const u = await User.findByPk(id);
    if (!u) { console.log(`\n=== ${role}: user not found ===`); continue; }
    const token = jwt.sign({ id: u.id }, process.env.JWT_SECRET, { expiresIn: '1h' });

    console.log(`\n=== ${role} (${u.name}, id=${u.id}) ===`);

    const statusRes = await get('/api/helpdesk/tickets?status=open,in-progress&pageSize=100', token);
    const statusBody = JSON.parse(statusRes.body);
    const statusTickets = statusBody.data?.tickets || [];
    console.log(`  status=open,in-progress -> ${statusRes.status}, total=${statusBody.data?.total}, returned=${statusTickets.length}, statuses seen=${[...new Set(statusTickets.map(t=>t.status))]}`);

    const reqTypeRes = await get('/api/helpdesk/tickets?requestType=' + encodeURIComponent('Service Request') + '&pageSize=100', token);
    const reqTypeBody = JSON.parse(reqTypeRes.body);
    const reqTypeTickets = reqTypeBody.data?.tickets || [];
    console.log(`  requestType=Service Request -> ${reqTypeRes.status}, total=${reqTypeBody.data?.total}, returned=${reqTypeTickets.length}`);

    // Also show what request_type values THIS user can even see at all (no filter)
    const allRes = await get('/api/helpdesk/tickets?pageSize=200', token);
    const allBody = JSON.parse(allRes.body);
    const allTickets = allBody.data?.tickets || [];
    const rtCounts = {};
    allTickets.forEach(t => { const k = t.requestType || 'null'; rtCounts[k] = (rtCounts[k]||0)+1; });
    console.log(`  (no filter) total visible=${allBody.data?.total}, requestType breakdown=${JSON.stringify(rtCounts)}`);
  }
  await sequelize.close();
})();
