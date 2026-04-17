/**
 * One-off: create database (if missing) + Sequelize sync (all tables).
 * Usage (set env vars, do not commit secrets):
 *   MYSQL_HOST=... MYSQL_USER=... MYSQL_PASSWORD=... node scripts/init-db-and-sync.js
 */
require('dotenv').config();

const host = process.env.MYSQL_HOST || '127.0.0.1';
const port = Number(process.env.MYSQL_PORT || 3306);
const user = process.env.MYSQL_USER;
const password = process.env.MYSQL_PASSWORD;
const database = process.env.MYSQL_DATABASE || 'pli_portal';

async function main() {
  if (!user || password === undefined) {
    console.error('Set MYSQL_USER and MYSQL_PASSWORD (and MYSQL_HOST if not localhost).');
    process.exit(1);
  }

  process.env.MYSQL_DATABASE = database;

  const mysql = require('mysql2/promise');
  console.log(`Connecting to MySQL at ${host}:${port} as ${user}...`);
  const adminConn = await mysql.createConnection({ host, port, user, password });
  await adminConn.query(
    `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  console.log(`Database "${database}" is ready.`);
  await adminConn.end();

  const sequelize = require('../src/config/database');
  await sequelize.authenticate();
  require('../src/models/associations');
  await sequelize.sync();
  console.log('Sequelize sync complete — tables created/updated.');
  await sequelize.close();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
