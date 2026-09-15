require('dotenv').config();
const sequelize = require('../src/config/database');

async function migrate() {
  await sequelize.authenticate();
  console.log('Connected to:', process.env.MYSQL_DATABASE);
  const q = (sql) => sequelize.query(sql);

  const run = async (label, sql) => {
    try { await q(sql); console.log('✅ ' + label); }
    catch (e) { console.log('⏭  skip ' + label + ' —', e.message.split('\n')[0]); }
  };

  await run('kpiHead column',                'ALTER TABLE quarterly_approval_items ADD COLUMN kpiHead VARCHAR(64) NULL');
  await run('month1_actual column',          'ALTER TABLE quarterly_approval_items ADD COLUMN month1_actual DECIMAL(10,4) NULL');
  await run('month2_actual column',          'ALTER TABLE quarterly_approval_items ADD COLUMN month2_actual DECIMAL(10,4) NULL');
  await run('month3_actual column',          'ALTER TABLE quarterly_approval_items ADD COLUMN month3_actual DECIMAL(10,4) NULL');
  await run('calculatedQuarterlyActual col', 'ALTER TABLE quarterly_approval_items ADD COLUMN calculatedQuarterlyActual DECIMAL(10,4) NULL');
  await run('calculatedQuarterlyScore col',  'ALTER TABLE quarterly_approvals ADD COLUMN calculatedQuarterlyScore DECIMAL(10,4) NULL');

  await run('scoring_configs table', `
    CREATE TABLE IF NOT EXISTS scoring_configs (
      id              CHAR(36)                    NOT NULL PRIMARY KEY,
      financialYear   VARCHAR(16)                 NOT NULL,
      quarter         ENUM('Q1','Q2','Q3','Q4')   NOT NULL,
      meetsMultiplier   DECIMAL(6,3)              NOT NULL DEFAULT 1.000,
      belowMultiplier   DECIMAL(6,3)              NOT NULL DEFAULT -0.500,
      exceedsMultiplier DECIMAL(6,3)              NOT NULL DEFAULT 1.500,
      isActive        TINYINT(1)                  NOT NULL DEFAULT 1,
      createdById     CHAR(36)                    NULL,
      createdAt       DATETIME                    NOT NULL,
      updatedAt       DATETIME                    NOT NULL,
      UNIQUE KEY uq_scoring_config_fy_q (financialYear, quarter)
    )
  `);

  console.log('\nMigration complete.');
  process.exit(0);
}

migrate().catch((e) => { console.error('Migration failed:', e.message); process.exit(1); });
