/**
 * Migration 052 — pm_milestone_templates.projectTypeId (real FK) + rename-safe sync
 *
 * pm_milestone_templates.projectType stored the project type's NAME as free text,
 * not a reference to pm_project_types.id. Renaming a project type left every one of
 * its templates still tagged with the OLD name, so the Milestone Templates screen
 * (which queries by the CURRENT name) showed nothing for it — the templates were
 * never lost, just unreachable.
 *
 * Adds projectTypeId as a genuine foreign key and backfills it by matching the
 * current name strings. The projectType string column is KEPT as a display copy
 * (nothing that reads it has to change) — from now on the rename endpoint keeps it
 * in sync via the FK, so a rename can never orphan a template again.
 *
 * Idempotent: safe to re-run. Reports any template it could not match.
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

async function constraintExists(table, name) {
  const [rows] = await sequelize.query(`
    SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?
  `, { replacements: [table, name] });
  return rows[0].cnt > 0;
}

async function run() {
  console.log('\n[Migration 052] Connecting...');
  await sequelize.authenticate();
  console.log('[Migration 052] Connected.\n');

  // 1) Column
  if (await columnExists('pm_milestone_templates', 'projectTypeId')) {
    console.log('  [~] pm_milestone_templates.projectTypeId already exists — skipping add');
  } else {
    await sequelize.query(`ALTER TABLE pm_milestone_templates ADD COLUMN projectTypeId INT NULL AFTER projectType`);
    console.log('  [+] pm_milestone_templates.projectTypeId added');
  }

  // 2) Backfill from the current name strings (safe: every existing template name
  //    matches a current project type today — the migration reports any that don't).
  const [result] = await sequelize.query(`
    UPDATE pm_milestone_templates t
    JOIN pm_project_types pt ON pt.name = t.projectType
    SET t.projectTypeId = pt.id
    WHERE t.projectTypeId IS NULL
  `);
  console.log(`  [=] backfilled projectTypeId on ${result.affectedRows ?? 0} template row(s)`);

  const [unmatched] = await sequelize.query(`
    SELECT id, projectType, name FROM pm_milestone_templates WHERE projectTypeId IS NULL
  `);
  if (unmatched.length) {
    console.log(`  [!] ${unmatched.length} template(s) reference a project type name that no longer exists (orphaned by an earlier rename):`);
    unmatched.forEach(r => console.log(`      id=${r.id} projectType="${r.projectType}" name="${r.name}"`));
    console.log('      These stay NULL. Recreate the old type name (or reassign them) and re-run to backfill.');
  } else {
    console.log('  [✓] every template matched a current project type');
  }

  // 3) Index + FK (FK only once nothing is dangling would be ideal, but a NULLable
  //    FK is fine — MySQL ignores NULLs for referential checks).
  const [idx] = await sequelize.query(`
    SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pm_milestone_templates' AND INDEX_NAME = 'idx_pm_ms_tpl_project_type_id'
  `);
  if (idx[0].cnt > 0) {
    console.log('  [~] index idx_pm_ms_tpl_project_type_id already exists — skipping');
  } else {
    await sequelize.query(`CREATE INDEX idx_pm_ms_tpl_project_type_id ON pm_milestone_templates (projectTypeId)`);
    console.log('  [+] index idx_pm_ms_tpl_project_type_id added');
  }

  if (await constraintExists('pm_milestone_templates', 'fk_pm_ms_tpl_project_type')) {
    console.log('  [~] FK fk_pm_ms_tpl_project_type already exists — skipping');
  } else {
    await sequelize.query(`
      ALTER TABLE pm_milestone_templates
      ADD CONSTRAINT fk_pm_ms_tpl_project_type
      FOREIGN KEY (projectTypeId) REFERENCES pm_project_types(id)
      ON DELETE RESTRICT ON UPDATE CASCADE
    `);
    console.log('  [+] FK fk_pm_ms_tpl_project_type added (RESTRICT delete, CASCADE id update)');
  }

  console.log('\n[Migration 052] Done.\n');
  await sequelize.close();
}
run().catch(err => { console.error('[Migration 052] FAILED:', err); process.exit(1); });
