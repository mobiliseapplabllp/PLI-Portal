const { sequelize } = require('../test/_helpers');
(async () => {
  const [[{ total }]] = await sequelize.query("SELECT COUNT(*) AS total FROM kpi_assignments");
  const [[{ withDept }]] = await sequelize.query("SELECT COUNT(*) AS withDept FROM kpi_assignments WHERE departmentId IS NOT NULL");
  const [[{ withoutDept }]] = await sequelize.query("SELECT COUNT(*) AS withoutDept FROM kpi_assignments WHERE departmentId IS NULL");
  console.log({ total, withDept, withoutDept });
  await sequelize.close();
})();
