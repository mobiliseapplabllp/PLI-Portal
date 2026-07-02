# MONAI Label service — real CT/MRI + oncology models

This directory wires [MONAI Label](https://github.com/Project-MONAI/MONAILabel)
(the open-source model server from the MONAI project) into the app as the real
engine behind CT/MRI studies, including **oncology (cancer) models** from the
[MONAI Model Zoo](https://monai.io/model-zoo).

## Oncology models loaded

| Bundle | Cancer / task | Output |
|--------|---------------|--------|
| `lung_nodule_ct_detection` | **Lung cancer** — pulmonary nodule detection (RetinaNet, LUNA16) | boxes + scores |
| `pancreas_ct_dints_segmentation` | **Pancreatic tumour** + pancreas | mask |
| `wholeBody_ct_segmentation` | 104 structures (staging context) | mask |
| `brats_mri_segmentation` *(add-on)* | **Brain tumour** (glioma, BraTS) | mask |
| `pathology_tumor_detection` *(add-on)* | **Breast cancer** metastasis (Camelyon WSI) | mask |

Set the active set with `MONAI_MODELS` (comma-separated bundle names). The
adapter (`backend/app/ai/monai_engine.py`) auto-detects mask vs. detection
(boxes) output — nodule detection scores flow straight into the Lung-RADS
assessment in the structured report.

## Enable it (macOS, with Docker Desktop)

```bash
# 0. Start the Docker engine once: open the Docker Desktop app (or `open -a Docker`)
#    and wait for the whale icon to say "running".

# 1. From the PROJECT ROOT (not backend/), bring up app + Postgres + MONAI.
#    First build downloads ~8-10GB (torch + models) and takes a while.
docker compose -f docker-compose.yml -f docker-compose.monai.yml --profile monai up --build

# 2. Get a real chest CT volume (the 3D detector needs one, not a 2D image):
python scripts/fetch_ct_sample.py         # -> sample_data/ct_volumes/*.nii.gz

# 3. In the app: open a patient → New study (modality: ct) → upload the .nii.gz
#    → Run AI analysis. CPU inference takes minutes; a GPU is much faster.
```

<details><summary>Alternative: original quick-start</summary>

```bash
# Start everything including MONAI (first build downloads ~8GB: torch + models)
docker compose --profile monai up --build

# 2. Tell the backend to use it (.env or compose environment)
AI_ENGINE_MODE=monai
MONAI_LABEL_URL=http://monailabel:8000     # inside compose
MONAI_LABEL_MODEL=segmentation             # optional; auto-detected otherwise
```

Without Docker (bare metal, needs Python 3.10 + ~8GB):

```bash
pip install monailabel
monailabel apps --download --name radiology --output apps
monailabel start_server --app apps/radiology --studies datasets \
    --conf models segmentation --port 8100
# backend: AI_ENGINE_MODE=monai MONAI_LABEL_URL=http://localhost:8100
```
</details>

## What happens

When a doctor clicks **Run AI analysis** on a CT/MRI study, the backend's
`MonaiLabelEngine` (backend/app/ai/monai_engine.py):

1. discovers the model + label vocabulary from `GET /info/`,
2. posts the image to `POST /infer/{model}`,
3. converts the returned segmentation mask into findings (per-structure
   coverage) and renders a mask overlay for the viewer.

If the MONAI server is down, the app falls back to the mock engine and says so
in the startup log — the UI keeps working either way.

## Notes

- Real segmentation needs **real scans** (DICOM/NIfTI). Use
  `scripts/fetch_real_samples.py` or your own de-identified data.
- CPU inference works but takes minutes per volume; a GPU is strongly
  recommended (`docker compose` will use it automatically with the NVIDIA
  container toolkit installed).
- Other Model Zoo apps (e.g. `pathology`, `endoscopy`, different `--conf models`)
  plug in the same way — that's the point of the bundle format.
