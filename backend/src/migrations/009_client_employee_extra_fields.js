/**
 * Migration 009 — Add mobileNo, designation, department to client_employees
 * Run: node backend/src/migrations/009_client_employee_extra_fields.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const sequelize = require('../config/database');

async function addColumnIfMissing(column, definition) {
  const [[row]] = await sequelize.query(
    `SELECT COUNT(*) as cnt FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'client_employees' AND column_name = ?`,
    { replacements: [column] }
  );
  if (row.cnt === 0) {
    await sequelize.query(`ALTER TABLE client_employees ADD COLUMN ${definition}`);
    console.log(`  + ${column} added`);
  } else {
    console.log(`  ~ ${column} already exists, skipped`);
  }
}

async function up() {
  await sequelize.authenticate();
  await addColumnIfMissing('mobileNo',    'mobileNo    VARCHAR(20)  NULL AFTER email');
  await addColumnIfMissing('designation', 'designation VARCHAR(100) NULL AFTER mobileNo');
  await addColumnIfMissing('department',  'department  VARCHAR(100) NULL AFTER designation');
  console.log('Migration 009 complete');
}

up()
  .then(() => process.exit(0))
  .catch((err) => { console.error(err); process.exit(1); });
