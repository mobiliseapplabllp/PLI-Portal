"use client";

import { useEffect, useState } from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import { Activity, AlertTriangle, FileCheck2, Layers, Users } from "lucide-react";
import Shell from "@/components/shell";
import { api } from "@/lib/api";

interface Summary {
  totals: {
    patients: number; studies: number; analyzed: number; reports: number;
    signed_reports: number; flagged_patients: number;
  };
  severity_distribution: { severity: string; count: number }[];
  modality_mix: { modality: string; count: number }[];
  top_findings: { finding: string; count: number }[];
  model_usage: { model: string; count: number }[];
  volume_30d: { date: string; count: number }[];
}

// Status ramp for severity (ordinal green→red), reused from the badge palette.
const SEV_HEX: Record<string, string> = {
  normal: "#15803d", low: "#0369a1", moderate: "#a16207", high: "#ea580c", critical: "#b91c1c",
};
const TEAL = "#0d9488"; // single hue for magnitude bars

function useDark() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const el = document.documentElement;
    const update = () => setDark(el.classList.contains("dark"));
    update();
    const obs = new MutationObserver(update);
    obs.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <h3 className="mb-3 text-sm font-bold text-slate-700 dark:text-slate-200">{title}</h3>
      {children}
    </div>
  );
}

function TipBox({ active, payload, label, unit }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-800">
      <div className="font-semibold">{label}</div>
      <div className="text-slate-500">
        {payload[0].value} {unit}
      </div>
    </div>
  );
}

const TILES: { key: string; label: string; icon: typeof Users; alert?: boolean }[] = [
  { key: "patients", label: "Patients", icon: Users },
  { key: "studies", label: "Studies", icon: Layers },
  { key: "analyzed", label: "Analyzed", icon: Activity },
  { key: "reports", label: "Reports", icon: FileCheck2 },
  { key: "signed_reports", label: "Signed", icon: FileCheck2 },
  { key: "flagged_patients", label: "Flagged", icon: AlertTriangle, alert: true },
];

export default function AnalyticsPage() {
  const [data, setData] = useState<Summary | null>(null);
  const dark = useDark();
  const grid = dark ? "#1e293b" : "#eef2f6";
  const axis = dark ? "#94a3b8" : "#64748b";

  useEffect(() => {
    api<Summary>("/api/analytics/summary").then(setData).catch(() => {});
  }, []);

  return (
    <Shell>
      <h1 className="mb-1 text-2xl font-bold">Analytics</h1>
      <p className="mb-5 text-sm text-slate-500">Organization-wide overview</p>

      {!data ? (
        <div className="grid gap-4 md:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="card h-24 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {/* KPI tiles */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            {TILES.map(({ key, label, icon: Icon, alert }) => (
              <div key={key} className="card p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">{label}</span>
                  <Icon size={15} className={alert ? "text-red-500" : "text-teal-600"} />
                </div>
                <div className={`mt-1 text-2xl font-bold tabular-nums ${alert ? "text-red-600 dark:text-red-400" : ""}`}>
                  {data.totals[key as keyof typeof data.totals]}
                </div>
              </div>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Panel title="Study volume — last 30 days">
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={data.volume_30d} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
                    <defs>
                      <linearGradient id="vol" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={TEAL} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={TEAL} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke={grid} vertical={false} />
                    <XAxis
                      dataKey="date" tick={{ fontSize: 10, fill: axis }} tickLine={false} axisLine={false}
                      tickFormatter={(d) => d.slice(5)} minTickGap={28}
                    />
                    <YAxis tick={{ fontSize: 10, fill: axis }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip content={<TipBox unit="studies" />} />
                    <Area type="monotone" dataKey="count" stroke={TEAL} strokeWidth={2} fill="url(#vol)" />
                  </AreaChart>
                </ResponsiveContainer>
              </Panel>
            </div>

            <Panel title="Severity distribution">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.severity_distribution} margin={{ top: 6, right: 8, bottom: 0, left: -20 }}>
                  <CartesianGrid stroke={grid} vertical={false} />
                  <XAxis dataKey="severity" tick={{ fontSize: 10, fill: axis }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: axis }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip content={<TipBox unit="studies" />} cursor={{ fill: grid }} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {data.severity_distribution.map((d) => (
                      <Cell key={d.severity} fill={SEV_HEX[d.severity]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Top findings">
              {data.top_findings.length ? (
                <ResponsiveContainer width="100%" height={Math.max(160, data.top_findings.length * 30)}>
                  <BarChart
                    layout="vertical" data={data.top_findings}
                    margin={{ top: 0, right: 16, bottom: 0, left: 8 }}
                  >
                    <CartesianGrid stroke={grid} horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: axis }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <YAxis
                      type="category" dataKey="finding" width={110}
                      tick={{ fontSize: 11, fill: axis }} tickLine={false} axisLine={false}
                    />
                    <Tooltip content={<TipBox unit="cases" />} cursor={{ fill: grid }} />
                    <Bar dataKey="count" fill={TEAL} radius={[0, 4, 4, 0]} barSize={14} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="py-10 text-center text-sm text-slate-400">No findings yet.</p>
              )}
            </Panel>

            <Panel title="Modality mix">
              <ResponsiveContainer width="100%" height={Math.max(160, data.modality_mix.length * 34)}>
                <BarChart
                  layout="vertical" data={data.modality_mix}
                  margin={{ top: 0, right: 16, bottom: 0, left: 8 }}
                >
                  <CartesianGrid stroke={grid} horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: axis }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="modality" width={70} tick={{ fontSize: 11, fill: axis }} tickLine={false} axisLine={false} />
                  <Tooltip content={<TipBox unit="studies" />} cursor={{ fill: grid }} />
                  <Bar dataKey="count" fill={TEAL} radius={[0, 4, 4, 0]} barSize={16} />
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
                <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">Model usage</h4>
                <div className="space-y-1.5">
                  {data.model_usage.map((m) => (
                    <div key={m.model} className="flex items-center justify-between text-xs">
                      <code className="truncate rounded bg-slate-100 px-1.5 py-0.5 dark:bg-slate-800">{m.model}</code>
                      <span className="ml-2 font-semibold tabular-nums">{m.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Panel>
          </div>
        </div>
      )}
    </Shell>
  );
}
