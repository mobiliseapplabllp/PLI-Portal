/**
 * Shared test helpers.
 *
 * Tests run against the DB named in backend/.env (the same DB every manual
 * verification used). Every test that writes must create its own rows with a
 * `__TEST__` prefix and remove them again — even when it fails. Never touch
 * rows you did not create.
 *
 * NOTE: `node --test` (Node 18) runs test FILES concurrently in child
 * processes. Files must therefore never depend on each other's state, and DB
 * tests must pick disjoint users (see pickFreeUser).
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// NEVER send real email from tests. emailService no-ops when SMTP_HOST is unset;
// the first suite run mailed four real employees before this guard existed.
delete process.env.SMTP_HOST;

// config/database exports the Sequelize INSTANCE — never destructure it.
const sequelize = require('../src/config/database');
require('../src/models/associations');
require('../src/models/helpdesk');

const { QueryTypes } = require('sequelize');
const { helpdeskAuth } = require('../src/middleware/helpdeskAuth');

const TEST_PREFIX = '__TEST__';
/** Escaped for MySQL LIKE — `_` is a single-char wildcard otherwise. */
const TEST_LIKE = '\_\_TEST\_\_%';

/** A recognisable, unique name for a temp row. */
const tag = (label) => `${TEST_PREFIX}${label} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const select = (sql, replacements = {}) => sequelize.query(sql, { type: QueryTypes.SELECT, replacements });

/** A real, active user of the given role (deterministic: lowest id). */
async function pickUser(role) {
  const [row] = await select(
    'SELECT id, name, email, role FROM users WHERE role = :role AND isActive = 1 ORDER BY id LIMIT 1',
    { role }
  );
  if (!row) throw new Error(`No active user with role '${role}' in the test DB`);
  return row;
}

/**
 * The n-th (0-based, ordered by id) active user of `role` who currently has NO
 * active project allocation and NO open ticket allocation. Concurrent test
 * files pass different `n` so they never share a user, whichever inserts first.
 */
async function pickFreeUser(n = 0, role = 'employee') {
  const [row] = await select(
    `SELECT u.id, u.name, u.email, u.role FROM users u
      WHERE u.role = :role AND u.isActive = 1
        AND u.id NOT IN (
          SELECT m.userId FROM pm_project_members m JOIN pm_projects p ON p.id = m.projectId
           WHERE p.status NOT IN ('completed','cancelled','closed'))
        AND u.id NOT IN (
          SELECT t.assignee_id FROM hd_tickets t
           WHERE t.assignee_id IS NOT NULL AND t.allocation_hours_per_day IS NOT NULL
             AND t.status NOT IN ('closed','resolved'))
      ORDER BY u.id LIMIT 1 OFFSET :n`,
    { role, n }
  );
  if (!row) throw new Error(`No free active user with role '${role}' (offset ${n}) in the test DB`);
  return row;
}

/** The shape services see after `authenticate` (renameIdsForClient: id → _id). */
const fakeUser = (row, role) => ({
  _id: row.id, id: row.id, role: role || row.role, name: row.name, email: row.email,
});

/** Exactly what middleware/helpdeskAuth.js attaches as req.hdUser. */
function fakeHdUser(row, role) {
  const req = { user: fakeUser(row, role) };
  let err;
  helpdeskAuth(req, {}, (e) => { err = e; });
  if (err) throw err;
  return req.hdUser;
}

/** Minimal Express response double — records status/json/send. */
function mockRes() {
  const res = {
    statusCode: 200, body: undefined, headers: {},
    status(code) { res.statusCode = code; return res; },
    json(payload) { res.body = payload; return res; },
    send(payload) { res.body = payload; return res; },
    setHeader(k, v) { res.headers[k] = v; return res; },
  };
  return res;
}

/** Fake `next` that remembers the error it was given. */
function mockNext() {
  const fn = (e) => { fn.error = e; fn.called = true; };
  fn.called = false; fn.error = undefined;
  return fn;
}

/**
 * LIFO cleanup registry. `add()` a function for every row you create, as soon
 * as you create it; `run()` in `finally` executes them newest-first and
 * reports the first failure after attempting all of them.
 */
function createCleanup() {
  const fns = [];
  return {
    add(fn) { fns.unshift(fn); },
    async run() {
      const errors = [];
      for (const fn of fns.splice(0)) {
        try { await fn(); } catch (e) { errors.push(e); }
      }
      if (errors.length) throw errors[0];
    },
  };
}

/** How many `__TEST__` rows exist in every table the suite writes to. */
async function countTestRows() {
  const [row] = await select(`SELECT
    (SELECT COUNT(*) FROM pm_projects            WHERE name       LIKE '${TEST_LIKE}') AS projects,
    (SELECT COUNT(*) FROM pm_project_members m JOIN pm_projects p ON p.id = m.projectId
                                                 WHERE p.name     LIKE '${TEST_LIKE}') AS members,
    (SELECT COUNT(*) FROM pm_milestones          WHERE name       LIKE '${TEST_LIKE}') AS milestones,
    (SELECT COUNT(*) FROM pm_milestone_date_logs WHERE reason     LIKE '${TEST_LIKE}') AS dateLogs,
    (SELECT COUNT(*) FROM hd_tickets             WHERE req_number LIKE '${TEST_LIKE}') AS tickets,
    (SELECT COUNT(*) FROM pm_holidays            WHERE name       LIKE '${TEST_LIKE}') AS holidays`);
  const counts = Object.fromEntries(Object.entries(row).map(([k, v]) => [k, Number(v)]));
  counts.total = Object.values(counts).reduce((s, n) => s + n, 0);
  return counts;
}

/** Close the pool so the child process exits promptly. Safe to call twice. */
async function closeDb() {
  try { await sequelize.close(); } catch (_) { /* already closed */ }
}

module.exports = {
  sequelize, select, TEST_PREFIX, TEST_LIKE, tag,
  pickUser, pickFreeUser, fakeUser, fakeHdUser, mockRes, mockNext,
  createCleanup, countTestRows, closeDb,
};
