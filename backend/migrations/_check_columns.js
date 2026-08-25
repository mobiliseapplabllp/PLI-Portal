require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const sequelize = require('../src/config/database');
async function run() {
  await sequelize.authenticate();
  const [rows] = await sequelize.query(
    "SELECT COLUMN_NAME, COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='pm_milestones' ORDER BY ORDINAL_POSITION"
  );
  rows.forEach(c => console.log(c.COLUMN_NAME + ' → ' + c.COLUMN_TYPE));
  await sequelize.close();
}
run().catch(e => { console.error(e.message); process.exit(1); });
