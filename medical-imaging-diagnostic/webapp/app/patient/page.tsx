"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Activity, BrainCircuit, ClipboardList, Download, FileJson, FileText, FlaskConical,
  Image as ImageIcon, Loader2, Play, Plus, RefreshCw, Send, ShieldAlert, Sparkles,
  Upload, Clock,
} from "lucide-react";
import Shell, { SeverityBadge } from "@/components/shell";
import AuthImage from "@/components/auth-image";
import {
  ageFrom, api, apiBlob, avatarColor, Assessment, Correlation, Diagnostic, DocRow,
  initials, Patient, ReportRow, Study, StructuredReport,
} from "@/lib/api";

interface Profile { patient: Patient; studies: Study[]; correlation: Correlation | null }
interface StudyDetail { study: Study; images: unknown[]; diagnostics: Diagnostic[]; reports: ReportRow[] }

const SEV_HEX: Record<string, string> = {
  normal: "#15803d", low: "#0369a1", moderate: "#a16207", high: "#c2410c", critical: "#b91c1c",
};

async function openBlob(path: string) {
  window.open(URL.createObjectURL(await apiBlob(path)), "_blank");
}
async function downloadBlob(path: string, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(await apiBlob(path));
  a.download = filename;
  a.click();
}

// ---------------------------------------------------------------- study card
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
      {study.description && <p className="mb-3 text-xs text-slate-500">{study.description}</p>}

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
              <button key={t} onClick={() => setTab(t)}
                className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                  tab === t ? "bg-white text-slate-900 shadow dark:bg-slate-700 dark:text-white" : "text-slate-500"}`}>
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
                    <span className="block h-full rounded-full" style={{ width: `${f.probability * 100}%`, background: SEV_HEX[f.severity] }} />
                  </div>
                  <span className="flex items-center gap-1 justify-self-end tabular-nums">
                    {(f.probability * 100).toFixed(0)}% <SeverityBadge severity={f.severity} />
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-1 text-[13px] font-medium text-green-700 dark:text-green-400">✓ No significant findings.</p>
          )}
          {report && <StructuredReportBlock studyId={study.id} report={report} />}
        </>
      )}
    </div>
  );
}

function StructuredReportBlock({ studyId, report }: { studyId: number; report: ReportRow }) {
  let sr: StructuredReport | null = null;
  try { sr = report.structured_json ? JSON.parse(report.structured_json) : null; } catch { sr = null; }
  const assess = sr?.assessment;
  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-800/40">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Structured report</span>
        <div className="flex gap-1.5">
          <button title="Open structured report" onClick={() => openBlob(`/api/studies/${studyId}/report.html`)}
            className="rounded-md border border-slate-300 p-1.5 text-slate-600 hover:bg-white dark:border-slate-600 dark:hover:bg-slate-700"><FileText size={13} /></button>
          <button title="Download JSON (FHIR)" onClick={() => downloadBlob(`/api/studies/${studyId}/report.json?fhir=true`, `study-${studyId}-fhir.json`)}
            className="rounded-md border border-slate-300 p-1.5 text-slate-600 hover:bg-white dark:border-slate-600 dark:hover:bg-slate-700"><FileJson size={13} /></button>
        </div>
      </div>
      {assess && (
        <div className={`mb-2 flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs ${
          assess.onco_flag ? "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40" : "border-teal-300 bg-teal-50 dark:border-teal-900 dark:bg-teal-950/40"}`}>
          {assess.onco_flag && <ShieldAlert size={14} className="flex-none text-red-600" />}
          <span className={`font-bold ${assess.onco_flag ? "text-red-700 dark:text-red-400" : "text-teal-700 dark:text-teal-400"}`}>{assess.category}</span>
          <span className="text-slate-500">· {assess.meaning}</span>
        </div>
      )}
      {sr?.impression?.length ? (
        <ol className="ml-4 list-decimal space-y-0.5 text-[12.5px] text-slate-700 dark:text-slate-300">
          {sr.impression.map((s, i) => <li key={i}>{s}</li>)}
        </ol>
      ) : <pre className="whitespace-pre-wrap text-[11px] text-slate-600">{report.body}</pre>}
    </div>
  );
}

// ---------------------------------------------------------------- tabs
const TABS = [
  { key: "overview", label: "Overview", icon: ClipboardList },
  { key: "imaging", label: "Imaging", icon: ImageIcon },
  { key: "reports", label: "Reports & Docs", icon: FlaskConical },
  { key: "ai", label: "AI Assistant", icon: BrainCircuit },
  { key: "timeline", label: "Timeline", icon: Clock },
] as const;
type TabKey = (typeof TABS)[number]["key"];

function PatientView() {
  const params = useSearchParams();
  const id = params.get("id");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [tab, setTab] = useState<TabKey>("overview");

  const refetchAssessment = useCallback(() => {
    if (id) api<Assessment | null>(`/api/patients/${id}/assessment`).then(setAssessment).catch(() => {});
  }, [id]);
  const load = useCallback(() => {
    if (!id) return;
    api<Profile>(`/api/patients/${id}`).then(setProfile);
    api<DocRow[]>(`/api/patients/${id}/documents`).then(setDocs).catch(() => {});
    refetchAssessment();
  }, [id, refetchAssessment]);
  useEffect(load, [load]);

  // After a study is analyzed the holistic assessment is auto-generated in the
  // background — refetch it shortly after so the AI tab reflects it.
  const onStudyChanged = useCallback(() => {
    load();
    setTimeout(refetchAssessment, 2000);
  }, [load, refetchAssessment]);

  const recompute = async () => { await api(`/api/patients/${id}/correlate`, { method: "POST" }); load(); };
  const addStudy = async () => {
    const modality = prompt("Modality (xray, ct, mri, fundus, dermoscopy, mammography):", "xray");
    if (!modality) return;
    const study = await api<Study>("/api/studies", { method: "POST", body: { patient_id: Number(id), modality, body_part: "", description: "new study" } });
    const input = document.createElement("input");
    input.type = "file"; input.accept = "image/*,.dcm,.dicom,application/dicom,.nii,.nii.gz";
    input.onchange = async () => {
      if (input.files?.[0]) { const fd = new FormData(); fd.append("file", input.files[0]); await api(`/api/studies/${study.id}/image`, { method: "POST", form: fd }); }
      setTab("imaging"); load();
    };
    input.click();
  };

  if (!profile)
    return <div className="space-y-4"><div className="card h-28 animate-pulse" /><div className="card h-40 animate-pulse" /></div>;

  const p = profile.patient;

  return (
    <div className="space-y-4">
      <a href="/" className="text-sm text-teal-700 hover:underline dark:text-teal-400">← All patients</a>

      {/* header */}
      <div className="card p-5">
        <div className="flex flex-wrap items-start gap-4">
          <span className="grid h-14 w-14 flex-none place-items-center rounded-2xl text-xl font-bold text-white" style={{ background: avatarColor(p.full_name) }}>
            {initials(p.full_name)}
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold">{p.full_name}</h1>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-slate-500">
              <span>MRN {p.mrn} · {p.sex || "?"} · DOB {p.date_of_birth || "n/a"} ({ageFrom(p.date_of_birth)})</span>
              {profile.correlation && <SeverityBadge severity={profile.correlation.max_severity} />}
              {assessment?.urgent && <span className="badge sev-critical">urgent</span>}
            </div>
            {p.notes && <p className="mt-1.5 flex items-center gap-1.5 text-sm text-slate-500"><ClipboardList size={14} /> {p.notes}</p>}
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
            <button className="btn-ghost" onClick={() => openBlob(`/api/patients/${id}/report.html`)}><FileText size={15} /> Report</button>
            <button className="btn-ghost" onClick={() => downloadBlob(`/api/patients/${id}/report.pdf`, `report_${p.mrn}.pdf`)}><Download size={15} /> PDF</button>
            <button className="btn" onClick={addStudy}><Plus size={15} /> New study</button>
          </div>
        </div>
      </div>

      {/* tab bar */}
      <div className="flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
              tab === key ? "border-teal-600 text-teal-700 dark:text-teal-400" : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"}`}>
            <Icon size={15} /> {label}
            {key === "ai" && assessment?.urgent && <span className="h-2 w-2 rounded-full bg-red-500" />}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab profile={profile} docs={docs} assessment={assessment} onRecompute={recompute} goAI={() => setTab("ai")} />}
      {tab === "imaging" && <ImagingTab profile={profile} onChanged={onStudyChanged} onAdd={addStudy} />}
      {tab === "reports" && <ReportsDocsTab profile={profile} docs={docs} patientId={id!} onDocs={load} />}
      {tab === "ai" && <AIAssistantTab patientId={id!} assessment={assessment} onAssessed={setAssessment} />}
      {tab === "timeline" && <TimelineTab profile={profile} docs={docs} />}
    </div>
  );
}

// ---------------------------------------------------------------- Overview
function OverviewTab({ profile, docs, assessment, onRecompute, goAI }: any) {
  const c = profile.correlation;
  const diff: any[] = c ? JSON.parse(c.differential_json) : [];
  const recs: string[] = c ? JSON.parse(c.recommendations_json) : [];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[["Studies", profile.studies.length], ["Documents", docs.length],
          ["Problems", assessment?.problem_list?.length ?? 0], ["Overall", c?.max_severity ?? "—"]].map(([l, v]: any) => (
          <div key={l} className="card p-4"><div className="text-xs text-slate-500">{l}</div><div className="mt-1 text-xl font-bold capitalize">{v}</div></div>
        ))}
      </div>

      {assessment && (
        <button onClick={goAI} className="card block w-full p-4 text-left transition hover:border-teal-400">
          <div className="mb-1 flex items-center gap-2 text-sm font-bold"><Sparkles size={15} className="text-teal-600" /> AI holistic impression
            {assessment.urgent && <span className="badge sev-critical">urgent</span>}
            <span className="ml-auto text-xs font-normal text-teal-600">Open AI Assistant →</span></div>
          <p className="text-sm text-slate-600 dark:text-slate-300">{assessment.narrative}</p>
        </button>
      )}

      <div className="card border-l-4 border-teal-500 bg-gradient-to-b from-teal-50/70 to-white p-5 dark:from-teal-950/30 dark:to-slate-900">
        <div className="mb-1.5 flex items-center gap-2">
          <h2 className="text-base font-bold">🧠 Cross-study correlation</h2>
          {c && <SeverityBadge severity={c.max_severity} />}
          <button onClick={onRecompute} className="ml-auto text-xs font-semibold text-teal-700 hover:underline dark:text-teal-400"><RefreshCw size={12} className="mr-1 inline" />Recompute</button>
        </div>
        <p className="text-sm text-slate-700 dark:text-slate-300">{c ? c.summary : "No correlation yet — analyse a study."}</p>
        {c && (
          <div className="mt-4 grid gap-5 md:grid-cols-2">
            <div>
              <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">Differential</h3>
              {diff.length ? diff.map((d, i) => (
                <div key={i} className="flex items-center justify-between border-b border-teal-100/50 py-1.5 text-sm last:border-0 dark:border-teal-900/40">
                  <span className="font-semibold">{d.condition}</span>
                  <span className="font-bold text-teal-700 dark:text-teal-400">{(d.confidence * 100).toFixed(0)}%</span>
                </div>
              )) : <p className="text-sm text-slate-400">No pattern matched.</p>}
            </div>
            <div>
              <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">Recommendations</h3>
              <ul className="space-y-1 text-sm">{(recs.length ? recs : ["Routine follow-up."]).map((r, i) => <li key={i} className="flex gap-2"><span className="font-bold text-teal-600">→</span> {r}</li>)}</ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Imaging
function ImagingTab({ profile, onChanged, onAdd }: any) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold">Studies ({profile.studies.length})</h2>
        <button className="btn-ghost" onClick={onAdd}><Plus size={15} /> New study</button>
      </div>
      {profile.studies.length ? (
        <div className="grid gap-4 md:grid-cols-2">{profile.studies.map((s: Study) => <StudyCard key={s.id} study={s} onChanged={onChanged} />)}</div>
      ) : <div className="card grid place-items-center gap-2 py-12 text-slate-400"><Upload size={28} /><p className="text-sm">No studies yet.</p></div>}
    </div>
  );
}

// ---------------------------------------------------------------- Reports & Docs
function ReportsDocsTab({ profile, docs, patientId, onDocs }: any) {
  const addLab = async () => {
    const title = prompt("Lab / test name (e.g. CA 19-9):"); if (!title) return;
    const value = prompt("Value / result (e.g. 250 U/mL, elevated):") || "";
    const fd = new FormData(); fd.append("kind", "lab"); fd.append("title", title); fd.append("value", value);
    await api(`/api/patients/${patientId}/documents`, { method: "POST", form: fd }); onDocs();
  };
  const uploadDoc = async () => {
    const input = document.createElement("input"); input.type = "file";
    input.onchange = async () => {
      if (!input.files?.[0]) return;
      const fd = new FormData(); fd.append("kind", "document"); fd.append("title", input.files[0].name); fd.append("file", input.files[0]);
      await api(`/api/patients/${patientId}/documents`, { method: "POST", form: fd }); onDocs();
    };
    input.click();
  };
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="card p-5">
        <h2 className="mb-3 text-sm font-bold">Imaging reports</h2>
        <div className="space-y-2">
          {profile.studies.map((s: Study) => (
            <div key={s.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
              <div><span className="chip">{s.modality}</span> <span className="ml-1 text-slate-500">{s.body_part}</span></div>
              <div className="flex gap-1.5">
                <button className="btn-ghost sm px-2 py-1 text-xs" onClick={() => openBlob(`/api/studies/${s.id}/report.html`)}><FileText size={12} /> HTML</button>
                <button className="btn-ghost sm px-2 py-1 text-xs" onClick={() => downloadBlob(`/api/studies/${s.id}/report.json?fhir=true`, `study-${s.id}.json`)}><FileJson size={12} /> FHIR</button>
              </div>
            </div>
          ))}
          {profile.studies.length === 0 && <p className="text-sm text-slate-400">No reports yet.</p>}
        </div>
        <button className="btn-ghost mt-3 w-full" onClick={() => openBlob(`/api/patients/${patientId}/report.html`)}><FileText size={15} /> Full patient report</button>
      </div>

      <div className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold">Labs & documents ({docs.length})</h2>
          <div className="flex gap-2">
            <button className="btn-ghost px-2.5 py-1.5 text-xs" onClick={addLab}><FlaskConical size={13} /> Add lab</button>
            <button className="btn-ghost px-2.5 py-1.5 text-xs" onClick={uploadDoc}><Upload size={13} /> Upload</button>
          </div>
        </div>
        <div className="space-y-2">
          {docs.map((d: DocRow) => (
            <div key={d.id} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
              {d.kind === "lab" ? <FlaskConical size={15} className="text-teal-600" /> : <FileText size={15} className="text-slate-400" />}
              <div className="min-w-0"><div className="font-medium">{d.title}</div>{d.value && <div className="text-xs text-slate-500">{d.value}</div>}</div>
              <span className="ml-auto text-[10px] uppercase tracking-wide text-slate-400">{d.kind}</span>
            </div>
          ))}
          {docs.length === 0 && <p className="text-sm text-slate-400">No labs or documents. Add a lab result or upload a file — the AI factors them in.</p>}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- AI Assistant
function AIAssistantTab({ patientId, assessment, onAssessed }: any) {
  const [busy, setBusy] = useState(false);
  const [msgs, setMsgs] = useState<{ role: "you" | "ai"; text: string }[]>([]);
  const [q, setQ] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const run = async () => {
    setBusy(true);
    try { onAssessed(await api<Assessment>(`/api/patients/${patientId}/assess`, { method: "POST" })); }
    finally { setBusy(false); }
  };
  const ask = async () => {
    if (!q.trim() || chatBusy) return;
    const question = q; setQ("");
    setMsgs((m) => [...m, { role: "you", text: question }, { role: "ai", text: "" }]);
    setChatBusy(true);
    const scroll = () => endRef.current?.scrollIntoView({ behavior: "smooth" });
    try {
      const token = localStorage.getItem("mid_token");
      const res = await fetch(`/api/patients/${patientId}/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ question }),
      });
      if (!res.body) throw new Error();
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      // stream chunks into the last (ai) message
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = dec.decode(value, { stream: true });
        setMsgs((m) => {
          const copy = [...m];
          copy[copy.length - 1] = { role: "ai", text: copy[copy.length - 1].text + chunk };
          return copy;
        });
        scroll();
      }
    } catch {
      setMsgs((m) => {
        const copy = [...m];
        copy[copy.length - 1] = { role: "ai", text: "Error contacting the assistant." };
        return copy;
      });
    } finally {
      setChatBusy(false);
      setTimeout(scroll, 50);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-bold"><BrainCircuit size={16} className="text-teal-600" /> Holistic assessment</h2>
          <button className="btn" onClick={run} disabled={busy}>{busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} {assessment ? "Re-run" : "Run assessment"}</button>
        </div>
        {!assessment ? (
          <p className="py-8 text-center text-sm text-slate-400">Run the assessment — the AI reads the entire profile (all imaging, findings, reports, labs, notes) and returns a holistic view.</p>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              Source: <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">{assessment.source}</code>
              {assessment.urgent && <span className="badge sev-critical">urgent</span>}
            </div>
            <p className="text-slate-700 dark:text-slate-300">{assessment.narrative}</p>
            {assessment.problem_list?.length > 0 && (
              <div><h3 className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">Problem list</h3>
                <ul className="list-inside list-disc space-y-0.5 text-slate-600 dark:text-slate-300">{assessment.problem_list.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul></div>
            )}
            {assessment.differential?.length > 0 && (
              <div><h3 className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">Differential</h3>
                {assessment.differential.map((d: { condition: string; rationale: string }, i: number) => <div key={i} className="py-0.5"><b>{d.condition}</b> — <span className="text-slate-500">{d.rationale}</span></div>)}</div>
            )}
            {assessment.suggestions?.length > 0 && (
              <div><h3 className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">Suggested next steps</h3>
                <ul className="space-y-0.5">{assessment.suggestions.map((s: string, i: number) => <li key={i} className="flex gap-2"><span className="text-teal-600">→</span>{s}</li>)}</ul></div>
            )}
          </div>
        )}
      </div>

      <div className="card flex flex-col p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold"><Activity size={16} className="text-teal-600" /> Ask about this patient</h2>
        <div className="mb-3 flex-1 space-y-2 overflow-y-auto" style={{ maxHeight: 340 }}>
          {msgs.length === 0 && <p className="py-8 text-center text-sm text-slate-400">Ask anything — e.g. “What’s the most urgent issue?”, “Do the labs support the imaging?”. Answers use the Claude CLI over the full profile.</p>}
          {msgs.map((m, i) => (
            <div key={i} className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.role === "you" ? "ml-auto bg-teal-600 text-white" : "bg-slate-100 dark:bg-slate-800"}`}>{m.text}</div>
          ))}
          {chatBusy && <div className="rounded-2xl bg-slate-100 px-3 py-2 text-sm dark:bg-slate-800"><Loader2 size={14} className="animate-spin" /></div>}
          <div ref={endRef} />
        </div>
        <div className="flex gap-2">
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask()} placeholder="Ask a question…" />
          <button className="btn" onClick={ask} disabled={chatBusy}><Send size={15} /></button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Timeline
function TimelineTab({ profile, docs }: any) {
  const events = [
    ...profile.studies.map((s: Study) => ({ t: s.acquired_at || "", kind: "study", label: `${s.modality.toUpperCase()} — ${s.body_part || ""}`, sub: s.description || "" })),
    ...docs.map((d: DocRow) => ({ t: d.created_at, kind: "doc", label: d.title, sub: d.value || d.kind })),
  ].filter((e) => e.t).sort((a, b) => (a.t < b.t ? 1 : -1));
  return (
    <div className="card p-5">
      <h2 className="mb-4 text-sm font-bold">Patient timeline</h2>
      {events.length === 0 ? <p className="text-sm text-slate-400">No events yet.</p> : (
        <ol className="relative ml-3 border-l border-slate-200 dark:border-slate-700">
          {events.map((e, i) => (
            <li key={i} className="mb-5 ml-5">
              <span className={`absolute -left-1.5 mt-1 h-3 w-3 rounded-full ${e.kind === "study" ? "bg-teal-500" : "bg-amber-500"}`} />
              <div className="text-xs text-slate-400">{new Date(e.t).toLocaleString()}</div>
              <div className="font-medium">{e.label}</div>
              <div className="text-sm text-slate-500">{e.sub}</div>
            </li>
          ))}
        </ol>
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
