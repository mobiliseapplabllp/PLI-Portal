import { useEffect, useRef, useState } from 'react';
import { checkProjectNameApi } from '../../api/pm/projects.api';

/**
 * useProjectNameCheck — live duplicate-name check for the create/edit forms.
 * The server enforces uniqueness (409); this only warns before Save.
 * Returns { taken, message, checking }.
 */
export function useProjectNameCheck(name, excludeId) {
  const [state, setState] = useState({ taken: false, message: '', checking: false });
  const seq = useRef(0);

  useEffect(() => {
    const clean = String(name ?? '').trim();
    if (clean.length < 2) { setState({ taken: false, message: '', checking: false }); return undefined; }
    const mine = ++seq.current;
    setState(s => ({ ...s, checking: true }));
    const t = setTimeout(() => {
      checkProjectNameApi(clean, excludeId)
        .then(res => {
          if (mine !== seq.current) return;
          const d = res.data?.data ?? {};
          setState({ taken: d.available === false, message: d.message || '', checking: false });
        })
        .catch(() => { if (mine === seq.current) setState({ taken: false, message: '', checking: false }); });
    }, 400);
    return () => clearTimeout(t);
  }, [name, excludeId]);

  return state;
}

/**
 * ProjectUsageChecks — where a project is used. Two independent checkboxes:
 *
 *   Product     planned and tracked in Project Management. Default milestones for
 *               the chosen project type are created ONLY when this is ticked.
 *   Operations  accepts helpdesk tickets.
 *
 * Both may be ticked (milestones are created, and it serves tickets too). At least
 * one must be ticked. The ticket project dropdown lists every project either way.
 *
 * Props: { value: { isProduct, isOperations }, onChange(next), disabled, compact }
 */
export default function ProjectUsageChecks({ value, onChange, disabled = false, compact = false }) {
  const isProduct    = value?.isProduct !== false;
  const isOperations = value?.isOperations === true;

  const toggle = (key) => {
    const next = { isProduct, isOperations, [key]: !(key === 'isProduct' ? isProduct : isOperations) };
    // Never leave a project belonging nowhere — untick one, the other turns on.
    if (!next.isProduct && !next.isOperations) next[key === 'isProduct' ? 'isOperations' : 'isProduct'] = true;
    onChange?.(next);
  };

  const box = (key, label, hint, checked) => (
    <label className={`flex items-start gap-2 ${disabled ? 'opacity-60' : 'cursor-pointer'}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={() => toggle(key)}
        className="mt-0.5 w-4 h-4 accent-blue-600"
      />
      <span>
        <span className={`${compact ? 'text-xs' : 'text-sm'} font-medium text-gray-800`}>{label}</span>
        {hint && <span className={`block ${compact ? 'text-[10px]' : 'text-xs'} text-gray-400`}>{hint}</span>}
      </span>
    </label>
  );

  return (
    <div className={compact ? 'space-y-1.5' : 'space-y-2'}>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {box('isProduct',    'Product',    'Project Management · creates the default milestones', isProduct)}
        {box('isOperations', 'Operations', 'Accepts helpdesk tickets',                            isOperations)}
      </div>
      {!isProduct && isOperations && (
        <p className={`${compact ? 'text-[10px]' : 'text-xs'} text-amber-600`}>
          Operations only — no milestones will be created.
        </p>
      )}
    </div>
  );
}
