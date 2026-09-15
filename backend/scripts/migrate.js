#!/usr/bin/env node
/**
 * Migration runner for PLI-Portal backend.
 *
 * Tracks which standalone migration scripts have been run in a
 * `schema_migrations` table and runs pending ones in a stable global order.
 * Existing migration files are executed UNCHANGED as child processes.
 *
 *   node scripts/migrate.js status              list every migration, APPLIED / PENDING
 *   node scripts/migrate.js up                  run all PENDING, in order, stop on first failure
 *   node scripts/migrate.js up --only <frag>    run one pending file whose name contains <frag>
 *   node scripts/migrate.js baseline [--force]  mark all present files applied WITHOUT running
 *   node scripts/migrate.js verify              warn about recorded rows whose file is gone
 *
 * Migration folders (relative to backend/):
 *   migrations/         numbered 005…042 (with 021b, 033b, 036b …)
 *   src/migrations/     helpdesk 001…017b
 * Both are sorted together by leading numeric+letter prefix; on a tie the
 * src/migrations/ file runs first.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const BACKEND_DIR = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(BACKEND_DIR, '.env') });

// NOTE: config/database exports the Sequelize instance directly. Never
// destructure `{ sequelize }` from it.
const sequelize = require('../src/config/database');

const FOLDERS = ['src/migrations', 'migrations']; // tie-break order: src first
const TABLE = 'schema_migrations';

// ---------------------------------------------------------------- discovery

/**
 * Parse the leading prefix of a migration file name.
 *   "021b_foo.js"          -> { num: 21, suffix: 'b', digits: 3 }
 *   "20260824000000-foo.js" -> { num: 20260824000000, suffix: '', digits: 14 }
 * Returns null if the name does not start with a digit.
 */
function parsePrefix(fileName) {
  const m = /^(\d+)([a-z]*)(?=[_\-.])/i.exec(fileName);
  if (!m) return null;
  return { num: Number(m[1]), suffix: m[2].toLowerCase(), digits: m[1].length };
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function discover() {
  const migrations = [];
  const ignored = [];
  for (const folder of FOLDERS) {
    const abs = path.join(BACKEND_DIR, folder);
    if (!fs.existsSync(abs)) continue;
    for (const f of fs.readdirSync(abs).sort()) {
      const full = path.join(abs, f);
      if (!fs.statSync(full).isFile()) continue;
      const rel = `${folder}/${f}`;
      const prefix = parsePrefix(f);
      if (!f.endsWith('.js')) { ignored.push({ name: rel, reason: 'not a .js file' }); continue; }
      if (!prefix) { ignored.push({ name: rel, reason: 'does not start with a digit' }); continue; }
      migrations.push({
        name: rel,
        file: full,
        folder,
        folderRank: FOLDERS.indexOf(folder),
        prefix,
        timestampStyle: prefix.digits > 6,
      });
    }
  }
  migrations.sort((a, b) =>
    a.prefix.num - b.prefix.num ||
    a.prefix.suffix.localeCompare(b.prefix.suffix) ||
    a.folderRank - b.folderRank ||
    a.name.localeCompare(b.name)
  );
  return { migrations, ignored };
}

// ---------------------------------------------------------------- db

async function ensureTable() {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS \`${TABLE}\` (
      name        VARCHAR(255) NOT NULL PRIMARY KEY,
      applied_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      duration_ms INT          NULL,
      checksum    CHAR(64)     NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

async function loadApplied() {
  const [rows] = await sequelize.query(`SELECT name, applied_at, duration_ms, checksum FROM \`${TABLE}\``);
  const map = new Map();
  for (const r of rows) map.set(r.name, r);
  return map;
}

async function record(name, durationMs, checksum) {
  await sequelize.query(
    `INSERT INTO \`${TABLE}\` (name, duration_ms, checksum) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE applied_at = CURRENT_TIMESTAMP, duration_ms = VALUES(duration_ms), checksum = VALUES(checksum)`,
    { replacements: [name, durationMs, checksum] }
  );
}

// ---------------------------------------------------------------- helpers

function banner(cmd) {
  const host = process.env.MYSQL_HOST || '127.0.0.1';
  const port = process.env.MYSQL_PORT || 3306;
  const db = process.env.MYSQL_DATABASE || 'pli_portal';
  console.log('='.repeat(72));
  console.log(`migrate ${cmd}   target: ${db} @ ${host}:${port}   (user ${process.env.MYSQL_USER || 'root'})`);
  console.log('='.repeat(72));
}

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function annotate(migrations, applied) {
  return migrations.map((m) => {
    const row = applied.get(m.name);
    const checksum = sha256(m.file);
    const state = row ? 'APPLIED' : 'PENDING';
    let note = '';
    if (row && row.checksum && row.checksum !== checksum) note = 'CHANGED';
    if (m.timestampStyle) note += (note ? ', ' : '') + 'timestamp-style prefix (sorted last)';
    return { ...m, row, checksum, state, note };
  });
}

function fmtDate(d) {
  const x = new Date(d);
  const p = (n) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())} ${p(x.getHours())}:${p(x.getMinutes())}`;
}

// ---------------------------------------------------------------- commands

async function cmdStatus() {
  const { migrations, ignored } = discover();
  const applied = await loadApplied();
  const list = annotate(migrations, applied);

  console.log(`\nResolved order (${list.length} migration files):\n`);
  list.forEach((m, i) => {
    const idx = String(i + 1).padStart(3, ' ');
    const state = m.state.padEnd(7, ' ');
    const when = m.row ? `  ${fmtDate(m.row.applied_at)}` : '';
    const note = m.note ? `  [${m.note}]` : '';
    console.log(`${idx}. ${state} ${m.name}${when}${note}`);
  });

  const pending = list.filter((m) => m.state === 'PENDING').length;
  const changed = list.filter((m) => m.note.includes('CHANGED')).length;
  console.log(`\n${list.length - pending} APPLIED, ${pending} PENDING${changed ? `, ${changed} CHANGED` : ''}`);

  const missing = [...applied.keys()].filter((n) => !migrations.some((m) => m.name === n));
  if (missing.length) {
    console.log(`\nWARNING: ${missing.length} recorded in ${TABLE} but missing on disk:`);
    missing.forEach((n) => console.log(`  - ${n}`));
  }

  if (ignored.length) {
    console.log(`\nIgnored (${ignored.length}):`);
    ignored.forEach((x) => console.log(`  - ${x.name}  (${x.reason})`));
  }
  return 0;
}

function runChild(m) {
  console.log(`\n--- running ${m.name} ---`);
  const started = Date.now();
  const res = spawnSync(process.execPath, [m.file], {
    cwd: BACKEND_DIR,
    stdio: 'inherit',
    env: process.env,
  });
  const durationMs = Date.now() - started;
  const code = res.status === null ? (res.signal ? `signal ${res.signal}` : 'unknown') : res.status;
  return { durationMs, code, ok: res.status === 0 };
}

async function cmdUp() {
  const only = argValue('--only');
  const { migrations } = discover();
  const applied = await loadApplied();
  let pending = annotate(migrations, applied).filter((m) => m.state === 'PENDING');

  if (only) {
    pending = pending.filter((m) => m.name.includes(only));
    if (pending.length === 0) {
      console.log(`\nNo PENDING migration matches "${only}".`);
      return 0;
    }
    if (pending.length > 1) {
      console.error(`\n"--only ${only}" matches ${pending.length} pending files; be more specific:`);
      pending.forEach((m) => console.error(`  - ${m.name}`));
      return 1;
    }
  }

  if (pending.length === 0) {
    console.log('\nNothing to do: 0 PENDING.');
    return 0;
  }

  console.log(`\nPlan: ${pending.length} migration(s) will run in this order:`);
  pending.forEach((m, i) => console.log(`  ${i + 1}. ${m.name}`));

  for (const m of pending) {
    const { durationMs, code, ok } = runChild(m);
    if (!ok) {
      console.error(`\nFAILED: ${m.name} exited with code ${code} after ${durationMs} ms.`);
      console.error('Stopped. Nothing after this file was run; the failed file was NOT recorded.');
      return 1;
    }
    await record(m.name, durationMs, m.checksum);
    console.log(`--- recorded ${m.name} (${durationMs} ms) ---`);
  }

  console.log(`\nDone: ${pending.length} migration(s) applied.`);
  return 0;
}

async function cmdBaseline() {
  const { migrations } = discover();
  const applied = await loadApplied();
  if (applied.size > 0 && !hasFlag('--force')) {
    console.error(`\nRefusing: ${TABLE} already has ${applied.size} row(s). Re-run with --force to mark everything applied anyway.`);
    return 1;
  }
  let n = 0;
  for (const m of migrations) {
    await record(m.name, null, sha256(m.file));
    n++;
  }
  console.log(`\nBaseline complete: ${n} migration file(s) marked as applied (not run).`);
  return 0;
}

async function cmdVerify() {
  const { migrations } = discover();
  const applied = await loadApplied();
  const list = annotate(migrations, applied);
  const missing = [...applied.keys()].filter((n) => !migrations.some((m) => m.name === n));
  const changed = list.filter((m) => m.note.includes('CHANGED'));
  const pending = list.filter((m) => m.state === 'PENDING');

  console.log(`\n${list.length} files on disk, ${applied.size} rows in ${TABLE}, ${pending.length} PENDING.`);
  if (changed.length) {
    console.log(`\nNote: ${changed.length} applied file(s) changed on disk since recorded (informational):`);
    changed.forEach((m) => console.log(`  - ${m.name}`));
  }
  if (missing.length) {
    console.log(`\nWARNING: ${missing.length} recorded migration(s) no longer exist on disk:`);
    missing.forEach((n) => console.log(`  - ${n}`));
    return 1;
  }
  console.log('OK: every recorded migration exists on disk.');
  return 0;
}

// ---------------------------------------------------------------- main

const COMMANDS = { status: cmdStatus, up: cmdUp, baseline: cmdBaseline, verify: cmdVerify };

async function main() {
  const cmd = process.argv[2];
  if (!COMMANDS[cmd]) {
    console.error('Usage: node scripts/migrate.js <status | up [--only <frag>] | baseline [--force] | verify>');
    return 2;
  }
  banner(cmd);
  await sequelize.authenticate();
  await ensureTable();
  return COMMANDS[cmd]();
}

main()
  .then(async (code) => { await sequelize.close(); process.exit(code); })
  .catch(async (err) => {
    console.error('\nmigrate: fatal:', err.message);
    try { await sequelize.close(); } catch (_) { /* ignore */ }
    process.exit(1);
  });
