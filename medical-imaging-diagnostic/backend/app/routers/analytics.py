"""Org-level analytics for the dashboard. All queries hard-scoped to the
caller's organization.

Aggregation is done in Python over org-scoped rows — fine at prototype scale
and keeps the code portable across SQLite/Postgres.
"""
from __future__ import annotations

import json
from collections import Counter
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from ..database import get_session
from ..deps import get_current_user
from ..models import Correlation, DiagnosticResult, Patient, Report, Study, User

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/summary")
def summary(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    org = user.org_id
    patients = session.exec(select(Patient).where(Patient.org_id == org)).all()
    studies = session.exec(select(Study).where(Study.org_id == org)).all()
    diags = session.exec(select(DiagnosticResult).where(DiagnosticResult.org_id == org)).all()
    reports = session.exec(select(Report).where(Report.org_id == org)).all()
    correlations = session.exec(select(Correlation).where(Correlation.org_id == org)).all()

    # Latest diagnostic per study (avoid double counting re-analyses).
    latest: dict[int, DiagnosticResult] = {}
    for d in diags:
        if d.study_id not in latest or d.id > latest[d.study_id].id:
            latest[d.study_id] = d
    latest_diags = list(latest.values())

    severity = Counter(d.max_severity.value for d in latest_diags)
    modality = Counter(s.modality.value for s in studies)
    models = Counter(d.model_source for d in latest_diags)

    finding_counts: Counter = Counter()
    for d in latest_diags:
        for f in json.loads(d.findings_json):
            if f["severity"] != "normal":
                finding_counts[f["label"]] += 1

    # Study volume over the last 30 days.
    today = datetime.utcnow().date()
    start = today - timedelta(days=29)
    by_day = Counter()
    for s in studies:
        day = (s.acquired_at.date() if s.acquired_at else today)
        if day >= start:
            by_day[day.isoformat()] += 1
    volume = [
        {"date": (start + timedelta(days=i)).isoformat(),
         "count": by_day.get((start + timedelta(days=i)).isoformat(), 0)}
        for i in range(30)
    ]

    flagged = [c for c in correlations if c.max_severity.value in ("high", "critical")]

    return {
        "totals": {
            "patients": len(patients),
            "studies": len(studies),
            "analyzed": len(latest_diags),
            "reports": len(reports),
            "signed_reports": sum(1 for r in reports if r.signed),
            "flagged_patients": len(flagged),
        },
        "severity_distribution": [
            {"severity": s, "count": severity.get(s, 0)}
            for s in ("normal", "low", "moderate", "high", "critical")
        ],
        "modality_mix": [{"modality": m, "count": c} for m, c in modality.most_common()],
        "top_findings": [{"finding": f, "count": c} for f, c in finding_counts.most_common(8)],
        "model_usage": [{"model": m, "count": c} for m, c in models.most_common()],
        "volume_30d": volume,
    }
