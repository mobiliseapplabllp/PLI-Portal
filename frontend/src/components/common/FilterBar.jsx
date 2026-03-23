import { MONTHS, FINANCIAL_YEARS } from '../../utils/constants';

export default function FilterBar({ filters, onChange, showMonth = true, showQuarter = true, showFY = true }) {
  const handleChange = (key, value) => {
    onChange({ ...filters, [key]: value });
  };

  return (
    <div className="flex flex-wrap gap-3 mb-4">
      {showFY && (
        <select
          value={filters.financialYear || ''}
          onChange={(e) => handleChange('financialYear', e.target.value)}
          className="input-field w-40"
        >
          <option value="">Select FY</option>
          {FINANCIAL_YEARS.map((fy) => (
            <option key={fy} value={fy}>FY {fy}</option>
          ))}
        </select>
      )}
      {showMonth && (
        <select
          value={filters.month || ''}
          onChange={(e) => handleChange('month', e.target.value)}
          className="input-field w-40"
        >
          <option value="">All Months</option>
          {MONTHS.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      )}
      {showQuarter && (
        <select
          value={filters.quarter || ''}
          onChange={(e) => handleChange('quarter', e.target.value)}
          className="input-field w-32"
        >
          <option value="">All Quarters</option>
          <option value="Q1">Q1 (Apr-Jun)</option>
          <option value="Q2">Q2 (Jul-Sep)</option>
          <option value="Q3">Q3 (Oct-Dec)</option>
          <option value="Q4">Q4 (Jan-Mar)</option>
        </select>
      )}
    </div>
  );
}
