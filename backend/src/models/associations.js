const Department = require('./Department');
const User = require('./User');
const AppraisalCycle = require('./AppraisalCycle');
const KpiAssignment = require('./KpiAssignment');
const KpiItem = require('./KpiItem');
const KpiPlan = require('./KpiPlan');
const KpiPlanItem = require('./KpiPlanItem');
const QuarterlyApproval = require('./QuarterlyApproval');
const QuarterlyApprovalItem = require('./QuarterlyApprovalItem');
const PliRule = require('./PliRule');
const PliSlab = require('./PliSlab');
const Notification = require('./Notification');
const AuditLog = require('./AuditLog');
const KpiTemplate = require('./KpiTemplate');

// ── User ─────────────────────────────────────────────────────────────────────
User.belongsTo(Department, { foreignKey: 'departmentId', as: 'department' });
Department.hasMany(User, { foreignKey: 'departmentId', as: 'users' });

User.belongsTo(User, { foreignKey: 'managerId', as: 'manager' });
User.hasMany(User, { foreignKey: 'managerId', as: 'directReports' });

// ── AppraisalCycle ────────────────────────────────────────────────────────────
AppraisalCycle.belongsTo(User, { foreignKey: 'createdById', as: 'createdBy' });

// ── KpiAssignment ─────────────────────────────────────────────────────────────
KpiAssignment.belongsTo(User, { foreignKey: 'employeeId', as: 'employee' });
KpiAssignment.belongsTo(User, { foreignKey: 'managerId', as: 'manager' });
KpiAssignment.belongsTo(User, { foreignKey: 'createdById', as: 'createdBy' });
KpiAssignment.belongsTo(User, { foreignKey: 'lockedById', as: 'lockedBy' });
KpiAssignment.hasMany(KpiItem, { foreignKey: 'kpiAssignmentId', as: 'items' });
KpiItem.belongsTo(KpiAssignment, { foreignKey: 'kpiAssignmentId', as: 'assignment' });

// ── KpiItem back-refs ─────────────────────────────────────────────────────────
KpiItem.belongsTo(KpiPlanItem, { foreignKey: 'kpiPlanItemId', as: 'planItem' });
KpiItem.belongsTo(User, { foreignKey: 'finalApprovedById', as: 'finalApprovedBy' });

// ── KpiPlan ───────────────────────────────────────────────────────────────────
KpiPlan.belongsTo(User, { foreignKey: 'createdById', as: 'createdBy' });
KpiPlan.belongsTo(User, { foreignKey: 'managerId', as: 'manager' });
KpiPlan.belongsTo(Department, { foreignKey: 'departmentId', as: 'department' });
KpiPlan.hasMany(KpiPlanItem, { foreignKey: 'kpiPlanId', as: 'items', onDelete: 'CASCADE' });
KpiPlanItem.belongsTo(KpiPlan, { foreignKey: 'kpiPlanId', as: 'plan' });

// ── QuarterlyApproval ─────────────────────────────────────────────────────────
QuarterlyApproval.belongsTo(User, { foreignKey: 'employeeId', as: 'employee' });
QuarterlyApproval.belongsTo(User, { foreignKey: 'finalApproverId', as: 'finalApprover' });
QuarterlyApproval.belongsTo(Department, { foreignKey: 'departmentId', as: 'department' });
QuarterlyApproval.hasMany(QuarterlyApprovalItem, {
  foreignKey: 'quarterlyApprovalId',
  as: 'items',
  onDelete: 'CASCADE',
});
QuarterlyApprovalItem.belongsTo(QuarterlyApproval, {
  foreignKey: 'quarterlyApprovalId',
  as: 'quarterlyApproval',
});
QuarterlyApprovalItem.belongsTo(KpiPlanItem, { foreignKey: 'kpiPlanItemId', as: 'planItem' });

// ── PLI ───────────────────────────────────────────────────────────────────────
PliRule.belongsTo(User, { foreignKey: 'createdById', as: 'createdBy' });
PliRule.hasMany(PliSlab, { foreignKey: 'pliRuleId', as: 'slabs', onDelete: 'CASCADE' });
PliSlab.belongsTo(PliRule, { foreignKey: 'pliRuleId', as: 'pliRule' });

// ── Notification ──────────────────────────────────────────────────────────────
Notification.belongsTo(User, { foreignKey: 'recipientId', as: 'recipient' });

// ── AuditLog ──────────────────────────────────────────────────────────────────
AuditLog.belongsTo(User, { foreignKey: 'changedById', as: 'changedBy' });

// ── KpiTemplate ───────────────────────────────────────────────────────────────
KpiTemplate.belongsTo(User, { foreignKey: 'createdById', as: 'createdBy' });
