"""Seed the database with sample tenants, doctors, patients, studies and images,
then run the AI pipeline end-to-end so the demo is populated on first launch.

Run:  cd backend && python -m app.seed
"""
from __future__ import annotations

import os
import random

from sqlmodel import Session, select

from . import services
from .config import get_settings
from .database import engine, init_db
from .models import Modality, Organization, Patient, Role, Study, User
from .security import hash_password

settings = get_settings()
RNG = random.Random(42)


def _make_synthetic_image(path: str, seed: int, kind: str = "xray") -> None:
    """Create a plausible-looking grayscale scan so engines have real pixels."""
    try:
        import numpy as np
        from PIL import Image
    except Exception:
        # No imaging libs: write a tiny deterministic file so hashing still works.
        with open(path, "wb") as fh:
            fh.write(f"synthetic-{kind}-{seed}".encode())
        return

    rng = np.random.default_rng(seed)
    size = 512
    yy, xx = np.mgrid[0:size, 0:size]
    base = 0.35 + 0.25 * np.sin(xx / 60.0) * np.cos(yy / 80.0)
    if kind == "fundus":
        cx = cy = size / 2
        disk = np.exp(-(((xx - cx) ** 2 + (yy - cy) ** 2) / (2 * (size * 0.3) ** 2)))
        base = 0.2 + 0.6 * disk
    for _ in range(rng.integers(1, 4)):
        cx, cy = rng.uniform(0.2, 0.8, 2) * size
        r = rng.uniform(20, 70)
        blob = np.exp(-(((xx - cx) ** 2 + (yy - cy) ** 2) / (2 * r ** 2)))
        base += rng.uniform(0.1, 0.3) * blob
    base += rng.normal(0, 0.03, base.shape)
    img = np.clip(base, 0, 1)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    Image.fromarray((img * 255).astype("uint8")).save(path)


def _upload_and_analyze(session: Session, study: Study, seed: int, kind: str) -> None:
    from .models import ImageAsset

    dest_dir = os.path.join(settings.upload_dir, f"org{study.org_id}", f"study{study.id}")
    dest = os.path.join(dest_dir, f"{kind}_{study.id}.png")
    _make_synthetic_image(dest, seed, kind)
    session.add(ImageAsset(
        org_id=study.org_id, study_id=study.id, filename=os.path.basename(dest),
        storage_path=dest, width=512, height=512,
    ))
    session.commit()
    services.run_analysis(session, study)


ORGS = [
    ("City General Hospital", "city-general"),
    ("Sunrise Diagnostics", "sunrise-dx"),
]
DOCTORS = [
    ("Radiology", Role.radiologist), ("Cardiology", Role.doctor),
    ("Ophthalmology", Role.doctor),
]
PATIENTS = [
    ("Asha Verma", "F", "1979-03-11"),
    ("Robert Chen", "M", "1965-07-22"),
    ("Maria Gomez", "F", "1988-12-02"),
]
STUDY_PLAN = [
    (Modality.xray, "Chest", "chest pain, dyspnoea", "xray"),
    (Modality.fundus, "Retina", "diabetic screening", "fundus"),
    (Modality.ct, "Chest", "nodule follow-up", "ct"),
]


def seed() -> None:
    init_db()
    with Session(engine) as session:
        if session.exec(select(Organization)).first():
            print("Database already seeded; skipping.")
            return

        seed_counter = 100
        for oi, (org_name, slug) in enumerate(ORGS):
            org = Organization(name=org_name, slug=slug)
            session.add(org)
            session.commit()
            session.refresh(org)

            admin = User(
                org_id=org.id, email=f"admin@{slug}.demo", full_name=f"{org_name} Admin",
                hashed_password=hash_password("demo1234"), role=Role.admin,
            )
            session.add(admin)
            for spec, role in DOCTORS:
                session.add(User(
                    org_id=org.id, email=f"{spec.lower()}@{slug}.demo",
                    full_name=f"Dr. {spec}", hashed_password=hash_password("demo1234"),
                    role=role, specialty=spec,
                ))
            session.commit()

            for pi, (name, sex, dob) in enumerate(PATIENTS):
                patient = Patient(
                    org_id=org.id, mrn=f"{slug.upper()[:3]}-{1000 + pi}",
                    full_name=name, sex=sex, date_of_birth=dob,
                )
                session.add(patient)
                session.commit()
                session.refresh(patient)

                # Each patient gets 1-3 studies across modalities.
                for modality, body, desc, kind in STUDY_PLAN[: 1 + ((oi + pi) % 3)]:
                    study = Study(
                        org_id=org.id, patient_id=patient.id, modality=modality,
                        body_part=body, description=desc, ordering_physician_id=admin.id,
                    )
                    session.add(study)
                    session.commit()
                    session.refresh(study)
                    seed_counter += 1
                    _upload_and_analyze(session, study, seed_counter, kind)

                services.regenerate_correlation(session, patient.id, org.id)

        print("Seed complete.")
        print("Login with:  admin@city-general.demo / demo1234")
        print("         or:  radiology@sunrise-dx.demo / demo1234")


if __name__ == "__main__":
    seed()
