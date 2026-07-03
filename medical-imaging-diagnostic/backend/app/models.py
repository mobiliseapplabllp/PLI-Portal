"""Multi-tenant data model.

Tenancy hierarchy:
    Organization (tenant)
      └── User (doctor / radiologist / admin)
      └── Patient
            └── Study (an imaging encounter: CXR, CT, MRI, fundus ...)
                  └── ImageAsset            (the pixels)
                  └── DiagnosticResult      (one AI engine's findings)
                  └── Report                (narrative / structured report)
            └── Correlation                 (cross-study synthesis for a patient)

Every tenant-owned row carries `org_id` so queries can be hard-scoped to the
caller's organization. This is the backbone of multi-org isolation.
"""
from __future__ import annotations

import enum
from datetime import datetime

from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.utcnow()


class Role(str, enum.Enum):
    admin = "admin"            # manages the org, its users and settings
    doctor = "doctor"          # treating physician
    radiologist = "radiologist"
    viewer = "viewer"          # read-only


class Modality(str, enum.Enum):
    xray = "xray"
    ct = "ct"
    mri = "mri"
    fundus = "fundus"          # retinal photography
    dermoscopy = "dermoscopy"
    mammography = "mammography"
    pathology = "pathology"


class Severity(str, enum.Enum):
    normal = "normal"
    low = "low"
    moderate = "moderate"
    high = "high"
    critical = "critical"


class Organization(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str
    slug: str = Field(index=True, unique=True)
    created_at: datetime = Field(default_factory=utcnow)


class User(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    org_id: int = Field(foreign_key="organization.id", index=True)
    email: str = Field(index=True, unique=True)
    full_name: str
    hashed_password: str
    role: Role = Role.doctor
    specialty: str | None = None
    is_active: bool = True
    created_at: datetime = Field(default_factory=utcnow)


class Patient(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    org_id: int = Field(foreign_key="organization.id", index=True)
    mrn: str = Field(index=True)              # medical record number (per org)
    full_name: str
    sex: str | None = None
    date_of_birth: str | None = None          # ISO date string (prototype)
    notes: str | None = None
    created_at: datetime = Field(default_factory=utcnow)


class Study(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    org_id: int = Field(foreign_key="organization.id", index=True)
    patient_id: int = Field(foreign_key="patient.id", index=True)
    modality: Modality
    body_part: str | None = None
    description: str | None = None
    ordering_physician_id: int | None = Field(default=None, foreign_key="user.id")
    status: str = "acquired"                   # acquired -> analyzed -> reported
    acquired_at: datetime = Field(default_factory=utcnow)


class ImageAsset(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    org_id: int = Field(foreign_key="organization.id", index=True)
    study_id: int = Field(foreign_key="study.id", index=True)
    filename: str
    content_type: str = "image/png"
    storage_path: str                          # displayable PNG (local path / object key)
    source_path: str | None = None             # original upload when it differs (e.g. .dcm)
    meta_json: str = "{}"                      # extracted metadata (DICOM tags etc.)
    width: int | None = None
    height: int | None = None
    created_at: datetime = Field(default_factory=utcnow)


class DiagnosticResult(SQLModel, table=True):
    """One AI engine's structured output for a study."""
    id: int | None = Field(default=None, primary_key=True)
    org_id: int = Field(foreign_key="organization.id", index=True)
    study_id: int = Field(foreign_key="study.id", index=True)
    image_id: int | None = Field(default=None, foreign_key="imageasset.id")
    engine: str                                # e.g. "cxr", "retinal", "segmentation"
    engine_version: str = "prototype"
    model_source: str = "MockEngine"           # or "torchxrayvision:densenet121-res224-all"
    findings_json: str = "[]"                  # JSON list of {label, probability, severity}
    top_finding: str | None = None
    max_severity: Severity = Severity.normal
    heatmap_path: str | None = None            # explainability overlay (Grad-CAM style)
    created_at: datetime = Field(default_factory=utcnow)


class Report(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    org_id: int = Field(foreign_key="organization.id", index=True)
    study_id: int = Field(foreign_key="study.id", index=True)
    author_id: int | None = Field(default=None, foreign_key="user.id")
    is_ai_draft: bool = True
    impression: str = ""                       # short conclusion
    body: str = ""                             # full narrative
    structured_json: str = "{}"               # machine-readable structured report
    assessment_category: str | None = None     # e.g. "Lung-RADS 4B", "ICDR Grade 3"
    signed: bool = False
    created_at: datetime = Field(default_factory=utcnow)


class Document(SQLModel, table=True):
    """Non-imaging patient data: lab results and uploaded documents (PDF, notes).
    Factored into the holistic AI assessment alongside imaging."""
    id: int | None = Field(default=None, primary_key=True)
    org_id: int = Field(foreign_key="organization.id", index=True)
    patient_id: int = Field(foreign_key="patient.id", index=True)
    kind: str = "lab"                          # "lab" | "document" | "note"
    title: str
    value: str | None = None                   # lab value/text, e.g. "CA 19-9: 250 U/mL"
    storage_path: str | None = None            # uploaded file, if any
    created_at: datetime = Field(default_factory=utcnow)


class PatientAssessment(SQLModel, table=True):
    """Holistic, whole-profile AI assessment (Claude CLI or rules fallback)."""
    id: int | None = Field(default=None, primary_key=True)
    org_id: int = Field(foreign_key="organization.id", index=True)
    patient_id: int = Field(foreign_key="patient.id", index=True)
    source: str = "rules"                      # "claude-cli" | "rules"
    narrative: str = ""
    problem_list_json: str = "[]"
    differential_json: str = "[]"
    suggestions_json: str = "[]"
    urgent: bool = False
    created_at: datetime = Field(default_factory=utcnow)


class ChatMessage(SQLModel, table=True):
    """Persisted AI-Assistant conversation, per patient."""
    id: int | None = Field(default=None, primary_key=True)
    org_id: int = Field(foreign_key="organization.id", index=True)
    patient_id: int = Field(foreign_key="patient.id", index=True)
    role: str                                  # "user" | "assistant"
    content: str
    author_id: int | None = Field(default=None, foreign_key="user.id")
    source: str | None = None                  # "claude-cli" | "unavailable" (assistant only)
    created_at: datetime = Field(default_factory=utcnow)


class Correlation(SQLModel, table=True):
    """Cross-study, cross-modality synthesis for one patient — the assistant's
    'second opinion' that ties multiple diagnostics into one clinical picture."""
    id: int | None = Field(default=None, primary_key=True)
    org_id: int = Field(foreign_key="organization.id", index=True)
    patient_id: int = Field(foreign_key="patient.id", index=True)
    summary: str = ""
    differential_json: str = "[]"              # ranked list of candidate conditions
    recommendations_json: str = "[]"
    max_severity: Severity = Severity.normal
    generated_at: datetime = Field(default_factory=utcnow)
