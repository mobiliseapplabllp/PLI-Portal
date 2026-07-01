"""Export human-readable sample reports from the seeded database.

Writes one Markdown file per patient into `sample_data/reports/`, containing
demographics, each study's AI findings, the AI-draft radiology report, and the
patient-level cross-study correlation. Handy for reviewing "sample reports"
without opening the app.

Run:  cd backend && python -m app.export_reports   (after seeding)
"""
from __future__ import annotations

import json
import os

from sqlmodel import Session, select

from .database import engine
from .models import Correlation, DiagnosticResult, Organization, Patient, Report, Study
from .report_render import render_patient_report
from .sample_scenarios import slugify

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
OUT_DIR = os.path.join(REPO_ROOT, "sample_data", "reports")


def _fmt_findings(findings: list[dict]) -> str:
    pos = [f for f in findings if f["severity"] != "normal"]
    pos.sort(key=lambda f: f["probability"], reverse=True)
    if not pos:
        return "_No significant findings._"
    return "\n".join(f"- **{f['label']}** — {f['probability']:.0%} ({f['severity']})" for f in pos)


def export() -> list[str]:
    os.makedirs(OUT_DIR, exist_ok=True)
    written = []
    with Session(engine) as session:
        patients = session.exec(select(Patient)).all()
        for patient in patients:
            org = session.get(Organization, patient.org_id)
            studies = session.exec(
                select(Study).where(Study.patient_id == patient.id)
            ).all()
            corr = session.exec(
                select(Correlation).where(Correlation.patient_id == patient.id)
            ).first()

            lines = [
                f"# Diagnostic Report — {patient.full_name}",
                "",
                f"- **Organization:** {org.name}",
                f"- **MRN:** {patient.mrn}",
                f"- **Sex / DOB:** {patient.sex} / {patient.date_of_birth}",
                f"- **Clinical notes:** {patient.notes or '—'}",
                "",
                "---",
                "",
            ]
            for st in studies:
                diag = session.exec(
                    select(DiagnosticResult).where(DiagnosticResult.study_id == st.id)
                    .order_by(DiagnosticResult.id.desc())
                ).first()
                report = session.exec(
                    select(Report).where(Report.study_id == st.id)
                    .order_by(Report.id.desc())
                ).first()
                lines += [
                    f"## {st.modality.value.upper()} — {st.body_part}",
                    f"_{st.description}_",
                    "",
                ]
                if diag:
                    lines += [
                        f"**AI engine:** `{diag.model_source}` · "
                        f"**Max severity:** {diag.max_severity.value}",
                        "",
                        "**Findings:**",
                        _fmt_findings(json.loads(diag.findings_json)),
                        "",
                    ]
                if report:
                    lines += ["**AI-draft report:**", "", "```", report.body, "```", ""]
                lines.append("---\n")

            if corr:
                diff = json.loads(corr.differential_json)
                recs = json.loads(corr.recommendations_json)
                lines += [
                    "## 🧠 Cross-study AI correlation",
                    f"**Max severity:** {corr.max_severity.value}",
                    "",
                    corr.summary,
                    "",
                ]
                if diff:
                    lines.append("**Differential:**")
                    lines += [
                        f"- {d['condition']} — {d['confidence']:.0%} "
                        f"(supporting: {', '.join(d['supporting_findings'])})"
                        for d in diff
                    ]
                    lines.append("")
                if recs:
                    lines.append("**Recommendations:**")
                    lines += [f"- {r}" for r in recs]
                    lines.append("")

            lines += [
                "---",
                "_⚠️ Research/education prototype. Findings are simulated (or from a "
                "non-clinical model) and are NOT validated for clinical use._",
            ]

            slug = slugify(patient.full_name)
            out = os.path.join(OUT_DIR, f"{slug}.md")
            with open(out, "w") as fh:
                fh.write("\n".join(lines))
            written.append(out)

            # Also emit the formal, print-ready HTML report artifact.
            items = []
            for st in studies:
                diag = session.exec(
                    select(DiagnosticResult).where(DiagnosticResult.study_id == st.id)
                    .order_by(DiagnosticResult.id.desc())
                ).first()
                rep = session.exec(
                    select(Report).where(Report.study_id == st.id).order_by(Report.id.desc())
                ).first()
                items.append({
                    "study": st,
                    "diagnostic": ({**diag.model_dump(), "findings": json.loads(diag.findings_json)}
                                   if diag else None),
                    "report": rep,
                })
            html = render_patient_report(
                org=org, patient=patient, studies=items, correlation=corr,
                report_id=f"MID-{patient.org_id:02d}-{patient.id:04d}",
            )
            html_out = os.path.join(OUT_DIR, f"{slug}.html")
            with open(html_out, "w") as fh:
                fh.write(html)
            written.append(html_out)
    return written


if __name__ == "__main__":
    files = export()
    print(f"Wrote {len(files)} reports to {OUT_DIR}")
    for f in files:
        print("  -", os.path.basename(f))
