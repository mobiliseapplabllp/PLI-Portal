const { sequelize } = require('../test/_helpers');
(async () => {
  const [ops] = await sequelize.query(
    "SELECT u.id, u.name, u.email FROM users u WHERE u.role='employee' AND u.isActive=1 AND u.departmentId = 'a1652c5c-e941-4ea2-8d5f-709d310ddb7f'"
  );
  console.log('Operations active employees (these are who got notified):', ops.length);
  console.log(ops.map(u => u.name));

  const [others] = await sequelize.query(
    "SELECT COUNT(*) AS cnt FROM users WHERE role='employee' AND isActive=1 AND (departmentId IS NULL OR departmentId != 'a1652c5c-e941-4ea2-8d5f-709d310ddb7f')"
  );
  console.log('Active employees OUTSIDE Operations (these did NOT get notified):', others[0].cnt);

  await sequelize.close();
})();
