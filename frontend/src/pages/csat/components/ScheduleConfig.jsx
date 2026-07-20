// Returns scheduling config object via onChange(config)

const MODES = [
  { key: 'instant', label: 'Send Now', desc: 'Emails are dispatched immediately' },
  { key: 'scheduled', label: 'Schedule', desc: 'Send at a specific date and time' },
  { key: 'recurring', label: 'Recurring', desc: 'Repeat on a weekly, monthly, or quarterly schedule' },
];

const PATTERNS = [
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'quarterly', label: 'Quarterly (every 3 months)' },
];

// local datetime string → ISO string for API
function toIso(val) {
  if (!val) return null;
  return new Date(val).toISOString();
}

export default function ScheduleConfig({ value, onChange }) {
  const cfg = value || {};
  const mode = cfg.dispatchMode || 'instant';

  const set = (patch) => onChange({ ...cfg, ...patch });

  return (
    <div className="space-y-4">
      {/* Mode selector */}
      <div className="grid grid-cols-3 gap-2">
        {MODES.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => set({ dispatchMode: m.key })}
            className={`p-3 rounded-xl border-2 text-left transition-colors ${
              mode === m.key
                ? 'border-emerald-500 bg-emerald-50'
                : 'border-gray-200 hover:border-gray-300 bg-white'
            }`}
          >
            <p className={`text-sm font-semibold ${mode === m.key ? 'text-emerald-700' : 'text-gray-700'}`}>
              {m.label}
            </p>
            <p className="text-xs text-gray-400 mt-0.5 leading-tight">{m.desc}</p>
          </button>
        ))}
      </div>

      {/* Scheduled — datetime picker */}
      {mode === 'scheduled' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Send date & time *</label>
          <input
            type="datetime-local"
            value={cfg.scheduledAt ? cfg.scheduledAt.slice(0, 16) : ''}
            onChange={(e) => set({ scheduledAt: toIso(e.target.value) })}
            min={new Date().toISOString().slice(0, 16)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      )}

      {/* Recurring — pattern + start + end */}
      {mode === 'recurring' && (
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Recurrence pattern *</label>
            <div className="flex gap-2 flex-wrap">
              {PATTERNS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => set({ recurrencePattern: p.key })}
                  className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                    cfg.recurrencePattern === p.key
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                      : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">First dispatch date *</label>
              <input
                type="datetime-local"
                value={cfg.scheduledAt ? cfg.scheduledAt.slice(0, 16) : ''}
                onChange={(e) => set({ scheduledAt: toIso(e.target.value) })}
                min={new Date().toISOString().slice(0, 16)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                End date <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="datetime-local"
                value={cfg.recurrenceEndAt ? cfg.recurrenceEndAt.slice(0, 16) : ''}
                onChange={(e) => set({ recurrenceEndAt: e.target.value ? toIso(e.target.value) : null })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <p className="text-xs text-gray-400 mt-0.5">Leave blank to repeat indefinitely</p>
            </div>
          </div>
        </div>
      )}

      {/* Common options for all modes */}
      <div className="grid grid-cols-2 gap-3 pt-1 border-t border-gray-100">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Expiry date <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            type="datetime-local"
            value={cfg.expiresAt ? cfg.expiresAt.slice(0, 16) : ''}
            onChange={(e) => set({ expiresAt: e.target.value ? toIso(e.target.value) : null })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <p className="text-xs text-gray-400 mt-0.5">Link expires after this date</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Reminder after <span className="text-gray-400 font-normal">(days, optional)</span>
          </label>
          <input
            type="number"
            value={cfg.reminderDays || ''}
            onChange={(e) => set({ reminderDays: e.target.value ? parseInt(e.target.value) : null })}
            min={1}
            max={30}
            placeholder="e.g. 3"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <p className="text-xs text-gray-400 mt-0.5">Auto-reminder to non-responders</p>
        </div>
      </div>
    </div>
  );
}
