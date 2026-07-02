"""Structured clinical reporting.

Turns a diagnostic engine's findings into a *structured* report — the kind a
radiology information system produces — rather than a flat paragraph:

  header · clinical information · technique · comparison
  · itemized findings (anatomy / system / laterality / confidence / severity)
  · standardized assessment category (Lung-RADS / BI-RADS-style / ICDR)
  · numbered impression · recommendations · AI provenance · disclaimer

It emits three things from one model:
  * a machine-readable dict (also serialized as a FHIR-style DiagnosticReport),
  * a numbered impression + narrative body (for back-compat / PDF text),
  * a self-contained HTML artifact.

Assessment categories here are heuristic prototypes keyed off model probability
(real Lung-RADS/BI-RADS need size, growth and morphology we don't measure) and
are labelled as such — they illustrate the structure, not clinical scoring.
"""
from __future__ import annotations

import html
import json
from datetime import date, datetime

SCHEMA = "mid.structured-report/v1"

SEVERITY_ORDER = ["normal", "low", "moderate", "high", "critical"]

MODALITY_TITLE = {
    "xray": "Chest Radiograph", "ct": "Computed Tomography", "mri": "MRI",
    "fundus": "Fundus Photography", "dermoscopy": "Dermoscopy", "pathology": "Digital Pathology",
}
TECHNIQUE = {
    "xray": "Digital radiography, PA projection. Automated analysis by a deep-learning classifier.",
    "ct": "Multidetector CT, axial acquisition. Automated segmentation/detection analysis.",
    "mri": "Multiplanar multisequence MRI. Automated analysis.",
    "fundus": "Colour fundus photography. Automated retinal analysis.",
    "dermoscopy": "Dermoscopic imaging. Automated lesion analysis.",
    "pathology": "Whole-slide imaging. Automated tissue analysis.",
}

# label -> anatomy/system + optional oncologic flag
ANATOMY: dict[str, dict] = {
    "Nodule": {"system": "Respiratory", "anatomy": "Lung", "onco": True},
    "Mass": {"system": "Respiratory", "anatomy": "Lung", "onco": True},
    "Lung Opacity": {"system": "Respiratory", "anatomy": "Lung", "onco": True},
    "Lung Lesion": {"system": "Respiratory", "anatomy": "Lung", "onco": True},
    "Consolidation": {"system": "Respiratory", "anatomy": "Lung parenchyma"},
    "Infiltration": {"system": "Respiratory", "anatomy": "Lung parenchyma"},
    "Pneumonia": {"system": "Respiratory", "anatomy": "Lung parenchyma"},
    "Atelectasis": {"system": "Respiratory", "anatomy": "Lung"},
    "Edema": {"system": "Cardiopulmonary", "anatomy": "Lung interstitium"},
    "Effusion": {"system": "Pleura", "anatomy": "Pleural space"},
    "Pleural_Thickening": {"system": "Pleura", "anatomy": "Pleura"},
    "Pneumothorax": {"system": "Pleura", "anatomy": "Pleural space"},
    "Emphysema": {"system": "Respiratory", "anatomy": "Lung"},
    "Fibrosis": {"system": "Respiratory", "anatomy": "Lung interstitium"},
    "Cardiomegaly": {"system": "Cardiovascular", "anatomy": "Cardiac silhouette"},
    "Hernia": {"system": "Gastrointestinal", "anatomy": "Diaphragm"},
    "Ground-glass opacity": {"system": "Respiratory", "anatomy": "Lung parenchyma", "onco": True},
    "Lesion": {"system": "General", "anatomy": "Soft tissue", "onco": True},
    # oncology — from MONAI detection (lowercase) + specialty engines
    "nodule": {"system": "Respiratory", "anatomy": "Lung", "onco": True},
    "Pulmonary nodule": {"system": "Respiratory", "anatomy": "Lung", "onco": True},
    "Pancreatic tumor": {"system": "Gastrointestinal", "anatomy": "Pancreas", "onco": True},
    # skin (dermoscopy)
    "Melanoma": {"system": "Dermatologic", "anatomy": "Skin", "onco": True},
    "Basal cell carcinoma": {"system": "Dermatologic", "anatomy": "Skin", "onco": True},
    "Actinic keratosis": {"system": "Dermatologic", "anatomy": "Skin", "onco": True},
    "Melanocytic nevus": {"system": "Dermatologic", "anatomy": "Skin"},
    "Benign keratosis": {"system": "Dermatologic", "anatomy": "Skin"},
    "Dermatofibroma": {"system": "Dermatologic", "anatomy": "Skin"},
    "Vascular lesion": {"system": "Dermatologic", "anatomy": "Skin"},
    # brain (MRI)
    "Glioma": {"system": "Neurologic", "anatomy": "Brain", "onco": True},
    "Enhancing tumor": {"system": "Neurologic", "anatomy": "Brain", "onco": True},
    "Necrotic core": {"system": "Neurologic", "anatomy": "Brain", "onco": True},
    "Metastasis": {"system": "Neurologic", "anatomy": "Brain", "onco": True},
    "Peritumoral edema": {"system": "Neurologic", "anatomy": "Brain"},
    # retinal
    "Mild DR": {"system": "Ophthalmic", "anatomy": "Retina"},
    "Moderate DR": {"system": "Ophthalmic", "anatomy": "Retina"},
    "Severe DR": {"system": "Ophthalmic", "anatomy": "Retina"},
    "Proliferative DR": {"system": "Ophthalmic", "anatomy": "Retina"},
    "Glaucoma": {"system": "Ophthalmic", "anatomy": "Optic disc"},
    "AMD": {"system": "Ophthalmic", "anatomy": "Macula"},
}


def _esc(s) -> str:
    return html.escape(str(s if s is not None else ""))


def _age(dob: str | None) -> str:
    if not dob:
        return "—"
    try:
        d = datetime.strptime(dob, "%Y-%m-%d").date()
        t = date.today()
        return f"{t.year - d.year - ((t.month, t.day) < (d.month, d.day))}y"
    except Exception:
        return "—"


def _anatomy(label: str) -> dict:
    return ANATOMY.get(label, {"system": "General", "anatomy": "—"})


def _assessment(modality: str, positives: list[dict]) -> dict | None:
    """Standardized category from the strongest relevant finding (heuristic)."""
    labels = {f["label"]: f["probability"] for f in positives}

    # Skin cancer (dermoscopy) → malignancy suspicion
    SKIN_MALIGNANT = {
        "Melanoma": "Melanoma", "Basal cell carcinoma": "Basal cell carcinoma",
        "Actinic keratosis": "Actinic keratosis (pre-malignant)",
    }
    skin_hits = [(SKIN_MALIGNANT[l], labels[l]) for l in SKIN_MALIGNANT if l in labels]
    if modality == "dermoscopy" and skin_hits:
        name, p = max(skin_hits, key=lambda x: x[1])
        if p >= 0.6:
            mean = f"Suspicious for {name.lower()} — dermatology referral & excisional biopsy."
        else:
            mean = f"Possible {name.lower()} — dermoscopic review / short-interval follow-up."
        return {"category": f"Skin: {name} suspected", "system": "ISIC lesion classification",
                "meaning": mean, "onco_flag": True}

    # Brain tumour (MRI) → neuro-oncology
    brain_onco = [l for l in labels if l in ("Glioma", "Enhancing tumor", "Metastasis", "Necrotic core")]
    if modality == "mri" and brain_onco:
        top = max(brain_onco, key=lambda l: labels[l])
        return {"category": f"Brain tumour suspected ({top})",
                "system": "Neuro-oncology (BraTS-style)",
                "meaning": "Neuro-oncology referral; contrast-enhanced MRI; consider "
                           "stereotactic biopsy / MDT review.", "onco_flag": True}

    # Pancreatic tumour (CT)
    if modality == "ct" and "Pancreatic tumor" in labels:
        return {"category": "Pancreatic mass — suspicious", "system": "Pancreatic oncology",
                "meaning": "Pancreatic-protocol CT/MRI; CA 19-9; HPB MDT referral.",
                "onco_flag": True}

    # Lung nodule / mass → Lung-RADS-style (heuristic, probability-driven)
    onco = [(l, p) for l, p in labels.items() if _anatomy(l).get("onco")
            and _anatomy(l)["system"] == "Respiratory"]
    if onco and modality in ("xray", "ct"):
        top_p = max(p for _, p in onco)
        has_mass = any(l in ("Mass",) for l, _ in onco)
        if has_mass or top_p >= 0.8:
            cat, mean = "4B", "Very suspicious — malignancy probability ≥15%. Tissue sampling / PET-CT."
        elif top_p >= 0.6:
            cat, mean = "4A", "Suspicious — malignancy probability 5–15%. Short-interval CT / PET-CT."
        elif top_p >= 0.35:
            cat, mean = "3", "Probably benign — malignancy <2%. 6-month follow-up CT."
        else:
            cat, mean = "2", "Benign appearance. Routine annual screening."
        return {"category": f"Lung-RADS {cat}", "system": "Lung-RADS v2022 (heuristic)",
                "meaning": mean, "onco_flag": True}

    # Diabetic retinopathy → ICDR grade
    dr_map = {
        "Proliferative DR": ("Grade 4", "Proliferative DR — urgent ophthalmology referral."),
        "Severe DR": ("Grade 3", "Severe non-proliferative DR — refer within weeks."),
        "Moderate DR": ("Grade 2", "Moderate non-proliferative DR — 3–6 month review."),
        "Mild DR": ("Grade 1", "Mild non-proliferative DR — 6–12 month review."),
    }
    for lbl, (cat, mean) in dr_map.items():
        if lbl in labels:
            return {"category": f"ICDR {cat}", "system": "Intl. Clinical DR Severity",
                    "meaning": mean, "onco_flag": False}
    return None


def _descriptor(f: dict) -> str:
    a = _anatomy(f["label"])
    conf = f"{f['probability']*100:.0f}% confidence"
    loc = f" in the {a['anatomy'].lower()}" if a["anatomy"] != "—" else ""
    return f"{f['label']} identified{loc} ({conf}, {f['severity']} concern)."


def build_structured_report(*, modality: str, findings: list[dict], patient, study,
                            ai_meta: dict, report_id: str) -> dict:
    positives = sorted(
        [f for f in findings if f["severity"] != "normal"],
        key=lambda f: f["probability"], reverse=True,
    )
    max_sev = max((f["severity"] for f in findings), key=SEVERITY_ORDER.index) \
        if findings else "normal"

    itemized = []
    for i, f in enumerate(positives, 1):
        a = _anatomy(f["label"])
        itemized.append({
            "id": i, "label": f["label"], "system": a["system"], "anatomy": a["anatomy"],
            "probability": round(f["probability"], 4), "severity": f["severity"],
            "oncologic": bool(a.get("onco")), "descriptor": _descriptor(f),
        })

    assessment = _assessment(modality, positives)

    # Impression (numbered) + recommendations
    impression: list[str] = []
    recommendations: list[str] = []
    if not positives:
        impression.append("No acute abnormality detected on automated analysis.")
        recommendations.append("Routine clinical follow-up as indicated.")
    else:
        for i, f in enumerate(itemized, 1):
            impression.append(f"{f['label']} ({f['probability']*100:.0f}%, {f['severity']}).")
        if assessment:
            impression.append(f"Assessment: {assessment['category']} — {assessment['meaning']}")
            recommendations.append(assessment["meaning"])
        onco = [f for f in itemized if f["oncologic"]]
        if onco:
            recommendations.append(
                "Oncologic workup advised: correlate with prior imaging, consider "
                "contrast CT/PET-CT and multidisciplinary review.")
        recommendations.append("Clinical correlation and specialist review required.")

    return {
        "schema": SCHEMA,
        "report_id": report_id,
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "status": "preliminary-ai-draft",
        "patient": {
            "name": patient.full_name, "mrn": patient.mrn, "sex": patient.sex,
            "date_of_birth": patient.date_of_birth, "age": _age(patient.date_of_birth),
        },
        "study": {
            "modality": modality, "modality_title": MODALITY_TITLE.get(modality, modality.upper()),
            "body_part": study.body_part, "description": study.description,
            "acquired_at": study.acquired_at.isoformat() if getattr(study, "acquired_at", None) else None,
        },
        "clinical_information": patient.notes or study.description or "Not provided.",
        "technique": TECHNIQUE.get(modality, "Automated analysis."),
        "comparison": "No prior studies available for comparison.",
        "findings": itemized,
        "max_severity": max_sev,
        "assessment": assessment,
        "impression": impression,
        "recommendations": list(dict.fromkeys(recommendations)),
        "ai": ai_meta,
        "disclaimer": (
            "Preliminary AI-generated report from a research/education prototype. "
            "Automated findings and assessment categories are heuristic and NOT "
            "validated for clinical use. A qualified physician must review all imaging."
        ),
    }


def narrative_from_structured(report: dict) -> tuple[str, str]:
    """(impression_text, full_body_text) — plain text for back-compat / PDF."""
    imp = " ".join(f"{i}. {s}" for i, s in enumerate(report["impression"], 1))
    lines = [
        f"{report['study']['modality_title']} — {report['study'].get('body_part') or ''}",
        "",
        f"CLINICAL INFORMATION: {report['clinical_information']}",
        f"TECHNIQUE: {report['technique']}",
        f"COMPARISON: {report['comparison']}",
        "",
        "FINDINGS:",
    ]
    if report["findings"]:
        for f in report["findings"]:
            lines.append(f"  {f['id']}. {f['descriptor']} [{f['system']}]")
    else:
        lines.append("  No significant findings on automated analysis.")
    if report["assessment"]:
        a = report["assessment"]
        lines += ["", f"ASSESSMENT: {a['category']} ({a['system']}) — {a['meaning']}"]
    lines += ["", "IMPRESSION:"]
    lines += [f"  {i}. {s}" for i, s in enumerate(report["impression"], 1)]
    if report["recommendations"]:
        lines += ["", "RECOMMENDATIONS:"]
        lines += [f"  - {r}" for r in report["recommendations"]]
    return imp, "\n".join(lines)


def to_fhir(report: dict) -> dict:
    """Minimal FHIR R4 DiagnosticReport representation of the structured report."""
    return {
        "resourceType": "DiagnosticReport",
        "status": "preliminary",
        "category": [{"coding": [{"system": "http://terminology.hl7.org/CodeSystem/v2-0074",
                                   "code": "RAD", "display": "Radiology"}]}],
        "code": {"text": report["study"]["modality_title"]},
        "subject": {"display": report["patient"]["name"],
                    "identifier": {"value": report["patient"]["mrn"]}},
        "effectiveDateTime": report["study"].get("acquired_at"),
        "issued": report["generated_at"],
        "conclusion": " ".join(report["impression"]),
        "conclusionCode": (
            [{"text": report["assessment"]["category"]}] if report["assessment"] else []
        ),
        "extension": [{"url": "https://mid.local/structured-report", "valueString": json.dumps(report)}],
    }


# ---------------------------------------------------------------- HTML artifact
SEV_COLORS = {"normal": "#15803d", "low": "#0369a1", "moderate": "#a16207",
              "high": "#c2410c", "critical": "#b91c1c"}
SEV_BG = {"normal": "#dcfce7", "low": "#e0f2fe", "moderate": "#fef9c3",
          "high": "#ffedd5", "critical": "#fee2e2"}


def render_structured_html(report: dict) -> str:
    p, st = report["patient"], report["study"]
    a = report["assessment"]

    def badge(sev):
        return (f'<span class="sev" style="color:{SEV_COLORS.get(sev,"#334155")};'
                f'background:{SEV_BG.get(sev,"#f1f5f9")}">{_esc(sev)}</span>')

    findings_rows = "".join(
        f'<tr><td>{f["id"]}</td><td><b>{_esc(f["label"])}</b>'
        f'{" <span class=onco>oncologic</span>" if f["oncologic"] else ""}</td>'
        f'<td>{_esc(f["system"])} · {_esc(f["anatomy"])}</td>'
        f'<td class=prob><div class=bar><span style="width:{f["probability"]*100:.0f}%;'
        f'background:{SEV_COLORS.get(f["severity"],"#334155")}"></span></div>{f["probability"]*100:.0f}%</td>'
        f'<td>{badge(f["severity"])}</td></tr>'
        for f in report["findings"]
    ) or '<tr><td colspan=5 class=none>No significant findings on automated analysis.</td></tr>'

    assess_html = ""
    if a:
        assess_html = f"""<div class="assess {'onco-assess' if a.get('onco_flag') else ''}">
          <div class="cat">{_esc(a['category'])}</div>
          <div class="am"><b>{_esc(a['system'])}</b> — {_esc(a['meaning'])}</div></div>"""

    impression = "".join(f"<li>{_esc(s)}</li>" for s in report["impression"])
    recs = "".join(f"<li>{_esc(r)}</li>" for r in report["recommendations"])

    return f"""<!DOCTYPE html><html lang=en><head><meta charset=utf-8>
<meta name=viewport content="width=device-width, initial-scale=1">
<title>Structured Report {_esc(report['report_id'])}</title><style>
:root{{--ink:#0f172a;--muted:#64748b;--line:#e2e8f0;--brand:#0f766e}}
*{{box-sizing:border-box}}body{{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;
color:var(--ink);background:#f1f5f9;margin:0}}
.sheet{{max-width:820px;margin:22px auto;background:#fff;border-radius:8px;padding:36px 44px;
box-shadow:0 4px 24px rgba(15,23,42,.08)}}
header{{display:flex;justify-content:space-between;border-bottom:3px solid var(--brand);padding-bottom:14px}}
.org{{font-size:19px;font-weight:700;color:var(--brand)}}.org small{{display:block;font-weight:400;color:var(--muted);font-size:11px}}
.meta{{text-align:right;font-size:11.5px;color:var(--muted)}}.meta b{{color:var(--ink)}}
h2{{font-size:12px;letter-spacing:.07em;text-transform:uppercase;color:var(--muted);margin:22px 0 7px;border-bottom:1px solid var(--line);padding-bottom:4px}}
.pt{{display:grid;grid-template-columns:repeat(4,1fr);gap:6px 14px;font-size:13.5px;background:#f8fafc;
border:1px solid var(--line);border-radius:8px;padding:12px 14px}}
.pt .l{{font-size:10.5px;text-transform:uppercase;color:var(--muted)}}.pt .v{{font-weight:600}}
.kv{{font-size:13.5px;margin:5px 0}}.kv b{{color:var(--ink)}}
table{{width:100%;border-collapse:collapse;font-size:13px}}
th{{text-align:left;font-size:10.5px;text-transform:uppercase;color:var(--muted);border-bottom:1px solid var(--line);padding:6px 5px}}
td{{padding:8px 5px;border-bottom:1px solid #f1f5f9;vertical-align:middle}}
td.prob{{display:flex;align-items:center;gap:8px}}.bar{{flex:1;max-width:120px;height:6px;background:#f1f5f9;border-radius:99px;overflow:hidden}}
.bar span{{display:block;height:100%}}.none{{color:#15803d}}
.sev{{padding:2px 9px;border-radius:99px;font-size:11px;font-weight:700;text-transform:capitalize}}
.onco{{font-size:9.5px;font-weight:700;color:#b91c1c;background:#fee2e2;padding:1px 6px;border-radius:99px;text-transform:uppercase;margin-left:4px}}
.assess{{border:1px solid var(--brand);border-radius:8px;padding:12px 14px;background:#f0fdfa;margin-top:6px;display:flex;gap:14px;align-items:center}}
.assess.onco-assess{{border-color:#b91c1c;background:#fef2f2}}
.assess .cat{{font-size:20px;font-weight:800;color:var(--brand);white-space:nowrap}}
.onco-assess .cat{{color:#b91c1c}}.assess .am{{font-size:13px}}
ol,ul{{margin:6px 0;padding-left:22px;font-size:13.5px}}li{{margin:3px 0}}
footer{{margin-top:24px;padding-top:12px;border-top:1px solid var(--line);font-size:10.5px;color:var(--muted);line-height:1.5}}
.toolbar{{max-width:820px;margin:14px auto -6px;text-align:right}}
.toolbar button{{font:inherit;font-size:13px;background:var(--brand);color:#fff;border:0;padding:8px 15px;border-radius:8px;cursor:pointer}}
@media print{{body{{background:#fff}}.sheet{{box-shadow:none;margin:0}}.toolbar{{display:none}}}}
</style></head><body>
<div class=toolbar><button onclick="window.print()">🖨 Print / Save as PDF</button></div>
<div class=sheet>
<header><div class=org>{_esc(st['modality_title'])} — Structured Report<small>AI-Assisted Diagnostic Reporting</small></div>
<div class=meta><div><b>Report ID:</b> {_esc(report['report_id'])}</div>
<div><b>Generated:</b> {_esc(report['generated_at'].replace('T',' '))}</div>
<div><b>Status:</b> Preliminary (AI draft)</div></div></header>

<h2>Patient</h2>
<div class=pt>
<div><div class=l>Name</div><div class=v>{_esc(p['name'])}</div></div>
<div><div class=l>MRN</div><div class=v>{_esc(p['mrn'])}</div></div>
<div><div class=l>Sex</div><div class=v>{_esc(p['sex'] or '—')}</div></div>
<div><div class=l>DOB / Age</div><div class=v>{_esc(p['date_of_birth'] or '—')} ({_esc(p['age'])})</div></div>
</div>

<h2>Clinical information</h2><div class=kv>{_esc(report['clinical_information'])}</div>
<h2>Technique</h2><div class=kv>{_esc(report['technique'])}</div>
<h2>Comparison</h2><div class=kv>{_esc(report['comparison'])}</div>

<h2>Findings</h2>
<table><thead><tr><th>#</th><th>Finding</th><th>System / Anatomy</th><th>Probability</th><th>Severity</th></tr></thead>
<tbody>{findings_rows}</tbody></table>

{('<h2>Assessment</h2>' + assess_html) if a else ''}

<h2>Impression</h2><ol>{impression}</ol>
<h2>Recommendations</h2><ul>{recs}</ul>

<h2>AI provenance</h2>
<div class=kv><b>Engine:</b> {_esc(report['ai'].get('engine'))} · <b>Model:</b> <code>{_esc(report['ai'].get('model_source'))}</code></div>

<footer><b>Disclaimer:</b> {_esc(report['disclaimer'])}</footer>
</div></body></html>"""
