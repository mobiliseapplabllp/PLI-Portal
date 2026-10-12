const { sequelize } = require('../test/_helpers');
(async () => {
  const [r] = await sequelize.query("SELECT name FROM hd_options WHERE type='mode' ORDER BY sort_order");
  console.log(r);
  await sequelize.close();
})();
