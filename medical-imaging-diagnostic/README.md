# 🩺 Medical Imaging Diagnostic Assistant (MID)

A **multi-tenant AI assistant for doctors** that builds a unified **patient
profile** — pulling together every imaging study, AI diagnostic result, and
report — and then **correlates findings across modalities** into a single
decision-support view.

> Built as a working prototype to explore the 2026 state of the art in medical
> imaging AI (foundation models, VLM report generation, segmentation, and
> cross-modal clinical reasoning). Runs on a laptop with zero GPU; swaps in real
> pretrained models (TorchXRayVision) with one env flag.
>
> **New to this?** Start with **[SOLUTION.md](./SOLUTION.md)** — the complete
> local runbook with sample patients, sample X-ray/CT images, and reports.

---

## What it does

```
Organization (hospital / clinic)         ← multi-tenant, isolated per org
   └── Doctors / Radiologists / Admins    ← roles + JWT auth
   └── Patients
         └── Studies (X-ray, CT, MRI, Fundus …)
               └── Images        → AI engine → findings + Grad-CAM heatmap
               └── AI-draft report (vision-language style)
         └── 🧠 Correlation      → cross-study differential + recommendations
```

The **AI assistant** angle: instead of one score per image, a treating doctor
opens a patient and sees the *whole picture* — e.g. *"Cardiomegaly (X-ray) +
Effusion (CT) → pattern consistent with congestive heart failure; correlate with
BNP / echocardiography."*

## Capabilities (diagnostic engines)

| Engine | Modality | What it detects | Real-model path |
|--------|----------|-----------------|-----------------|
| **CXR** | X-ray | 15 chest pathologies + heatmap | [TorchXRayVision](https://github.com/mlmed/torchxrayvision) |
| **Retinal** | Fundus | Diabetic retinopathy grade, glaucoma, AMD | RETFound |
| **Segmentation** | CT / MRI | Lesion / region segmentation | [MedSAM / SAM-Med2D](https://github.com/openmedlab) |
| **Report** | all | Vision-language draft report | Flamingo-CXR / MAIRA / Clara Reason |
| **Correlation** | patient | Cross-study differential + next steps | transparent rule engine |

Every engine ships as a **mock** (deterministic, dependency-free) *and* a
documented **real-model adapter**. Flip `AI_ENGINE_MODE=real` (after installing
`requirements-ml.txt`) to use real pretrained weights.

---

## Stack

- **Frontend** — Next.js 14 + TypeScript + Tailwind (dark mode, Recharts analytics)
- **Backend** — FastAPI + SQLModel, multi-tenant, JWT + roles
- **AI** — TorchXRayVision (real X-ray) + MONAI Label (real CT/MRI) + smart mocks
- **Features** — DICOM upload, PDF & HTML report artifacts, analytics, admin UI
- **Deploy** — Docker Compose + cloud configs (Render, Fly.io)

## Quick start

```bash
# Docker (recommended) — builds UI, starts Postgres + app, seeds data
docker compose up --build
# → http://localhost:8000   (login: admin@city-general.demo / demo1234)
```

No Docker? The built UI is committed, so you only need **Python 3.11+**:

```bash
python3.11 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt && cp .env.example .env
cd backend
python -m app.generate_samples && python -m app.seed && python -m app.export_reports
uvicorn app.main:app --port 8000
```

Full runbook (real models, cloud deploy, UI dev, tests) → **[SOLUTION.md](./SOLUTION.md)**.

### Sample patients

7 realistic scenarios are seeded, each with images and an AI correlation — e.g.
**Robert Chen** (cardiomegaly + effusion → *congestive heart failure*),
**James Okoro** (CXR nodule + CT mass → *suspicious neoplasm*),
**Maria Gomez** (fundus → *severe diabetic retinopathy*),
**David Smith** (*pneumothorax*). Sample images live in `sample_data/images/`
(upload them via the UI) and pre-generated reports in `sample_data/reports/`.

### Docker (scalable deployment)

```bash
docker compose up --build            # API + Postgres
docker compose up --scale api=3      # horizontal scale behind a load balancer
```

---

## Using it

1. **Sign in** as a demo doctor (or `POST /api/auth/signup` to create a brand-new
   organization).
2. Pick a **patient** → see their unified profile, studies, and AI correlation.
3. **+ New study** → choose a modality and upload any image → **Run AI analysis**.
4. Watch the **findings**, **Grad-CAM heatmap**, **AI-draft report**, and the
   patient-level **correlation** update live.

Interactive API docs: **http://localhost:8000/docs**

---

## Enabling real models

```bash
pip install -r requirements-ml.txt        # torch + torchxrayvision (~2 GB)
# set in .env:
AI_ENGINE_MODE=real
```

The chest X-ray engine now runs the real `densenet121-res224-all` weights from
TorchXRayVision. Other modalities fall back to mock until their adapters are
wired (hooks are in `backend/app/ai/engines.py`).

---

## Multi-tenancy & security

- Every tenant-owned row carries `org_id`; all queries are hard-scoped to the
  authenticated user's organization (verified: a user in org B gets `404` for
  org A's patients).
- JWT bearer auth, bcrypt password hashing, role-based access (`admin`,
  `doctor`, `radiologist`, `viewer`).
- Stateless API → scale horizontally; Postgres + object storage for prod.

## ⚠️ Not for clinical use

This is a **research/education prototype**. The default engines are simulated and
produce **fabricated** findings. Even with real models enabled, nothing here is
validated or regulatory-cleared (FDA/CE). Do not use for real patient care.

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for design details and the roadmap to
production.
