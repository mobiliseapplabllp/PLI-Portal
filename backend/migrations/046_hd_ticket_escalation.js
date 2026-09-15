/**
 * Migration 046 — HELPDESK TICKET ESCALATION
 *
 * Supports the hourly escalation job (src/jobs/hdEscalation.job.js), which marks
 * open tickets past their due date (or stale for 48h without a due date) as
 * SLA-breached and escalates each one ONCE to its group manager.
 *
 *   hd_tickets.escalated_at     DATETIME NULL + index — when the escalation email
 *                               was sent. Non-NULL means "never escalate again".
 *   hd_tickets.escalated_to_id  CHAR(36) utf8mb4_bin NULL — users.id of the manager
 *                               escalated to (audit). Same type/collation as
 *                               users.id / hd_groups.manager_id. No FK: audit
 *                               value, must survive the user being removed.
 *
 * Idempotent — safe to re-run. Additive only.
 *
 *   node backend/migrations/046_hd_ticket_escalation.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const sequelize = require('../src/config/database');

const IDX_NAME = 'idx_hd_tickets_escalated_at';

async function hasColumn(table, column) {
  const [[{ cnt }]] = await sequelize.query(
    `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    { replacements: [table, column] }
  );
  return Number(cnt) > 0;
}

async function hasIndex(table, index) {
  const [[{ cnt }]] = await sequelize.query(
    `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    { replacements: [table, index] }
  );
  return Number(cnt) > 0;
}

async function run() {
  console.log('\n[Migration 046] Connecting...');
  await sequelize.authenticate();
  console.log('[Migration 046] Connected.\n');

  if (await hasColumn('hd_tickets', 'escalated_at')) {
    console.log('  [~] hd_tickets.escalated_at already exists — skipping');
  } else {
    await sequelize.query(
      `ALTER TABLE hd_tickets ADD COLUMN escalated_at DATETIME NULL DEFAULT NULL
         COMMENT 'When the SLA escalation was sent to the group manager (set once)'`
    );
    console.log('  [+] hd_tickets.escalated_at added');
  }

  if (await hasColumn('hd_tickets', 'escalated_to_id')) {
    console.log('  [~] hd_tickets.escalated_to_id already exists — skipping');
  } else {
    await sequelize.query(
      `ALTER TABLE hd_tickets ADD COLUMN escalated_to_id CHAR(36)
         CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL DEFAULT NULL
         COMMENT 'users.id of the manager the ticket was escalated to (audit, no FK)'`
    );
    console.log('  [+] hd_tickets.escalated_to_id added');
  }

  if (await hasIndex('hd_tickets', IDX_NAME)) {
    console.log(`  [~] index ${IDX_NAME} already exists — skipping`);
  } else {
    await sequelize.query(`ALTER TABLE hd_tickets ADD INDEX ${IDX_NAME} (escalated_at)`);
    console.log(`  [+] index ${IDX_NAME} added`);
  }

  console.log('\n[Migration 046] Done.\n');
  await sequelize.close();
}

run().catch(err => { console.error('[Migration 046] FAILED:', err.message); process.exit(1); });
