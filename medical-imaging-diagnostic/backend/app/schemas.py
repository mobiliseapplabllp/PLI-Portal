"""Request / response payloads (thin — SQLModel rows are returned directly)."""
from __future__ import annotations

from pydantic import BaseModel, EmailStr

from .models import Modality, Role


class OrgSignup(BaseModel):
    """Bootstrap a new tenant together with its first admin user."""
    org_name: str
    org_slug: str
    admin_email: EmailStr
    admin_name: str
    admin_password: str


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str
    password: str
    role: Role = Role.doctor
    specialty: str | None = None


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: int
    org_id: int
    role: str


class PatientCreate(BaseModel):
    mrn: str
    full_name: str
    sex: str | None = None
    date_of_birth: str | None = None
    notes: str | None = None


class StudyCreate(BaseModel):
    patient_id: int
    modality: Modality
    body_part: str | None = None
    description: str | None = None


class ReportUpdate(BaseModel):
    impression: str | None = None
    body: str | None = None
    signed: bool | None = None
