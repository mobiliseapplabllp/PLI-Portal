"""Engine registry — resolves the right diagnostic engine for a modality.

Swaps between mock and real backends based on AI_ENGINE_MODE, so the rest of
the app is agnostic to which implementation is running.
"""
from __future__ import annotations

from ..config import get_settings
from .base import DiagnosticEngine
from .engines import (
    MockBrainTumorEngine,
    MockCXREngine,
    MockMammographyEngine,
    MockRetinalEngine,
    MockSegmentationEngine,
    MockSkinCancerEngine,
    TorchXRayVisionEngine,
)

# modality -> engine class (mock backends, always available)
_MOCK_BY_MODALITY: dict[str, type[DiagnosticEngine]] = {
    "xray": MockCXREngine,
    "fundus": MockRetinalEngine,
    "ct": MockSegmentationEngine,
    "mri": MockBrainTumorEngine,          # brain tumour (BraTS-style) oncology
    "dermoscopy": MockSkinCancerEngine,    # skin cancer / melanoma oncology
    "mammography": MockMammographyEngine,  # breast cancer → BI-RADS oncology
}

_cache: dict[str, DiagnosticEngine] = {}


def get_engine(modality: str) -> DiagnosticEngine | None:
    """Return an engine instance for the modality, or None if unsupported."""
    settings = get_settings()
    key = f"{settings.ai_engine_mode}:{modality}"
    if key in _cache:
        return _cache[key]

    engine: DiagnosticEngine | None = None
    if settings.ai_engine_mode in ("real", "monai") and modality == "xray":
        try:
            engine = TorchXRayVisionEngine()
        except Exception:
            engine = None  # torch not installed -> fall back to mock below
    if settings.ai_engine_mode in ("real", "monai") and modality == "dermoscopy" and engine is None:
        try:
            from .engines import TorchSkinCancerEngine
            engine = TorchSkinCancerEngine()
        except Exception:
            engine = None  # no ISIC weights -> fall back to mock below
    if settings.ai_engine_mode == "monai" and modality in ("ct", "mri") and engine is None:
        try:
            from .monai_engine import MonaiLabelEngine
            engine = MonaiLabelEngine()
        except Exception:
            engine = None  # MONAI Label unreachable -> fall back to mock below

    if engine is None:
        cls = _MOCK_BY_MODALITY.get(modality)
        engine = cls() if cls else None

    if engine is not None:
        _cache[key] = engine
    return engine


def supported_modalities() -> list[str]:
    return sorted(_MOCK_BY_MODALITY.keys())


def describe_active() -> str:
    """Human-readable summary of the active engine configuration (for startup log)."""
    settings = get_settings()
    mode = settings.ai_engine_mode
    if mode in ("real", "monai"):
        xray = get_engine("xray")
        parts = [f"chest X-ray → {xray.model_source if xray else 'mock (torch missing)'}"]
        if mode == "monai":
            ct = get_engine("ct")
            parts.append(f"CT/MRI → {ct.model_source if ct else 'mock (MONAI Label unreachable)'}")
        return f"AI_ENGINE_MODE={mode}: " + "; ".join(parts) + "; rest mock."
    return "AI_ENGINE_MODE=mock → all modalities use deterministic mock engines."
