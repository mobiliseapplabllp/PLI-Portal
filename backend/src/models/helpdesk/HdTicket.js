/**
 * HdTicket — Core helpdesk ticket model.
 * Table: hd_tickets
 *
 * Statuses:   open → in-progress → pending → resolved → closed
 * Priorities: low | medium | high | critical
 */
const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

/** @enum {string} */
const TICKET_STATUS = Object.freeze({
  OPEN:        'open',
  IN_PROGRESS: 'in-progress',
  PENDING:     'pending',
  RESOLVED:    'resolved',
  CLOSED:      'closed',
});

/** @enum {string} */
const TICKET_PRIORITY = Object.freeze({
  LOW:      'low',
  MEDIUM:   'medium',
  HIGH:     'high',
  CRITICAL: 'critical',
});

/** @enum {string} */
const LINK_TYPE = Object.freeze({
  RELATED:    'related',
  DUPLICATE:  'duplicate',
  BLOCKS:     'blocks',
  BLOCKED_BY: 'blocked-by',
});

/** @enum {string} */
const REQUEST_TYPE = Object.freeze({
  INCIDENT:        'Incident',
  SERVICE_REQUEST: 'Service Request',
});

/** @enum {string} */
const MODE = Object.freeze({
  WEB:   'Web Form',
  EMAIL: 'E-Mail',
  PHONE: 'Phone Call',
});

/** @enum {string} */
const IMPACT = Object.freeze({
  LOW:    'Low',
  MEDIUM: 'Medium',
  HIGH:   'High',
});

/** @enum {string} */
const URGENCY = Object.freeze({
  LOW:    'Low',
  MEDIUM: 'Medium',
  HIGH:   'High',
});

const HdTicket = sequelize.define('HdTicket', {
  id: {
    type:          DataTypes.INTEGER,
    primaryKey:    true,
    autoIncrement: true,
  },
  reqNumber: {
    type:      DataTypes.STRING(20),
    allowNull: false,
    unique:    true,
    field:     'req_number',
    comment:   'Human-readable ID e.g. REQ-0001',
  },
  title: {
    type:      DataTypes.STRING(300),
    allowNull: false,
    validate:  { notEmpty: { msg: 'Title is required' }, len: [3, 300] },
  },
  description: {
    type:      DataTypes.TEXT,
    allowNull: true,
  },
  status: {
    type:         DataTypes.ENUM(...Object.values(TICKET_STATUS)),
    allowNull:    false,
    defaultValue: TICKET_STATUS.OPEN,
  },
  priority: {
    type:         DataTypes.ENUM(...Object.values(TICKET_PRIORITY)),
    allowNull:    false,
    defaultValue: TICKET_PRIORITY.MEDIUM,
  },
  category: {
    type:      DataTypes.STRING(100),
    allowNull: true,
  },
  // Ticket classification fields (migrated from original helpdesk)
  requestType: {
    type:      DataTypes.STRING(50),
    allowNull: true,
    field:     'request_type',
  },
  mode: {
    type:      DataTypes.STRING(50),
    allowNull: true,
  },
  impact: {
    type:      DataTypes.STRING(20),
    allowNull: true,
  },
  urgency: {
    type:      DataTypes.STRING(20),
    allowNull: true,
  },
  resolution: {
    type:      DataTypes.TEXT,
    allowNull: true,
    comment:   'Resolved outcome text — filled when ticket is closed/resolved',
  },
  site: {
    type:      DataTypes.STRING(100),
    allowNull: true,
  },
  raisedByTeam: {
    type:      DataTypes.STRING(100),
    allowNull: true,
    field:     'raised_by_team',
  },
  // Referencing PLI Portal users.id (UUID strings)
  requesterId: {
    type:      DataTypes.STRING(36),
    allowNull: true,
    field:     'requester_id',
  },
  assigneeId: {
    type:      DataTypes.STRING(36),
    allowNull: true,
    field:     'assignee_id',
    comment:   'Primary assignee (legacy single-assignee). See hd_ticket_assignees for multi-assignee.',
  },
  groupId: {
    type:      DataTypes.INTEGER,
    allowNull: true,
    field:     'group_id',
    references: { model: 'hd_groups', key: 'id' },
  },
  projectId: {
    type:      DataTypes.INTEGER,
    allowNull: true,
    field:     'project_id',
    references: { model: 'hd_projects', key: 'id' },
  },
  dueDate: {
    type:      DataTypes.DATE,
    allowNull: true,
    field:     'due_date',
  },
  closedAt: {
    type:      DataTypes.DATE,
    allowNull: true,
    field:     'closed_at',
  },
  // Public widget submission fields
  widgetSource: {
    type:         DataTypes.BOOLEAN,
    defaultValue: false,
    field:        'widget_source',
  },
  widgetEmail: {
    type:      DataTypes.STRING(200),
    allowNull: true,
    field:     'widget_email',
    comment:   'Email of unauthenticated widget submitter',
  },
  widgetName: {
    type:      DataTypes.STRING(200),
    allowNull: true,
    field:     'widget_name',
  },
  // SLA
  slaBreached: {
    type:         DataTypes.BOOLEAN,
    defaultValue: false,
    field:        'sla_breached',
  },
  slaBreachAt: {
    type:      DataTypes.DATE,
    allowNull: true,
    field:     'sla_breach_at',
  },
  // Ticket linking
  linkedTicketId: {
    type:      DataTypes.INTEGER,
    allowNull: true,
    field:     'linked_ticket_id',
  },
  linkType: {
    type:      DataTypes.STRING(30),
    allowNull: true,
    field:     'link_type',
    validate:  { isIn: { args: [Object.values(LINK_TYPE)], msg: 'Invalid link type' } },
  },
  reopenCount: {
    type:         DataTypes.INTEGER,
    defaultValue: 0,
    field:        'reopen_count',
  },
}, {
  tableName:  'hd_tickets',
  underscored: true,
  timestamps:  true,
  createdAt:   'created_at',
  updatedAt:   'updated_at',
  hooks: {
    /**
     * Auto-stamp closedAt when status transitions to resolved or closed.
     */
    beforeUpdate(ticket) {
      if (
        ticket.changed('status') &&
        [TICKET_STATUS.RESOLVED, TICKET_STATUS.CLOSED].includes(ticket.status) &&
        !ticket.closedAt
      ) {
        ticket.closedAt = new Date();
      }
    },
  },
});

HdTicket.TICKET_STATUS   = TICKET_STATUS;
HdTicket.TICKET_PRIORITY = TICKET_PRIORITY;
HdTicket.LINK_TYPE       = LINK_TYPE;
HdTicket.REQUEST_TYPE    = REQUEST_TYPE;
HdTicket.MODE            = MODE;
HdTicket.IMPACT          = IMPACT;
HdTicket.URGENCY         = URGENCY;

module.exports = HdTicket;
