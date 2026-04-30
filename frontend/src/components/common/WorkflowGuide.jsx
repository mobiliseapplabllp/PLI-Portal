const WORKFLOW_STEPS = [
  { title: 'KPI Assigned',       desc: 'Plan published and auto-assigned to you',        statusKey: 'assigned' },
  { title: 'Submit Commitment',  desc: 'Commit to target values for the current month',  statusKey: 'commitment_submitted' },
  { title: 'Manager Approves',   desc: 'Manager approves or rejects your commitment',    statusKey: 'commitment_approved' },
  { title: 'Submit Self-Review', desc: 'Rate your achievement: Meets / Exceeds / Below', statusKey: 'employee_submitted' },
  { title: 'Manager Review',     desc: 'Manager rates your actual achievement',           statusKey: 'manager_reviewed' },
  { title: 'Final Approval',     desc: 'Final approver signs off and assigns PLI score',  statusKey: 'final_approved' },
];

const STATUS_ACTIVE_STEP = {
  assigned:             1,
  commitment_submitted: 2,
  commitment_approved:  3,
  employee_submitted:   4,
  manager_reviewed:     5,
  final_approved:       6,
  final_reviewed:       6,
  locked:               6,
};

export default function WorkflowGuide({ status }) {
  const activeIdx = status != null ? (STATUS_ACTIVE_STEP[status] ?? -1) : -1;
  const totalSteps = WORKFLOW_STEPS.length;
  const completedSteps = activeIdx >= totalSteps ? totalSteps : activeIdx >= 0 ? activeIdx : 0;
  const progressPct = Math.round((completedSteps / totalSteps) * 100);

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
      {/* Header + percentage */}
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Monthly KPI Workflow</h3>
        {status && (
          <span className="text-xs font-semibold text-primary-600">{progressPct}% complete</span>
        )}
      </div>

      {/* Progress bar */}
      <div className="w-full h-1.5 bg-gray-100 rounded-full mb-5 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary-400 to-emerald-500 transition-all duration-500"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Steps */}
      <div className="flex items-start w-full overflow-x-auto">
        {WORKFLOW_STEPS.map((step, idx) => {
          const done   = idx < activeIdx || activeIdx >= totalSteps;
          const active = idx === activeIdx;

          return (
            <div key={step.statusKey} className="flex items-start flex-1 min-w-0">
              <div className="flex flex-col items-center flex-shrink-0 w-full">
                {/* Circle + connectors */}
                <div className="flex items-center w-full">
                  <div className={`flex-1 h-0.5 ${idx === 0 ? 'invisible' : done ? 'bg-emerald-400' : 'bg-gray-200'}`} />
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold transition-all duration-300
                    ${done   ? 'bg-emerald-500 text-white shadow-sm'
                    : active ? 'bg-primary-500 text-white ring-4 ring-primary-100 shadow-md'
                             : 'bg-gray-100 text-gray-400 border-2 border-dashed border-gray-300'}`}
                  >
                    {done ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : idx + 1}
                  </div>
                  <div className={`flex-1 h-0.5 ${idx === WORKFLOW_STEPS.length - 1 ? 'invisible' : done ? 'bg-emerald-400' : 'bg-gray-200'}`} />
                </div>

                {/* Label + desc + tag */}
                <div className="mt-2 px-1 text-center w-full">
                  <p className={`text-[11px] font-semibold leading-tight
                    ${done ? 'text-emerald-600' : active ? 'text-primary-700' : 'text-gray-400'}`}>
                    {step.title}
                  </p>
                  <p className={`text-[10px] mt-0.5 leading-tight
                    ${done || active ? 'text-gray-500' : 'text-gray-300'}`}>
                    {step.desc}
                  </p>
                  {(done || active) && (
                    <span className={`inline-block mt-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full
                      ${done ? 'bg-emerald-50 text-emerald-600' : 'bg-primary-50 text-primary-600'}`}>
                      {done ? '✓ Done' : '● In Progress'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
