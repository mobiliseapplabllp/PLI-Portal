"""Cross-study correlation — the assistant's clinical reasoning layer.

Given all of a patient's positive findings across every modality, it looks for
known co-occurrence patterns and produces a ranked differential, plain-language
summary, and next-step recommendations. This is what turns a pile of per-image
scores into a single decision-support view for the treating doctor.

The pattern rules below are intentionally transparent (not a black box) so a
clinician can see *why* a suggestion was made — the explainability that 2026
radiology-AI guidance keeps emphasising.
"""
from __future__ import annotations

_SEV_ORDER = ["normal", "low", "moderate", "high", "critical"]


def _max_sev(a: str, b: str) -> str:
    return a if _SEV_ORDER.index(a) >= _SEV_ORDER.index(b) else b


# Each rule: required finding labels (any modality) -> condition suggestion.
PATTERN_RULES = [
    {
        "condition": "Congestive heart failure",
        "any_of": [["Cardiomegaly", "Effusion"], ["Cardiomegaly", "Edema"]],
        "recommendation": "Correlate with BNP / echocardiography; assess fluid status.",
    },
    {
        "condition": "Pulmonary infection / pneumonia",
        "any_of": [["Consolidation"], ["Pneumonia"], ["Infiltration", "Consolidation"]],
        "recommendation": "Correlate with WBC/CRP and clinical signs; consider antibiotics.",
    },
    {
        "condition": "Suspicious pulmonary neoplasm",
        "any_of": [["Mass"], ["Nodule", "Mass"], ["Lung Opacity", "Nodule"]],
        "recommendation": "Recommend contrast CT chest and pulmonology referral.",
    },
    {
        "condition": "Tension/simple pneumothorax",
        "any_of": [["Pneumothorax"]],
        "recommendation": "Urgent clinical review; consider chest decompression if symptomatic.",
    },
    {
        "condition": "Diabetic retinopathy progression",
        "any_of": [["Moderate DR"], ["Severe DR"], ["Proliferative DR"]],
        "recommendation": "Ophthalmology referral; optimise glycaemic control; consider anti-VEGF.",
    },
]


def build_correlation(findings_by_study: list[dict]) -> dict:
    """`findings_by_study`: list of {modality, findings:[{label,probability,severity}]}.

    Returns a dict ready to persist on the Correlation model."""
    positives: dict[str, float] = {}   # label -> best probability seen
    max_sev = "normal"
    for study in findings_by_study:
        for f in study.get("findings", []):
            if f["severity"] == "normal":
                continue
            positives[f["label"]] = max(positives.get(f["label"], 0.0), f["probability"])
            max_sev = _max_sev(max_sev, f["severity"])

    present = set(positives)
    differential = []
    recommendations = []
    for rule in PATTERN_RULES:
        for combo in rule["any_of"]:
            if set(combo) <= present:
                conf = round(sum(positives[l] for l in combo) / len(combo), 3)
                differential.append({
                    "condition": rule["condition"],
                    "confidence": conf,
                    "supporting_findings": combo,
                })
                recommendations.append(rule["recommendation"])
                break

    differential.sort(key=lambda d: d["confidence"], reverse=True)
    recommendations = list(dict.fromkeys(recommendations))  # dedupe, keep order

    if not positives:
        summary = "No significant findings across available studies. Routine follow-up."
    else:
        top = ", ".join(sorted(present))
        if differential:
            lead = differential[0]["condition"]
            summary = (
                f"Findings across {len(findings_by_study)} study(ies) — {top}. "
                f"Pattern most consistent with {lead.lower()}. "
                f"{len(differential)} candidate condition(s) flagged for review."
            )
        else:
            summary = (
                f"Positive findings ({top}) present but no established multi-finding "
                f"pattern matched. Recommend radiologist correlation."
            )

    return {
        "summary": summary,
        "differential": differential,
        "recommendations": recommendations,
        "max_severity": max_sev,
    }
