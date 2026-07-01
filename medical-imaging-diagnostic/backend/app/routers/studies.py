"""Imaging studies: create, upload image, run AI analysis, review."""
import json
import os
import shutil

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlmodel import Session, select

from .. import services
from ..config import get_settings
from ..database import get_session
from ..deps import get_current_user
from ..models import DiagnosticResult, ImageAsset, Patient, Report, Study, User
from ..schemas import StudyCreate

router = APIRouter(prefix="/api/studies", tags=["studies"])
settings = get_settings()


def _get_owned_study(session: Session, study_id: int, org_id: int) -> Study:
    study = session.get(Study, study_id)
    if study is None or study.org_id != org_id:
        raise HTTPException(404, "Study not found")
    return study


@router.post("", response_model=Study, status_code=201)
def create_study(
    payload: StudyCreate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Study:
    patient = session.get(Patient, payload.patient_id)
    if patient is None or patient.org_id != user.org_id:
        raise HTTPException(404, "Patient not found")
    study = Study(
        org_id=user.org_id,
        patient_id=payload.patient_id,
        modality=payload.modality,
        body_part=payload.body_part,
        description=payload.description,
        ordering_physician_id=user.id,
    )
    session.add(study)
    session.commit()
    session.refresh(study)
    return study


@router.post("/{study_id}/image", response_model=ImageAsset, status_code=201)
def upload_image(
    study_id: int,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> ImageAsset:
    study = _get_owned_study(session, study_id, user.org_id)
    dest_dir = os.path.join(settings.upload_dir, f"org{user.org_id}", f"study{study.id}")
    os.makedirs(dest_dir, exist_ok=True)
    dest = os.path.join(dest_dir, file.filename or "image.png")
    with open(dest, "wb") as out:
        shutil.copyfileobj(file.file, out)

    width = height = None
    try:
        from PIL import Image
        with Image.open(dest) as im:
            width, height = im.size
    except Exception:
        pass

    image = ImageAsset(
        org_id=user.org_id,
        study_id=study.id,
        filename=file.filename or "image.png",
        content_type=file.content_type or "image/png",
        storage_path=dest,
        width=width,
        height=height,
    )
    session.add(image)
    session.commit()
    session.refresh(image)
    return image


@router.post("/{study_id}/analyze")
def analyze_study(
    study_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    """Run the AI engine, then refresh the patient-level correlation."""
    study = _get_owned_study(session, study_id, user.org_id)
    diag = services.run_analysis(session, study)
    if diag is None:
        raise HTTPException(400, "No image uploaded or unsupported modality")
    # Snapshot now: regenerating the correlation commits and expires `diag`.
    diag_payload = {**diag.model_dump(), "findings": json.loads(diag.findings_json)}
    patient_id = study.patient_id
    correlation = services.regenerate_correlation(session, patient_id, user.org_id)
    return {"diagnostic": diag_payload, "correlation": correlation}


@router.get("/{study_id}")
def get_study_detail(
    study_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    study = _get_owned_study(session, study_id, user.org_id)
    images = session.exec(select(ImageAsset).where(ImageAsset.study_id == study_id)).all()
    diags = session.exec(
        select(DiagnosticResult).where(DiagnosticResult.study_id == study_id)
    ).all()
    reports = session.exec(select(Report).where(Report.study_id == study_id)).all()
    return {
        "study": study,
        "images": images,
        "diagnostics": [
            {**d.model_dump(), "findings": json.loads(d.findings_json)} for d in diags
        ],
        "reports": reports,
    }


@router.get("/{study_id}/image-file")
def get_image_file(
    study_id: int,
    heatmap: bool = False,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> FileResponse:
    """Serve the original image, or the AI heatmap overlay when ?heatmap=true."""
    _get_owned_study(session, study_id, user.org_id)
    if heatmap:
        diag = session.exec(
            select(DiagnosticResult)
            .where(DiagnosticResult.study_id == study_id)
            .order_by(DiagnosticResult.id.desc())
        ).first()
        path = diag.heatmap_path if diag else None
    else:
        image = session.exec(
            select(ImageAsset)
            .where(ImageAsset.study_id == study_id)
            .order_by(ImageAsset.id.desc())
        ).first()
        path = image.storage_path if image else None

    if not path or not os.path.exists(path):
        raise HTTPException(404, "Image not available")
    return FileResponse(path)
