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
            {"engine": "cxr", "modality": "xray", "oncology": True,
             "description": "Chest X-ray multi-pathology detection incl. nodule/mass (15 labels) + heatmap"},
            {"engine": "segmentation", "modality": "ct", "oncology": True,
             "description": "CT lesion/nodule/mass detection (MedSAM / lung-nodule-detection)"},
            {"engine": "brain", "modality": "mri", "oncology": True,
             "description": "Brain tumour segmentation — glioma/metastasis (BraTS-style)"},
            {"engine": "skin", "modality": "dermoscopy", "oncology": True,
             "description": "Skin-cancer classification — melanoma, BCC, AK (ISIC/HAM10000)"},
            {"engine": "retinal", "modality": "fundus", "oncology": False,
             "description": "Diabetic retinopathy grading, glaucoma & AMD screening"},
            {"engine": "report", "modality": "all", "oncology": False,
             "description": "Structured report generation (RADS/ICDR, FHIR)"},
            {"engine": "correlation", "modality": "patient", "oncology": False,
             "description": "Cross-study clinical correlation & differential"},
        ],
    }
