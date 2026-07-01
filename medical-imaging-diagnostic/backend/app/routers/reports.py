"""Report review + sign-off. Doctors edit AI drafts and sign them."""
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from ..database import get_session
from ..deps import get_current_user
from ..models import Report, Role, User
from ..schemas import ReportUpdate

router = APIRouter(prefix="/api/reports", tags=["reports"])

# Roles permitted to edit / sign clinical reports (viewers are read-only).
_EDITOR_ROLES = {Role.admin, Role.doctor, Role.radiologist}


@router.patch("/{report_id}", response_model=Report)
def update_report(
    report_id: int,
    payload: ReportUpdate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Report:
    if user.role not in _EDITOR_ROLES:
        raise HTTPException(403, "Your role cannot edit or sign reports")
    report = session.get(Report, report_id)
    if report is None or report.org_id != user.org_id:
        raise HTTPException(404, "Report not found")

    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(report, key, value)
    if data:
        # Any human edit means it's no longer purely an AI draft.
        report.is_ai_draft = False
        report.author_id = user.id
    session.add(report)
    session.commit()
    session.refresh(report)
    return report
