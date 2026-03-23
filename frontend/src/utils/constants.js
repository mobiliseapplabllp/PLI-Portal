export const ROLES = {
  EMPLOYEE: 'employee',
  MANAGER: 'manager',
  ADMIN: 'admin',
};

export const KPI_STATUS = {
  DRAFT: 'draft',
  ASSIGNED: 'assigned',
  EMPLOYEE_SUBMITTED: 'employee_submitted',
  MANAGER_REVIEWED: 'manager_reviewed',
  FINAL_REVIEWED: 'final_reviewed',
  LOCKED: 'locked',
};

export const KPI_STATUS_LABELS = {
  draft: 'Draft',
  assigned: 'Assigned',
  employee_submitted: 'Employee Submitted',
  manager_reviewed: 'Manager Reviewed',
  final_reviewed: 'Final Reviewed',
  locked: 'Locked',
};

export const KPI_STATUS_COLORS = {
  draft: 'bg-gray-100 text-gray-700',
  assigned: 'bg-blue-100 text-blue-700',
  employee_submitted: 'bg-yellow-100 text-yellow-700',
  manager_reviewed: 'bg-purple-100 text-purple-700',
  final_reviewed: 'bg-green-100 text-green-700',
  locked: 'bg-red-100 text-red-700',
};

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
 *   Q1 (Apr-Jun) → Q2 visible from June 1st
 *   Q2 (Jul-Sep) → Q3 visible from Sep 1st
 *   Q3 (Oct-Dec) → Q4 visible from Dec 1st
 *   Q4 (Jan-Mar) → next FY Q1 visible from Mar 1st
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
  // Next quarter becomes visible on the 1st of the last month of current quarter
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
    // Determine FY for this quarter
    // Q4 months (1,2,3) belong to the second half of FY
    let fy = currentFY;
    if (q === 'Q1' && currentQuarter === 'Q4') {
      // Next FY's Q1
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
