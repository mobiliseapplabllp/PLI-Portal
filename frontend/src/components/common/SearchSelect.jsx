/**
 * SearchSelect — a searchable single-select dropdown with no external dependency.
 *
 * Props
 *   options      [{ value, label, sub? }]   sub = optional grey second line (email, dept…)
 *   value        the selected `value` ('' or null when nothing selected)
 *   onChange     (value, option|null) => void
 *   placeholder  text when nothing selected            (default '— Select —')
 *   disabled     bool
 *   allowClear   bool — show an × to clear            (default true)
 *   loading      bool — shows "Loading…" in the list
 *   emptyText    text when no option matches           (default 'No match')
 *   className    extra classes for the trigger button
 *   error        bool — red border
 *   size         'sm' | 'md'                            (default 'sm', matches helpdesk forms)
 *   renderFooter optional () => node rendered under the list (e.g. "+ Add new project")
 *
 * Keyboard: ↑/↓ move, Enter picks, Esc closes. Typing filters label + sub.
 */
import { useEffect, useMemo, useRef, useState } from 'react';

const norm = (s) => String(s ?? '').toLowerCase();

export default function SearchSelect({
  options = [],
  value,
  onChange,
  placeholder = '— Select —',
  disabled = false,
  allowClear = true,
  loading = false,
  emptyText = 'No match',
  className = '',
  error = false,
  size = 'sm',
  renderFooter,
}) {
  const [open, setOpen]     = useState(false);
  const [query, setQuery]   = useState('');
  const [active, setActive] = useState(0);
  const rootRef  = useRef(null);
  const inputRef = useRef(null);
  const listRef  = useRef(null);

  const selected = useMemo(
    () => options.find((o) => String(o.value) === String(value)) || null,
    [options, value],
  );

  const filtered = useMemo(() => {
    const q = norm(query).trim();
    if (!q) return options;
    return options.filter((o) => norm(o.label).includes(q) || norm(o.sub).includes(q));
  }, [options, query]);

  // Close on outside click
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) close(); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Focus the search box when opened
  useEffect(() => {
    if (open) { setQuery(''); setActive(0); setTimeout(() => inputRef.current?.focus(), 0); }
  }, [open]);

  // Keep the active row visible
  useEffect(() => {
    const el = listRef.current?.children?.[active];
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const close = () => { setOpen(false); setQuery(''); };
  const pick = (opt) => { onChange?.(opt.value, opt); close(); };
  const clear = (e) => { e.stopPropagation(); onChange?.('', null); };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, filtered.length - 1)); return; }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); return; }
    if (e.key === 'Enter')     { e.preventDefault(); if (filtered[active]) pick(filtered[active]); }
  };

  const pad  = size === 'md' ? 'px-3 py-2 text-sm' : 'px-2.5 py-1.5 text-xs';
  const ring = error ? 'border-red-500' : 'border-gray-300';

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={`w-full flex items-center justify-between gap-2 border rounded bg-white text-left ${pad} ${ring} focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400 ${className}`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={`truncate ${selected ? 'text-gray-800' : 'text-gray-400'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <span className="flex items-center gap-1 flex-shrink-0">
          {allowClear && selected && !disabled && (
            <span role="button" aria-label="Clear" onClick={clear} className="text-gray-400 hover:text-gray-600 leading-none">×</span>
          )}
          <svg className="w-3.5 h-3.5 text-gray-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
          </svg>
        </span>
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full rounded border border-gray-200 bg-white shadow-lg">
          <div className="p-1.5 border-b border-gray-100">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setActive(0); }}
              onKeyDown={onKeyDown}
              placeholder="Type to search…"
              className="w-full px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <ul ref={listRef} role="listbox" className="max-h-56 overflow-auto py-1">
            {loading && <li className="px-3 py-1.5 text-xs text-gray-400">Loading…</li>}
            {!loading && filtered.length === 0 && <li className="px-3 py-1.5 text-xs text-gray-400">{emptyText}</li>}
            {!loading && filtered.map((o, i) => {
              const isSel = selected && String(o.value) === String(selected.value);
              return (
                <li
                  key={String(o.value)}
                  role="option"
                  aria-selected={isSel}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => { e.preventDefault(); pick(o); }}
                  className={`px-3 py-1.5 cursor-pointer text-xs ${i === active ? 'bg-blue-50' : ''} ${isSel ? 'font-semibold text-blue-700' : 'text-gray-800'}`}
                >
                  <div className="truncate">{o.label}</div>
                  {o.sub && <div className="text-[10px] text-gray-400 truncate">{o.sub}</div>}
                </li>
              );
            })}
          </ul>
          {renderFooter && <div className="border-t border-gray-100 p-1.5">{renderFooter()}</div>}
        </div>
      )}
    </div>
  );
}
