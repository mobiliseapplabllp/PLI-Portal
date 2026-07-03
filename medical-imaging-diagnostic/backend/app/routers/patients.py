"""Patient records — always scoped to the caller's organization."""
import json
import os
import shutil

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from fastapi.responses import HTMLResponse, StreamingResponse
from sqlmodel import Session, select

from .. import services
from ..ai import holistic
from ..config import get_settings
from ..database import engine as db_engine
from ..database import get_session
from ..deps import get_current_user
from ..models import (
    ChatMessage,
    Correlation,
    DiagnosticResult,
    Document,
    Organization,
    Patient,
    PatientAssessment,
    Report,
    Study,
    User,
)
from ..report_render import render_patient_report
from ..schemas import PatientCreate

router = APIRouter(prefix="/api/patients", tags=["patients"])
settings = get_settings()


def _gather_studies(session: Session, patient_id: int) -> list[dict]:
    """Studies with their latest diagnostic (findings) + report — for AI context."""
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
    return items


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
    items = _gather_studies(session, patient.id)
    correlation = session.exec(
        select(Correlation).where(Correlation.patient_id == patient.id)
    ).first()
    return {
        "org": org, "patient": patient, "studies": items, "correlation": correlation,
        "report_id": f"MID-{patient.org_id:02d}-{patient.id:04d}",
    }


# ---- documents / labs ----------------------------------------------------
@router.get("/{patient_id}/documents", response_model=list[Document])
def list_documents(
    patient_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[Document]:
    _get_owned_patient(session, patient_id, user.org_id)
    return session.exec(
        select(Document).where(Document.patient_id == patient_id).order_by(Document.id.desc())
    ).all()


@router.post("/{patient_id}/documents", response_model=Document, status_code=201)
def add_document(
    patient_id: int,
    kind: str = Form("lab"),
    title: str = Form(...),
    value: str | None = Form(None),
    file: UploadFile | None = File(None),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Document:
    """Add a lab result (title+value) or upload a document (PDF/note)."""
    _get_owned_patient(session, patient_id, user.org_id)
    storage_path = None
    if file is not None and file.filename:
        safe = os.path.basename(file.filename)
        dest_dir = os.path.join(settings.upload_dir, f"org{user.org_id}", "documents")
        os.makedirs(dest_dir, exist_ok=True)
        storage_path = os.path.join(dest_dir, f"p{patient_id}_{safe}")
        with open(storage_path, "wb") as out:
            shutil.copyfileobj(file.file, out)
    doc = Document(org_id=user.org_id, patient_id=patient_id, kind=kind,
                   title=title, value=value, storage_path=storage_path)
    session.add(doc)
    session.commit()
    session.refresh(doc)
    return doc


# ---- holistic AI (Claude CLI) --------------------------------------------
@router.post("/{patient_id}/assess")
def assess_patient(
    patient_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    """Run the whole-profile holistic AI assessment and persist it."""
    patient = _get_owned_patient(session, patient_id, user.org_id)
    studies = _gather_studies(session, patient_id)
    documents = session.exec(
        select(Document).where(Document.patient_id == patient_id)
    ).all()
    result = holistic.assess_patient(patient=patient, studies=studies, documents=documents)

    row = PatientAssessment(
        org_id=user.org_id, patient_id=patient_id, source=result["source"],
        narrative=result["narrative"], urgent=bool(result["urgent"]),
        problem_list_json=json.dumps(result["problem_list"]),
        differential_json=json.dumps(result["differential"]),
        suggestions_json=json.dumps(result["suggestions"]),
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return {**result, "id": row.id, "created_at": row.created_at.isoformat()}


@router.get("/{patient_id}/assessment")
def get_assessment(
    patient_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict | None:
    """Latest persisted holistic assessment, if any."""
    _get_owned_patient(session, patient_id, user.org_id)
    row = session.exec(
        select(PatientAssessment).where(PatientAssessment.patient_id == patient_id)
        .order_by(PatientAssessment.id.desc())
    ).first()
    if row is None:
        return None
    return {
        "id": row.id, "source": row.source, "narrative": row.narrative, "urgent": row.urgent,
        "problem_list": json.loads(row.problem_list_json),
        "differential": json.loads(row.differential_json),
        "suggestions": json.loads(row.suggestions_json),
        "created_at": row.created_at.isoformat(),
    }


@router.post("/{patient_id}/chat")
def chat_patient(
    patient_id: int,
    body: dict,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    """Ask a free-text question about the patient (Claude CLI over full profile)."""
    patient = _get_owned_patient(session, patient_id, user.org_id)
    question = (body or {}).get("question", "").strip()
    if not question:
        raise HTTPException(400, "question is required")
    studies = _gather_studies(session, patient_id)
    documents = session.exec(
        select(Document).where(Document.patient_id == patient_id)
    ).all()
    return holistic.chat(patient=patient, studies=studies, documents=documents, question=question)


@router.get("/{patient_id}/chat", response_model=list[ChatMessage])
def chat_history(
    patient_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[ChatMessage]:
    """Persisted AI-Assistant conversation for this patient."""
    _get_owned_patient(session, patient_id, user.org_id)
    return session.exec(
        select(ChatMessage).where(ChatMessage.patient_id == patient_id)
        .order_by(ChatMessage.id)
    ).all()


@router.delete("/{patient_id}/chat", status_code=204)
def clear_chat(
    patient_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> None:
    """Clear the conversation history for this patient."""
    _get_owned_patient(session, patient_id, user.org_id)
    for m in session.exec(select(ChatMessage).where(ChatMessage.patient_id == patient_id)).all():
        session.delete(m)
    session.commit()


@router.post("/{patient_id}/chat/stream")
def chat_patient_stream(
    patient_id: int,
    body: dict,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> StreamingResponse:
    """Streaming chat — text chunks as the Claude CLI produces them. Persists both
    the question and the (possibly partial, if stopped) answer."""
    patient = _get_owned_patient(session, patient_id, user.org_id)
    question = (body or {}).get("question", "").strip()
    if not question:
        raise HTTPException(400, "question is required")
    studies = _gather_studies(session, patient_id)
    documents = session.exec(
        select(Document).where(Document.patient_id == patient_id)
    ).all()

    # Persist the user's question immediately.
    session.add(ChatMessage(org_id=user.org_id, patient_id=patient_id, role="user",
                            content=question, author_id=user.id))
    session.commit()

    org_id = user.org_id
    source = "claude-cli" if holistic.cli_available() else "unavailable"
    # Build the context STRING now, while the session is open — the streaming
    # generator runs after the session closes (ORM objects would be detached).
    context = holistic.build_context(patient=patient, studies=studies, documents=documents)

    def stream():
        buf: list[str] = []
        try:
            for chunk in holistic.chat_stream(context=context, question=question):
                buf.append(chunk)
                yield chunk
        finally:
            # Persist whatever was produced (full answer, or partial if stopped),
            # using a fresh session since the request session is closed by now.
            text = "".join(buf).strip() or "(no response)"
            try:
                with Session(db_engine) as s2:
                    s2.add(ChatMessage(org_id=org_id, patient_id=patient_id,
                                       role="assistant", content=text, source=source))
                    s2.commit()
            except Exception:
                pass

    return StreamingResponse(stream(), media_type="text/plain")


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
