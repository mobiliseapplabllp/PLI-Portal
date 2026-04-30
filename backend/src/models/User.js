const { DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');
const sequelize = require('../config/database');
const { ROLES } = require('../config/constants');

const User = sequelize.define(
  'User',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    employeeCode: { type: DataTypes.STRING(32), allowNull: false, unique: true },
    name: { type: DataTypes.STRING(255), allowNull: false },
    email: { type: DataTypes.STRING(255), allowNull: false, unique: true },
    passwordHash: { type: DataTypes.STRING(255), allowNull: false },
    phone: { type: DataTypes.STRING(32), allowNull: true },
    departmentId: { type: DataTypes.UUID, allowNull: true },
    designation: { type: DataTypes.STRING(128), allowNull: true },
    joiningDate: { type: DataTypes.DATEONLY, allowNull: true },
    managerId: { type: DataTypes.UUID, allowNull: true },
    role: {
      // Hardcoded ENUM string to match the DB column after migration script runs.
      // Do NOT use DataTypes.ENUM(...Object.values(ROLES)) because Sequelize alter
      // would drop+recreate the ENUM and lose legacy 'final_reviewed' value.
      type: DataTypes.ENUM('employee', 'manager', 'senior_manager', 'hr_admin', 'final_approver', 'admin'),
      defaultValue: ROLES.EMPLOYEE,
    },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
    mustChangePassword: { type: DataTypes.BOOLEAN, defaultValue: true },
    kpiReviewApplicable: { type: DataTypes.BOOLEAN, defaultValue: true },
    lastLogin: { type: DataTypes.DATE, allowNull: true },
  },
  {
    tableName: 'users',
    hooks: {
      beforeCreate: async (user) => {
        if (user.passwordHash && !String(user.passwordHash).startsWith('$2')) {
          user.passwordHash = await bcrypt.hash(user.passwordHash, 12);
        }
      },
      beforeUpdate: async (user) => {
        if (user.changed('passwordHash') && user.passwordHash && !String(user.passwordHash).startsWith('$2')) {
          user.passwordHash = await bcrypt.hash(user.passwordHash, 12);
        }
      },
    },
  }
);

User.prototype.comparePassword = async function comparePassword(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

module.exports = User;
