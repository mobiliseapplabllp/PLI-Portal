const sequelize = require('../src/config/database');

async function up() {
  await sequelize.query(`
    ALTER TABLE users
    MODIFY COLUMN role ENUM(
      'employee',
      'manager',
      'senior_manager',
      'hr_admin',
      'final_approver',
      'admin',
      'md',
      'director',
      'sales_director'
    ) NOT NULL DEFAULT 'employee'
  `);
  console.log('✅ Migration 007: sales_director role added to users.role ENUM');
}

up()
  .then(() => process.exit(0))
  .catch((err) => { console.error('❌ Migration failed:', err.message); process.exit(1); });
