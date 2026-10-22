const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// A staged publish request — publishing a KPI plan is the ONLY gated action;
// defining/editing is always free for anyone eligible. Only `admin` ever
// actually applies a publish; a non-admin's request climbs an approval
// chain (built from who granted them Definer rights, via grantedById) before
// admin's final sign-off — see kpiDefinitionApproval.service.js.
const KpiDefinitionChangeRequest = sequelize.define(
  'KpiDefinitionChangeRequest',
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    action: {
      type: DataTypes.ENUM(
        'createPlan', 'updatePlan', 'updatePlanStatus',
        'addPlanItem', 'updatePlanItem', 'deletePlanItem', 'publishPlan'
      ),
      allowNull: false,
    },
    departmentId: { type: DataTypes.UUID, allowNull: false },
    planId: { type: DataTypes.UUID, allowNull: true },
    itemId: { type: DataTypes.UUID, allowNull: true },
    payload: { type: DataTypes.JSON, allowNull: true },
    status: {
      type: DataTypes.ENUM('pending', 'approved', 'rejected'),
      defaultValue: 'pending',
      allowNull: false,
    },
    requestedById: { type: DataTypes.UUID, allowNull: false },
    // Current stage's required approver — advances as the chain climbs.
    // null means the next (and final) stage is admin.
    approverId: { type: DataTypes.UUID, allowNull: true },
    // Ordered list of intermediate approver user ids, built from
    // kpi_definers.grantedById at submit time. Admin is always the implicit
    // final stage and is never included here — see
    // kpiDefinitionApproval.service.js buildApprovalChain().
    approvalChain: { type: DataTypes.JSON, allowNull: true, defaultValue: [] },
    currentStage: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    reviewedById: { type: DataTypes.UUID, allowNull: true },
    reviewedAt: { type: DataTypes.DATE, allowNull: true },
    reviewNote: { type: DataTypes.STRING(500), allowNull: true },
    resultPlanId: { type: DataTypes.UUID, allowNull: true },
  },
  { tableName: 'kpi_definition_change_requests' }
);

module.exports = KpiDefinitionChangeRequest;
