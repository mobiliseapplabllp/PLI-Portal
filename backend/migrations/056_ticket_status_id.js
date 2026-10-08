/**
 * Migration 056 — hd_tickets.statusId (real FK) + hd_options.built_in_key.
 *
 * Migration 055 made Status admin-configurable (VARCHAR + hd_options), but left
 * two gaps:
 *   1. Tickets referenced status by NAME (string) only — renaming a status
 *      option wouldn't automatically follow through to existing tickets, the
 *      exact "orphaned by rename" bug this session already fixed twice for
 *      project types and milestone templates.
 *   2. ~20 places in code compare ticket.status against hardcoded literal
 *      strings ('resolved', 'closed', ...) for real behavior — SLA/aging
 *      counts, the closedAt auto-stamp, the approval flow. A rename would
 *      silently break all of it, since those checks never look at hd_options.
 *
 * This migration adds the FK for (1), and a stable `built_in_key` on
 * hd_options — seeded once to the CURRENT name of each of the 6 foundational
 * statuses — so code can resolve "the id currently mapped to the built-in
 * 'resolved' slot" instead of hardcoding a string that might get renamed.
 * `name` (the admin-editable display label) can change freely from now on;
 * `built_in_key` never does.
 *
 * Idempotent: safe to re-run.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const sequelize = require('../src/config/database');

// key -> the CURRENT display name (as of migration 055) it's seeded from.
const BUILT_IN_KEYS = {
  open:          'open',
  'in-progress': 'in-progress',
  pending:       'pending',
  'on-hold':     'on-hold',
  resolved:      'resolved',
  closed:        'closed',
};

async function columnExists(table, column) {
  const [rows] = await sequelize.query(`
    SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
  `, { replacements: [table, column] });
  return rows[0].cnt > 0;
}

async function indexExists(table, name) {
  const [rows] = await sequelize.query(`
    SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?
  `, { replacements: [table, name] });
  return rows[0].cnt > 0;
}

async function constraintExists(table, name) {
  const [rows] = await sequelize.query(`
    SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?
  `, { replacements: [table, name] });
  return rows[0].cnt > 0;
}

async function run() {
  console.log('=== Migration 056: hd_tickets.statusId FK + hd_options.built_in_key ===\n');

  // 1) hd_options.built_in_key
  if (!(await columnExists('hd_options', 'built_in_key'))) {
    await sequelize.query(`ALTER TABLE hd_options ADD COLUMN built_in_key VARCHAR(50) NULL`);
    console.log('Added hd_options.built_in_key');
  } else {
    console.log('hd_options.built_in_key already exists — skipping');
  }

  for (const [key, currentName] of Object.entries(BUILT_IN_KEYS)) {
    const [, meta] = await sequelize.query(
      `UPDATE hd_options SET built_in_key = ? WHERE type = 'status' AND name = ? AND (built_in_key IS NULL OR built_in_key <> ?)`,
      { replacements: [key, currentName, key] }
    );
    if (meta.affectedRows > 0) console.log(`Set built_in_key='${key}' on status option "${currentName}"`);
  }
  const [[{ keyedCount }]] = await sequelize.query(`SELECT COUNT(*) AS keyedCount FROM hd_options WHERE type='status' AND built_in_key IS NOT NULL`);
  console.log(`Status options with a built_in_key: ${keyedCount} (expect 6)`);

  // 2) hd_tickets.statusId
  if (!(await columnExists('hd_tickets', 'status_id'))) {
    await sequelize.query(`ALTER TABLE hd_tickets ADD COLUMN status_id INT NULL`);
    console.log('Added hd_tickets.status_id');
  } else {
    console.log('hd_tickets.status_id already exists — skipping');
  }

  if (!(await indexExists('hd_tickets', 'idx_hd_tickets_status_id'))) {
    await sequelize.query(`CREATE INDEX idx_hd_tickets_status_id ON hd_tickets (status_id)`);
    console.log('Added index idx_hd_tickets_status_id');
  } else {
    console.log('Index idx_hd_tickets_status_id already exists — skipping');
  }

  if (!(await constraintExists('hd_tickets', 'fk_hd_tickets_status'))) {
    await sequelize.query(`
      ALTER TABLE hd_tickets
      ADD CONSTRAINT fk_hd_tickets_status
      FOREIGN KEY (status_id) REFERENCES hd_options(id)
      ON DELETE RESTRICT ON UPDATE CASCADE
    `);
    console.log('Added FK fk_hd_tickets_status');
  } else {
    console.log('FK fk_hd_tickets_status already exists — skipping');
  }

  // 3) Backfill every ticket's status_id by matching its current status string
  // to hd_options.name (case-sensitive exact match — status values are already
  // normalised lowercase/hyphenated, matching hd_options names 1:1).
  const [, backfillMeta] = await sequelize.query(`
    UPDATE hd_tickets t
    JOIN hd_options o ON o.type = 'status' AND o.name = t.status
    SET t.status_id = o.id
    WHERE t.status_id IS NULL OR t.status_id <> o.id
  `);
  console.log(`Backfilled status_id on ${backfillMeta.affectedRows} ticket(s)`);

  const [[{ unmatched }]] = await sequelize.query(`SELECT COUNT(*) AS unmatched FROM hd_tickets WHERE status_id IS NULL`);
  if (unmatched > 0) {
    const [rows] = await sequelize.query(`SELECT id, status FROM hd_tickets WHERE status_id IS NULL LIMIT 20`);
    console.log(`WARNING: ${unmatched} ticket(s) could not be matched to a status option:`, rows);
  } else {
    console.log('All tickets matched — 0 orphans');
  }

  console.log('\n=== Migration 056 complete ===');
}

run()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Migration 056 failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  });
