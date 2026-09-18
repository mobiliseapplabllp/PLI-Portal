'use strict';

/**
 * Shared test helpers (node:test). Require this FIRST in every test file.
 *
 * - Loads backend/.env (the SHARED UAT DB with real users) and immediately
 *   removes SMTP_HOST so no test can ever send mail.
 * - Exposes the Sequelize INSTANCE (config/database exports it directly —
 *   never `const { sequelize } = require(...)`).
 * - Loads all associations (KPI/PM + helpdesk) exactly once.
 *
 * Rules for tests: never modify real users; any row a test creates uses the
 * `__TEST__` prefix and is removed via createCleanup() in a finally block.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
delete process.env.SMTP_HOST;          // tests must never send email
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const sequelize = require('../src/config/database');
require('../src/models/associations');   // KPI / PM / CSAT associations
const hd = require('../src/models/helpdesk'); // helpdesk associations (+ teamManager / pmProject)
const User = require('../src/models/User');

/** Prefix every test-created row with this so stray rows are recognisable. */
const TEST_PREFIX = '__TEST__';

/**
 * Pick a real ACTIVE user by role (read-only). Returns a plain object without passwordHash.
 * @param {string} role
 * @param {{ where?: object }} [opts] extra where clauses
 * @returns {Promise<object|null>}
 */
async function pickUser(role, { where = {} } = {}) {
  return User.findOne({
    attributes: { exclude: ['passwordHash'] },
    where: { role, isActive: true, ...where },
    order: [['name', 'ASC']],
    raw: true,
  });
}

/**
 * Minimal Express-like response double.
 * Captures statusCode + json body; `status()` and `json()` are chainable.
 */
function mockRes() {
  const res = {
    statusCode: 200,
    body: undefined,
    headers: {},
    status(code) { res.statusCode = code; return res; },
    json(body)   { res.body = body; return res; },
    send(body)   { res.body = body; return res; },
    set(k, v)    { res.headers[k] = v; return res; },
    setHeader(k, v) { res.headers[k] = v; return res; },
  };
  return res;
}

/**
 * `next` double that records the error (if any) it was called with.
 * @returns {{ (err?: any): void, called: boolean, error: any }}
 */
function mockNext() {
  const next = (err) => { next.called = true; next.error = err; };
  next.called = false;
  next.error  = undefined;
  return next;
}

/**
 * Collects async cleanup callbacks; run() executes them in reverse order
 * and never throws (each failure is logged so the rest still run).
 *
 * @example
 *   const cleanup = createCleanup();
 *   try {
 *     const t = await HdTicket.create({...});
 *     cleanup.add(() => t.destroy());
 *   } finally { await cleanup.run(); }
 */
function createCleanup() {
  const fns = [];
  return {
    add(fn) { fns.push(fn); },
    async run() {
      while (fns.length) {
        const fn = fns.pop();
        try { await fn(); } catch (e) { console.error('[cleanup] failed:', e.message); }
      }
    },
  };
}

/** Close the DB pool so node:test can exit. */
async function closeDb() {
  try { await sequelize.close(); } catch { /* already closed */ }
}

module.exports = {
  sequelize,
  models: { ...hd, User },
  TEST_PREFIX,
  pickUser,
  mockRes,
  mockNext,
  createCleanup,
  closeDb,
};
