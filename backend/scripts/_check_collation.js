const { sequelize } = require('../test/_helpers');
(async () => {
  const [a] = await sequelize.query("SHOW CREATE TABLE appraisal_cycles");
  console.log(a[0]['Create Table']);
  console.log('\n---\n');
  const [d] = await sequelize.query("SHOW CREATE TABLE departments");
  console.log(d[0]['Create Table']);
  await sequelize.close();
})();
