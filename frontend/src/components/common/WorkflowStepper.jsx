/**
 * WorkflowStepper — Horizontal progress indicator showing assignment status pipeline.
 * compact=true → icon-only strip for table rows
 * compact=false → full labeled stepper (default)
 */

const STEPS = [
  { key: 'draft',                label: 'Draft',       shortLabel: 'D' },
  { key: 'assigned',             label: 'Assigned',    shortLabel: 'A' },
  { key: 'commitment_submitted', label: 'Committed',   shortLabel: 'C' },
  { key: 'commitment_approved',  label: 'Approved',    shortLabel: 'CA' },
  { key: 'employee_submitted',   label: 'Self Assessment', shortLabel: 'SA' },
  { key: 'manager_reviewed',     label: 'Manager Review',  shortLabel: 'MR' },
  { key: 'final_approved',       label: 'Final Review', shortLabel: 'FR' },
  { key: 'locked',               label: 'Locked',      shortLabel: '🔒' },
];

// Legacy support: treat 'final_reviewed' same as 'final_approved'
const LEGACY_ALIAS = { final_reviewed: 'final_approved' };

const getStepIndex = (status) => {
  const normalized = LEGACY_ALIAS[status] || status;
  return STEPS.findIndex((s) => s.key === normalized);
};

export default function WorkflowStepper({ status, compact = false }) {
  const activeIndex = getStepIndex(status);

  if (compact) {
    return (
      <div className="flex items-center gap-0.5">
        {STEPS.map((step, idx) => {
          const done = idx < activeIndex;
          const active = idx === activeIndex;
          return (
            <div
              key={step.key}
              title={step.label}
              className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold
                ${done
                  ? 'bg-primary-600 text-white'
                  : active
                  ? 'bg-primary-200 text-primary-800 ring-2 ring-primary-400'
                  : 'bg-gray-100 text-gray-300'
                }`}
            >
              {done ? '✓' : step.shortLabel}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex items-center w-full overflow-x-auto">
      {STEPS.map((step, idx) => {
        const done = idx < activeIndex;
        const active = idx === activeIndex;
        const isLast = idx === STEPS.length - 1;

        return (
          <div key={step.key} className="flex items-center flex-1 min-w-0">
            {/* Step circle */}
            <div className="flex flex-col items-center flex-shrink-0">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all
                  ${done
                    ? 'bg-primary-600 text-white'
                    : active
                    ? 'bg-primary-100 text-primary-700 ring-2 ring-primary-400 ring-offset-1'
                    : 'bg-gray-100 text-gray-400 border-2 border-dashed border-gray-300'
                  }`}
              >
                {done ? '✓' : idx + 1}
              </div>
              <span
                className={`mt-1 text-[10px] text-center leading-tight max-w-[68px] break-words
                  ${done ? 'text-primary-600 font-medium' : active ? 'text-primary-700 font-semibold' : 'text-gray-400'}`}
              >
                {step.label}
              </span>
            </div>

            {/* Connector line */}
            {!isLast && (
              <div className={`h-0.5 flex-1 mx-1 ${done ? 'bg-primary-400' : 'bg-gray-200'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
