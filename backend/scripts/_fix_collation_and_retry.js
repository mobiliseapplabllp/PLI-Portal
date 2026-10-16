const { sequelize } = require('../test/_helpers');
(async () => {
  console.log('Fixing appraisal_cycles.departmentId collation...');
  await sequelize.query("ALTER TABLE appraisal_cycles MODIFY COLUMN departmentId CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL");
  console.log('OK');

  console.log('Adding FK fk_appraisal_cycle_department...');
  await sequelize.query(`
    ALTER TABLE appraisal_cycles
    ADD CONSTRAINT fk_appraisal_cycle_department
      FOREIGN KEY (departmentId) REFERENCES departments(id)
      ON DELETE CASCADE
      ON UPDATE CASCADE
  `);
  console.log('OK');

  console.log('\n=== appraisal_cycles done ===\n');

  console.log('Adding scoring_configs.departmentId...');
  await sequelize.query("ALTER TABLE scoring_configs ADD COLUMN departmentId CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL AFTER financialYear");
  console.log('OK');

  console.log('Dropping old uq_scoring_config_fy...');
  await sequelize.query("ALTER TABLE scoring_configs DROP INDEX uq_scoring_config_fy");
  console.log('OK');

  console.log('Adding uq_scoring_config_fy_dept...');
  await sequelize.query("ALTER TABLE scoring_configs ADD UNIQUE KEY uq_scoring_config_fy_dept (financialYear, departmentId)");
  console.log('OK');

  console.log('Adding FK fk_scoring_config_department...');
  await sequelize.query(`
    ALTER TABLE scoring_configs
    ADD CONSTRAINT fk_scoring_config_department
      FOREIGN KEY (departmentId) REFERENCES departments(id)
      ON DELETE CASCADE
      ON UPDATE CASCADE
  `);
  console.log('OK');

  console.log('\n=== All done ===');
  await sequelize.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
