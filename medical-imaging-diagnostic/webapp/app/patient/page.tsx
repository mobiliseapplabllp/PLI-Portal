"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ClipboardList, Download, FileJson, FileText, Loader2, Play, Plus, RefreshCw,
  ShieldAlert, Upload,
} from "lucide-react";
import Shell, { SeverityBadge } from "@/components/shell";
import AuthImage from "@/components/auth-image";
import {
  ageFrom, api, apiBlob, avatarColor, Correlation, Diagnostic, initials,
  Patient, ReportRow, Study, StructuredReport,
} from "@/lib/api";

async function openBlob(path: string) {
  const blob = await apiBlob(path);
  window.open(URL.createObjectURL(blob), "_blank");
}
async function downloadBlob(path: string, filename: string) {
  const blob = await apiBlob(path);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

interface Profile { patient: Patient; studies: Study[]; correlation: Correlation | null }
interface StudyDetail { study: Study; images: unknown[]; diagnostics: Diagnostic[]; reports: ReportRow[] }

const SEV_HEX: Record<string, string> = {
  normal: "#15803d", low: "#0369a1", moderate: "#a16207", high: "#c2410c", critical: "#b91c1c",
};

function StudyCard({ study, onChanged }: { study: Study; onChanged: () => void }) {
  const [detail, setDetail] = useState<StudyDetail | null>(null);
  const [tab, setTab] = useState<"orig" | "heat">("orig");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<StudyDetail>(`/api/studies/${study.id}`).then(setDetail);
  }, [study.id]);
  useEffect(load, [load]);

  const analyze = async () => {
    setBusy(true);
    try {
      await api(`/api/studies/${study.id}/analyze`, { method: "POST" });
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const diag = detail?.diagnostics?.[0];
  const report = detail?.reports?.[0];
  const hasImg = (detail?.images?.length ?? 0) > 0;
  const pos = (diag?.findings || [])
    .filter((f) => f.severity !== "normal")
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 6);

  return (
    <div className="card p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="chip">{study.modality}</span>
          {study.body_part && <span className="chip-soft">{study.body_part}</span>}
        </div>
        <span className="text-xs text-slate-400">{study.status}</span>
      </div>
      {study.description && (
        <p className="mb-3 text-xs text-slate-500">{study.description}</p>
      )}

      {!detail ? (
        <div className="aspect-square animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
      ) : !diag ? (
        <button className="btn-dark w-full" onClick={analyze} disabled={!hasImg || busy}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
          {hasImg ? "Run AI analysis" : "Upload an image first"}
        </button>
      ) : (
        <>
          <div className="overflow-hidden rounded-lg bg-slate-900">
            <AuthImage
              path={`/api/studies/${study.id}/image-file${tab === "heat" ? "?heatmap=true" : ""}`}
              alt={study.modality}
              className="aspect-square w-full object-cover"
            />
          </div>
          <div className="my-3 inline-flex rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
            {(["orig", "heat"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                  tab === t
                    ? "bg-white text-slate-900 shadow dark:bg-slate-700 dark:text-white"
                    : "text-slate-500"
                }`}
              >
                {t === "orig" ? "Original" : "AI attention"}
              </button>
            ))}
          </div>
          {pos.length ? (
            <div className="space-y-1.5">
              {pos.map((f) => (
                <div key={f.label} className="grid grid-cols-[1fr_90px_auto] items-center gap-2 text-[13px]">
                  <span className="truncate">{f.label}</span>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${f.probability * 100}%`, background: SEV_HEX[f.severity] }}
                    />
                  </div>
                  <span className="flex items-center gap-1 justify-self-end tabular-nums">
                    {(f.probability * 100).toFixed(0)}% <SeverityBadge severity={f.severity} />
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-1 text-[13px] font-medium text-green-700 dark:text-green-400">
              ✓ No significant findings.
            </p>
          )}
          <p className="mt-2 text-[11px] text-slate-400">
            Model: <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">{diag.model_source}</code>
          </p>
          {report && <StructuredReportBlock studyId={study.id} report={report} />}
        </>
      )}
    </div>
  );
}

function StructuredReportBlock({ studyId, report }: { studyId: number; report: ReportRow }) {
  let sr: StructuredReport | null = null;
  try {
    sr = report.structured_json ? JSON.parse(report.structured_json) : null;
  } catch {
    sr = null;
  }
  const assess = sr?.assessment;

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-800/40">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
          Structured report
        </span>
        <div className="flex gap-1.5">
          <button title="Open structured report" onClick={() => openBlob(`/api/studies/${studyId}/report.html`)}
            className="rounded-md border border-slate-300 p-1.5 text-slate-600 hover:bg-white dark:border-slate-600 dark:hover:bg-slate-700">
            <FileText size={13} />
          </button>
          <button title="Download JSON (FHIR)" onClick={() => downloadBlob(`/api/studies/${studyId}/report.json?fhir=true`, `study-${studyId}-fhir.json`)}
            className="rounded-md border border-slate-300 p-1.5 text-slate-600 hover:bg-white dark:border-slate-600 dark:hover:bg-slate-700">
            <FileJson size={13} />
          </button>
        </div>
      </div>

      {assess && (
        <div className={`mb-2 flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs ${
          assess.onco_flag
            ? "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40"
            : "border-teal-300 bg-teal-50 dark:border-teal-900 dark:bg-teal-950/40"
        }`}>
          {assess.onco_flag && <ShieldAlert size={14} className="flex-none text-red-600" />}
          <span className={`font-bold ${assess.onco_flag ? "text-red-700 dark:text-red-400" : "text-teal-700 dark:text-teal-400"}`}>
            {assess.category}
          </span>
          <span className="text-slate-500">· {assess.meaning}</span>
        </div>
      )}

      {sr?.impression?.length ? (
        <ol className="ml-4 list-decimal space-y-0.5 text-[12.5px] text-slate-700 dark:text-slate-300">
          {sr.impression.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      ) : (
        <pre className="whitespace-pre-wrap text-[11px] text-slate-600">{report.body}</pre>
      )}
    </div>
  );
}

function PatientView() {
  const params = useSearchParams();
  const id = params.get("id");
  const [profile, setProfile] = useState<Profile | null>(null);

  const load = useCallback(() => {
    if (!id) return;
    api<Profile>(`/api/patients/${id}`).then(setProfile);
  }, [id]);
  useEffect(load, [load]);

  const openReport = async () => {
    const blob = await apiBlob(`/api/patients/${id}/report.html`);
    window.open(URL.createObjectURL(blob), "_blank");
  };
  const downloadPdf = async () => {
    const blob = await apiBlob(`/api/patients/${id}/report.pdf`);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `report_${profile?.patient.mrn || id}.pdf`;
    a.click();
  };
  const recompute = async () => {
    await api(`/api/patients/${id}/correlate`, { method: "POST" });
    load();
  };
  const addStudy = async () => {
    const modality = prompt("Modality (xray, ct, mri, fundus, dermoscopy, mammography):", "xray");
    if (!modality) return;
    const study = await api<Study>("/api/studies", {
      method: "POST",
      body: { patient_id: Number(id), modality, body_part: "", description: "new study" },
    });
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*,.dcm,.dicom,application/dicom,.nii,.nii.gz";
    input.onchange = async () => {
      if (input.files?.[0]) {
        const fd = new FormData();
        fd.append("file", input.files[0]);
        await api(`/api/studies/${study.id}/image`, { method: "POST", form: fd });
      }
      load();
    };
    input.click();
  };

  if (!profile)
    return (
      <div className="space-y-4">
        <div className="card h-28 animate-pulse" />
        <div className="card h-40 animate-pulse" />
      </div>
    );

  const p = profile.patient;
  const c = profile.correlation;
  const diff: { condition: string; confidence: number; supporting_findings: string[] }[] =
    c ? JSON.parse(c.differential_json) : [];
  const recs: string[] = c ? JSON.parse(c.recommendations_json) : [];

  return (
    <div className="space-y-4">
      <a href="/" className="text-sm text-teal-700 hover:underline dark:text-teal-400">
        ← All patients
      </a>

      <div className="card p-5">
        <div className="flex flex-wrap items-start gap-4">
          <span
            className="grid h-14 w-14 flex-none place-items-center rounded-2xl text-xl font-bold text-white"
            style={{ background: avatarColor(p.full_name) }}
          >
            {initials(p.full_name)}
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold">{p.full_name}</h1>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-slate-500">
              <span>
                MRN {p.mrn} · {p.sex || "?"} · DOB {p.date_of_birth || "n/a"} ({ageFrom(p.date_of_birth)})
              </span>
              {c && <SeverityBadge severity={c.max_severity} />}
            </div>
            {p.notes && (
              <p className="mt-1.5 flex items-center gap-1.5 text-sm text-slate-500">
                <ClipboardList size={14} /> {p.notes}
              </p>
            )}
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
            <button className="btn-ghost" onClick={openReport}>
              <FileText size={15} /> Report
            </button>
            <button className="btn-ghost" onClick={downloadPdf}>
              <Download size={15} /> PDF
            </button>
            <button className="btn-ghost" onClick={recompute}>
              <RefreshCw size={15} /> Recompute
            </button>
            <button className="btn" onClick={addStudy}>
              <Plus size={15} /> New study
            </button>
          </div>
        </div>
      </div>

      <div className="card border-l-4 border-teal-500 bg-gradient-to-b from-teal-50/70 to-white p-5 dark:from-teal-950/30 dark:to-slate-900">
        <div className="mb-1.5 flex items-center gap-2">
          <h2 className="text-base font-bold">🧠 AI Correlation</h2>
          {c && <SeverityBadge severity={c.max_severity} />}
        </div>
        <p className="text-sm text-slate-700 dark:text-slate-300">
          {c ? c.summary : "No correlation yet — analyse a study."}
        </p>
        {c && (
          <div className="mt-4 grid gap-5 md:grid-cols-2">
            <div>
              <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Differential considerations
              </h3>
              {diff.length ? (
                diff.map((d, i) => (
                  <div key={i} className="border-b border-teal-100/50 py-1.5 last:border-0 dark:border-teal-900/40">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-semibold">{d.condition}</span>
                      <span className="font-bold text-teal-700 dark:text-teal-400">
                        {(d.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400">
                      supporting: {d.supporting_findings.join(", ")}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-400">No multi-finding pattern matched.</p>
              )}
            </div>
            <div>
              <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Recommendations
              </h3>
              <ul className="space-y-1 text-sm">
                {(recs.length ? recs : ["Routine follow-up."]).map((r, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="font-bold text-teal-600">→</span> {r}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>

      <h2 className="px-1 pt-1 text-sm font-bold">Studies ({profile.studies.length})</h2>
      {profile.studies.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {profile.studies.map((s) => (
            <StudyCard key={s.id} study={s} onChanged={load} />
          ))}
        </div>
      ) : (
        <div className="card grid place-items-center gap-2 py-12 text-slate-400">
          <Upload size={28} />
          <p className="text-sm">No studies yet — add one to run AI analysis.</p>
        </div>
      )}
    </div>
  );
}

export default function PatientPage() {
  return (
    <Shell>
      <Suspense fallback={<div className="card h-40 animate-pulse" />}>
        <PatientView />
      </Suspense>
    </Shell>
  );
}
