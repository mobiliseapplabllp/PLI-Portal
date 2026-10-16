const { sequelize } = require('../test/_helpers');
(async () => {
  const [a] = await sequelize.query("SHOW CREATE TABLE kpi_assignments");
  console.log(a[0]['Create Table']);
  await sequelize.close();
})();
