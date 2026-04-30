const sequelize = require('./database');
require('../models/associations');
const logger = require('../utils/logger');

// Drop legacy kpi_plans unique indexes (MySQL 5.7 compatible — no IF EXISTS on DROP INDEX)
async function dropLegacyKpiPlanIndexes(seq) {
  const legacyIndexes = ['unique_dept_plan', 'unique_dept_fy_plan', 'unique_team_plan', 'unique_dept_fy_role_plan'];
  for (const indexName of legacyIndexes) {
    try {
      await seq.query(`ALTER TABLE kpi_plans DROP INDEX \`${indexName}\``);
      logger.db(`Dropped legacy index: ${indexName}`);
    } catch (e) {
      // ER_CANT_DROP_FIELD_OR_KEY (1091) = index doesn't exist — safe to ignore
      // ER_NO_SUCH_TABLE (1146) = table doesn't exist yet — also ignore
      if (!e.message.includes('1091') && !e.message.includes('1146') &&
          !e.message.includes("Can't DROP") && !e.message.includes("doesn't exist")) {
        logger.warn(`Could not drop index ${indexName}: ${e.message}`);
      }
    }
  }
}

const RETRY_DELAY_MS = 8000;  // 8 s between attempts
let dbReady = false;

/**
 * Returns true once the DB has connected and synced at least once.
 * Used by the healthcheck / middleware to surface 503 cleanly.
 */
const isDbReady = () => dbReady;

/**
 * Connects to MySQL and runs alter-sync.
 * Retries indefinitely until it succeeds — does NOT crash the process.
 * This lets the HTTP server stay up and return 503 while the DB is warming up.
 */
const connectDB = async () => {
  let attempt = 0;
  while (true) {
    attempt++;
    try {
      await sequelize.authenticate();
      logger.db(`MySQL connected (attempt ${attempt}) — ${sequelize.config.host} / ${sequelize.config.database}`);
      dbReady = true;
      await dropLegacyKpiPlanIndexes(sequelize);
      sequelize.sync({ alter: true })
        .then(() => logger.db('Models synchronised (alter mode)'))
        .catch((err) => logger.error('DB sync error (non-fatal):', err.message));
      return;
    } catch (error) {
      logger.error(`MySQL connection failed (attempt ${attempt}): ${error.message}`);
      logger.info(`Retrying in ${RETRY_DELAY_MS / 1000}s…`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
};

module.exports = connectDB;
module.exports.isDbReady = isDbReady;
