const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

// One row per bulk-import run (migration 054) — history + the source of truth
// for "which batch do I undo".
const PmImportLog = sequelize.define(
  'PmImportLog',
  {
    id:               { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    batchId:           { type: DataTypes.UUID, allowNull: false },
    fileName:          { type: DataTypes.STRING(255), allowNull: true },
    importedById:      { type: DataTypes.UUID, allowNull: true },
    orgsCreated:       { type: DataTypes.INTEGER, defaultValue: 0 },
    orgsReused:        { type: DataTypes.INTEGER, defaultValue: 0 },
    projectsCreated:   { type: DataTypes.INTEGER, defaultValue: 0 },
    projectsSkipped:   { type: DataTypes.INTEGER, defaultValue: 0 },
    rowErrors:         { type: DataTypes.JSON, allowNull: true },
    // 'completed' | 'undone'
    status:            { type: DataTypes.STRING(20), defaultValue: 'completed' },
  },
  { tableName: 'pm_import_logs' }
);

module.exports = PmImportLog;
