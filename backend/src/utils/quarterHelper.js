const { QUARTER_MAP, QUARTER_MONTHS } = require('../config/constants');

/**
 * Get quarter from month number (1-12)
 */
const getQuarterFromMonth = (month) => {
  return QUARTER_MAP[month] || null;
};

/**
 * Get months belonging to a quarter
 */
const getMonthsInQuarter = (quarter) => {
  return QUARTER_MONTHS[quarter] || [];
};

/**
 * Get financial year string from a date.
 * FY runs Apr-Mar. April 2026 -> "2026-27", Jan 2027 -> "2026-27"
 */
const getFinancialYear = (date) => {
  const d = new Date(date);
  const month = d.getMonth() + 1; // 1-12
  const year = d.getFullYear();

  if (month >= 4) {
    return `${year}-${String(year + 1).slice(2)}`;
  } else {
    return `${year - 1}-${String(year).slice(2)}`;
  }
};

/**
 * Get financial year and quarter from a date
 */
const getFYAndQuarter = (date) => {
  const d = new Date(date);
  const month = d.getMonth() + 1;
  return {
    financialYear: getFinancialYear(date),
    quarter: getQuarterFromMonth(month),
    month,
  };
};

/**
 * Get month name from number
 */
const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const getMonthName = (month) => MONTH_NAMES[month] || '';

module.exports = {
  getQuarterFromMonth,
  getMonthsInQuarter,
  getFinancialYear,
  getFYAndQuarter,
  getMonthName,
};
