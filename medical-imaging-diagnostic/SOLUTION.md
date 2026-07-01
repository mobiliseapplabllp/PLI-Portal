# 🚀 Solution & Local Runbook

This is the complete, self-contained solution for running the **AI Medical
Imaging Diagnostic Assistant** on your local machine, with sample patients,
sample X-ray / CT images, sample reports, and the real **TorchXRayVision** model.

Destination repo: **`mobiliseapplabllp/ai-for-medical-assistance`**
(see [Getting this into your repo](#getting-this-into-your-repo)).

---

## 1. What you get

- **7 sample patients** across 2 organizations, each a realistic scenario:
  | Patient | Org | Scenario | AI correlation |
  |---------|-----|----------|----------------|
  | Robert Chen | City General | Cardiomegaly + effusion + edema | **Congestive heart failure (84%)** |
  | Asha Verma | City General | Consolidation + infiltration | **Pneumonia** |
  | Maria Gomez | City General | Fundus severe DR + normal CXR | **Diabetic retinopathy** |
  | James Okoro | City General | CXR nodule + CT mass | **Suspicious neoplasm** |
  | Emily Nguyen | City General | Normal screening | No significant findings |
  | David Smith | Sunrise Dx | Pneumothorax | **Pneumothorax** |
  | Fatima Al-Sayed | Sunrise Dx | Cardiomegaly + effusion | **Congestive heart failure** |
- **Sample images** (`sample_data/images/`) — synthetic X-ray, CT and fundus you can upload via the UI.
- **Sample reports** (`sample_data/reports/*.md`) — pre-generated per-patient reports (findings + AI-draft radiology report + cross-study correlation).
- **Real model** — chest X-ray via `torchxrayvision` (18 pathologies) with a gradient saliency heatmap.

---

## 2. Fastest path (one command)

```bash
cd medical-imaging-diagnostic
make demo
```

`make demo` creates the venv, installs deps, generates sample images, seeds the
database with the 7 patients, exports sample reports, and starts the server.

Then open **http://localhost:8000** and sign in:

| Login | Password | Sees |
|-------|----------|------|
| `admin@city-general.demo` | `demo1234` | 5 patients |
| `admin@sunrise-dx.demo` | `demo1234` | 2 patients |

> No `make`? Use the manual steps below. On **Windows**, use `run_dev.bat` or the
> manual commands in PowerShell.

---

## 3. Manual steps

```bash
cd medical-imaging-diagnostic
python3 -m venv .venv
source .venv/bin/activate           # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                 # Windows: copy .env.example .env

cd backend
python -m app.generate_samples       # -> sample_data/images/*.png
python -m app.seed                   # -> creates mid.db with 7 patients
python -m app.export_reports         # -> sample_data/reports/*.md
uvicorn app.main:app --reload --port 8000
```

Interactive API docs: **http://localhost:8000/docs**

---

## 4. Try it — X-ray, CT, and reports

1. **Sign in** → pick **James Okoro** → you'll see two studies (Chest X-ray +
   CT), each with findings, a heatmap, and an AI-draft report, plus the
   patient-level **AI correlation** ("Suspicious pulmonary neoplasm").
2. **Generate a full medical report**: click **📄 Medical Report** on a patient
   to open a formal, print-ready radiology report (with **Print / Save as PDF**).
3. **See the models**: click **AI Models** in the top bar for the active engines,
   modalities, and how to enable the real TorchXRayVision model.
4. **Create a new study**: on any patient click **+ New study**, choose a
   modality (`xray`, `ct`, `mri`, `fundus`), and upload an image from
   `sample_data/images/` → click **Run AI analysis**.
5. **Read sample reports** without the app: open any `sample_data/reports/*.html`
   (formatted report) or `*.md` (plain text).

---

## 5. Enable the REAL chest X-ray model

The default engines are simulated so the app runs anywhere. To use the real
[TorchXRayVision](https://github.com/mlmed/torchxrayvision) DenseNet-121:

```bash
# from the project root, venv active
make real                # installs torch (CPU) + torchxrayvision
# or manually:
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
pip install torchxrayvision

# then set in .env:
AI_ENGINE_MODE=real
```

Get real radiographs to test with (synthetic images give meaningless real
predictions):

```bash
python scripts/fetch_real_samples.py   # -> sample_data/real_images/
```

Restart the server; the startup log prints
`AI_ENGINE_MODE=real → chest X-ray uses torchxrayvision:densenet121-res224-all`.
Upload a real chest X-ray and the model returns genuine 18-pathology
probabilities with a Grad-CAM saliency heatmap. Other modalities keep using the
mock engine until their real adapters (MedSAM, RETFound) are wired.

---

## 6. Docker (production-like)

```bash
docker compose up --build          # API + Postgres on :8000
```

The API is stateless and built to scale horizontally. To run multiple replicas,
remove the fixed `ports:` binding in `docker-compose.yml` and put a reverse proxy
(nginx/traefik) in front, then `docker compose up --scale api=3`.

Seed inside the container once it's up:

```bash
docker compose exec api python -m app.seed
```

---

## 7. Tests

```bash
cd backend && python -m pytest -q   # auth, AI pipeline, correlation, tenant isolation
```

---

## Getting this into your repo

This code was developed in a session whose GitHub access is **locked to
`PLI-Portal`**, so it could not be pushed to `ai-for-medical-assistance`
directly. To publish it:

```bash
# You received a bundle: mid-ai-medical.bundle  (or a tar of this folder)
git clone mid-ai-medical.bundle ai-for-medical-assistance
cd ai-for-medical-assistance
git remote set-url origin https://github.com/mobiliseapplabllp/ai-for-medical-assistance.git
git push -u origin main
```

Or, to let Claude push directly next time, add
`mobiliseapplabllp/ai-for-medical-assistance` to the session's **allowed
repositories** in your Claude Code on the web environment settings
(https://code.claude.com/docs/en/claude-code-on-the-web).

---

## ⚠️ Not for clinical use

Research/education prototype. Default findings are **simulated**; even with the
real model enabled, nothing here is validated or regulatory-cleared (FDA/CE). Do
not use for real patient care.
