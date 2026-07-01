"""Patient records — always scoped to the caller's organization."""
import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from sqlmodel import Session, select

from .. import services
from ..database import get_session
from ..deps import get_current_user
from ..models import (
    Correlation,
    DiagnosticResult,
    Organization,
    Patient,
    Report,
    Study,
    User,
)
from ..report_render import render_patient_report
from ..schemas import PatientCreate

router = APIRouter(prefix="/api/patients", tags=["patients"])


def _get_owned_patient(session: Session, patient_id: int, org_id: int) -> Patient:
    patient = session.get(Patient, patient_id)
    if patient is None or patient.org_id != org_id:
        raise HTTPException(404, "Patient not found")
    return patient


@router.post("", response_model=Patient, status_code=201)
def create_patient(
    payload: PatientCreate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Patient:
    patient = Patient(org_id=user.org_id, **payload.model_dump())
    session.add(patient)
    session.commit()
    session.refresh(patient)
    return patient


@router.get("", response_model=list[Patient])
def list_patients(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[Patient]:
    return session.exec(
        select(Patient).where(Patient.org_id == user.org_id).order_by(Patient.id.desc())
    ).all()


@router.get("/{patient_id}")
def get_patient_profile(
    patient_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    """The unified patient profile: demographics + every study + the latest
    cross-study correlation. This is the doctor's single pane of glass."""
    patient = _get_owned_patient(session, patient_id, user.org_id)
    studies = session.exec(
        select(Study).where(Study.patient_id == patient_id).order_by(Study.id.desc())
    ).all()
    correlation = session.exec(
        select(Correlation).where(Correlation.patient_id == patient_id)
    ).first()
    return {"patient": patient, "studies": studies, "correlation": correlation}


@router.post("/{patient_id}/correlate", response_model=Correlation)
def correlate_patient(
    patient_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Correlation:
    """(Re)compute the AI correlation across all of the patient's studies."""
    _get_owned_patient(session, patient_id, user.org_id)
    return services.regenerate_correlation(session, patient_id, user.org_id)


@router.get("/{patient_id}/report.html", response_class=HTMLResponse)
def patient_report_artifact(
    patient_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> HTMLResponse:
    """Formal, print-ready medical report as a self-contained HTML artifact."""
    patient = _get_owned_patient(session, patient_id, user.org_id)
    org = session.get(Organization, patient.org_id)
    studies = session.exec(
        select(Study).where(Study.patient_id == patient_id).order_by(Study.id)
    ).all()

    items = []
    for st in studies:
        diag = session.exec(
            select(DiagnosticResult).where(DiagnosticResult.study_id == st.id)
            .order_by(DiagnosticResult.id.desc())
        ).first()
        report = session.exec(
            select(Report).where(Report.study_id == st.id).order_by(Report.id.desc())
        ).first()
        items.append({
            "study": st,
            "diagnostic": ({**diag.model_dump(), "findings": json.loads(diag.findings_json)}
                           if diag else None),
            "report": report,
        })

    correlation = session.exec(
        select(Correlation).where(Correlation.patient_id == patient_id)
    ).first()

    html = render_patient_report(
        org=org, patient=patient, studies=items, correlation=correlation,
        report_id=f"MID-{patient.org_id:02d}-{patient.id:04d}",
    )
    return HTMLResponse(content=html)
