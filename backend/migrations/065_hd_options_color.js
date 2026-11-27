/**
 * Migration 065 — admin-configurable color per hd_options row.
 *
 * Mirrors the exact pattern pm_statuses already uses (color VARCHAR, hex
 * string, admin-editable via a color picker) — same idea, applied to
 * Helpdesk's status and priority options instead of reinventing a new
 * scheme. Fixes the Operations Reports color-consistency gap: the pie
 * chart and summary widgets previously derived color independently
 * (array position vs a hardcoded prop), so they could never reliably
 * agree — now both read the SAME admin-configured value for a given
 * status/priority name.
 *
 * Nullable, no default — only status/priority rows get a seeded color
 * (below); other option types (category, mode, etc.) don't use color at
 * all and are left NULL.
 *
 * Idempotent: safe to re-run (seed UPDATEs are keyed by type+name and only
 * touch rows that don't already have a color; re-running never overwrites
 * a color an admin has since customized).
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const sequelize = require('../src/config/database');

async function columnExists(table, column) {
  const [rows] = await sequelize.query(`
    SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
  `, { replacements: [table, column] });
  return rows[0].cnt > 0;
}

// Status: 'open' = red per the explicit product requirement that drove this
// fix ("Open Tickets should be red in both [the pie chart and the widgets]").
const STATUS_SEED_COLORS = {
  'open':        '#ef4444', // red
  'in-progress': '#8b5cf6', // purple
  'pending':     '#f59e0b', // amber
  'on-hold':     '#64748b', // slate
  'resolved':    '#10b981', // green
  'closed':      '#6b7280', // gray
};

// Priority: Low/Medium/High exactly as specified; Critical kept distinct
// (darker red) so it doesn't collide visually with High.
const PRIORITY_SEED_COLORS = {
  'Low':      '#16a34a', // green
  'Medium':   '#eab308', // yellow
  'High':     '#ef4444', // red
  'Critical': '#991b1b', // dark red
};

async function run() {
  console.log('=== Migration 065: hd_options color ===\n');

  if (!(await columnExists('hd_options', 'color'))) {
    await sequelize.query(`
      ALTER TABLE hd_options
      ADD COLUMN color VARCHAR(20) NULL COMMENT 'Hex color, admin-configurable — same pattern as pm_statuses.color. NULL = no color assigned (most option types do not use one).'
    `);
    console.log('Added hd_options.color');
  } else {
    console.log('hd_options.color already exists — skipping');
  }

  let seeded = 0;
  for (const [name, color] of Object.entries(STATUS_SEED_COLORS)) {
    const [result] = await sequelize.query(`
      UPDATE hd_options SET color = ? WHERE type = 'status' AND name = ? AND color IS NULL
    `, { replacements: [color, name] });
    seeded += result.affectedRows || 0;
  }
  for (const [name, color] of Object.entries(PRIORITY_SEED_COLORS)) {
    const [result] = await sequelize.query(`
      UPDATE hd_options SET color = ? WHERE type = 'priority' AND name = ? AND color IS NULL
    `, { replacements: [color, name] });
    seeded += result.affectedRows || 0;
  }
  console.log(`Seeded default colors on ${seeded} existing status/priority row(s)`);

  console.log('\n=== Migration 065 complete ===');
}

run()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Migration 065 failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  });
