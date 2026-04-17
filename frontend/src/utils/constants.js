export const ROLES = {
  EMPLOYEE: 'employee',
  MANAGER: 'manager',
  HR_ADMIN: 'hr_admin',
  FINAL_APPROVER: 'final_approver',
  ADMIN: 'admin',
};

export const KPI_STATUS = {
  DRAFT: 'draft',
  ASSIGNED: 'assigned',
  COMMITMENT_SUBMITTED: 'commitment_submitted',  // NEW
  EMPLOYEE_SUBMITTED: 'employee_submitted',
  MANAGER_REVIEWED: 'manager_reviewed',
  FINAL_APPROVED: 'final_approved',              // renamed from FINAL_REVIEWED
  FINAL_REVIEWED: 'final_reviewed',              // kept for legacy data display
  LOCKED: 'locked',
};

export const KPI_STATUS_LABELS = {
  draft: 'Draft',
  assigned: 'Assigned',
  commitment_submitted: 'Commitment Submitted',   // NEW
  employee_submitted: 'Employee Submitted',
  manager_reviewed: 'Manager Reviewed',
  final_approved: 'Final Approved',               // NEW
  final_reviewed: 'Final Reviewed',               // legacy label
  locked: 'Locked',
};

export const KPI_STATUS_COLORS = {
  draft: 'bg-gray-100 text-gray-700',
  assigned: 'bg-blue-100 text-blue-700',
  commitment_submitted: 'bg-sky-100 text-sky-700',  // NEW — light blue, distinct from assigned
  employee_submitted: 'bg-yellow-100 text-yellow-700',
  manager_reviewed: 'bg-purple-100 text-purple-700',
  final_approved: 'bg-emerald-100 text-emerald-700',  // NEW — same visual weight as old final_reviewed
  final_reviewed: 'bg-green-100 text-green-700',      // legacy
  locked: 'bg-red-100 text-red-700',
};

// KPI submission status values (Meets / Exceeds / Below)
export const KPI_SUBMISSION_STATUS = {
  MEETS: 'Meets',
  EXCEEDS: 'Exceeds',
  BELOW: 'Below',
};
export const KPI_SUBMISSION_VALUES = ['Meets', 'Exceeds', 'Below'];

export const CYCLE_STATUS_COLORS = {
  draft: 'bg-gray-100 text-gray-700',
  open: 'bg-green-100 text-green-700',
  closed: 'bg-yellow-100 text-yellow-700',
  locked: 'bg-red-100 text-red-700',
};

export const QUARTER_MAP = {
  4: 'Q1', 5: 'Q1', 6: 'Q1',
  7: 'Q2', 8: 'Q2', 9: 'Q2',
  10: 'Q3', 11: 'Q3', 12: 'Q3',
  1: 'Q4', 2: 'Q4', 3: 'Q4',
};

export const MONTHS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
];

// Financial years available in dropdowns
export const FINANCIAL_YEARS = [
  '2024-25',
  '2025-26',
  '2026-27',
];

/**
 * Get current financial year string based on today's date
 */
export function getCurrentFinancialYear(now = new Date()) {
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const fyStart = month >= 4 ? year : year - 1;
  return `${fyStart}-${String(fyStart + 1).slice(2)}`;
}

export const KPI_CATEGORIES = ['Financial', 'Operational', 'Quality', 'Compliance', 'Development', 'Other'];
export const KPI_UNITS = ['Number', 'Percentage', 'Currency', 'Rating', 'Boolean', 'Days', 'Hours', 'Other'];

/**
 * Quarter visibility rules:
 * - Current quarter is always visible
 * - Next quarter becomes visible on the 1st of the last month of the current quarter
 *
 * Returns array of { month, quarter, financialYear } objects for visible months.
 */
export const QUARTER_MONTHS = {
  Q1: [4, 5, 6],
  Q2: [7, 8, 9],
  Q3: [10, 11, 12],
  Q4: [1, 2, 3],
};

export function getVisibleQuarters(now = new Date()) {
  const currentMonth = now.getMonth() + 1; // 1-12
  const currentYear = now.getFullYear();

  // Determine current FY
  const fyStart = currentMonth >= 4 ? currentYear : currentYear - 1;
  const currentFY = `${fyStart}-${String(fyStart + 1).slice(2)}`;
  const nextFYStart = fyStart + 1;
  const nextFY = `${nextFYStart}-${String(nextFYStart + 1).slice(2)}`;

  const currentQuarter = QUARTER_MAP[currentMonth];

  // Determine if next quarter is visible
  const currentQMonths = QUARTER_MONTHS[currentQuarter];
  const lastMonthOfCurrentQ = currentQMonths[currentQMonths.length - 1];
  const nextQuarterVisible = currentMonth >= lastMonthOfCurrentQ;

  const quarters = [currentQuarter]; // current always visible
  if (nextQuarterVisible) {
    const qOrder = ['Q1', 'Q2', 'Q3', 'Q4'];
    const nextQIdx = (qOrder.indexOf(currentQuarter) + 1) % 4;
    quarters.push(qOrder[nextQIdx]);
  }

  // Build visible months with FY info
  const visible = [];
  for (const q of quarters) {
    const months = QUARTER_MONTHS[q];
    let fy = currentFY;
    if (q === 'Q1' && currentQuarter === 'Q4') {
      fy = nextFY;
    }
    for (const m of months) {
      visible.push({ month: m, quarter: q, financialYear: fy });
    }
  }

  return { visibleMonths: visible, quarters, currentFY, currentQuarter };
}

/**
 * Filter MONTHS array to only include visible months
 */
export function getVisibleMonthOptions(now = new Date()) {
  const { visibleMonths } = getVisibleQuarters(now);
  const visibleMonthNumbers = visibleMonths.map((v) => v.month);
  return MONTHS.filter((m) => visibleMonthNumbers.includes(m.value));
}

/**
 * Role display config — used by Sidebar for accent colours and labels
 */
export const ROLE_CONFIG = {
  employee:       { label: 'Employee Portal',       accentClass: 'from-primary-600 to-primary-700' },
  manager:        { label: 'Manager Portal',         accentClass: 'from-indigo-600 to-indigo-700' },
  hr_admin:       { label: 'HR Admin Portal',        accentClass: 'from-violet-600 to-violet-700' },
  final_approver: { label: 'Final Approver Portal',  accentClass: 'from-cyan-700 to-cyan-800' },
  admin:          { label: 'Admin Portal',            accentClass: 'from-gray-700 to-gray-800' },
};
