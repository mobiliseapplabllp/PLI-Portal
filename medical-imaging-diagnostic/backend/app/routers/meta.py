"""Non-tenant metadata: health + available AI capabilities."""
from fastapi import APIRouter

from ..ai import supported_modalities
from ..config import get_settings

router = APIRouter(prefix="/api", tags=["meta"])
settings = get_settings()


@router.get("/health")
def health() -> dict:
    return {"status": "ok", "app": settings.app_name}


@router.get("/engines")
def engines() -> dict:
    """What the assistant can analyse, and which backend is active."""
    return {
        "engine_mode": settings.ai_engine_mode,
        "supported_modalities": supported_modalities(),
        "capabilities": [
            {"engine": "cxr", "modality": "xray",
             "description": "Chest X-ray multi-pathology detection (15 labels) + heatmap"},
            {"engine": "retinal", "modality": "fundus",
             "description": "Diabetic retinopathy grading, glaucoma & AMD screening"},
            {"engine": "segmentation", "modality": "ct/mri",
             "description": "Region/lesion segmentation (MedSAM-style)"},
            {"engine": "report", "modality": "all",
             "description": "Vision-language draft report generation"},
            {"engine": "correlation", "modality": "patient",
             "description": "Cross-study clinical correlation & differential"},
        ],
    }
