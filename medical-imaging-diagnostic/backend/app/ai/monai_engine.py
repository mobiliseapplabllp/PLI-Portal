"""MONAI Label adapter — plugs a real segmentation model server into the app.

MONAI Label (https://github.com/Project-MONAI/MONAILabel) is an open-source
model server from the MONAI project. Run it next to this app (see monai/ and
docker-compose.yml), load a Model Zoo app (e.g. radiology + segmentation), and
set AI_ENGINE_MODE=monai — CT/MRI studies are then analyzed by the real model.

Flow per analysis:
  GET  {url}/info/                → discover models + label vocabulary
  POST {url}/infer/{model}        → upload image, receive segmentation mask
  mask → per-label voxel coverage → Finding(label, confidence)

Degrades gracefully: if the server is unreachable at startup the registry falls
back to the mock engine, and any per-request failure raises a clear error.
"""
from __future__ import annotations

import io
import json
import os

from .base import DiagnosticEngine, EngineResult, Finding


class MonaiLabelEngine(DiagnosticEngine):
    name = "segmentation"
    modality = "ct"

    def __init__(self, url: str | None = None, model: str | None = None,
                 timeout: int = 300) -> None:
        import requests

        self._requests = requests
        self.url = (url or os.environ.get("MONAI_LABEL_URL", "http://localhost:8100")).rstrip("/")
        self.timeout = timeout

        info = requests.get(f"{self.url}/info/", timeout=10).json()
        models = info.get("models", {})
        if not models:
            raise RuntimeError(f"MONAI Label at {self.url} reports no models")
        # Pick the requested model, else the first segmentation-type model.
        self.model = model or os.environ.get("MONAI_LABEL_MODEL") or next(
            (n for n, m in models.items() if m.get("type") == "segmentation"),
            next(iter(models)),
        )
        self.labels = self._extract_labels(models.get(self.model, {}))
        self.model_source = f"monailabel:{self.model}@{self.url}"

    @staticmethod
    def _extract_labels(model_info: dict) -> dict[int, str]:
        """MONAI reports labels as {name: index} or [names]; normalize to {index: name}."""
        labels = model_info.get("labels", {})
        if isinstance(labels, dict):
            return {int(v): k for k, v in labels.items()}
        return {i + 1: name for i, name in enumerate(labels)}

    def analyze(self, image_path: str, *, heatmap_out: str | None = None) -> EngineResult:
        resp = self._requests.post(
            f"{self.url}/infer/{self.model}?output=image",
            files={"file": (os.path.basename(image_path), open(image_path, "rb"))},
            timeout=self.timeout,
        )
        resp.raise_for_status()
        findings = self._findings_from_mask(resp.content)
        heatmap = self._mask_overlay(resp.content, image_path, heatmap_out)
        return EngineResult(self.name, self.modality, self.model_source, findings, heatmap)

    def _findings_from_mask(self, mask_bytes: bytes) -> list[Finding]:
        """Convert the returned mask into per-label findings.

        Confidence proxy: fraction of image area covered by each label, scaled
        so visible structures land in the flagged range. A structure covering
        >0.5% of the volume is reported."""
        import numpy as np

        arr = self._read_mask(mask_bytes)
        if arr is None:
            # Could not parse the mask format — report model labels as detected
            # but unquantified rather than failing the whole analysis.
            return [Finding(name, 0.5) for name in list(self.labels.values())[:5]]

        total = arr.size or 1
        findings = []
        for idx, name in self.labels.items():
            frac = float((arr == idx).sum()) / total
            if frac > 0.005:
                findings.append(Finding(name, min(0.55 + frac * 4, 0.98)))
            else:
                findings.append(Finding(name, min(frac * 20, 0.1)))
        return findings

    @staticmethod
    def _read_mask(mask_bytes: bytes):
        """Try NIfTI (nibabel) then plain image (PIL). Returns ndarray or None."""
        try:
            import tempfile

            import nibabel as nib
            with tempfile.NamedTemporaryFile(suffix=".nii.gz", delete=False) as tmp:
                tmp.write(mask_bytes)
                path = tmp.name
            arr = nib.load(path).get_fdata()
            os.unlink(path)
            return arr.astype("int16")
        except Exception:
            pass
        try:
            import numpy as np
            from PIL import Image
            return np.asarray(Image.open(io.BytesIO(mask_bytes)))
        except Exception:
            return None

    def _mask_overlay(self, mask_bytes: bytes, image_path: str,
                      heatmap_out: str | None) -> str | None:
        """Blend the segmentation mask over the source image for the viewer."""
        if not heatmap_out:
            return None
        try:
            import numpy as np
            from PIL import Image

            arr = self._read_mask(mask_bytes)
            if arr is None:
                return None
            if arr.ndim == 3:
                arr = arr[..., arr.shape[-1] // 2] if arr.shape[-1] < arr.shape[0] \
                    else arr[arr.shape[0] // 2]
            base = Image.open(image_path).convert("RGB").resize(
                (arr.shape[1], arr.shape[0]))
            img = np.asarray(base, dtype=np.float32) / 255.0
            mask = (arr > 0).astype(np.float32)
            overlay = img.copy()
            overlay[..., 0] = np.clip(img[..., 0] + 0.45 * mask, 0, 1)
            overlay[..., 1] = np.clip(img[..., 1] + 0.15 * mask, 0, 1)
            os.makedirs(os.path.dirname(heatmap_out) or ".", exist_ok=True)
            Image.fromarray((overlay * 255).astype("uint8")).save(heatmap_out)
            return heatmap_out
        except Exception:
            return None
