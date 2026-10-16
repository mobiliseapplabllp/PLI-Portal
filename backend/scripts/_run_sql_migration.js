const fs = require('fs');
const path = require('path');
const { sequelize } = require('../test/_helpers');

const file = process.argv[2];
if (!file) { console.error('Usage: node _run_sql_migration.js <path-to-sql>'); process.exit(1); }

(async () => {
  const sql = fs.readFileSync(path.resolve(file), 'utf8');
  const statements = sql
    .split(/;\s*(?:\r?\n|$)/)
    .map(s => s.replace(/--.*$/gm, '').trim())
    .filter(Boolean);

  for (const stmt of statements) {
    console.log('>>>', stmt.slice(0, 100).replace(/\s+/g, ' '), '...');
    await sequelize.query(stmt);
    console.log('    OK');
  }
  console.log('\n=== All statements applied ===');
  await sequelize.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
