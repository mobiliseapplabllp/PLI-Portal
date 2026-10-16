const { sequelize } = require('../test/_helpers');
(async () => {
  const [rows] = await sequelize.query(
    "SELECT id, name, email, role, departmentId, isActive FROM users WHERE email = 'veervikram.singh@mobilise.co.in'"
  );
  console.log(rows);
  const [neha] = await sequelize.query(
    "SELECT id, name, email, role, departmentId, isActive FROM users WHERE name LIKE '%Neha%Chitlangia%' OR email LIKE '%neha%'"
  );
  console.log(neha);
  await sequelize.close();
})();
