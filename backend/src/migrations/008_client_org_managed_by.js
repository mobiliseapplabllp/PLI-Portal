/**
 * Migration 008 — Replace contact fields with managedById on client_organisations
 * Run: node backend/src/migrations/008_client_org_managed_by.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const sequelize = require('../config/database');

async function up() {
  await sequelize.authenticate();

  const [[cols]] = await sequelize.query(
    `SELECT COUNT(*) as cnt FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'client_organisations' AND column_name = 'contactPerson'`
  );
  if (cols.cnt > 0) {
    await sequelize.query(`ALTER TABLE client_organisations DROP COLUMN contactPerson`);
  }

  const [[cols2]] = await sequelize.query(
    `SELECT COUNT(*) as cnt FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'client_organisations' AND column_name = 'contactEmail'`
  );
  if (cols2.cnt > 0) {
    await sequelize.query(`ALTER TABLE client_organisations DROP COLUMN contactEmail`);
  }

  const [[cols3]] = await sequelize.query(
    `SELECT COUNT(*) as cnt FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'client_organisations' AND column_name = 'contactPhone'`
  );
  if (cols3.cnt > 0) {
    await sequelize.query(`ALTER TABLE client_organisations DROP COLUMN contactPhone`);
  }

  const [[cols4]] = await sequelize.query(
    `SELECT COUNT(*) as cnt FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'client_organisations' AND column_name = 'managedById'`
  );
  if (cols4.cnt === 0) {
    await sequelize.query(`ALTER TABLE client_organisations ADD COLUMN managedById CHAR(36) NULL AFTER industry`);
  }

  console.log('Migration 008 complete: managedById added, contact columns removed');
}

up()
  .then(() => process.exit(0))
  .catch((err) => { console.error(err); process.exit(1); });
