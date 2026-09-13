/**
 * Migration 041 — Phase 3: Helpdesk ticket allocation (hours/day)
 *
 * Helpdesk effort must stack against project work on the same day, so a
 * ticket assignment now carries an allocation window and hours/day, exactly
 * like a project membership.
 *
 * Columns go on hd_tickets (not hd_ticket_assignees): assignment in this
 * system is single-valued via hd_tickets.assignee_id — nothing ever writes
 * hd_ticket_assignees rows, so putting allocation there would count nothing.
 *
 * Adds to hd_tickets (snake_case, matching the table):
 *   allocation_hours_per_day  DECIMAL(3,1) NULL  — hours/day the assignee spends on it
 *   allocation_from           DATE         NULL  — window start
 *   allocation_to             DATE         NULL  — window end
 *
 * NULL hours = not counted in utilisation (legacy tickets stay silent until
 * someone re-assigns them with hours).
 *
 * Idempotent — safe to re-run.
 *
 *   node backend/migrations/041_hd_ticket_allocation.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const sequelize = require('../src/config/database');

async function hasColumn(table, column) {
  const [[{ cnt }]] = await sequelize.query(
    `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    { replacements: [table, column] }
  );
  return Number(cnt) > 0;
}
async function addColumn(table, column, ddl) {
  if (await hasColumn(table, column)) { console.log(`  [~] ${table}.${column} already exists — skipping`); return; }
  await sequelize.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  console.log(`  [+] ${table}.${column} added`);
}

async function run() {
  console.log('\n[Migration 041] Connecting...');
  await sequelize.authenticate();
  console.log('[Migration 041] Connected.\n');

  await addColumn('hd_tickets', 'allocation_hours_per_day',
    `DECIMAL(3,1) NULL DEFAULT NULL COMMENT 'Hours/day the assignee is expected to spend on this ticket'`);
  await addColumn('hd_tickets', 'allocation_from',
    `DATE NULL DEFAULT NULL COMMENT 'Assignee effort window start'`);
  await addColumn('hd_tickets', 'allocation_to',
    `DATE NULL DEFAULT NULL COMMENT 'Assignee effort window end'`);

  await sequelize.query(`CREATE INDEX idx_hd_tickets_assignee_alloc ON hd_tickets (assignee_id, allocation_from, allocation_to)`)
    .then(() => console.log('  [+] index idx_hd_tickets_assignee_alloc added'))
    .catch(e => { if (/Duplicate key name/i.test(e.message)) console.log('  [~] index already exists — skipping'); else throw e; });

  const [[c]] = await sequelize.query(`SELECT COUNT(*) total, SUM(allocation_hours_per_day IS NOT NULL) withHours FROM hd_tickets`);
  console.log(`\n  [✓] hd_tickets: ${c.total} rows, ${c.withHours} with allocation hours`);
  console.log('\n[Migration 041] Done.\n');
  await sequelize.close();
}

run().catch(err => { console.error('[Migration 041] FAILED:', err.message); process.exit(1); });
