const sequelize = require('./database');
require('../models/associations');

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
      console.log(`MySQL connected (attempt ${attempt}): ${sequelize.config.host} / ${sequelize.config.database}`);
      // Mark ready immediately after auth so the HTTP server stops returning 503.
      // Sync runs in the background — it may take extra seconds on a remote DB.
      dbReady = true;
      sequelize.sync({ alter: true })
        .then(() => console.log('Database models synchronized (alter mode)'))
        .catch((err) => console.error('DB sync error (non-fatal):', err.message));
      return;
    } catch (error) {
      console.error(`MySQL connection error (attempt ${attempt}): ${error.message}`);
      console.log(`Retrying in ${RETRY_DELAY_MS / 1000}s...`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
};

module.exports = connectDB;
module.exports.isDbReady = isDbReady;
