const { sequelize } = require('../test/_helpers');
(async () => {
  const [r] = await sequelize.query("SHOW COLUMNS FROM departments LIKE 'id'");
  console.log(r);
  await sequelize.close();
})();
