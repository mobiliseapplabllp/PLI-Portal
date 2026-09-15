/**
 * One error shape: every error body is
 *   { success:false, message, error:{ message, ...extra } }
 * PM pages read data.message; helpdesk/KPI thunks read data.error.message.
 * No DB writes.
 */
const H = require('./_helpers');   // first: loads .env, disables SMTP
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('fs');
const path = require('path');

const { sendError } = require('../src/utils/response');
const { errorHandler } = require('../src/middleware/errorHandler');
const { AppError, NotFoundError, AllocationConflictError } = require('../src/utils/errors');
const logger = require('../src/utils/logger');

after(() => H.closeDb());

const res = () => H.mockRes();

test('sendError emits message at both paths', () => {
  const r = res();
  sendError(r, 'Nope', 404);
  assert.equal(r.statusCode, 404);
  assert.deepEqual(r.body, { success: false, message: 'Nope', error: { message: 'Nope' } });
});

test('sendError keeps details and extra keys where readers expect them', () => {
  const r = res();
  const conflict = { overDays: 2, ranges: [], peak: 9, remaining: 0, capacity: 8 };
  sendError(r, 'Over capacity', 409, null, { conflict, error: { code: 'X', message: 'ignored' }, message: 'ignored', success: true });
  assert.deepEqual(r.body, {
    success: false, message: 'Over capacity', conflict,
    error: { message: 'Over capacity', code: 'X' },
  });

  const d = res();
  sendError(d, 'Bad', 400, [{ field: 'a', message: 'b' }]);
  assert.deepEqual(d.body, { success: false, message: 'Bad', error: { message: 'Bad', details: [{ field: 'a', message: 'b' }] } });
});

test('errorHandler: AppError / unhandled carry both message paths', () => {
  const origWarn = logger.warn, origErr = logger.error;
  logger.warn = () => {}; logger.error = () => {};
  try {
    const req = { method: 'GET', url: '/x' };
    const a = res();
    errorHandler(new NotFoundError('Thing'), req, a, () => {});
    assert.deepEqual(a.body, { success: false, message: 'Thing not found', error: { message: 'Thing not found' } });

    const c = res();
    errorHandler(new AppError('Teapot', 418), req, c, () => {});
    assert.equal(c.statusCode, 418);
    assert.equal(c.body.message, 'Teapot');
    assert.equal(c.body.error.message, 'Teapot');

    const u = res();
    errorHandler(new Error('boom'), req, u, () => {});
    assert.equal(u.statusCode, 500);
    assert.equal(u.body.success, false);
    assert.equal(typeof u.body.message, 'string');
    assert.equal(u.body.message, u.body.error.message);
  } finally { logger.warn = origWarn; logger.error = origErr; }
});

test('AllocationConflictError still exposes conflict for the 409 body', () => {
  const e = new AllocationConflictError({ message: 'Over', overDays: 1, ranges: [], peak: 10, remaining: 0 }, 8);
  const r = res();
  sendError(r, e.message, 409, null, { conflict: e.conflict });
  assert.equal(r.body.message, 'Over');
  assert.equal(r.body.error.message, 'Over');
  assert.deepEqual(r.body.conflict, e.conflict);
});

test('no hand-written error bodies remain in PM / helpdesk / time-entry controllers and routes', () => {
  const root = path.join(__dirname, '..', 'src');
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(d =>
    d.isDirectory() ? walk(path.join(dir, d.name)) : d.name.endsWith('.js') ? [path.join(dir, d.name)] : []);
  const files = [
    ...walk(path.join(root, 'controllers', 'pm')),
    ...walk(path.join(root, 'controllers', 'helpdesk')),
    path.join(root, 'controllers', 'timeEntry.controller.js'),
    ...walk(path.join(root, 'routes', 'pm')),
    ...walk(path.join(root, 'routes', 'helpdesk')),
    path.join(root, 'routes', 'timeEntries.routes.js'),
  ];
  const offenders = [];
  for (const f of files) {
    fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      // any res.status(<non-2xx>).json(...) or success:false literal written by hand
      if (/status\((?![23]\d\d\))[^)]*\)\s*\.json\(/.test(line) || /success:\s*false/.test(line.replace(/^\s*(\*|\/\/).*/, ''))) {
        offenders.push(`${path.relative(root, f)}:${i + 1}: ${line.trim()}`);
      }
    });
  }
  assert.deepEqual(offenders, []);
});
