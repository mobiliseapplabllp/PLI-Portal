const { sequelize } = require('../test/_helpers');
(async () => {
  const [opts] = await sequelize.query("SELECT name, sort_order FROM hd_options WHERE type='category' ORDER BY sort_order");
  console.log('--- hd_options category list (admin-configured dropdown) ---');
  console.log(opts);
  const [used] = await sequelize.query("SELECT category, COUNT(*) AS cnt FROM hd_tickets GROUP BY category ORDER BY cnt DESC");
  console.log('--- distinct categories actually used on existing tickets ---');
  console.log(used);
  await sequelize.close();
})();
