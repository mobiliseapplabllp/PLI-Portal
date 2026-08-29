/**
 * Migration 026 — pm_member_allocation
 *
 * Adds resource allocation tracking columns to pm_project_members.
 * One row per user per project (UNIQUE constraint already exists) —
 * these columns track the total engagement window and percentage.
 *
 * UPDATED: Step 6 backfills allocationPct = 100 for all existing members.
 * Rationale: every existing assigned member is treated as 100% allocated
 * (confirmed by project owner — no prior allocation records exist to derive
 * a finer-grained value from). This is idempotent — rows already set to
 * a non-NULL value are not touched.
 *
 * Run once:
 *   node backend/migrations/026_pm_member_allocation.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const sequelize = require('../src/config/database');

async function run() {
  console.log('\n[Migration 026] Connecting...');
  await sequelize.authenticate();
  console.log('[Migration 026] Connected.\n');

  // ── Step 1: ADD allocationPct ─────────────────────────────────────────────
  await sequelize.query(`
    ALTER TABLE pm_project_members
    ADD COLUMN allocationPct TINYINT UNSIGNED NULL COMMENT 'Resource allocation percentage (0-100)'
  `).catch(e => {
    if (!e.message.includes('Duplicate column name')) throw e;
    console.log('  [~] allocationPct already exists — skipping');
  });
  console.log('  [+] allocationPct column added (NULL for existing rows)');

  // ── Step 2: ADD allocationFrom ────────────────────────────────────────────
  await sequelize.query(`
    ALTER TABLE pm_project_members
    ADD COLUMN allocationFrom DATE NULL COMMENT 'Start of allocation period'
  `).catch(e => {
    if (!e.message.includes('Duplicate column name')) throw e;
    console.log('  [~] allocationFrom already exists — skipping');
  });
  console.log('  [+] allocationFrom column added (NULL for existing rows)');

  // ── Step 3: ADD allocationTo ──────────────────────────────────────────────
  await sequelize.query(`
    ALTER TABLE pm_project_members
    ADD COLUMN allocationTo DATE NULL COMMENT 'End of allocation period'
  `).catch(e => {
    if (!e.message.includes('Duplicate column name')) throw e;
    console.log('  [~] allocationTo already exists — skipping');
  });
  console.log('  [+] allocationTo column added (NULL for existing rows)');

  // ── Step 4: ADD allocationStatus ─────────────────────────────────────────
  await sequelize.query(`
    ALTER TABLE pm_project_members
    ADD COLUMN allocationStatus ENUM('active','pending','approved','rejected') NOT NULL DEFAULT 'active' COMMENT 'Allocation record status'
  `).catch(e => {
    if (!e.message.includes('Duplicate column name')) throw e;
    console.log('  [~] allocationStatus already exists — skipping');
  });
  console.log('  [+] allocationStatus column added (DEFAULT active for existing rows)');

  // ── Step 5: ADD index on allocationStatus ────────────────────────────────
  await sequelize.query(`
    CREATE INDEX idx_pm_members_allocation ON pm_project_members(allocationStatus)
  `).catch(e => {
    if (!e.message.includes('Duplicate key name')) throw e;
    console.log('  [~] idx_pm_members_allocation already exists — skipping');
  });
  console.log('  [+] idx_pm_members_allocation index created');

  // ── Step 6: Backfill allocationPct = 100 for all existing members ─────────
  // Every member assigned before this migration existed without an explicit
  // allocation percentage. The business decision (confirmed) is to treat all
  // pre-existing members as 100% allocated. New members set allocationPct
  // explicitly via the allocation approval flow.
  // Idempotent: WHERE allocationPct IS NULL — already-set rows not touched.
  const [, meta] = await sequelize.query(`
    UPDATE pm_project_members
    SET    allocationPct = 100
    WHERE  allocationPct IS NULL
  `);
  const updated = meta?.affectedRows ?? 0;
  console.log(`  [+] allocationPct backfilled to 100 for ${updated} existing member row(s)`);

  console.log('\n[Migration 026] Done.\n');
  await sequelize.close();
}

run().catch(err => {
  console.error('[Migration 026] FAILED:', err);
  process.exit(1);
});
