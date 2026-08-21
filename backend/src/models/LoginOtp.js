const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// One-time passcode for passwordless login.
// The code itself is NEVER stored — only a bcrypt hash of it (same treatment as
// passwordHash). Rows are consumed on success and superseded on re-request.
const LoginOtp = sequelize.define(
  'LoginOtp',
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false },
    codeHash: { type: DataTypes.STRING(255), allowNull: false },
    expiresAt: { type: DataTypes.DATE, allowNull: false },
    attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    lockedUntil: { type: DataTypes.DATE, allowNull: true }, // cooldown after abuse
    consumedAt: { type: DataTypes.DATE, allowNull: true },
    ipAddress: { type: DataTypes.STRING(64), allowNull: true },
  },
  {
    tableName: 'login_otps',
    indexes: [{ fields: ['userId'] }, { fields: ['expiresAt'] }],
  }
);

module.exports = LoginOtp;
