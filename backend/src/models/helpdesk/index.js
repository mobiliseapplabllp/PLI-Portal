/**
 * Helpdesk Models â€” barrel export + association setup.
 *
 * Import this module once (e.g. in app.js or the helpdesk router) to register
 * all associations. Individual models can still be required directly.
 *
 * Associations summary:
 *   HdTicket       hasMany  HdConversation, HdTicketHistory, HdTicketAssignee, HdTicketApproval, HdTask, HdAttachment
 *   HdGroup        hasMany  HdTicket
 *   HdProject      hasMany  HdTicket
 *   HdConversation hasMany  HdAttachment
 */

const HdGroup           = require('./HdGroup');
const HdProject         = require('./HdProject');
const HdTicket          = require('./HdTicket');
const HdConversation    = require('./HdConversation');
const HdTicketHistory   = require('./HdTicketHistory');
const HdTicketAssignee  = require('./HdTicketAssignee');
const HdTicketApproval  = require('./HdTicketApproval');
const HdTask            = require('./HdTask');
const HdSolution        = require('./HdSolution');
const HdAnnouncement    = require('./HdAnnouncement');
const HdReminder        = require('./HdReminder');
const HdAttachment      = require('./HdAttachment');
const HdDocument        = require('./HdDocument');
const User              = require('../User');
// PM Project model only depends on config/database — safe to require here without
// pulling in models/associations.js (no circular load).
const Project           = require('../pm/Project');
// Same reasoning: PmAllocationApproval only depends on config/database. The
// approval ↔ ticket link is declared HERE (not in models/associations.js, which
// deliberately never requires the helpdesk models) so nothing loads circularly.
const PmAllocationApproval = require('../pm/PmAllocationApproval');

// â”€â”€ Ticket â†” Group / Project â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
HdGroup.hasMany(HdTicket,   { foreignKey: 'groupId',   as: 'tickets' });
HdTicket.belongsTo(HdGroup, { foreignKey: 'groupId',   as: 'group' });

HdProject.hasMany(HdTicket,    { foreignKey: 'projectId', as: 'tickets' });
HdTicket.belongsTo(HdProject,  { foreignKey: 'projectId', as: 'project' });

// â”€â”€ Project â†” Group (scoped projects per team) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
HdGroup.hasMany(HdProject,   { foreignKey: 'groupId', as: 'projects' });
HdProject.belongsTo(HdGroup, { foreignKey: 'groupId', as: 'group' });

// â”€â”€ Ticket â†” Conversations â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
HdTicket.hasMany(HdConversation,   { foreignKey: 'ticketId', as: 'conversations', onDelete: 'CASCADE' });
HdConversation.belongsTo(HdTicket, { foreignKey: 'ticketId', as: 'ticket' });

// â”€â”€ Ticket â†” History â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
HdTicket.hasMany(HdTicketHistory,   { foreignKey: 'ticketId', as: 'history', onDelete: 'CASCADE' });
HdTicketHistory.belongsTo(HdTicket, { foreignKey: 'ticketId', as: 'ticket' });

// â”€â”€ Ticket â†” Assignees â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
HdTicket.hasMany(HdTicketAssignee,   { foreignKey: 'ticketId', as: 'assignees', onDelete: 'CASCADE' });
HdTicketAssignee.belongsTo(HdTicket, { foreignKey: 'ticketId', as: 'ticket' });

// â”€â”€ Ticket â†” Approvals â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
HdTicket.hasMany(HdTicketApproval,   { foreignKey: 'ticketId', as: 'approvals', onDelete: 'CASCADE' });
HdTicketApproval.belongsTo(HdTicket, { foreignKey: 'ticketId', as: 'ticket' });

// â”€â”€ Ticket â†” Sub-tasks â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
HdTicket.hasMany(HdTask,   { foreignKey: 'ticketId', as: 'tasks', onDelete: 'CASCADE' });
HdTask.belongsTo(HdTicket, { foreignKey: 'ticketId', as: 'ticket' });

// â”€â”€ Ticket â†” Attachments â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
HdTicket.hasMany(HdAttachment,   { foreignKey: 'ticketId', as: 'attachments', onDelete: 'CASCADE' });
HdAttachment.belongsTo(HdTicket, { foreignKey: 'ticketId', as: 'ticket' });

// â”€â”€ Conversation â†” Attachments â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Note: alias is 'files' (not 'attachments') to avoid collision with the
// HdConversation.attachments JSON column of the same name.
HdConversation.hasMany(HdAttachment,   { foreignKey: 'conversationId', as: 'files', onDelete: 'CASCADE' });
HdAttachment.belongsTo(HdConversation, { foreignKey: 'conversationId', as: 'conversation' });

// â”€â”€ Ticket self-referential link â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
HdTicket.belongsTo(HdTicket, { foreignKey: 'linkedTicketId', as: 'linkedTicket' });

// â”€â”€ Ticket â†” PLI User (assignee / requester) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Allows eager-loading user names in ticket lists and detail views.
HdTicket.belongsTo(User, { foreignKey: 'assigneeId',  as: 'assigneeUser',  constraints: false });
HdTicket.belongsTo(User, { foreignKey: 'requesterId', as: 'requesterUser', constraints: false });
// Team owning the ticket = the reporting manager (users.id). Migration 043.
HdTicket.belongsTo(User, { foreignKey: 'teamManagerId', as: 'teamManager', constraints: false });

// ── Ticket / legacy HdProject ↔ PM Project (pm_projects UUID) ──────────────
HdTicket.belongsTo(Project,  { foreignKey: 'pmProjectId', as: 'pmProject', constraints: false });
HdProject.belongsTo(Project, { foreignKey: 'pmProjectId', as: 'pmProject', constraints: false });

// ── Ticket ↔ allocation exception request (migration 047) ──────────────────
// No FK constraints: the approval row outlives the ticket, exactly as the project
// exception rows outlive their member.
PmAllocationApproval.belongsTo(HdTicket, { foreignKey: 'ticketId', as: 'ticket', constraints: false });
HdTicket.hasMany(PmAllocationApproval,   { foreignKey: 'ticketId', as: 'allocationApprovals', constraints: false });

// â”€â”€ Approval â†” PLI User (approver / requestedBy) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
HdTicketApproval.belongsTo(User, { foreignKey: 'approverId',   as: 'approver',          constraints: false });
HdTicketApproval.belongsTo(User, { foreignKey: 'requestedBy',  as: 'requestedByUser',   constraints: false });

// â”€â”€ Task â†” PLI User (assignee) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
HdTask.belongsTo(User, { foreignKey: 'assignedTo', as: 'assigneeUser', constraints: false });

// â”€â”€ Ticket â†” Reminders â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
HdTicket.hasMany(HdReminder, { foreignKey: 'ticketId', as: 'reminders', onDelete: 'CASCADE' });
HdReminder.belongsTo(HdTicket, { foreignKey: 'ticketId', as: 'ticket' });

// ── Ticket ↔ Documents ──────────────────────────────────────────────────────
HdDocument.belongsTo(HdTicket, { foreignKey: 'ticketId', as: 'ticket', constraints: false });
HdDocument.belongsTo(User, { foreignKey: 'uploadedById', as: 'uploadedBy', constraints: false });
HdTicket.hasMany(HdDocument, { foreignKey: 'ticketId', as: 'documents', constraints: false });

// â”€â”€ User â†” HdGroup (helpdesk group assignment) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
User.belongsTo(HdGroup, { foreignKey: 'hdGroupId', as: 'hdGroup',  constraints: false });
HdGroup.hasMany(User,   { foreignKey: 'hdGroupId', as: 'members', constraints: false });

module.exports = {
  HdGroup,
  HdProject,
  HdTicket,
  HdConversation,
  HdTicketHistory,
  HdTicketAssignee,
  HdTicketApproval,
  HdTask,
  HdSolution,
  HdAnnouncement,
  HdReminder,
  HdAttachment,
  HdDocument,
  // Re-export User so consumers can `const { HdTicket, User } = require('.../helpdesk')` if needed
  User,
  // PM Project (aliased as 'pmProject' on HdTicket / HdProject)
  Project,
  // Allocation exception requests (aliased as 'ticket' on the approval)
  PmAllocationApproval,
};
