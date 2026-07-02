"""Seed the database with clinically coherent sample tenants, doctors, patients,
studies and images, then run the AI pipeline end-to-end so the demo is fully
populated on first launch.

Run:  cd backend && python -m app.seed
"""
from __future__ import annotations

import json
import os

from sqlmodel import Session, select

from . import services
from .config import get_settings
from .database import engine, init_db
from .models import ImageAsset, Organization, Patient, Study, User
from .sample_scenarios import DOCTORS, ORGS, SCENARIOS, make_synthetic_image, slugify
from .security import hash_password

settings = get_settings()


def _place_image_and_analyze(session: Session, study: Study, kind: str,
                             plan: dict, seed: int) -> None:
    dest_dir = os.path.join(settings.upload_dir, f"org{study.org_id}", f"study{study.id}")
    dest = os.path.join(dest_dir, f"{kind}_{study.id}.png")
    make_synthetic_image(dest, seed, kind)
    # Always write the sidecar (even an empty plan) so an intended-normal study
    # is deterministically normal instead of getting random mock findings.
    with open(dest + ".plan.json", "w") as fh:
        json.dump(plan, fh)
    session.add(ImageAsset(
        org_id=study.org_id, study_id=study.id, filename=os.path.basename(dest),
        storage_path=dest, width=512, height=512,
    ))
    session.commit()
    services.run_analysis(session, study)


def seed() -> None:
    init_db()
    with Session(engine) as session:
        if session.exec(select(Organization)).first():
            print("Database already seeded; skipping.  (delete mid.db to reseed)")
            return

        orgs: dict[str, Organization] = {}
        admins: dict[str, User] = {}
        for org_name, slug in ORGS:
            org = Organization(name=org_name, slug=slug)
            session.add(org)
            session.commit()
            session.refresh(org)
            orgs[slug] = org

            admin = User(
                org_id=org.id, email=f"admin@{slug}.demo", full_name=f"{org_name} Admin",
                hashed_password=hash_password("demo1234"), role="admin",
            )
            session.add(admin)
            for spec, role in DOCTORS:
                session.add(User(
                    org_id=org.id, email=f"{spec.lower()}@{slug}.demo",
                    full_name=f"Dr. {spec}", hashed_password=hash_password("demo1234"),
                    role=role, specialty=spec,
                ))
            session.commit()
            session.refresh(admin)
            admins[slug] = admin

        seed_counter = 100
        for si, sc in enumerate(SCENARIOS):
            org = orgs[sc["org"]]
            admin = admins[sc["org"]]
            p = sc["patient"]
            patient = Patient(
                org_id=org.id, mrn=f"{sc['org'][:3].upper()}-{1000 + si}",
                full_name=p["name"], sex=p["sex"], date_of_birth=p["dob"], notes=p["notes"],
            )
            session.add(patient)
            session.commit()
            session.refresh(patient)

            for st in sc["studies"]:
                study = Study(
                    org_id=org.id, patient_id=patient.id, modality=st["modality"],
                    body_part=st["body_part"], description=st["description"],
                    ordering_physician_id=admin.id,
                )
                session.add(study)
                session.commit()
                session.refresh(study)
                seed_counter += 1
                _place_image_and_analyze(session, study, st["kind"], st.get("plan", {}), seed_counter)

            services.regenerate_correlation(session, patient.id, org.id)

        print("Seed complete.")
        print(f"  Organizations : {len(orgs)}")
        print(f"  Patients      : {len(SCENARIOS)}")
        print("\nLogin (password: demo1234):")
        print("  admin@city-general.demo   — 7 patients (CHF, pneumonia, DR, lung nodule,")
        print("                              normal, melanoma, brain tumour)")
        print("  admin@sunrise-dx.demo     — 2 patients (pneumothorax, CHF)")


if __name__ == "__main__":
    seed()
