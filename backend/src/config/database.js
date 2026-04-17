const { Sequelize } = require('sequelize');

const host = process.env.MYSQL_HOST || '127.0.0.1';
const port = Number(process.env.MYSQL_PORT || 3306);
const database = process.env.MYSQL_DATABASE || 'pli_portal';
const username = process.env.MYSQL_USER || 'root';
const password = process.env.MYSQL_PASSWORD || '';

const sequelize = new Sequelize(database, username, password, {
  host,
  port,
  dialect: 'mysql',
  logging: process.env.MYSQL_LOGGING === 'true' ? console.log : false,
  dialectOptions: {
    ...(process.env.MYSQL_SSL === 'true'
      ? { ssl: { rejectUnauthorized: process.env.MYSQL_SSL_REJECT_UNAUTHORIZED !== 'false' } }
      : {}),
    connectTimeout: 60000,   // 60 s — gives remote/VPN hosts time to respond
  },
  pool: {
    max: 10,
    min: 0,
    acquire: 60000,  // ms to wait for a connection from the pool
    idle: 10000,
  },
  define: {
    timestamps: true,
    underscored: false,
  },
});

module.exports = sequelize;
