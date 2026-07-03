"""Application services: orchestrate AI engines + persistence.

Keeps routers thin and puts the 'assistant' workflow in one place:
  run_analysis()          -> engine findings + AI-draft report for one study
  regenerate_correlation() -> patient-level cross-study synthesis
"""
from __future__ import annotations

import json
import os

from sqlmodel import Session, select

from . import ai
from .config import get_settings
from .database import engine as db_engine
from .models import (
    Correlation,
    DiagnosticResult,
    ImageAsset,
    Patient,
    Report,
    Severity,
    Study,
)
from .structured_report import build_structured_report, narrative_from_structured

settings = get_settings()


def run_analysis(session: Session, study: Study) -> DiagnosticResult | None:
    """Run the modality's engine on the study's latest image, persist a
    DiagnosticResult and an AI-draft Report. Returns the result (or None if no
    image / unsupported modality)."""
    engine = ai.get_engine(study.modality.value)
    if engine is None:
        return None

    image = session.exec(
        select(ImageAsset)
        .where(ImageAsset.study_id == study.id)
        .order_by(ImageAsset.id.desc())
    ).first()
    if image is None:
        return None

    heatmap_dir = os.path.join(settings.upload_dir, "heatmaps")
    heatmap_out = os.path.join(heatmap_dir, f"study{study.id}_heatmap.png")
    # 3D models (MONAI CT/MRI) need the original volume (DICOM/NIfTI), not the
    # 2D PNG preview; 2D engines use the preview.
    analysis_path = image.storage_path
    if settings.ai_engine_mode == "monai" and study.modality.value in ("ct", "mri") \
            and image.source_path:
        analysis_path = image.source_path
    result = engine.analyze(analysis_path, heatmap_out=heatmap_out)
    payload = result.to_dict()

    diag = DiagnosticResult(
        org_id=study.org_id,
        study_id=study.id,
        image_id=image.id,
        engine=result.engine,
        model_source=result.model_source,
        findings_json=json.dumps(payload["findings"]),
        top_finding=payload["top_finding"],
        max_severity=Severity(payload["max_severity"]),
        heatmap_path=result.heatmap_path,
    )
    session.add(diag)

    # Build a STRUCTURED report (sections, itemized findings, assessment category,
    # numbered impression) rather than a flat paragraph.
    patient = session.get(Patient, study.patient_id)
    structured = build_structured_report(
        modality=study.modality.value,
        findings=payload["findings"],
        patient=patient,
        study=study,
        ai_meta={"engine": result.engine, "model_source": result.model_source,
                 "engine_version": "prototype"},
        report_id=f"MID-{study.org_id:02d}-P{study.patient_id:04d}-S{study.id:04d}",
    )
    impression_text, body_text = narrative_from_structured(structured)
    session.add(Report(
        org_id=study.org_id,
        study_id=study.id,
        is_ai_draft=True,
        impression=impression_text,
        body=body_text,
        structured_json=json.dumps(structured),
        assessment_category=(structured["assessment"] or {}).get("category"),
    ))

    study.status = "analyzed"
    session.add(study)
    session.commit()
    session.refresh(diag)
    return diag


def run_holistic_assessment(patient_id: int, org_id: int) -> None:
    """Recompute the whole-profile holistic AI assessment and persist it.
    Runs with its own session so it can be used as a background task after a
    study is analyzed. Best-effort — never raises into the caller."""
    import json as _json

    from . import ai  # noqa: F401  (kept lazy to avoid import cycles)
    from .ai import holistic
    from .models import Document, Patient, PatientAssessment

    try:
        with Session(db_engine) as session:
            patient = session.get(Patient, patient_id)
            if patient is None or patient.org_id != org_id:
                return
            studies = []
            for st in session.exec(select(Study).where(Study.patient_id == patient_id)).all():
                d = session.exec(
                    select(DiagnosticResult).where(DiagnosticResult.study_id == st.id)
                    .order_by(DiagnosticResult.id.desc())
                ).first()
                r = session.exec(
                    select(Report).where(Report.study_id == st.id).order_by(Report.id.desc())
                ).first()
                studies.append({
                    "study": st,
                    "diagnostic": ({**d.model_dump(), "findings": _json.loads(d.findings_json)}
                                   if d else None),
                    "report": r,
                })
            documents = session.exec(
                select(Document).where(Document.patient_id == patient_id)
            ).all()
            result = holistic.assess_patient(patient=patient, studies=studies, documents=documents)
            session.add(PatientAssessment(
                org_id=org_id, patient_id=patient_id, source=result["source"],
                narrative=result["narrative"], urgent=bool(result["urgent"]),
                problem_list_json=_json.dumps(result["problem_list"]),
                differential_json=_json.dumps(result["differential"]),
                suggestions_json=_json.dumps(result["suggestions"]),
            ))
            session.commit()
    except Exception:
        pass


def regenerate_correlation(session: Session, patient_id: int, org_id: int) -> Correlation:
    """Recompute the patient-level correlation from all diagnostic results."""
    studies = session.exec(
        select(Study).where(Study.patient_id == patient_id, Study.org_id == org_id)
    ).all()

    findings_by_study = []
    for st in studies:
        diags = session.exec(
            select(DiagnosticResult).where(DiagnosticResult.study_id == st.id)
        ).all()
        for d in diags:
            findings_by_study.append({
                "modality": st.modality.value,
                "findings": json.loads(d.findings_json),
            })

    corr = ai.build_correlation(findings_by_study)

    existing = session.exec(
        select(Correlation).where(Correlation.patient_id == patient_id)
    ).first()
    if existing is None:
        existing = Correlation(org_id=org_id, patient_id=patient_id)

    existing.summary = corr["summary"]
    existing.differential_json = json.dumps(corr["differential"])
    existing.recommendations_json = json.dumps(corr["recommendations"])
    existing.max_severity = Severity(corr["max_severity"])
    session.add(existing)
    session.commit()
    session.refresh(existing)
    return existing
