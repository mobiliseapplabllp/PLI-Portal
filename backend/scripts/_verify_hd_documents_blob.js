const { sequelize } = require('../test/_helpers');
const { Op } = require('sequelize');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const User = require('../src/models/User');
const HdTicket = require('../src/models/helpdesk/HdTicket');
const HdDocument = require('../src/models/helpdesk/HdDocument');

let pass = 0, fail = 0;
const check = (l, ok, d = '') => { if (ok) { pass++; console.log('  OK  ' + l); } else { fail++; console.log('  FAIL ' + l + '  ' + d); } };

const UPLOAD_DIR = path.join(__dirname, '../uploads');

// Minimal multipart body builder — no external deps, matches what the real
// browser (via axios auto-detecting FormData) now sends since the
// Content-Type-override bug was removed.
function buildMultipart(fields, fileField) {
  const boundary = '----verifyboundary' + Date.now();
  const parts = [];
  for (const [k, v] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  }
  if (fileField) {
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${fileField.name}"; filename="${fileField.filename}"\r\nContent-Type: ${fileField.contentType}\r\n\r\n`
    ));
    parts.push(fileField.data);
    parts.push(Buffer.from('\r\n'));
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(parts), boundary };
}

function post(pathUrl, token, body, boundary) {
  const http = require('http');
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost', port: 5105, path: pathUrl, method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
    }, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function get(pathUrl, token) {
  const http = require('http');
  return new Promise((resolve, reject) => {
    http.get({ hostname: 'localhost', port: 5105, path: pathUrl, headers: { Authorization: 'Bearer ' + token } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks), headers: res.headers }));
    }).on('error', reject);
  });
}

(async () => {
  const createdTicketIds = [];
  const createdDocIds = [];
  const legacyFilePath = path.join(UPLOAD_DIR, '__test_legacy_doc.txt');
  let fatal = null;

  try {
    const admin = await User.findOne({ where: { role: 'admin', isActive: true } });
    if (!admin) throw new Error('Need an active admin user to test');
    const token = jwt.sign({ id: admin.id }, process.env.JWT_SECRET, { expiresIn: '1h' });

    const ticket = await HdTicket.create({
      reqNumber: `__TEST__-${Date.now()}`,
      title: '__TEST__ blob doc ticket', category: 'Hardware', priority: 'Medium',
      status: 'open', requesterId: admin.id, raisedByTeam: 'Operations',
    });
    createdTicketIds.push(ticket.id);

    // ═══ 1. New upload — should land in file_blob, NOT on disk ═══
    const { body, boundary } = buildMultipart(
      { category: 'Others' },
      { name: 'file', filename: 'blob-test.txt', contentType: 'text/plain', data: Buffer.from('hello from blob storage') }
    );
    const uploadRes = await post(`/api/helpdesk/tickets/${ticket.id}/documents`, token, body, boundary);
    check('upload returns 201', uploadRes.status === 201, uploadRes.body);
    const uploaded = JSON.parse(uploadRes.body).data;
    createdDocIds.push(uploaded.id);
    check('upload response does NOT leak fileBlob', uploaded.fileBlob === undefined);

    const dbRow = await HdDocument.findByPk(uploaded.id);
    check('new row has fileBlob populated in the database', Buffer.isBuffer(dbRow.fileBlob) && dbRow.fileBlob.length > 0);
    check('new row has storedName = NULL (nothing written to disk)', dbRow.storedName === null);

    // ═══ 2. List — must not leak the blob either ═══
    const listRes = await get(`/api/helpdesk/tickets/${ticket.id}/documents`, token);
    const listBody = JSON.parse(listRes.body.toString());
    check('list response does not include fileBlob on any row', listBody.data.every((d) => d.fileBlob === undefined));

    // ═══ 3. Download — new blob-stored doc serves correctly ═══
    const downloadRes = await get(`/api/helpdesk/tickets/${ticket.id}/documents/${uploaded.id}/download`, token);
    check('download returns 200', downloadRes.status === 200);
    check('downloaded bytes match what was uploaded', downloadRes.body.toString() === 'hello from blob storage');

    // ═══ 4. Legacy row (disk-stored, file_blob NULL) — must STILL work exactly as before ═══
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    fs.writeFileSync(legacyFilePath, 'legacy file on disk, untouched by the blob switch');
    const legacyDoc = await HdDocument.create({
      ticketId: ticket.id, category: 'Others', filename: 'legacy.txt',
      storedName: '__test_legacy_doc.txt', mimeType: 'text/plain', sizeBytes: 50, fileBlob: null,
    });
    createdDocIds.push(legacyDoc.id);

    const legacyDownload = await get(`/api/helpdesk/tickets/${ticket.id}/documents/${legacyDoc.id}/download`, token);
    check('legacy (disk-stored, pre-migration-061) document STILL downloads correctly', legacyDownload.status === 200);
    check('legacy download serves the REAL file from disk, unchanged', legacyDownload.body.toString() === 'legacy file on disk, untouched by the blob switch');

  } catch (e) {
    fatal = e;
  } finally {
    if (createdDocIds.length) await HdDocument.destroy({ where: { id: { [Op.in]: createdDocIds } }, force: true });
    if (createdTicketIds.length) await HdTicket.destroy({ where: { id: { [Op.in]: createdTicketIds } }, force: true });
    if (fs.existsSync(legacyFilePath)) fs.unlinkSync(legacyFilePath);

    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    if (fatal) console.error('FATAL (inside try):', fatal.message, '\n', fatal.stack);
    await sequelize.close();
    process.exit(fail || fatal ? 1 : 0);
  }
})().catch(e => { console.error('FATAL', e.message, e.stack); process.exit(1); });
