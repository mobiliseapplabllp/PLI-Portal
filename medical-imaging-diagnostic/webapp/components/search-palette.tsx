"use client";

import { useEffect, useRef, useState } from "react";
import {
  Activity, BarChart3, Ribbon, Search, Settings2, Users, X,
} from "lucide-react";
import { api, ageFrom, avatarColor, initials } from "@/lib/api";

interface Hit { id: number; full_name: string; mrn: string; sex?: string | null; date_of_birth?: string | null }

const PAGES = [
  { href: "/", label: "Patients", icon: Users },
  { href: "/screening/", label: "Cancer Screening", icon: Ribbon },
  { href: "/analytics/", label: "Analytics", icon: BarChart3 },
  { href: "/models/", label: "AI Models", icon: Activity },
  { href: "/admin/", label: "Admin & Users", icon: Settings2 },
];

export default function SearchPalette({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (!q.trim()) { setHits([]); return; }
    const t = setTimeout(() => {
      api<Hit[]>(`/api/patients/search?q=${encodeURIComponent(q)}`).then(setHits).catch(() => setHits([]));
    }, 150);
    return () => clearTimeout(t);
  }, [q]);

  const pages = PAGES.filter((p) => !q.trim() || p.label.toLowerCase().includes(q.toLowerCase()));
  const rows: { type: "page" | "patient"; el: React.ReactNode; go: () => void }[] = [
    ...pages.map((p) => ({
      type: "page" as const,
      go: () => (window.location.href = p.href),
      el: (
        <div className="flex items-center gap-3">
          <p.icon size={16} className="text-slate-400" />
          <span>{p.label}</span>
          <span className="ml-auto text-[10px] uppercase tracking-wide text-slate-400">Page</span>
        </div>
      ),
    })),
    ...hits.map((h) => ({
      type: "patient" as const,
      go: () => (window.location.href = `/patient/?id=${h.id}`),
      el: (
        <div className="flex items-center gap-3">
          <span className="grid h-7 w-7 flex-none place-items-center rounded-full text-[11px] font-bold text-white"
            style={{ background: avatarColor(h.full_name) }}>
            {initials(h.full_name)}
          </span>
          <span className="font-medium">{h.full_name}</span>
          <span className="text-xs text-slate-500">MRN {h.mrn} · {ageFrom(h.date_of_birth)}</span>
          <span className="ml-auto text-[10px] uppercase tracking-wide text-slate-400">Patient</span>
        </div>
      ),
    })),
  ];

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, rows.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { rows[active]?.go(); }
    else if (e.key === "Escape") { onClose(); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[12vh]" onClick={onClose}>
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 dark:border-slate-800">
          <Search size={18} className="text-slate-400" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => { setQ(e.target.value); setActive(0); }}
            onKeyDown={onKey}
            placeholder="Search patients, or jump to a page…"
            className="w-full bg-transparent py-4 text-sm outline-none"
          />
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {rows.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-slate-400">
              {q.trim() ? "No matches." : "Type a name, MRN, or page…"}
            </div>
          ) : (
            rows.map((r, i) => (
              <button
                key={i}
                onMouseEnter={() => setActive(i)}
                onClick={r.go}
                className={`w-full rounded-lg px-3 py-2.5 text-left text-sm ${
                  i === active ? "bg-teal-50 dark:bg-teal-950/60" : "hover:bg-slate-50 dark:hover:bg-slate-800"
                }`}
              >
                {r.el}
              </button>
            ))
          )}
        </div>
        <div className="border-t border-slate-200 px-4 py-2 text-[11px] text-slate-400 dark:border-slate-800">
          ↑↓ navigate · ↵ open · esc close
        </div>
      </div>
    </div>
  );
}
