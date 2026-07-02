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


def is_nifti(filename: str) -> bool:
    return filename.lower().endswith((".nii", ".nii.gz"))


def convert_nifti(nii_path: str, png_path: str) -> DicomResult:
    """Read a NIfTI volume, write a mid-slice PNG preview + basic metadata.

    The original .nii/.nii.gz stays as the source that 3D models (e.g. MONAI
    lung_nodule_ct_detection) consume; the PNG is only for the viewer."""
    import nibabel as nib
    import numpy as np
    from PIL import Image

    vol = nib.load(nii_path)
    arr = np.asanyarray(vol.dataobj)
    if arr.ndim == 4:
        arr = arr[..., 0]
    # middle axial slice for the preview
    sl = arr[:, :, arr.shape[2] // 2] if arr.ndim == 3 else arr
    lo, hi = np.percentile(sl, 1.0), np.percentile(sl, 99.0)
    if hi <= lo:
        lo, hi = float(sl.min()), float(sl.max() or 1.0)
    img = np.clip((sl - lo) / (hi - lo), 0, 1)
    out = np.rot90((img * 255).astype("uint8"))
    os.makedirs(os.path.dirname(png_path) or ".", exist_ok=True)
    Image.fromarray(out).save(png_path)
    shape = "x".join(str(d) for d in arr.shape)
    return DicomResult(png_path=png_path, width=out.shape[1], height=out.shape[0],
                       metadata={"format": "NIfTI", "volume_shape": shape})


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
