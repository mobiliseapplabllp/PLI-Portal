const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const DEFAULT_CHECKLIST = [
  { label: 'Client deliverables handed over', checked: false },
  { label: 'Client sign-off received',        checked: false },
  { label: 'Knowledge transfer completed',    checked: false },
  { label: 'Final invoice raised',            checked: false },
  { label: 'Project documentation archived',  checked: false },
  { label: 'Team released from project',      checked: false },
];

const PmClosure = sequelize.define(
  'PmClosure',
  {
    id:           { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    projectId:    { type: DataTypes.UUID, allowNull: false, unique: true },
    closureDate:  { type: DataTypes.DATEONLY, allowNull: true },
    closureNotes: { type: DataTypes.TEXT, allowNull: true },
    signedOffById:{ type: DataTypes.UUID, allowNull: true },
    signedOffAt:  { type: DataTypes.DATE, allowNull: true },
    checklist: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: DEFAULT_CHECKLIST,
    },
    closedAt:     { type: DataTypes.DATE, allowNull: true },
    createdById:  { type: DataTypes.UUID, allowNull: true },
  },
  { tableName: 'pm_closure' }
);

PmClosure.DEFAULT_CHECKLIST = DEFAULT_CHECKLIST;
module.exports = PmClosure;
