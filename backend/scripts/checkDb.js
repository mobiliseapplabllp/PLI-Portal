require('dotenv').config();
const sequelize = require('../src/config/database');

async function check() {
  await sequelize.authenticate();
  console.log('DB:', process.env.MYSQL_DATABASE);

  const [cols1] = await sequelize.query('SHOW COLUMNS FROM quarterly_approval_items');
  const newCols = cols1.filter(c => ['kpiHead','month1_actual','month2_actual','month3_actual','calculatedQuarterlyActual'].includes(c.Field));
  console.log('\nNew columns in quarterly_approval_items:');
  if (newCols.length === 0) console.log('  NONE — migration needed!');
  else newCols.forEach(c => console.log(' ', c.Field, c.Type));

  const [cols2] = await sequelize.query('SHOW COLUMNS FROM quarterly_approvals');
  const scoreCol = cols2.filter(c => c.Field === 'calculatedQuarterlyScore');
  console.log('\ncalculatedQuarterlyScore in quarterly_approvals:', scoreCol.length ? 'EXISTS' : 'MISSING');

  const [rows] = await sequelize.query(
    'SELECT id, calculatedQuarterlyActual, quarterlyAchievedWeightage FROM quarterly_approval_items LIMIT 5'
  );
  console.log('\nSample quarterly_approval_items data:');
  rows.forEach(r => console.log(' ', JSON.stringify(r)));

  const [arows] = await sequelize.query(
    'SELECT id, calculatedQuarterlyScore, quarterlyScore, status FROM quarterly_approvals LIMIT 5'
  );
  console.log('\nSample quarterly_approvals data:');
  arows.forEach(r => console.log(' ', JSON.stringify(r)));

  process.exit(0);
}
check().catch(e => { console.error(e.message); process.exit(1); });
