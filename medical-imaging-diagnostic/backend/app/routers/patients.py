"""Patient records — always scoped to the caller's organization."""
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from .. import services
from ..database import get_session
from ..deps import get_current_user
from ..models import Correlation, Patient, Study, User
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
