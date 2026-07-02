"""Concrete diagnostic engines.

Every engine ships in two flavours:
  * a deterministic **mock** that runs with zero heavy dependencies, so the whole
    product is demoable on a laptop / CI, and
  * a documented hook for the **real** pretrained model (torchxrayvision, MedSAM,
    RETFound ...) that plugs in behind the exact same `analyze()` contract.

Demo coherence: a mock engine will honour a "scenario plan" — a sidecar JSON file
`<image>.plan.json` mapping {label: probability}. This lets the seed script craft
clinically consistent sample patients (a CHF case, a pneumonia case, ...) while
still exercising the real engine pipeline. Without a plan, the mock is seeded from
the image bytes so results are stable per image but vary across images.
"""
from __future__ import annotations

import hashlib
import json
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
SEGMENTATION_LABELS = ["Lesion", "Nodule", "Mass", "Effusion region", "Ground-glass opacity"]

# ISIC / HAM10000-style skin lesion classes (dermoscopy). Malignant: Melanoma, BCC, AKIEC.
SKIN_LABELS = [
    "Melanoma", "Basal cell carcinoma", "Actinic keratosis",
    "Melanocytic nevus", "Benign keratosis", "Dermatofibroma", "Vascular lesion",
]
# BraTS-style brain tumour sub-regions (MRI).
BRAIN_LABELS = ["Glioma", "Enhancing tumor", "Peritumoral edema", "Necrotic core", "Metastasis"]


def _seed_from_image(image_path: str) -> random.Random:
    try:
        with open(image_path, "rb") as fh:
            digest = hashlib.sha256(fh.read()).hexdigest()
    except OSError:
        digest = hashlib.sha256(image_path.encode()).hexdigest()
    return random.Random(int(digest[:16], 16))


def _load_plan(image_path: str) -> dict | None:
    """Optional scenario plan: {label: probability} in `<image>.plan.json`."""
    plan_path = image_path + ".plan.json"
    if os.path.exists(plan_path):
        try:
            with open(plan_path) as fh:
                return json.load(fh)
        except Exception:
            return None
    return None


def _findings_from_plan(labels: list[str], plan: dict, rng: random.Random) -> list[Finding]:
    findings = []
    for label in labels:
        if label in plan:
            findings.append(Finding(label, float(plan[label])))
        else:
            findings.append(Finding(label, rng.uniform(0.0, 0.10)))
    return findings


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
    os.makedirs(os.path.dirname(heatmap_out) or ".", exist_ok=True)
    Image.fromarray((out * 255).astype("uint8")).save(heatmap_out)
    return heatmap_out


class MockCXREngine(DiagnosticEngine):
    name = "cxr"
    modality = "xray"
    model_source = "MockEngine(cxr-densenet-sim)"

    def analyze(self, image_path: str, *, heatmap_out: str | None = None) -> EngineResult:
        rng = _seed_from_image(image_path)
        plan = _load_plan(image_path)
        if plan is not None:
            findings = _findings_from_plan(CXR_LABELS, plan, rng)
        else:
            findings = []
            n_hot = rng.choices([0, 1, 2, 3], weights=[3, 4, 3, 1])[0]
            hot = set(rng.sample(range(len(CXR_LABELS)), n_hot))
            for i, label in enumerate(CXR_LABELS):
                p = rng.uniform(0.55, 0.95) if i in hot else rng.uniform(0.0, 0.14)
                findings.append(Finding(label, p))
        has_pos = any(f.severity != "normal" for f in findings)
        heatmap = _maybe_heatmap(image_path, heatmap_out, rng) if has_pos else None
        return EngineResult(self.name, self.modality, self.model_source, findings, heatmap)


class MockRetinalEngine(DiagnosticEngine):
    name = "retinal"
    modality = "fundus"
    model_source = "MockEngine(retfound-sim)"

    def analyze(self, image_path: str, *, heatmap_out: str | None = None) -> EngineResult:
        rng = _seed_from_image(image_path)
        plan = _load_plan(image_path)
        if plan is not None:
            findings = _findings_from_plan(RETINAL_LABELS, plan, rng)
        else:
            grade = rng.choices(range(5), weights=[5, 3, 3, 2, 1])[0]  # DR severity 0-4
            findings = []
            for i, label in enumerate(RETINAL_LABELS[:5]):
                p = rng.uniform(0.7, 0.95) if i == grade else rng.uniform(0.0, 0.2)
                findings.append(Finding(label, p))
            findings.append(Finding("Glaucoma", rng.uniform(0.0, 0.5)))
            findings.append(Finding("AMD", rng.uniform(0.0, 0.4)))
        has_pos = any(f.severity != "normal" and not f.label.endswith("No DR") for f in findings)
        heatmap = _maybe_heatmap(image_path, heatmap_out, rng) if has_pos else None
        return EngineResult(self.name, self.modality, self.model_source, findings, heatmap)


class MockSegmentationEngine(DiagnosticEngine):
    """Stand-in for MedSAM / SAM-Med2D. Reports region confidences as findings."""
    name = "segmentation"
    modality = "ct"
    model_source = "MockEngine(medsam-sim)"

    def analyze(self, image_path: str, *, heatmap_out: str | None = None) -> EngineResult:
        rng = _seed_from_image(image_path)
        plan = _load_plan(image_path)
        if plan is not None:
            findings = _findings_from_plan(SEGMENTATION_LABELS, plan, rng)
        else:
            findings = [Finding(r, rng.uniform(0.1, 0.9)) for r in SEGMENTATION_LABELS[:3]]
        heatmap = _maybe_heatmap(image_path, heatmap_out, rng)
        return EngineResult(self.name, self.modality, self.model_source, findings, heatmap)


class MockSkinCancerEngine(DiagnosticEngine):
    """Dermoscopy skin-lesion classifier (ISIC/HAM10000 classes). Oncology.

    Stand-in for an EfficientNet/ViT trained on ISIC. Malignant classes
    (Melanoma, BCC, Actinic keratosis) drive the melanoma assessment."""
    name = "skin"
    modality = "dermoscopy"
    model_source = "MockEngine(isic-derm-sim)"

    def analyze(self, image_path: str, *, heatmap_out: str | None = None) -> EngineResult:
        rng = _seed_from_image(image_path)
        plan = _load_plan(image_path)
        if plan is not None:
            findings = _findings_from_plan(SKIN_LABELS, plan, rng)
        else:
            # single dominant class + low noise on the rest
            top = rng.choices(range(len(SKIN_LABELS)),
                              weights=[2, 1, 1, 4, 2, 1, 1])[0]
            findings = []
            for i, label in enumerate(SKIN_LABELS):
                p = rng.uniform(0.6, 0.93) if i == top else rng.uniform(0.0, 0.15)
                findings.append(Finding(label, p))
        malignant = any(f.label in ("Melanoma", "Basal cell carcinoma", "Actinic keratosis")
                        and f.severity != "normal" for f in findings)
        heatmap = _maybe_heatmap(image_path, heatmap_out, rng) if malignant else None
        return EngineResult(self.name, self.modality, self.model_source, findings, heatmap)


class MockBrainTumorEngine(DiagnosticEngine):
    """Brain MRI tumour segmentation (BraTS-style). Oncology."""
    name = "brain"
    modality = "mri"
    model_source = "MockEngine(brats-sim)"

    def analyze(self, image_path: str, *, heatmap_out: str | None = None) -> EngineResult:
        rng = _seed_from_image(image_path)
        plan = _load_plan(image_path)
        if plan is not None:
            findings = _findings_from_plan(BRAIN_LABELS, plan, rng)
        else:
            findings = [Finding(BRAIN_LABELS[0], rng.uniform(0.1, 0.85))]
            findings += [Finding(l, rng.uniform(0.0, 0.5)) for l in BRAIN_LABELS[1:4]]
        has_pos = any(f.severity != "normal" for f in findings)
        heatmap = _maybe_heatmap(image_path, heatmap_out, rng) if has_pos else None
        return EngineResult(self.name, self.modality, self.model_source, findings, heatmap)


# ---- real model adapters (optional) ----------------------------------------

class TorchSkinCancerEngine(DiagnosticEngine):
    """Real dermoscopy classifier via `timm` (e.g. an ISIC-fine-tuned model).

    Activated when AI_ENGINE_MODE in (real, monai) and timm+torch are installed
    with SKIN_MODEL_WEIGHTS pointing at ISIC weights. Import-lazy so the base
    prototype never needs torch. Falls back to the mock if weights are absent."""
    name = "skin"
    modality = "dermoscopy"
    model_source = "timm:isic-efficientnet"

    def __init__(self) -> None:
        import os as _os

        weights = _os.environ.get("SKIN_MODEL_WEIGHTS")
        if not weights or not _os.path.exists(weights):
            raise RuntimeError("SKIN_MODEL_WEIGHTS not set / not found")
        import timm  # noqa: F401
        import torch

        arch = _os.environ.get("SKIN_MODEL_ARCH", "efficientnet_b0")
        self._torch = torch
        self._model = timm.create_model(arch, num_classes=len(SKIN_LABELS))
        self._model.load_state_dict(torch.load(weights, map_location="cpu"))
        self._model.eval()

    def analyze(self, image_path: str, *, heatmap_out: str | None = None) -> EngineResult:
        import numpy as np
        import torch
        from PIL import Image

        img = Image.open(image_path).convert("RGB").resize((224, 224))
        x = np.asarray(img, dtype=np.float32) / 255.0
        x = (x - 0.5) / 0.5
        t = torch.from_numpy(x.transpose(2, 0, 1))[None, ...].float()
        with torch.no_grad():
            probs = torch.softmax(self._model(t).squeeze(), dim=0).tolist()
        findings = [Finding(lbl, p) for lbl, p in zip(SKIN_LABELS, probs)]
        return EngineResult(self.name, self.modality, self.model_source, findings, None)


class TorchXRayVisionEngine(DiagnosticEngine):
    """Real 18-pathology chest X-ray classifier.

    Activated when AI_ENGINE_MODE=real and torchxrayvision is installed. Kept
    import-lazy so the base prototype never needs torch. Produces a real
    Grad-CAM-style overlay from the model's own gradients when a heatmap path
    is requested."""
    name = "cxr"
    modality = "xray"
    model_source = "torchxrayvision:densenet121-res224-all"

    def __init__(self) -> None:
        import torchxrayvision as xrv  # validated at construction
        self._xrv = xrv
        self._model = xrv.models.DenseNet(weights="densenet121-res224-all")
        self._model.eval()

    def _preprocess(self, image_path: str):
        import numpy as np
        from PIL import Image

        xrv = self._xrv
        img = np.asarray(Image.open(image_path).convert("L"), dtype=np.float32)
        img = xrv.datasets.normalize(img, 255)          # -> [-1024, 1024]
        img = img[None, ...]                             # add channel dim -> (1, H, W)
        img = xrv.datasets.XRayCenterCrop()(img)
        img = xrv.datasets.XRayResizer(224)(img)
        return img

    def analyze(self, image_path: str, *, heatmap_out: str | None = None) -> EngineResult:
        import numpy as np
        import torch

        img = self._preprocess(image_path)
        tensor = torch.from_numpy(img)[None, ...].float()
        tensor.requires_grad_(True)
        out = self._model(tensor)
        probs = out.detach().squeeze().tolist()
        findings = [
            Finding(label, p)
            for label, p in zip(self._model.pathologies, probs)
            if label
        ]

        heatmap = None
        if heatmap_out and findings:
            heatmap = self._gradcam(tensor, out, image_path, heatmap_out)
        return EngineResult(self.name, self.modality, self.model_source, findings, heatmap)

    def _gradcam(self, tensor, out, image_path: str, heatmap_out: str):
        """Saliency overlay from the gradient of the top class w.r.t. the input."""
        try:
            import numpy as np
            import torch
            from PIL import Image

            top = int(torch.argmax(out))
            self._model.zero_grad()
            out[0, top].backward()
            sal = tensor.grad.detach().abs().squeeze().numpy()
            sal = (sal - sal.min()) / (np.ptp(sal) + 1e-8)

            base = Image.open(image_path).convert("RGB").resize((sal.shape[1], sal.shape[0]))
            arr = np.asarray(base, dtype=np.float32) / 255.0
            heat = np.zeros_like(arr)
            heat[..., 0] = sal
            heat[..., 1] = sal * 0.3
            blended = np.clip(arr * (1 - 0.5 * sal[..., None]) + heat * 0.5, 0, 1)
            os.makedirs(os.path.dirname(heatmap_out) or ".", exist_ok=True)
            Image.fromarray((blended * 255).astype("uint8")).save(heatmap_out)
            return heatmap_out
        except Exception:
            return None
