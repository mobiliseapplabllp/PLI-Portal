"""Concrete diagnostic engines.

Every engine ships in two flavours:
  * a deterministic **mock** that runs with zero heavy dependencies, so the whole
    product is demoable on a laptop / CI, and
  * a documented hook for the **real** pretrained model (torchxrayvision, MedSAM,
    RETFound ...) that plugs in behind the exact same `analyze()` contract.

The mock is seeded from the image bytes so results are stable per image but vary
across images — good enough to exercise the full patient/correlation pipeline.
"""
from __future__ import annotations

import hashlib
import os
import random

from .base import DiagnosticEngine, EngineResult, Finding

# ---- label vocabularies (mirror real model heads) -------------------------

CXR_LABELS = [
    "Atelectasis", "Cardiomegaly", "Consolidation", "Edema", "Effusion",
    "Emphysema", "Fibrosis", "Hernia", "Infiltration", "Mass", "Nodule",
    "Pleural_Thickening", "Pneumonia", "Pneumothorax", "Lung Opacity",
]
RETINAL_LABELS = [
    "No DR", "Mild DR", "Moderate DR", "Severe DR", "Proliferative DR",
    "Glaucoma", "AMD",
]


def _seed_from_image(image_path: str) -> random.Random:
    try:
        with open(image_path, "rb") as fh:
            digest = hashlib.sha256(fh.read()).hexdigest()
    except OSError:
        digest = hashlib.sha256(image_path.encode()).hexdigest()
    return random.Random(int(digest[:16], 16))


def _maybe_heatmap(image_path: str, heatmap_out: str | None, rng: random.Random) -> str | None:
    """Render a Grad-CAM-style attention overlay so the UI has something to show.
    Falls back to None if Pillow/numpy are unavailable."""
    if not heatmap_out:
        return None
    try:
        import numpy as np
        from PIL import Image
    except Exception:
        return None
    try:
        base = Image.open(image_path).convert("RGB")
    except Exception:
        base = Image.new("RGB", (512, 512), (20, 20, 30))
    w, h = base.size
    yy, xx = np.mgrid[0:h, 0:w]
    cx, cy = rng.uniform(0.3, 0.7) * w, rng.uniform(0.3, 0.7) * h
    sigma = 0.18 * min(w, h)
    blob = np.exp(-(((xx - cx) ** 2 + (yy - cy) ** 2) / (2 * sigma ** 2)))
    heat = np.zeros((h, w, 3), dtype=np.float32)
    heat[..., 0] = blob            # red channel = attention
    heat[..., 1] = blob * 0.4
    arr = np.asarray(base, dtype=np.float32) / 255.0
    out = np.clip(arr * (1 - 0.5 * blob[..., None]) + heat * 0.5, 0, 1)
    os.makedirs(os.path.dirname(heatmap_out), exist_ok=True)
    Image.fromarray((out * 255).astype("uint8")).save(heatmap_out)
    return heatmap_out


class MockCXREngine(DiagnosticEngine):
    name = "cxr"
    modality = "xray"
    model_source = "MockEngine(cxr-densenet-sim)"

    def analyze(self, image_path: str, *, heatmap_out: str | None = None) -> EngineResult:
        rng = _seed_from_image(image_path)
        # Most images: mostly-normal with 0-3 elevated pathologies.
        findings = []
        n_hot = rng.choices([0, 1, 2, 3], weights=[3, 4, 3, 1])[0]
        hot = set(rng.sample(range(len(CXR_LABELS)), n_hot))
        for i, label in enumerate(CXR_LABELS):
            p = rng.uniform(0.55, 0.95) if i in hot else rng.uniform(0.0, 0.14)
            findings.append(Finding(label, p))
        heatmap = _maybe_heatmap(image_path, heatmap_out, rng) if hot else None
        return EngineResult(self.name, self.modality, self.model_source, findings, heatmap)


class MockRetinalEngine(DiagnosticEngine):
    name = "retinal"
    modality = "fundus"
    model_source = "MockEngine(retfound-sim)"

    def analyze(self, image_path: str, *, heatmap_out: str | None = None) -> EngineResult:
        rng = _seed_from_image(image_path)
        grade = rng.choices(range(5), weights=[5, 3, 3, 2, 1])[0]  # DR severity 0-4
        findings = []
        for i, label in enumerate(RETINAL_LABELS[:5]):
            p = rng.uniform(0.7, 0.95) if i == grade else rng.uniform(0.0, 0.2)
            findings.append(Finding(label, p))
        findings.append(Finding("Glaucoma", rng.uniform(0.0, 0.5)))
        findings.append(Finding("AMD", rng.uniform(0.0, 0.4)))
        heatmap = _maybe_heatmap(image_path, heatmap_out, rng) if grade else None
        return EngineResult(self.name, self.modality, self.model_source, findings, heatmap)


class MockSegmentationEngine(DiagnosticEngine):
    """Stand-in for MedSAM / SAM-Med2D. Reports region areas as 'findings'."""
    name = "segmentation"
    modality = "ct"
    model_source = "MockEngine(medsam-sim)"

    def analyze(self, image_path: str, *, heatmap_out: str | None = None) -> EngineResult:
        rng = _seed_from_image(image_path)
        regions = ["Lesion", "Nodule", "Effusion region"]
        findings = [Finding(r, rng.uniform(0.1, 0.9)) for r in regions]
        heatmap = _maybe_heatmap(image_path, heatmap_out, rng)
        return EngineResult(self.name, self.modality, self.model_source, findings, heatmap)


# ---- real model adapter (optional) ----------------------------------------

class TorchXRayVisionEngine(DiagnosticEngine):
    """Real 18-pathology chest X-ray classifier.

    Activated only when AI_ENGINE_MODE=real and torchxrayvision is installed.
    Kept import-lazy so the base prototype never needs torch."""
    name = "cxr"
    modality = "xray"
    model_source = "torchxrayvision:densenet121-res224-all"

    def __init__(self) -> None:
        import torchxrayvision as xrv  # noqa: F401  (validated at construction)
        self._xrv = xrv
        self._model = xrv.models.DenseNet(weights="densenet121-res224-all")
        self._model.eval()

    def analyze(self, image_path: str, *, heatmap_out: str | None = None) -> EngineResult:
        import numpy as np
        import torch
        from PIL import Image

        xrv = self._xrv
        img = np.asarray(Image.open(image_path).convert("L"), dtype=np.float32)
        img = xrv.datasets.normalize(img, 255)
        img = img[None, ...]
        img = xrv.datasets.XRayCenterCrop()({"img": img})["img"]
        img = xrv.datasets.XRayResizer(224)({"img": img})["img"]
        with torch.no_grad():
            out = self._model(torch.from_numpy(img)[None, ...]).squeeze().tolist()
        findings = [
            Finding(label, p)
            for label, p in zip(self._model.pathologies, out)
            if label
        ]
        return EngineResult(self.name, self.modality, self.model_source, findings, None)
