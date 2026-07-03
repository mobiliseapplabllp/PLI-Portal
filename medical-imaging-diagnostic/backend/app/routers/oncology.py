"""Oncology screening worklist — every study with a cancer-relevant assessment
or oncologic finding, across the caller's organization, in one place.

Powers the "Screening" tab so clinicians see all suspected malignancies at a
glance instead of opening patients one by one.
"""
from __future__ import annotations

import json

from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from ..database import get_session
from ..deps import get_current_user
from ..models import DiagnosticResult, Patient, Report, Study, User

router = APIRouter(prefix="/api/oncology", tags=["oncology"])

_SEV_ORDER = {"critical": 0, "high": 1, "moderate": 2, "low": 3, "normal": 4}


@router.get("/worklist")
def worklist(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    org = user.org_id
    reports = session.exec(select(Report).where(Report.org_id == org)).all()
    # latest report per study
    latest: dict[int, Report] = {}
    for r in reports:
        if r.study_id not in latest or r.id > latest[r.study_id].id:
            latest[r.study_id] = r

    items = []
    counts = {"lung": 0, "breast": 0, "skin": 0, "brain": 0, "other": 0}
    for study_id, rep in latest.items():
        structured = json.loads(rep.structured_json or "{}")
        onco_findings = [f for f in structured.get("findings", []) if f.get("oncologic")]
        assessment = structured.get("assessment")
        onco_flag = bool((assessment or {}).get("onco_flag"))
        # Cancer worklist only: an oncologic assessment (Lung-RADS/BI-RADS/melanoma
        # /brain) or an oncologic finding. Non-cancer categories (e.g. ICDR
        # diabetic retinopathy) are excluded.
        if not onco_flag and not onco_findings:
            continue

        study = session.get(Study, study_id)
        patient = session.get(Patient, study.patient_id) if study else None
        if patient is None or patient.org_id != org:
            continue

        cat = rep.assessment_category or "Oncologic finding"
        # bucket for the summary tiles
        low = cat.lower()
        if "lung-rads" in low:
            counts["lung"] += 1
        elif "bi-rads" in low:
            counts["breast"] += 1
        elif "melanoma" in low or "skin" in low:
            counts["skin"] += 1
        elif "brain" in low:
            counts["brain"] += 1
        else:
            counts["other"] += 1

        items.append({
            "patient_id": patient.id,
            "patient_name": patient.full_name,
            "mrn": patient.mrn,
            "study_id": study_id,
            "modality": study.modality.value,
            "body_part": study.body_part,
            "assessment_category": cat,
            "assessment_meaning": (assessment or {}).get("meaning", ""),
            "onco_flag": onco_flag,
            "max_severity": structured.get("max_severity", "moderate"),
            "onco_findings": [f["label"] for f in onco_findings],
            "acquired_at": study.acquired_at.isoformat() if study.acquired_at else None,
        })

    items.sort(key=lambda x: _SEV_ORDER.get(x["max_severity"], 4))
    return {"total": len(items), "counts": counts, "items": items}
