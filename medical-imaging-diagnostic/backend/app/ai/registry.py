"""Engine registry — resolves the right diagnostic engine for a modality.

Swaps between mock and real backends based on AI_ENGINE_MODE, so the rest of
the app is agnostic to which implementation is running.
"""
from __future__ import annotations

from ..config import get_settings
from .base import DiagnosticEngine
from .engines import (
    MockCXREngine,
    MockRetinalEngine,
    MockSegmentationEngine,
    TorchXRayVisionEngine,
)

# modality -> engine class (mock backends, always available)
_MOCK_BY_MODALITY: dict[str, type[DiagnosticEngine]] = {
    "xray": MockCXREngine,
    "fundus": MockRetinalEngine,
    "ct": MockSegmentationEngine,
    "mri": MockSegmentationEngine,
}

_cache: dict[str, DiagnosticEngine] = {}


def get_engine(modality: str) -> DiagnosticEngine | None:
    """Return an engine instance for the modality, or None if unsupported."""
    settings = get_settings()
    key = f"{settings.ai_engine_mode}:{modality}"
    if key in _cache:
        return _cache[key]

    engine: DiagnosticEngine | None = None
    if settings.ai_engine_mode == "real" and modality == "xray":
        try:
            engine = TorchXRayVisionEngine()
        except Exception:
            engine = None  # torch not installed -> fall back to mock below

    if engine is None:
        cls = _MOCK_BY_MODALITY.get(modality)
        engine = cls() if cls else None

    if engine is not None:
        _cache[key] = engine
    return engine


def supported_modalities() -> list[str]:
    return sorted(_MOCK_BY_MODALITY.keys())
