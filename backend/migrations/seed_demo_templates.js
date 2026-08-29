/**
 * Seed: Replace Demo project type milestone templates with the full
 *       8-milestone set (same as 'Signed' project type).
 *
 * Safe: only modifies pm_milestone_templates (config table).
 *       No existing project or milestone row is touched.
 *
 * Idempotent: DELETE existing Demo rows first, then INSERT IGNORE.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const sequelize = require('../src/config/database');

const DEMO_TEMPLATES = [
  // [name,                              minPct, maxPct, sortOrder]
  ['Requirement Gathering /Understanding', 15.00,  20.00, 1],
  ['Figma Design',                         10.00,  15.00, 2],
  ['Development',                          50.00,  60.00, 3],
  ['Testing',                               5.00,  10.00, 4],
  ['Detect Fixes',                          5.00,  10.00, 5],
  ['Client Demo',                           5.00,  10.00, 6],
  ['Client Feedback',                       5.00,  10.00, 7],
  ['Client Sign-Off',                       5.00,  10.00, 8],
];

async function run() {
  console.log('\n[seed_demo_templates] Connecting...');
  await sequelize.authenticate();
  console.log('[seed_demo_templates] Connected to:', process.env.MYSQL_DATABASE, '\n');

  // Step 1: Remove old placeholder (single "Development" 0–100%)
  const [, delMeta] = await sequelize.query(
    "DELETE FROM `pm_milestone_templates` WHERE `projectType` = 'Demo'"
  );
  console.log(`  [-] Removed ${delMeta?.affectedRows ?? 0} old Demo template(s)`);

  // Step 2: Insert all 8 templates
  for (const [name, minPct, maxPct, sortOrder] of DEMO_TEMPLATES) {
    await sequelize.query(
      `INSERT IGNORE INTO \`pm_milestone_templates\`
         (\`projectType\`, \`name\`, \`minPct\`, \`maxPct\`, \`sortOrder\`, \`isActive\`, \`createdAt\`, \`updatedAt\`)
       VALUES (?, ?, ?, ?, ?, 1, NOW(), NOW())`,
      { replacements: ['Demo', name, minPct, maxPct, sortOrder] }
    );
    console.log(`  [+] ${String(sortOrder).padStart(1)}. ${name.padEnd(40)} ${minPct}% – ${maxPct}%`);
  }

  // Step 3: Verify
  const [rows] = await sequelize.query(
    "SELECT name, minPct, maxPct, sortOrder FROM `pm_milestone_templates` WHERE `projectType` = 'Demo' ORDER BY sortOrder"
  );
  console.log('\n  [✓] Final Demo templates in DB:');
  rows.forEach(r =>
    console.log(`       ${r.sortOrder}. ${r.name} (${r.minPct}% – ${r.maxPct}%)`)
  );

  console.log('\n[seed_demo_templates] Done.\n');
  await sequelize.close();
}

run().catch(err => {
  console.error('[seed_demo_templates] FAILED:', err.message);
  process.exit(1);
});
