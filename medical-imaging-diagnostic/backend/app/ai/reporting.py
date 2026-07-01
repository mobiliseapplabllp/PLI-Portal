"""Draft radiology reports from an engine result.

Stand-in for a vision-language reporting model (Flamingo-CXR / MAIRA / Clara
Reason). The interface — image findings in, structured impression + narrative
out — matches what a real VLM would expose, so it can be swapped later.
"""
from __future__ import annotations

MODALITY_TITLE = {
    "xray": "Chest Radiograph",
    "ct": "CT",
    "mri": "MRI",
    "fundus": "Fundus Photography",
    "dermoscopy": "Dermoscopy",
    "pathology": "Pathology",
}


def draft_report(modality: str, findings: list[dict]) -> dict:
    positives = [f for f in findings if f["severity"] != "normal"]
    positives.sort(key=lambda f: f["probability"], reverse=True)
    title = MODALITY_TITLE.get(modality, modality.upper())

    if not positives:
        impression = "No acute abnormality detected."
        body = (
            f"{title} examination. The study is within normal limits on automated "
            f"analysis. No focal consolidation, effusion, or other acute finding."
        )
    else:
        lead = positives[0]
        lines = [
            f"- {f['label']}: probability {f['probability']:.0%} ({f['severity']})"
            for f in positives
        ]
        impression = (
            f"{lead['label']} identified ({lead['severity']}). "
            f"{len(positives)} finding(s) flagged — clinical correlation advised."
        )
        body = (
            f"{title} examination with automated diagnostic analysis.\n\n"
            f"FINDINGS:\n" + "\n".join(lines) + "\n\n"
            f"IMPRESSION:\n{impression}"
        )

    return {"impression": impression, "body": body, "is_ai_draft": True}
