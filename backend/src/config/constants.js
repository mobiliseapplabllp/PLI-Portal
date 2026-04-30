// User roles
const ROLES = {
  EMPLOYEE: 'employee',
  MANAGER: 'manager',
  SENIOR_MANAGER: 'senior_manager',
  HR_ADMIN: 'hr_admin',
  FINAL_APPROVER: 'final_approver',
  ADMIN: 'admin',
};

// KPI Assignment statuses
const KPI_STATUS = {
  DRAFT: 'draft',
  ASSIGNED: 'assigned',
  COMMITMENT_SUBMITTED: 'commitment_submitted',
  COMMITMENT_APPROVED: 'commitment_approved',   // manager approved the commitment
  EMPLOYEE_SUBMITTED: 'employee_submitted',
  MANAGER_REVIEWED: 'manager_reviewed',
  FINAL_REVIEWED: 'final_reviewed',   // kept for backward-compat with legacy DB records
  FINAL_APPROVED: 'final_approved',   // renamed from FINAL_REVIEWED for new records
  LOCKED: 'locked',
};

// Valid status transitions
const STATUS_TRANSITIONS = {
  [KPI_STATUS.DRAFT]: [KPI_STATUS.ASSIGNED],
  [KPI_STATUS.ASSIGNED]: [KPI_STATUS.COMMITMENT_SUBMITTED],
  // manager approve → commitment_approved; manager reject → back to assigned (handled in service)
  [KPI_STATUS.COMMITMENT_SUBMITTED]: [KPI_STATUS.COMMITMENT_APPROVED, KPI_STATUS.ASSIGNED],
  [KPI_STATUS.COMMITMENT_APPROVED]: [KPI_STATUS.EMPLOYEE_SUBMITTED],
  [KPI_STATUS.EMPLOYEE_SUBMITTED]: [KPI_STATUS.MANAGER_REVIEWED],
  [KPI_STATUS.MANAGER_REVIEWED]: [KPI_STATUS.FINAL_APPROVED],
  [KPI_STATUS.FINAL_APPROVED]: [KPI_STATUS.LOCKED],
  [KPI_STATUS.LOCKED]: [KPI_STATUS.FINAL_APPROVED], // unlock
  // legacy: allow unlocking old final_reviewed records too
  [KPI_STATUS.FINAL_REVIEWED]: [KPI_STATUS.LOCKED],
};

// Reopen: admin can send an assignment back to any earlier status for re-evaluation
const REOPEN_ALLOWED_FROM = [
  KPI_STATUS.LOCKED,
  KPI_STATUS.FINAL_APPROVED,
  KPI_STATUS.FINAL_REVIEWED, // legacy
  KPI_STATUS.MANAGER_REVIEWED,
  KPI_STATUS.EMPLOYEE_SUBMITTED,
  KPI_STATUS.COMMITMENT_APPROVED,
  KPI_STATUS.COMMITMENT_SUBMITTED,
];
const REOPEN_ALLOWED_TO = [
  KPI_STATUS.ASSIGNED,
  KPI_STATUS.COMMITMENT_SUBMITTED,
  KPI_STATUS.EMPLOYEE_SUBMITTED,
  KPI_STATUS.MANAGER_REVIEWED,
  KPI_STATUS.FINAL_APPROVED,
];

// Appraisal cycle statuses
const CYCLE_STATUS = {
  DRAFT: 'draft',
  OPEN: 'open',
  CLOSED: 'closed',
  LOCKED: 'locked',
};

// KPI Plan heads (tabs)
const KPI_HEADS = ['Performance', 'CustomerCentric', 'CoreValues', 'Trainings'];
const KPI_HEAD_LABELS = {
  Performance: 'Productivity',
  CustomerCentric: 'Client Focus',
  CoreValues: 'Company Core Values',
  Trainings: 'Personal Growth',
};
const DEFAULT_HEAD_WEIGHTAGES = { Performance: 40, CustomerCentric: 30, CoreValues: 20, Trainings: 10 };

// KPI Plan statuses (workflow before publishing)
const KPI_PLAN_STATUS = {
  DRAFT: 'draft',
  SAVED: 'saved',
  READY_FOR_REVIEW: 'ready_for_review',
};

// Assigned-to options for KPI items
const KPI_ASSIGNED_TO = ['leader', 'team_member'];

// KPI categories
const KPI_CATEGORIES = ['Financial', 'Operational', 'Quality', 'Compliance', 'Development', 'Other'];

// KPI units
const KPI_UNITS = ['Number', 'Percentage', 'Currency', 'Rating', 'Boolean', 'Days', 'Hours', 'Other'];

// Submission statuses used by employee and manager per KPI item
const KPI_SUBMISSION_STATUS = {
  MEETS: 'Meets',
  EXCEEDS: 'Exceeds',
  BELOW: 'Below',
};
const KPI_SUBMISSION_VALUES = Object.values(KPI_SUBMISSION_STATUS);

// Notification types
const NOTIFICATION_TYPES = {
  KPI_ASSIGNED: 'kpi_assigned',
  COMMITMENT_SUBMITTED: 'commitment_submitted',
  EMPLOYEE_SUBMITTED: 'employee_submitted',
  MANAGER_REVIEWED: 'manager_reviewed',
  FINAL_REVIEWED: 'final_reviewed',   // kept for old notification records
  FINAL_APPROVED: 'final_approved',
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
  COMMITTED: 'committed',
  REVIEWED: 'reviewed',
  FINAL_REVIEWED: 'final_reviewed',   // kept for old audit records
  FINAL_APPROVED: 'final_approved',
  LOCKED: 'locked',
  UNLOCKED: 'unlocked',
  REOPENED: 'reopened',
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
  KPI_HEADS,
  KPI_HEAD_LABELS,
  DEFAULT_HEAD_WEIGHTAGES,
  KPI_PLAN_STATUS,
  KPI_ASSIGNED_TO,
  KPI_STATUS,
  STATUS_TRANSITIONS,
  REOPEN_ALLOWED_FROM,
  REOPEN_ALLOWED_TO,
  CYCLE_STATUS,
  KPI_CATEGORIES,
  KPI_UNITS,
  KPI_SUBMISSION_STATUS,
  KPI_SUBMISSION_VALUES,
  NOTIFICATION_TYPES,
  AUDIT_ACTIONS,
  QUARTER_MAP,
  QUARTER_MONTHS,
};
