const { sequelize } = require('../test/_helpers');
(async () => {
  const [rows] = await sequelize.query(`
    SELECT
      u.name AS employee, d.name AS department,
      ka.financialYear, ka.month, ka.status,
      ka.totalWeightage, ka.committedAt, ka.employeeSubmittedAt, ka.managerReviewedAt
    FROM kpi_assignments ka
    JOIN users u ON u.id = ka.employeeId
    LEFT JOIN departments d ON d.id = ka.departmentId
    WHERE ka.status NOT IN ('draft','assigned')
    ORDER BY d.name, u.name, ka.financialYear, ka.month
    LIMIT 50
  `);
  console.table(rows);
  const [[{ total }]] = await sequelize.query(`SELECT COUNT(*) AS total FROM kpi_assignments WHERE status NOT IN ('draft','assigned')`);
  console.log('Total committed/submitted KPI assignments in DB:', total);
  await sequelize.close();
})();
