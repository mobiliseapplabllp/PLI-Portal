"""Render a formal, print-ready medical imaging report as a self-contained
HTML document (an "artifact" the user can open, print, or save as PDF).

No template engine — plain f-strings with inlined CSS so the output is a single
portable file. Structured like a real diagnostic radiology report:
letterhead → patient → clinical indication → per-study findings → impression →
AI correlation → recommendations → sign-off → disclaimer.
"""
from __future__ import annotations

import html
import json
from datetime import date, datetime

SEV_COLORS = {
    "normal": "#15803d", "low": "#0369a1", "moderate": "#a16207",
    "high": "#c2410c", "critical": "#b91c1c",
}
SEV_BG = {
    "normal": "#dcfce7", "low": "#e0f2fe", "moderate": "#fef9c3",
    "high": "#ffedd5", "critical": "#fee2e2",
}
MODALITY_TECHNIQUE = {
    "xray": "Digital radiography, PA projection.",
    "ct": "Multidetector CT, axial acquisition with reconstructions.",
    "mri": "Multiplanar multisequence MRI.",
    "fundus": "Colour fundus photography.",
    "dermoscopy": "Dermoscopic imaging.",
    "pathology": "Whole-slide digital pathology.",
}
MODALITY_TITLE = {
    "xray": "Chest Radiograph", "ct": "CT", "mri": "MRI",
    "fundus": "Fundus Photography", "dermoscopy": "Dermoscopy", "pathology": "Pathology",
}


def _esc(s) -> str:
    return html.escape(str(s if s is not None else ""))


def _age(dob: str | None) -> str:
    if not dob:
        return "—"
    try:
        d = datetime.strptime(dob, "%Y-%m-%d").date()
        today = date.today()
        years = today.year - d.year - ((today.month, today.day) < (d.month, d.day))
        return f"{years} y"
    except Exception:
        return "—"


def _badge(sev: str) -> str:
    return (f'<span class="sev" style="color:{SEV_COLORS.get(sev, "#334155")};'
            f'background:{SEV_BG.get(sev, "#f1f5f9")}">{_esc(sev)}</span>')


def _findings_rows(findings: list[dict]) -> str:
    pos = sorted([f for f in findings if f["severity"] != "normal"],
                 key=lambda f: f["probability"], reverse=True)
    if not pos:
        return ('<tr><td colspan="3" class="none">No significant findings '
                'detected on automated analysis.</td></tr>')
    rows = []
    for f in pos:
        pct = f["probability"] * 100
        rows.append(
            f'<tr><td>{_esc(f["label"])}</td>'
            f'<td class="prob"><div class="bar"><span style="width:{pct:.0f}%;'
            f'background:{SEV_COLORS.get(f["severity"], "#334155")}"></span></div>'
            f'{pct:.0f}%</td>'
            f'<td>{_badge(f["severity"])}</td></tr>'
        )
    return "".join(rows)


def render_patient_report(*, org, patient, studies: list[dict], correlation,
                          report_id: str) -> str:
    """`studies`: list of {study, diagnostic(dict|None), report(obj|None)}.
    `correlation`: Correlation row or None."""
    generated = datetime.now().strftime("%d %b %Y, %H:%M")
    overall_sev = correlation.max_severity.value if correlation else "normal"

    study_sections = []
    for item in studies:
        st = item["study"]
        diag = item.get("diagnostic")
        rep = item.get("report")
        modality = st.modality.value
        title = MODALITY_TITLE.get(modality, modality.upper())
        technique = MODALITY_TECHNIQUE.get(modality, "—")
        findings = diag["findings"] if diag else []
        model = diag["model_source"] if diag else "—"
        impression = rep.impression if rep else "Pending."
        study_sections.append(f"""
        <section class="study">
          <div class="study-head">
            <h3>{_esc(title)} — {_esc(st.body_part or '')}</h3>
            <span class="muted">{_esc(st.acquired_at.strftime('%d %b %Y') if getattr(st, 'acquired_at', None) else '')}</span>
          </div>
          <p class="tech"><strong>Technique:</strong> {_esc(technique)}
             &nbsp;·&nbsp; <strong>Indication:</strong> {_esc(st.description or '—')}</p>
          <table class="findings">
            <thead><tr><th>Finding</th><th>Probability</th><th>Severity</th></tr></thead>
            <tbody>{_findings_rows(findings)}</tbody>
          </table>
          <p class="impression"><strong>Impression:</strong> {_esc(impression)}</p>
          <p class="model">Automated analysis: <code>{_esc(model)}</code></p>
        </section>""")

    # Correlation block
    corr_html = ""
    if correlation:
        diff = json.loads(correlation.differential_json)
        recs = json.loads(correlation.recommendations_json)
        diff_html = "".join(
            f'<li><span class="cond">{_esc(d["condition"])}</span>'
            f'<span class="conf">{d["confidence"]*100:.0f}%</span>'
            f'<span class="support muted">supporting: {_esc(", ".join(d["supporting_findings"]))}</span></li>'
            for d in diff
        ) or '<li class="muted">No multi-finding pattern matched.</li>'
        recs_html = "".join(f"<li>{_esc(r)}</li>" for r in recs) or \
            '<li class="muted">Routine follow-up.</li>'
        corr_html = f"""
        <section class="corr">
          <div class="corr-head"><h3>Integrated AI Correlation</h3> {_badge(overall_sev)}</div>
          <p class="summary">{_esc(correlation.summary)}</p>
          <div class="corr-grid">
            <div><h4>Differential considerations</h4><ul class="diff">{diff_html}</ul></div>
            <div><h4>Recommendations</h4><ul class="recs">{recs_html}</ul></div>
          </div>
        </section>"""

    return f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Report {_esc(report_id)} — {_esc(patient.full_name)}</title>
<style>
  :root {{ --ink:#0f172a; --muted:#64748b; --line:#e2e8f0; --brand:#0f766e; }}
  * {{ box-sizing:border-box; }}
  body {{ font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    color:var(--ink); margin:0; background:#f1f5f9; }}
  .sheet {{ max-width:820px; margin:24px auto; background:#fff; padding:40px 48px;
    box-shadow:0 4px 24px rgba(15,23,42,.08); border-radius:8px; }}
  header.letter {{ display:flex; justify-content:space-between; align-items:flex-start;
    border-bottom:3px solid var(--brand); padding-bottom:16px; }}
  .org {{ font-size:20px; font-weight:700; color:var(--brand); }}
  .org small {{ display:block; font-weight:400; color:var(--muted); font-size:12px; }}
  .doc-meta {{ text-align:right; font-size:12px; color:var(--muted); }}
  .doc-meta b {{ color:var(--ink); }}
  h1 {{ font-size:16px; letter-spacing:.06em; text-transform:uppercase; color:var(--muted);
    margin:24px 0 8px; }}
  .pt {{ display:grid; grid-template-columns:repeat(4,1fr); gap:8px 16px; font-size:14px;
    background:#f8fafc; border:1px solid var(--line); border-radius:8px; padding:14px 16px; }}
  .pt .lbl {{ font-size:11px; text-transform:uppercase; color:var(--muted); letter-spacing:.04em; }}
  .pt .val {{ font-weight:600; }}
  .indication {{ font-size:14px; margin:14px 2px; }}
  section.study {{ border:1px solid var(--line); border-radius:8px; padding:16px 18px; margin:14px 0; }}
  .study-head {{ display:flex; justify-content:space-between; align-items:baseline; }}
  .study-head h3 {{ margin:0; font-size:15px; }}
  .tech {{ font-size:12.5px; color:#475569; margin:6px 0 12px; }}
  table.findings {{ width:100%; border-collapse:collapse; font-size:13px; }}
  table.findings th {{ text-align:left; font-size:11px; text-transform:uppercase; color:var(--muted);
    border-bottom:1px solid var(--line); padding:6px 4px; }}
  table.findings td {{ padding:7px 4px; border-bottom:1px solid #f1f5f9; }}
  td.prob {{ display:flex; align-items:center; gap:8px; }}
  .bar {{ flex:1; height:7px; background:#f1f5f9; border-radius:99px; overflow:hidden; max-width:160px; }}
  .bar span {{ display:block; height:100%; }}
  td.none {{ color:#15803d; padding:10px 4px; }}
  .sev {{ padding:2px 9px; border-radius:99px; font-size:11px; font-weight:700; text-transform:capitalize; }}
  .impression {{ font-size:13.5px; margin:12px 0 4px; }}
  .model {{ font-size:11px; color:var(--muted); margin:0; }}
  .model code {{ background:#f1f5f9; padding:1px 5px; border-radius:4px; }}
  section.corr {{ border:1px solid var(--brand); border-radius:8px; padding:16px 18px; margin:18px 0;
    background:linear-gradient(180deg,#f0fdfa,#fff); }}
  .corr-head {{ display:flex; align-items:center; gap:10px; }}
  .corr-head h3 {{ margin:0; font-size:15px; color:var(--brand); }}
  .summary {{ font-size:13.5px; }}
  .corr-grid {{ display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-top:8px; }}
  .corr-grid h4 {{ font-size:12px; text-transform:uppercase; color:var(--muted); margin:0 0 6px; }}
  ul.diff, ul.recs {{ margin:0; padding-left:0; list-style:none; font-size:13px; }}
  ul.diff li {{ display:grid; grid-template-columns:1fr auto; gap:2px 8px; padding:5px 0;
    border-bottom:1px solid #ecfdf5; }}
  ul.diff .cond {{ font-weight:600; }}
  ul.diff .conf {{ font-weight:700; color:var(--brand); }}
  ul.diff .support {{ grid-column:1/3; font-size:11px; }}
  ul.recs li {{ padding:5px 0 5px 18px; position:relative; }}
  ul.recs li:before {{ content:"→"; position:absolute; left:0; color:var(--brand); }}
  .muted {{ color:var(--muted); }}
  .signoff {{ display:flex; justify-content:space-between; margin-top:28px; font-size:13px; }}
  .sig {{ width:46%; }}
  .sig .line {{ border-top:1px solid var(--ink); margin-top:34px; padding-top:4px; color:var(--muted);
    font-size:11px; }}
  footer.disc {{ margin-top:26px; padding-top:14px; border-top:1px solid var(--line);
    font-size:10.5px; color:var(--muted); line-height:1.5; }}
  .toolbar {{ max-width:820px; margin:16px auto -8px; text-align:right; }}
  .toolbar button {{ font:inherit; font-size:13px; background:var(--brand); color:#fff; border:0;
    padding:8px 16px; border-radius:8px; cursor:pointer; }}
  @media print {{ body {{ background:#fff; }} .sheet {{ box-shadow:none; margin:0; border-radius:0; }}
    .toolbar {{ display:none; }} }}
</style></head>
<body>
  <div class="toolbar"><button onclick="window.print()">🖨 Print / Save as PDF</button></div>
  <div class="sheet">
    <header class="letter">
      <div class="org">{_esc(org.name)}<small>Department of Diagnostic Imaging · AI-Assisted Reporting</small></div>
      <div class="doc-meta">
        <div><b>Report ID:</b> {_esc(report_id)}</div>
        <div><b>Generated:</b> {_esc(generated)}</div>
        <div><b>Status:</b> Preliminary (AI draft)</div>
      </div>
    </header>

    <h1>Patient</h1>
    <div class="pt">
      <div><div class="lbl">Name</div><div class="val">{_esc(patient.full_name)}</div></div>
      <div><div class="lbl">MRN</div><div class="val">{_esc(patient.mrn)}</div></div>
      <div><div class="lbl">Sex</div><div class="val">{_esc(patient.sex or '—')}</div></div>
      <div><div class="lbl">DOB / Age</div><div class="val">{_esc(patient.date_of_birth or '—')} ({_age(patient.date_of_birth)})</div></div>
    </div>

    <p class="indication"><strong>Clinical indication:</strong> {_esc(patient.notes or '—')}</p>

    <h1>Imaging & Findings</h1>
    {''.join(study_sections) if study_sections else '<p class="muted">No studies on file.</p>'}

    {corr_html}

    <div class="signoff">
      <div class="sig"><div class="line">AI-assisted preliminary report — not a final interpretation</div></div>
      <div class="sig"><div class="line">Reporting radiologist (signature / date)</div></div>
    </div>

    <footer class="disc">
      <strong>Disclaimer:</strong> This document was produced by a research/education
      prototype ("Medical Imaging Diagnostic Assistant"). Findings are generated by
      automated models (including simulated engines) and are <strong>not validated for
      clinical use</strong> and not regulatory-cleared (FDA/CE). It must not be used for
      diagnosis or treatment. A qualified physician must review all imaging.
    </footer>
  </div>
</body></html>"""
