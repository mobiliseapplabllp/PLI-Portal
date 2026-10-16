const { sequelize } = require('../test/_helpers');
(async () => {
  const [a] = await sequelize.query("SHOW INDEX FROM appraisal_cycles");
  console.log('--- appraisal_cycles indexes ---');
  console.log(a.map(r => ({ Key_name: r.Key_name, Column_name: r.Column_name, Non_unique: r.Non_unique })));
  const [s] = await sequelize.query("SHOW INDEX FROM scoring_configs");
  console.log('--- scoring_configs indexes ---');
  console.log(s.map(r => ({ Key_name: r.Key_name, Column_name: r.Column_name, Non_unique: r.Non_unique })));
  await sequelize.close();
})();
