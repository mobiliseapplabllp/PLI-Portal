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
const LoginOtp = require('./LoginOtp');

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

// ── LoginOtp ──────────────────────────────────────────────────────────────────
LoginOtp.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasMany(LoginOtp, { foreignKey: 'userId', as: 'loginOtps', onDelete: 'CASCADE' });

// ── KpiTemplate ───────────────────────────────────────────────────────────────
KpiTemplate.belongsTo(User, { foreignKey: 'createdById', as: 'createdBy' });

// ── Project ───────────────────────────────────────────────────────────────────
Project.belongsTo(User, { foreignKey: 'ownerId', as: 'owner' });
Project.belongsTo(User, { foreignKey: 'managerId', as: 'projectManager' });
Project.belongsTo(User, { foreignKey: 'createdById', as: 'createdBy' });
Project.belongsTo(User, { foreignKey: 'billedById', as: 'billedBy' });
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

// ── CSAT Models ───────────────────────────────────────────────────────────────
const ClientOrganisation = require('./csat/ClientOrganisation');
const ClientEmployee = require('./csat/ClientEmployee');
const Survey = require('./csat/Survey');
const SurveyQuestion = require('./csat/SurveyQuestion');
const SurveyDispatch = require('./csat/SurveyDispatch');
const SurveyRecipient = require('./csat/SurveyRecipient');
const SurveyResponse = require('./csat/SurveyResponse');
const SurveyDispatchApproval = require('./csat/SurveyDispatchApproval');
const SurveyDispatchApprovalFeedback = require('./csat/SurveyDispatchApprovalFeedback');

// ── ClientOrganisation ────────────────────────────────────────────────────────
ClientOrganisation.belongsTo(User, { foreignKey: 'createdById', as: 'createdBy' });
ClientOrganisation.belongsTo(User, { foreignKey: 'managedById', as: 'managedBy' });
ClientOrganisation.hasMany(ClientEmployee, { foreignKey: 'clientOrganisationId', as: 'employees', onDelete: 'CASCADE' });

// ── ClientEmployee ────────────────────────────────────────────────────────────
ClientEmployee.belongsTo(ClientOrganisation, { foreignKey: 'clientOrganisationId', as: 'organisation' });
ClientEmployee.hasMany(SurveyRecipient, { foreignKey: 'clientEmployeeId', as: 'surveyRecipients' });

// ── Survey ────────────────────────────────────────────────────────────────────
Survey.belongsTo(User, { foreignKey: 'createdById', as: 'createdBy' });
Survey.hasMany(SurveyQuestion, { foreignKey: 'surveyId', as: 'questions', onDelete: 'CASCADE' });
Survey.hasMany(SurveyDispatch, { foreignKey: 'surveyId', as: 'dispatches' });

// ── SurveyQuestion ────────────────────────────────────────────────────────────
SurveyQuestion.belongsTo(Survey, { foreignKey: 'surveyId', as: 'survey' });
SurveyQuestion.hasMany(SurveyResponse, { foreignKey: 'surveyQuestionId', as: 'responses' });

// ── SurveyDispatch ────────────────────────────────────────────────────────────
SurveyDispatch.belongsTo(Survey, { foreignKey: 'surveyId', as: 'survey' });
SurveyDispatch.belongsTo(ClientOrganisation, { foreignKey: 'clientOrganisationId', as: 'clientOrganisation' });
SurveyDispatch.belongsTo(User, { foreignKey: 'sentById', as: 'sentBy' });
// Self-referencing: parent dispatch (recurring) ↔ child dispatches
SurveyDispatch.belongsTo(SurveyDispatch, { foreignKey: 'parentDispatchId', as: 'parentDispatch' });
SurveyDispatch.hasMany(SurveyDispatch, { foreignKey: 'parentDispatchId', as: 'childDispatches' });
SurveyDispatch.hasMany(SurveyRecipient, { foreignKey: 'surveyDispatchId', as: 'recipients', onDelete: 'CASCADE' });

// ── SurveyRecipient ───────────────────────────────────────────────────────────
SurveyRecipient.belongsTo(SurveyDispatch, { foreignKey: 'surveyDispatchId', as: 'dispatch' });
SurveyRecipient.belongsTo(ClientEmployee, { foreignKey: 'clientEmployeeId', as: 'employee' });
SurveyRecipient.hasMany(SurveyResponse, { foreignKey: 'surveyRecipientId', as: 'responses', onDelete: 'CASCADE' });

// ── SurveyResponse ────────────────────────────────────────────────────────────
SurveyResponse.belongsTo(SurveyRecipient, { foreignKey: 'surveyRecipientId', as: 'recipient' });
SurveyResponse.belongsTo(SurveyQuestion, { foreignKey: 'surveyQuestionId', as: 'question' });

// ── SurveyDispatchApproval ────────────────────────────────────────────────────
SurveyDispatch.hasMany(SurveyDispatchApproval, { foreignKey: 'surveyDispatchId', as: 'approvals' });
SurveyDispatchApproval.belongsTo(SurveyDispatch, { foreignKey: 'surveyDispatchId', as: 'dispatch' });
SurveyDispatchApproval.belongsTo(User, { foreignKey: 'requestedById', as: 'requestedBy' });
SurveyDispatchApproval.belongsTo(User, { foreignKey: 'reviewedById', as: 'reviewedBy' });
SurveyDispatchApproval.hasMany(SurveyDispatchApprovalFeedback, { foreignKey: 'surveyDispatchApprovalId', as: 'feedbacks' });
SurveyDispatchApprovalFeedback.belongsTo(SurveyDispatchApproval, { foreignKey: 'surveyDispatchApprovalId', as: 'approval' });
SurveyDispatchApprovalFeedback.belongsTo(SurveyQuestion, { foreignKey: 'surveyQuestionId', as: 'question' });

// ── Rostering Models ──────────────────────────────────────────────────────────
const RosterWeek = require('./roster/RosterWeek');
const RosterEntry = require('./roster/RosterEntry');
const RosterCompOff = require('./roster/RosterCompOff');
const RosterSwapRequest = require('./roster/RosterSwapRequest');
const RosterSettings = require('./roster/RosterSettings');
const RosterHoliday = require('./roster/RosterHoliday');
const RosterLeave = require('./roster/RosterLeave');
const RosterEntryChange = require('./roster/RosterEntryChange');

RosterWeek.belongsTo(User, { foreignKey: 'createdById', as: 'createdBy' });
RosterWeek.hasMany(RosterEntry, { foreignKey: 'rosterWeekId', as: 'entries', onDelete: 'CASCADE' });

RosterEntry.belongsTo(RosterWeek, { foreignKey: 'rosterWeekId', as: 'week' });
RosterEntry.belongsTo(User, { foreignKey: 'employeeId', as: 'employee' });
RosterEntry.belongsTo(User, { foreignKey: 'managerId', as: 'manager' });
RosterEntry.belongsTo(User, { foreignKey: 'changedById', as: 'changedBy' });
RosterEntry.belongsTo(User, { foreignKey: 'publishedById', as: 'publishedBy' });

RosterCompOff.belongsTo(User, { foreignKey: 'employeeId', as: 'employee' });
RosterCompOff.belongsTo(User, { foreignKey: 'grantedById', as: 'grantedBy' });
RosterCompOff.belongsTo(RosterEntry, { foreignKey: 'rosterEntryId', as: 'rosterEntry' });

RosterSwapRequest.belongsTo(RosterWeek, { foreignKey: 'rosterWeekId', as: 'week' });
RosterSwapRequest.belongsTo(User, { foreignKey: 'requesterId', as: 'requester' });
RosterSwapRequest.belongsTo(User, { foreignKey: 'targetId', as: 'target' });
RosterSwapRequest.belongsTo(User, { foreignKey: 'decidedById', as: 'decidedBy' });
RosterSwapRequest.belongsTo(RosterEntry, { foreignKey: 'requesterEntryId', as: 'requesterEntry' });
RosterSwapRequest.belongsTo(RosterEntry, { foreignKey: 'targetEntryId', as: 'targetEntry' });

RosterHoliday.belongsTo(User, { foreignKey: 'createdById', as: 'createdBy' });
RosterLeave.belongsTo(User, { foreignKey: 'employeeId', as: 'employee' });
RosterLeave.belongsTo(User, { foreignKey: 'createdById', as: 'createdBy' });

RosterEntry.hasMany(RosterEntryChange, { foreignKey: 'rosterEntryId', as: 'changes', onDelete: 'CASCADE' });
RosterEntryChange.belongsTo(RosterEntry, { foreignKey: 'rosterEntryId', as: 'entry' });
RosterEntryChange.belongsTo(User, { foreignKey: 'changedById', as: 'changedBy' });

// Export PM models so other files can import from associations
module.exports = {
  Project, ProjectMember, Milestone, Task, DailyStatusLog, ProjectNotificationRecipient, PmSettings,
  // CSAT
  ClientOrganisation, ClientEmployee, Survey, SurveyQuestion,
  SurveyDispatch, SurveyRecipient, SurveyResponse,
  SurveyDispatchApproval, SurveyDispatchApprovalFeedback,
  // Rostering
  RosterWeek, RosterEntry, RosterCompOff, RosterSwapRequest,
  RosterSettings, RosterHoliday, RosterLeave, RosterEntryChange,
  // Auth
  LoginOtp,
};
