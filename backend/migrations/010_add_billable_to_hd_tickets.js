require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const sequelize = require('../src/config/database');
async function run() {
  console.log('\n[Migration 010] Connecting...');
  await sequelize.authenticate();
  console.log('[Migration 010] Connected.\n');

  // Check if column already exists (compatible with MySQL 5.7+)
  const [rows] = await sequelize.query(`
    SELECT COUNT(*) AS cnt
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'hd_tickets'
      AND COLUMN_NAME  = 'billable'
  `);
  const exists = rows[0].cnt > 0;

  if (exists) {
    console.log('  [~] hd_tickets.billable column already exists — skipping');
  } else {
    await sequelize.query(`ALTER TABLE hd_tickets ADD COLUMN billable ENUM('Billable','Non-Billable') NOT NULL DEFAULT 'Non-Billable'`);
    console.log('  [+] hd_tickets.billable column added');
  }

  console.log('\n[Migration 010] Done.\n');
  await sequelize.close();
}
run().catch(err => { console.error('[Migration 010] FAILED:', err); process.exit(1); });
