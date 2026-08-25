require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const sequelize = require('../src/config/database');
async function run() {
  // Check if kamal exists and their role
  const [rows] = await sequelize.query(
    "SELECT id, name, email, role FROM users WHERE email LIKE '%kamal%' OR email LIKE '%mobilise%' LIMIT 10"
  );
  rows.forEach(r => console.log(r.role.padEnd(15), '|', r.name.padEnd(25), '|', r.email));
  await sequelize.close();
}
run().catch(e => { console.error(e.message); process.exit(1); });
