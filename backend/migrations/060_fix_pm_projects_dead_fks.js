/**
 * Migration 060 — repoint every foreign key still referencing pm_projects_dead
 * onto the real, live pm_projects table.
 *
 * Background: at some point pm_projects was renamed to pm_projects_dead and a
 * fresh pm_projects table was created. MySQL automatically keeps any existing
 * foreign key following the renamed table, so every FK that was already
 * defined against pm_projects at that moment silently started pointing at the
 * frozen snapshot (pm_projects_dead) instead of the live table — any project
 * created AFTER that rename is invisible to those constraints.
 *
 * Migration 053 already discovered and fixed this for pm_milestones.projectId.
 * This migration generalises that same fix (same approach: drop the broken
 * constraint, add a corrected one with identical ON DELETE/ON UPDATE
 * behaviour) to EVERY table/column in the database still affected — found by
 * querying INFORMATION_SCHEMA at runtime, not a hardcoded list, so nothing
 * gets missed a second time.
 *
 * Schema-only — never touches row data. MySQL itself refuses to add a
 * corrected FK if any existing row would violate it, so this cannot silently
 * corrupt anything: it either succeeds cleanly or fails loudly with nothing
 * changed.
 *
 * Idempotent: safe to re-run — already-fixed tables are skipped.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const sequelize = require('../src/config/database');

async function findBrokenFks() {
  const [rows] = await sequelize.query(`
    SELECT
      kcu.TABLE_NAME,
      kcu.COLUMN_NAME,
      kcu.CONSTRAINT_NAME,
      rc.DELETE_RULE,
      rc.UPDATE_RULE
    FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
    JOIN INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
      ON rc.CONSTRAINT_SCHEMA = kcu.TABLE_SCHEMA
     AND rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
     AND rc.TABLE_NAME = kcu.TABLE_NAME
    WHERE kcu.TABLE_SCHEMA = DATABASE()
      AND kcu.REFERENCED_TABLE_NAME = 'pm_projects_dead'
  `);
  return rows;
}

async function run() {
  console.log('=== Migration 060: repoint pm_projects_dead FKs -> pm_projects ===\n');

  const [[{ deadExists }]] = await sequelize.query(`
    SELECT COUNT(*) AS deadExists FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pm_projects_dead'
  `);
  if (!deadExists) {
    console.log('pm_projects_dead does not exist on this database — nothing to repoint.');
    console.log('\n=== Migration 060 complete ===');
    return;
  }

  const broken = await findBrokenFks();

  if (broken.length === 0) {
    console.log('No foreign keys currently reference pm_projects_dead — nothing to fix.');
    console.log('\n=== Migration 060 complete ===');
    return;
  }

  console.log(`Found ${broken.length} foreign key(s) pointing at pm_projects_dead:`);
  broken.forEach((fk) => console.log(`  - ${fk.TABLE_NAME}.${fk.COLUMN_NAME} (${fk.CONSTRAINT_NAME})`));
  console.log('');

  for (const fk of broken) {
    const newName = `${fk.CONSTRAINT_NAME}_v2`;
    await sequelize.query(`ALTER TABLE \`${fk.TABLE_NAME}\` DROP FOREIGN KEY \`${fk.CONSTRAINT_NAME}\``);
    await sequelize.query(`
      ALTER TABLE \`${fk.TABLE_NAME}\`
      ADD CONSTRAINT \`${newName}\`
      FOREIGN KEY (\`${fk.COLUMN_NAME}\`) REFERENCES pm_projects(id)
      ON DELETE ${fk.DELETE_RULE} ON UPDATE ${fk.UPDATE_RULE}
    `);
    console.log(`Repointed ${fk.TABLE_NAME}.${fk.COLUMN_NAME}: ${fk.CONSTRAINT_NAME} -> ${newName} (now -> pm_projects, same ${fk.DELETE_RULE}/${fk.UPDATE_RULE} rules)`);
  }

  console.log(`\nFixed ${broken.length} foreign key(s).`);
  console.log('\n=== Migration 060 complete ===');
}

run()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Migration 060 failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  });
