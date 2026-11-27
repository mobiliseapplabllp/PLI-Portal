const { sequelize } = require('../test/_helpers');
const { Op } = require('sequelize');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const User = require('../src/models/User');
const HdTicket = require('../src/models/helpdesk/HdTicket');
const HdDocument = require('../src/models/helpdesk/HdDocument');
const HdAttachment = require('../src/models/helpdesk/HdAttachment');

let pass = 0, fail = 0;
const check = (l, ok, d = '') => { if (ok) { pass++; console.log('  OK  ' + l); } else { fail++; console.log('  FAIL ' + l + '  ' + d); } };

const UPLOAD_DIR = path.join(__dirname, '../uploads');

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
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': body.length },
    }, (res) => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve({ status: res.statusCode, body: d })); });
    req.on('error', reject); req.write(body); req.end();
  });
}

function get(pathUrl, token) {
  const http = require('http');
  return new Promise((resolve, reject) => {
    http.get({ hostname: 'localhost', port: 5105, path: pathUrl, headers: { Authorization: 'Bearer ' + token } }, (res) => {
      const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks), headers: res.headers }));
    }).on('error', reject);
  });
}

function del(pathUrl, token) {
  const http = require('http');
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: 'localhost', port: 5105, path: pathUrl, method: 'DELETE', headers: { Authorization: 'Bearer ' + token } },
      (res) => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve({ status: res.statusCode, body: d })); });
    req.on('error', reject); req.end();
  });
}

(async () => {
  const createdTicketIds = [];
  const createdAttachmentIds = [];
  const legacyFilePath = path.join(UPLOAD_DIR, '__test_legacy_attachment.txt');
  let fatal = null;

  try {
    const admin = await User.findOne({ where: { role: 'admin', isActive: true } });
    if (!admin) throw new Error('Need an active admin user to test');
    const token = jwt.sign({ id: admin.id }, process.env.JWT_SECRET, { expiresIn: '1h' });

    const ticket = await HdTicket.create({
      reqNumber: `__TEST__-${Date.now()}`, title: '__TEST__ attachment blob ticket',
      category: 'Hardware', priority: 'Medium', status: 'open', requesterId: admin.id, raisedByTeam: 'Operations',
    });
    createdTicketIds.push(ticket.id);

    // ═══ 1. Conversation reply with a new file — blob-stored, not disk ═══
    const { body, boundary } = buildMultipart(
      { message: '__TEST__ reply with attachment' },
      { name: 'file', filename: 'reply-attachment.txt', contentType: 'text/plain', data: Buffer.from('hello from conversation attachment blob') }
    );
    const convRes = await post(`/api/helpdesk/tickets/${ticket.id}/conversations`, token, body, boundary);
    check('conversation reply with attachment returns 201', convRes.status === 201, convRes.body);

    const listConvRes = await get(`/api/helpdesk/tickets/${ticket.id}/conversations`, token);
    const convList = JSON.parse(listConvRes.body.toString());
    const conv = convList.data.find(c => c.message === '__TEST__ reply with attachment');
    check('conversation list does not leak fileBlob on nested files', conv.files.every(f => f.fileBlob === undefined));
    const file = conv.files[0];
    const fileId = file._id || file.id;
    createdAttachmentIds.push(fileId);
    check('new conversation attachment row has no storedName (blob-stored)', file.storedName === null || file.storedName === undefined);

    const dlRes = await get(`/api/helpdesk/attachments/${fileId}/download`, token);
    check('download by id (blob-stored) returns 200', dlRes.status === 200, dlRes.body.toString());
    check('downloaded bytes match what was uploaded', dlRes.body.toString() === 'hello from conversation attachment blob');

    // ═══ 2. Legacy conversation attachment (disk-stored, fileBlob NULL) still works ═══
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    fs.writeFileSync(legacyFilePath, 'legacy attachment on disk, untouched by the blob switch');
    const legacyAtt = await HdAttachment.create({
      ticketId: ticket.id, conversationId: conv._id || conv.id, uploadedBy: admin.id,
      filename: 'legacy.txt', storedName: '__test_legacy_attachment.txt', mimeType: 'text/plain', sizeBytes: 50, fileBlob: null,
    });
    createdAttachmentIds.push(legacyAtt.id);
    const legacyDl = await get(`/api/helpdesk/attachments/${legacyAtt.id}/download`, token);
    check('legacy (disk-stored) attachment STILL downloads correctly via id route', legacyDl.status === 200);
    check('legacy download serves the REAL file from disk, unchanged', legacyDl.body.toString() === 'legacy attachment on disk, untouched by the blob switch');

    // ═══ 3. Legacy ticket-level attachment (pre-dating the Documents merge) shows in Documents list ═══
    const ticketLevelLegacy = await HdAttachment.create({
      ticketId: ticket.id, conversationId: null, uploadedBy: admin.id,
      filename: 'old-create-ticket-attachment.pdf', storedName: null, mimeType: 'application/pdf', sizeBytes: 100, fileBlob: Buffer.from('old attachment blob content'),
    });
    createdAttachmentIds.push(ticketLevelLegacy.id);

    const docsRes = await get(`/api/helpdesk/tickets/${ticket.id}/documents`, token);
    const docsBody = JSON.parse(docsRes.body.toString());
    const merged = docsBody.data.find(d => d.filename === 'old-create-ticket-attachment.pdf');
    check('legacy ticket-level attachment appears in the merged Documents list', !!merged);
    check('merged item is tagged source=attachment', merged?.source === 'attachment');
    check('merged item has category "Initial Request Attachment"', merged?.category === 'Initial Request Attachment');
    check('merged Documents list does not leak fileBlob', docsBody.data.every(d => d.fileBlob === undefined));

    const mergedDl = await get(`/api/helpdesk/attachments/${merged.id}/download`, token);
    check('merged legacy attachment downloads correctly (blob-stored)', mergedDl.status === 200 && mergedDl.body.toString() === 'old attachment blob content');

    // ═══ 4. Delete a blob-stored attachment ═══
    const delRes = await del(`/api/helpdesk/attachments/${fileId}`, token);
    check('delete blob-stored attachment returns success', delRes.status === 200, delRes.body);
    createdAttachmentIds.splice(createdAttachmentIds.indexOf(fileId), 1);

  } catch (e) {
    fatal = e;
  } finally {
    if (createdAttachmentIds.length) await HdAttachment.destroy({ where: { id: { [Op.in]: createdAttachmentIds } }, force: true }).catch(() => {});
    if (createdTicketIds.length) await HdDocument.destroy({ where: { ticketId: { [Op.in]: createdTicketIds } }, force: true }).catch(() => {});
    if (createdTicketIds.length) await HdTicket.destroy({ where: { id: { [Op.in]: createdTicketIds } }, force: true }).catch(() => {});
    if (fs.existsSync(legacyFilePath)) fs.unlinkSync(legacyFilePath);

    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    if (fatal) console.error('FATAL (inside try):', fatal.message, '\n', fatal.stack);
    await sequelize.close();
    process.exit(fail || fatal ? 1 : 0);
  }
})().catch(e => { console.error('FATAL', e.message, e.stack); process.exit(1); });
