"use client";

import { useEffect, useState } from "react";
import { Ribbon, ShieldAlert } from "lucide-react";
import Shell, { SeverityBadge } from "@/components/shell";
import { api } from "@/lib/api";

interface WorkItem {
  patient_id: number; patient_name: string; mrn: string;
  study_id: number; modality: string; body_part?: string | null;
  assessment_category: string; assessment_meaning: string;
  onco_flag: boolean; max_severity: string; onco_findings: string[];
}
interface Worklist {
  total: number;
  counts: { lung: number; breast: number; skin: number; brain: number; other: number };
  items: WorkItem[];
}

const TILES = [
  { key: "lung", label: "Lung", emoji: "🫁" },
  { key: "breast", label: "Breast", emoji: "🎗️" },
  { key: "skin", label: "Skin", emoji: "🩹" },
  { key: "brain", label: "Brain", emoji: "🧠" },
  { key: "other", label: "Other", emoji: "🔬" },
] as const;

export default function ScreeningPage() {
  const [data, setData] = useState<Worklist | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem("mid_token")) {
      window.location.href = "/login/";
      return;
    }
    api<Worklist>("/api/oncology/worklist").then(setData).catch(() => {});
  }, []);

  return (
    <Shell>
      <div className="mb-1 flex items-center gap-2">
        <Ribbon className="text-red-500" />
        <h1 className="text-2xl font-bold">Cancer Screening Worklist</h1>
      </div>
      <p className="mb-5 text-sm text-slate-500">
        Every study across your organization with a cancer-relevant assessment or oncologic finding.
      </p>

      {!data ? (
        <div className="card h-64 animate-pulse" />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <div className="card p-4">
              <div className="text-xs font-medium text-slate-500">Flagged studies</div>
              <div className="mt-1 text-2xl font-bold text-red-600 dark:text-red-400">{data.total}</div>
            </div>
            {TILES.map((t) => (
              <div key={t.key} className="card p-4">
                <div className="text-xs font-medium text-slate-500">{t.emoji} {t.label}</div>
                <div className="mt-1 text-2xl font-bold tabular-nums">
                  {data.counts[t.key as keyof typeof data.counts]}
                </div>
              </div>
            ))}
          </div>

          {data.items.length === 0 ? (
            <div className="card grid place-items-center gap-2 py-16 text-slate-400">
              <ShieldAlert size={32} />
              <p>No cancer-flagged studies yet. Run AI analysis on imaging studies to populate this list.</p>
            </div>
          ) : (
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/50">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Patient</th>
                    <th className="px-4 py-3 font-semibold">Study</th>
                    <th className="px-4 py-3 font-semibold">Assessment</th>
                    <th className="px-4 py-3 font-semibold">Findings</th>
                    <th className="px-4 py-3 font-semibold">Severity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.items.map((it) => (
                    <tr
                      key={it.study_id}
                      onClick={() => (window.location.href = `/patient/?id=${it.patient_id}`)}
                      className="cursor-pointer transition hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    >
                      <td className="px-4 py-3">
                        <div className="font-semibold">{it.patient_name}</div>
                        <div className="text-xs text-slate-500">MRN {it.mrn}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="chip">{it.modality}</span>
                        <div className="mt-1 text-xs text-slate-500">{it.body_part}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-bold ${
                          it.onco_flag
                            ? "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
                            : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                        }`}>
                          {it.onco_flag && <ShieldAlert size={13} />}
                          {it.assessment_category}
                        </div>
                        <div className="mt-1 max-w-md text-xs text-slate-500">{it.assessment_meaning}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                        {it.onco_findings.join(", ") || "—"}
                      </td>
                      <td className="px-4 py-3"><SeverityBadge severity={it.max_severity} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-4 text-xs text-slate-400">
            ⚠️ Assessment categories (Lung-RADS / BI-RADS / ICDR) are heuristic prototypes, not clinically validated.
          </p>
        </>
      )}
    </Shell>
  );
}
