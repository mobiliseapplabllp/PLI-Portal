# 🚀 Solution & Runbook (v2 — full stack)

A complete, state-of-the-art AI medical imaging platform:

- **Frontend** — Next.js 14 + TypeScript + Tailwind (dark mode, charts, static export)
- **Backend** — FastAPI + SQLModel, multi-tenant, JWT/roles
- **AI** — TorchXRayVision (real chest X-ray) + MONAI Label (real CT/MRI segmentation)
  + smart mock engines (zero-install default)
- **Features** — DICOM upload, PDF + HTML report artifacts, analytics dashboard,
  admin/user management
- **Delivery** — one-command Docker Compose *and* cloud deploy (Render / Fly.io)

Destination repo: **`mobiliseapplabllp/ai-for-medical-assistance`**.

---

## Fastest path — Docker (recommended)

Install Docker Desktop, then:

```bash
docker compose up --build
# open http://localhost:8000   (login: admin@city-general.demo / demo1234)
```

That builds the UI, starts Postgres + the app, and seeds sample data. To add the
real CT/MRI model server (large download):

```bash
AI_ENGINE_MODE=monai docker compose --profile monai up --build
```

---

## Run locally without Docker

The built UI is committed (`webapp/out`), so you only need **Python 3.11+** —
no Node required to run.

```bash
# from the project root
python3.11 -m venv .venv && source .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                       # Windows: copy .env.example .env
cd backend
python -m app.generate_samples && python -m app.seed && python -m app.export_reports
uvicorn app.main:app --host 127.0.0.1 --port 8000
# open http://localhost:8000
```

### Modifying the UI (needs Node 20+)

```bash
cd webapp
npm install
npm run dev        # http://localhost:3000, talks to the API on :8000
#   set NEXT_PUBLIC_API_URL=http://localhost:8000 in webapp/.env.local
npm run build      # regenerate webapp/out for the Python server to serve
```

---

## What you can do in the app

| Page | What it does |
|------|--------------|
| **Patients** | Searchable list; open a unified profile |
| **Patient profile** | Studies with Original ↔ AI-attention viewer, findings, AI correlation |
| **📄 Report / PDF** | Formal medical report as HTML (print) or downloadable **PDF** |
| **Structured report** | Per study: sectioned report (findings by anatomy/system, RADS/ICDR assessment, numbered impression, recommendations) — open as HTML or download **FHIR JSON** |
| **Analytics** | Case volumes, severity distribution, top findings, modality mix, model usage |
| **Admin** | Manage doctors: roles, activate/deactivate, add users (admin only) |
| **AI Models** | Active engines, modalities, how to enable real models |
| **New study** | Upload **PNG/JPG or DICOM (.dcm)** → Run AI analysis |

---

## Real AI models

| Modality | Real engine | Enable |
|----------|-------------|--------|
| Chest X-ray | TorchXRayVision (18 pathologies) | `pip install -r requirements-ml.txt` + `AI_ENGINE_MODE=real` |
| CT / MRI | MONAI Label (incl. **lung-nodule detection**, pancreas, brain tumour) | see one-command below |
| Skin (dermoscopy) | ISIC/HAM10000 classifier (`timm`) | `AI_ENGINE_MODE=real` + `SKIN_MODEL_WEIGHTS=…` |

**Oncology models** (lung, breast BI-RADS, skin melanoma, brain tumour, pancreas)
run as mocks by default. To run the **real lung-nodule detector** end-to-end:

```bash
docker compose -f docker-compose.yml -f docker-compose.monai.yml \
  --profile monai up --build      # AI_ENGINE_MODE=monai, lung_nodule_ct_detection
```

Both degrade gracefully to the mock engine if unavailable, and the startup log
prints which engine is active. Real models need real scans — use
`python scripts/fetch_real_samples.py` for public-domain chest X-rays.

---

## Cloud deploy (public URL)

- **Render**: push to GitHub → New ▸ Blueprint → select repo (`render.yaml` provisions
  the web service + managed Postgres). `SECRET_KEY` is auto-generated.
- **Fly.io**: `fly launch --no-deploy` → `fly postgres create` + `fly postgres attach` →
  `fly volumes create mid_data --size 5` → `fly secrets set SECRET_KEY=$(openssl rand -hex 32)` →
  `fly deploy` (`fly.toml` included).

Start on the mock engine (cheap); scale RAM up for `real`/`monai`.

---

## Tests

```bash
cd backend && python -m pytest -q     # auth, pipeline, correlation, tenancy,
                                      # analytics, PDF, admin, DICOM  (9 tests)
```

---

## Getting this into your repo

This session's GitHub access is scoped to `PLI-Portal`, so use the delivered
bundle:

```bash
git clone ai-for-medical-assistance.bundle ai-for-medical-assistance
cd ai-for-medical-assistance
git remote set-url origin https://github.com/mobiliseapplabllp/ai-for-medical-assistance.git
git push -u origin main            # add --force if the repo already has a commit
```

---

## ⚠️ Not for clinical use

Research/education prototype. Findings are simulated (or from non-clinical
models) and are **not validated or regulatory-cleared**. A qualified physician
must review all imaging.
