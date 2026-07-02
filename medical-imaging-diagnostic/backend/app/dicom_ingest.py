"""DICOM ingestion: accept real .dcm files from imaging equipment.

Converts a DICOM file to an 8-bit windowed PNG preview (what the AI engines and
the viewer consume) and extracts key metadata. The original .dcm is kept next to
the preview so nothing is lost.

Windowing: uses the file's WindowCenter/WindowWidth when present, otherwise a
robust percentile stretch — good enough for prototype display of CT/MR/CR/DX.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field


@dataclass
class DicomResult:
    png_path: str
    width: int
    height: int
    metadata: dict = field(default_factory=dict)


def is_dicom(filename: str, first_bytes: bytes) -> bool:
    if filename.lower().endswith((".dcm", ".dicom")):
        return True
    # DICOM magic: "DICM" at offset 128
    return len(first_bytes) >= 132 and first_bytes[128:132] == b"DICM"


def _first(value):
    """WindowCenter/Width can be multi-valued."""
    try:
        return float(value[0])
    except (TypeError, IndexError):
        return float(value)


def convert_dicom(dcm_path: str, png_path: str) -> DicomResult:
    """Convert a DICOM file to a windowed 8-bit PNG. Raises on unreadable input."""
    import numpy as np
    import pydicom
    from PIL import Image
    from pydicom.pixel_data_handlers.util import apply_modality_lut

    ds = pydicom.dcmread(dcm_path)
    arr = apply_modality_lut(ds.pixel_array, ds).astype(np.float32)

    # Multi-frame: take the middle slice for the preview.
    if arr.ndim == 3:
        arr = arr[arr.shape[0] // 2]

    wc = getattr(ds, "WindowCenter", None)
    ww = getattr(ds, "WindowWidth", None)
    if wc is not None and ww is not None:
        center, width = _first(wc), max(_first(ww), 1.0)
        lo, hi = center - width / 2, center + width / 2
    else:
        lo, hi = np.percentile(arr, 1.0), np.percentile(arr, 99.0)
        if hi <= lo:
            lo, hi = float(arr.min()), float(arr.max() or 1.0)

    img = np.clip((arr - lo) / (hi - lo), 0, 1)
    if str(getattr(ds, "PhotometricInterpretation", "")) == "MONOCHROME1":
        img = 1.0 - img  # inverted grayscale convention

    out = (img * 255).astype("uint8")
    os.makedirs(os.path.dirname(png_path) or ".", exist_ok=True)
    Image.fromarray(out).save(png_path)

    meta = {}
    for tag, attr in [
        ("modality", "Modality"), ("body_part", "BodyPartExamined"),
        ("study_description", "StudyDescription"), ("study_date", "StudyDate"),
        ("manufacturer", "Manufacturer"), ("institution", "InstitutionName"),
    ]:
        val = getattr(ds, attr, None)
        if val:
            meta[tag] = str(val)

    h, w = out.shape[:2]
    return DicomResult(png_path=png_path, width=w, height=h, metadata=meta)
