// User roles
const ROLES = {
  EMPLOYEE: 'employee',
  MANAGER: 'manager',
  ADMIN: 'admin',
};

// KPI Assignment statuses
const KPI_STATUS = {
  DRAFT: 'draft',
  ASSIGNED: 'assigned',
  EMPLOYEE_SUBMITTED: 'employee_submitted',
  MANAGER_REVIEWED: 'manager_reviewed',
  FINAL_REVIEWED: 'final_reviewed',
  LOCKED: 'locked',
};

// Valid status transitions
const STATUS_TRANSITIONS = {
  [KPI_STATUS.DRAFT]: [KPI_STATUS.ASSIGNED],
  [KPI_STATUS.ASSIGNED]: [KPI_STATUS.EMPLOYEE_SUBMITTED],
  [KPI_STATUS.EMPLOYEE_SUBMITTED]: [KPI_STATUS.MANAGER_REVIEWED],
  [KPI_STATUS.MANAGER_REVIEWED]: [KPI_STATUS.FINAL_REVIEWED],
  [KPI_STATUS.FINAL_REVIEWED]: [KPI_STATUS.LOCKED],
  [KPI_STATUS.LOCKED]: [KPI_STATUS.FINAL_REVIEWED], // unlock
};

// Reopen: allows admin to send a locked/final_reviewed/manager_reviewed assignment
// back to any earlier status for re-evaluation
const REOPEN_ALLOWED_FROM = [
  KPI_STATUS.LOCKED,
  KPI_STATUS.FINAL_REVIEWED,
  KPI_STATUS.MANAGER_REVIEWED,
];
const REOPEN_ALLOWED_TO = [
  KPI_STATUS.ASSIGNED,
  KPI_STATUS.EMPLOYEE_SUBMITTED,
  KPI_STATUS.MANAGER_REVIEWED,
  KPI_STATUS.FINAL_REVIEWED,
];

// Appraisal cycle statuses
const CYCLE_STATUS = {
  DRAFT: 'draft',
  OPEN: 'open',
  CLOSED: 'closed',
  LOCKED: 'locked',
};

// KPI categories
const KPI_CATEGORIES = ['Financial', 'Operational', 'Quality', 'Compliance', 'Development', 'Other'];

// KPI units
const KPI_UNITS = ['Number', 'Percentage', 'Currency', 'Rating', 'Boolean', 'Days', 'Hours', 'Other'];

// Notification types
const NOTIFICATION_TYPES = {
  KPI_ASSIGNED: 'kpi_assigned',
  EMPLOYEE_SUBMITTED: 'employee_submitted',
  MANAGER_REVIEWED: 'manager_reviewed',
  FINAL_REVIEWED: 'final_reviewed',
  RECORD_LOCKED: 'record_locked',
  RECORD_UNLOCKED: 'record_unlocked',
  CYCLE_DEADLINE: 'cycle_deadline',
};

// Audit actions
const AUDIT_ACTIONS = {
  CREATED: 'created',
  UPDATED: 'updated',
  DELETED: 'deleted',
  SUBMITTED: 'submitted',
  REVIEWED: 'reviewed',
  FINAL_REVIEWED: 'final_reviewed',
  LOCKED: 'locked',
  UNLOCKED: 'unlocked',
  LOGIN: 'login',
  PASSWORD_CHANGED: 'password_changed',
};

// Quarter mapping: month number -> quarter
const QUARTER_MAP = {
  4: 'Q1', 5: 'Q1', 6: 'Q1',
  7: 'Q2', 8: 'Q2', 9: 'Q2',
  10: 'Q3', 11: 'Q3', 12: 'Q3',
  1: 'Q4', 2: 'Q4', 3: 'Q4',
};

// Quarter to months mapping
const QUARTER_MONTHS = {
  Q1: [4, 5, 6],
  Q2: [7, 8, 9],
  Q3: [10, 11, 12],
  Q4: [1, 2, 3],
};

module.exports = {
  ROLES,
  KPI_STATUS,
  STATUS_TRANSITIONS,
  REOPEN_ALLOWED_FROM,
  REOPEN_ALLOWED_TO,
  CYCLE_STATUS,
  KPI_CATEGORIES,
  KPI_UNITS,
  NOTIFICATION_TYPES,
  AUDIT_ACTIONS,
  QUARTER_MAP,
  QUARTER_MONTHS,
};
