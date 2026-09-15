/**
 * Migration 045 — TIME ENTRIES (actual hours)
 *
 * One polymorphic, module-neutral table for logged hours. An entry belongs to
 * exactly one entity — a helpdesk ticket, a PM milestone or a PM project —
 * identified by (entity_type, entity_id). entity_id is VARCHAR(36) because
 * hd_tickets has an INT PK while pm_* use CHAR(36) UUIDs.
 *
 *   • user_id     — who did the work (FK → users.id, attempted; soft link if it fails)
 *   • created_by_id — who logged it (a manager may log on behalf of a user)
 *   • hours       — DECIMAL(5,2), app-validated 0.25–24 in 0.25 steps
 *
 * Idempotent — safe to re-run. Additive only: no existing table is touched.
 *
 *   node backend/migrations/045_time_entries.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const sequelize = require('../src/config/database');

async function hasTable(table) {
  const [[{ cnt }]] = await sequelize.query(
    `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    { replacements: [table] }
  );
  return Number(cnt) > 0;
}

async function hasConstraint(table, name) {
  const [[{ cnt }]] = await sequelize.query(
    `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?`,
    { replacements: [table, name] }
  );
  return Number(cnt) > 0;
}

async function run() {
  console.log('\n[Migration 045] Connecting...');
  await sequelize.authenticate();
  console.log('[Migration 045] Connected.\n');

  // 1. Table. user_id copies users.id's collation (utf8mb4_bin) so the FK can bind.
  if (await hasTable('time_entries')) {
    console.log('  [~] time_entries already exists — skipping CREATE');
  } else {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS time_entries (
        id            CHAR(36)     NOT NULL,
        entity_type   ENUM('ticket','milestone','project') NOT NULL,
        entity_id     VARCHAR(36)  NOT NULL COMMENT 'hd_tickets.id (int as string) | pm_milestones.id | pm_projects.id',
        user_id       CHAR(36)     CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
        date          DATE         NOT NULL,
        hours         DECIMAL(5,2) NOT NULL,
        note          VARCHAR(500) NULL DEFAULT NULL,
        created_by_id CHAR(36)     NULL DEFAULT NULL,
        created_at    DATETIME     NOT NULL,
        updated_at    DATETIME     NOT NULL,
        PRIMARY KEY (id),
        INDEX idx_time_entries_entity (entity_type, entity_id),
        INDEX idx_time_entries_user_date (user_id, date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('  [+] time_entries created');
  }

  // 2. FK user_id → users(id). Best effort — a mismatch (collation, orphan rows)
  //    must not block the migration; the app enforces the link regardless.
  if (await hasConstraint('time_entries', 'fk_time_entries_user')) {
    console.log('  [~] FK fk_time_entries_user already exists — skipping');
  } else {
    try {
      await sequelize.query(
        `ALTER TABLE time_entries
           ADD CONSTRAINT fk_time_entries_user FOREIGN KEY (user_id) REFERENCES users(id)
           ON DELETE CASCADE ON UPDATE CASCADE`
      );
      console.log('  [+] FK fk_time_entries_user added (time_entries.user_id → users.id)');
    } catch (e) {
      console.log(`  [!] FK fk_time_entries_user NOT added — continuing without it: ${e.message}`);
    }
  }

  const [[c]] = await sequelize.query(`SELECT COUNT(*) AS cnt FROM time_entries`);
  console.log(`\n  [✓] time_entries ready — ${c.cnt} row(s)`);
  console.log('\n[Migration 045] Done.\n');
  await sequelize.close();
}

run().catch(err => { console.error('[Migration 045] FAILED:', err.message); process.exit(1); });
