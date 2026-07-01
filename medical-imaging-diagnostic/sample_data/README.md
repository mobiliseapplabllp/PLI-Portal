# Sample data

Generated assets for testing the app. Regenerate any time with the scripts noted.

## `images/`  — upload these via the UI
Synthetic X-ray / CT / fundus images, one per sample study. Each has a
`<name>.plan.json` sidecar so that when uploaded through the app (mock engine),
it produces the intended, clinically coherent findings.

Regenerate:  `cd backend && python -m app.generate_samples`

| File pattern | Modality | Intended finding |
|--------------|----------|------------------|
| `robert-chen_xray_xray.png` | Chest X-ray | Cardiomegaly + effusion (→ CHF) |
| `asha-verma_xray_xray.png` | Chest X-ray | Consolidation (→ pneumonia) |
| `james-okoro_*` | X-ray + CT | Nodule / mass (→ neoplasm) |
| `maria-gomez_fundus_fundus.png` | Fundus | Severe diabetic retinopathy |
| `david-smith_xray_xray.png` | Chest X-ray | Pneumothorax |
| ... | | |

## `reports/`  — pre-generated per-patient reports
Two formats per patient:
- **`<name>.html`** — the formal, print-ready medical report artifact (open in a
  browser, then "Print / Save as PDF"). Same as the **Medical Report** button in the app.
- **`<name>.md`** — a plain-text version (findings + AI-draft report + correlation).

Regenerate (after seeding):  `cd backend && python -m app.export_reports`

## `real_images/`  — real radiographs for the real model
Populated by `python scripts/fetch_real_samples.py` (public-domain teaching
images). Use these with `AI_ENGINE_MODE=real`.

---
⚠️ All findings are simulated (or from a non-clinical model). Not for clinical use.
