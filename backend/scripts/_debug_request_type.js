require('dotenv').config();
const sequelize = require('../src/config/database');
(async () => {
  const [rows] = await sequelize.query(`
    SELECT t.id, t.request_type, t.requester_id, t.team_manager_id, t.assignee_id, u.role as requester_role, u.name as requester_name
    FROM hd_tickets t LEFT JOIN users u ON u.id = t.requester_id
    WHERE t.request_type IS NOT NULL
  `);
  console.log(JSON.stringify(rows, null, 2));
  await sequelize.close();
})();
