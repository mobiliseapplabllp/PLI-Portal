# MONAI Label service — real CT/MRI segmentation

This directory wires [MONAI Label](https://github.com/Project-MONAI/MONAILabel)
(the open-source model server from the MONAI project) into the app as the real
engine behind CT/MRI studies.

## Enable it

```bash
# 1. Start everything including MONAI (first build downloads ~8GB: torch + models)
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
