const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');
const { PM_PROJECT_STATUS } = require('../../config/constants');

const Project = sequelize.define(
  'Project',
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING(255), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    purpose: { type: DataTypes.TEXT, allowNull: true },
    ownerId: { type: DataTypes.UUID, allowNull: true },
    clientName: { type: DataTypes.STRING(255), allowNull: true },
    clientEmail: { type: DataTypes.STRING(255), allowNull: true },
    notifyClient: { type: DataTypes.BOOLEAN, defaultValue: false },
    managerId: { type: DataTypes.UUID, allowNull: true },
    status: {
      type: DataTypes.ENUM(...Object.values(PM_PROJECT_STATUS)),
      defaultValue: PM_PROJECT_STATUS.PLANNING,
    },
    startDate: { type: DataTypes.DATEONLY, allowNull: true },
    endDate: { type: DataTypes.DATEONLY, allowNull: true },
    createdById: { type: DataTypes.UUID, allowNull: true },
    // ── Billing ───────────────────────────────────────────────────────────────
    // isBillable is set by the project manager; isBilled and its invoice details
    // are written only by Finance/admin, and only once the project is completed.
    isBillable: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    isBilled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    invoiceNumber: { type: DataTypes.STRING(64), allowNull: true },
    billedDate: { type: DataTypes.DATEONLY, allowNull: true },
    billedById: { type: DataTypes.UUID, allowNull: true },
    billedAt: { type: DataTypes.DATE, allowNull: true },
  },
  { tableName: 'pm_projects' }
);

module.exports = Project;
