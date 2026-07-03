"""Patient records — always scoped to the caller's organization."""
import json

from fastapi import APIRouter, Depends, HTTPException, Response
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


@router.get("/search")
def search_patients(
    q: str = "",
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[dict]:
    """Global search: patients by name or MRN within the caller's org.
    Returns lightweight hits for the command palette."""
    term = q.strip().lower()
    if not term:
        return []
    rows = session.exec(select(Patient).where(Patient.org_id == user.org_id)).all()
    hits = [
        p for p in rows
        if term in p.full_name.lower() or term in (p.mrn or "").lower()
    ]
    return [
        {"id": p.id, "full_name": p.full_name, "mrn": p.mrn,
         "sex": p.sex, "date_of_birth": p.date_of_birth}
        for p in hits[:20]
    ]


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


def _collect_report_data(session: Session, patient: Patient) -> dict:
    """Everything the report renderers (HTML + PDF) need for one patient."""
    org = session.get(Organization, patient.org_id)
    studies = session.exec(
        select(Study).where(Study.patient_id == patient.id).order_by(Study.id)
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
        select(Correlation).where(Correlation.patient_id == patient.id)
    ).first()
    return {
        "org": org, "patient": patient, "studies": items, "correlation": correlation,
        "report_id": f"MID-{patient.org_id:02d}-{patient.id:04d}",
    }


@router.get("/{patient_id}/report.html", response_class=HTMLResponse)
def patient_report_artifact(
    patient_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> HTMLResponse:
    """Formal, print-ready medical report as a self-contained HTML artifact."""
    patient = _get_owned_patient(session, patient_id, user.org_id)
    return HTMLResponse(content=render_patient_report(**_collect_report_data(session, patient)))


@router.get("/{patient_id}/report.pdf")
def patient_report_pdf(
    patient_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Response:
    """Server-side PDF export of the medical report (downloadable artifact)."""
    from ..pdf_render import render_patient_pdf

    patient = _get_owned_patient(session, patient_id, user.org_id)
    pdf_bytes = render_patient_pdf(**_collect_report_data(session, patient))
    fname = f"report_{patient.mrn.replace('/', '-')}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )
