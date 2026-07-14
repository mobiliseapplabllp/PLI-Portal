const Department = require('./Department');
const User = require('./User');
const ScoringConfig = require('./ScoringConfig');
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

// ── PM Models ─────────────────────────────────────────────────────────────────
const Project = require('./pm/Project');
const ProjectMember = require('./pm/ProjectMember');
const Milestone = require('./pm/Milestone');
const Task = require('./pm/Task');
const DailyStatusLog = require('./pm/DailyStatusLog');
const ProjectNotificationRecipient = require('./pm/ProjectNotificationRecipient');
const PmSettings = require('./pm/PmSettings');

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

// ── ScoringConfig ─────────────────────────────────────────────────────────────
ScoringConfig.belongsTo(User, { foreignKey: 'createdById', as: 'createdBy' });
QuarterlyApproval.belongsTo(ScoringConfig, { foreignKey: 'scoringConfigId', as: 'scoringConfig' });

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

// ── Project ───────────────────────────────────────────────────────────────────
Project.belongsTo(User, { foreignKey: 'ownerId', as: 'owner' });
Project.belongsTo(User, { foreignKey: 'managerId', as: 'projectManager' });
Project.belongsTo(User, { foreignKey: 'createdById', as: 'createdBy' });
Project.hasMany(ProjectMember, { foreignKey: 'projectId', as: 'members', onDelete: 'CASCADE' });
Project.hasMany(Milestone, { foreignKey: 'projectId', as: 'milestones', onDelete: 'CASCADE' });
Project.hasMany(Task, { foreignKey: 'projectId', as: 'tasks', onDelete: 'CASCADE' });
Project.hasMany(DailyStatusLog, { foreignKey: 'projectId', as: 'dailyLogs', onDelete: 'CASCADE' });
Project.hasMany(ProjectNotificationRecipient, { foreignKey: 'projectId', as: 'notificationRecipients', onDelete: 'CASCADE' });

ProjectMember.belongsTo(Project, { foreignKey: 'projectId', as: 'project' });
ProjectMember.belongsTo(User, { foreignKey: 'userId', as: 'user' });

Milestone.belongsTo(Project, { foreignKey: 'projectId', as: 'project' });
Milestone.belongsTo(User, { foreignKey: 'accountableUserId', as: 'accountableUser' });
Milestone.hasMany(Task, { foreignKey: 'milestoneId', as: 'tasks', onDelete: 'CASCADE' });

Task.belongsTo(Milestone, { foreignKey: 'milestoneId', as: 'milestone' });
Task.belongsTo(Project, { foreignKey: 'projectId', as: 'project' });
Task.belongsTo(User, { foreignKey: 'assignedToId', as: 'assignedTo' });

DailyStatusLog.belongsTo(Project, { foreignKey: 'projectId', as: 'project' });
DailyStatusLog.belongsTo(User, { foreignKey: 'createdById', as: 'createdBy' });

ProjectNotificationRecipient.belongsTo(Project, { foreignKey: 'projectId', as: 'project' });
ProjectNotificationRecipient.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// Export PM models so other files can import from associations
module.exports = { Project, ProjectMember, Milestone, Task, DailyStatusLog, ProjectNotificationRecipient, PmSettings };
