require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const sequelize = require('../src/config/database');
async function run() {
  console.log('\n[Migration 009] Connecting...');
  await sequelize.authenticate();
  console.log('[Migration 009] Connected.\n');
  await sequelize.query(`ALTER TABLE pm_documents MODIFY COLUMN category VARCHAR(150) NOT NULL DEFAULT 'Others'`);
  console.log('  [+] pm_documents.category changed to VARCHAR(150)');
  console.log('\n[Migration 009] Done.\n');
  await sequelize.close();
}
run().catch(err => { console.error('[Migration 009] FAILED:', err); process.exit(1); });
