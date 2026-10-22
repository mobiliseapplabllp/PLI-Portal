require('dotenv').config();
const sequelize = require('../src/config/database');
sequelize.query(`
  SELECT TABLE_NAME, COUNT(DISTINCT INDEX_NAME) AS idx_count
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
  GROUP BY TABLE_NAME
  HAVING idx_count > 30
  ORDER BY idx_count DESC
`).then(([rows]) => { console.table(rows); process.exit(0); }).catch(e => { console.error(e.message); process.exit(1); });
