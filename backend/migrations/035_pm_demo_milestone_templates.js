/**
 * Migration 035 — Seed Demo project type milestone templates
 *
 * Replaces the single placeholder "Development" (0–100%) template that
 * migration 021d seeded for the Demo project type with the full 8-milestone
 * set (identical to the 'Signed' project type templates).
 *
 * ════════════════════════════════════════════════════════════════════
 * DATA SAFETY
 * ════════════════════════════════════════════════════════════════════
 * Only modifies pm_milestone_templates (config/master table).
 * No existing pm_projects or pm_milestones rows are touched.
 * Affects only NEW project creation going forward — existing project
 * milestones are completely unchanged.
 *
 * ════════════════════════════════════════════════════════════════════
 * IDEMPOTENCY
 * ════════════════════════════════════════════════════════════════════
 * Guard: if Demo already has ≥ 2 templates, skip (placeholder was
 * already replaced). DELETE + INSERT IGNORE pattern otherwise.
 *
 * ════════════════════════════════════════════════════════════════════
 * FINAL DEMO TEMPLATE SET
 * ════════════════════════════════════════════════════════════════════
 *  1. Requirement Gathering /Understanding   15% – 20%
 *  2. Figma Design                           10% – 15%
 *  3. Development                            50% – 60%
 *  4. Testing                                 5% – 10%
 *  5. Detect Fixes                            5% – 10%
 *  6. Client Demo                             5% – 10%
 *  7. Client Feedback                         5% – 10%
 *  8. Client Sign-Off                         5% – 10%
 *
 *   node backend/migrations/035_pm_demo_milestone_templates.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const sequelize = require('../src/config/database');

const DEMO_TEMPLATES = [
  // [name,                                  minPct, maxPct, sortOrder]
  ['Requirement Gathering /Understanding',    15.00,  20.00, 1],
  ['Figma Design',                            10.00,  15.00, 2],
  ['Development',                             50.00,  60.00, 3],
  ['Testing',                                  5.00,  10.00, 4],
  ['Detect Fixes',                             5.00,  10.00, 5],
  ['Client Demo',                              5.00,  10.00, 6],
  ['Client Feedback',                          5.00,  10.00, 7],
  ['Client Sign-Off',                          5.00,  10.00, 8],
];

async function run() {
  console.log('\n[Migration 035] Connecting...');
  await sequelize.authenticate();
  console.log('[Migration 035] Connected to:', process.env.MYSQL_DATABASE, '\n');

  // ── Idempotency guard ─────────────────────────────────────────────────────
  const [[{ existing }]] = await sequelize.query(
    "SELECT COUNT(*) AS `existing` FROM `pm_milestone_templates` WHERE `projectType` = 'Demo'"
  );
  if (Number(existing) >= 2) {
    console.log(`  [~] Demo already has ${existing} template(s) — full set already applied. Skipping.\n`);
    await sequelize.close();
    return;
  }

  // ── Step 1: Remove old placeholder (single "Development" 0–100%) ──────────
  const [, delMeta] = await sequelize.query(
    "DELETE FROM `pm_milestone_templates` WHERE `projectType` = 'Demo'"
  );
  console.log(`  [-] Removed ${delMeta?.affectedRows ?? 0} old Demo placeholder template(s)`);

  // ── Step 2: Insert all 8 templates ────────────────────────────────────────
  for (const [name, minPct, maxPct, sortOrder] of DEMO_TEMPLATES) {
    await sequelize.query(
      `INSERT IGNORE INTO \`pm_milestone_templates\`
         (\`projectType\`, \`name\`, \`minPct\`, \`maxPct\`,
          \`sortOrder\`, \`isActive\`, \`createdAt\`, \`updatedAt\`)
       VALUES (?, ?, ?, ?, ?, 1, NOW(), NOW())`,
      { replacements: ['Demo', name, minPct, maxPct, sortOrder] }
    );
    console.log(`  [+] ${sortOrder}. ${name.padEnd(42)} ${minPct}% – ${maxPct}%`);
  }

  // ── Step 3: Verify final state ────────────────────────────────────────────
  const [rows] = await sequelize.query(
    `SELECT name, minPct, maxPct, sortOrder
       FROM \`pm_milestone_templates\`
      WHERE \`projectType\` = 'Demo'
      ORDER BY sortOrder`
  );
  console.log('\n  [✓] Final Demo templates in DB:');
  rows.forEach(r =>
    console.log(`       ${r.sortOrder}. ${r.name.padEnd(42)} (${r.minPct}% – ${r.maxPct}%)`)
  );

  console.log('\n[Migration 035] Done.\n');
  await sequelize.close();
}

run().catch(err => {
  console.error('[Migration 035] FAILED:', err.message);
  process.exit(1);
});
