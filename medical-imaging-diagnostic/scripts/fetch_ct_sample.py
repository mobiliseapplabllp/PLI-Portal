#!/usr/bin/env python3
"""Download a public chest CT volume (NIfTI) to test the REAL MONAI lung-nodule
detector.

The real 3D detector needs a volumetric CT, not a 2D image. This grabs a small
public-domain / open-license chest CT as .nii.gz.

Usage:  python scripts/fetch_ct_sample.py
Output: sample_data/ct_volumes/chest_ct.nii.gz  → upload it to a CT study.

If the download fails, use any of these open sources instead:
  * MONAI test data:  python -c "from monai.apps import download_url; \
      download_url('https://github.com/Project-MONAI/MONAI-extra-test-data/releases/download/0.8.1/CT_2D_head_fixed.nii.gz','chest.nii.gz')"
  * LIDC-IDRI / LUNA16 (chest CT with nodules) — https://luna16.grand-challenge.org/
  * TCIA public collections — https://www.cancerimagingarchive.net/
"""
from __future__ import annotations

import os
import urllib.request

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(REPO_ROOT, "sample_data", "ct_volumes")

# Open-license volumetric CT samples (best-effort; see docstring for fallbacks).
SOURCES = [
    ("chest_ct.nii.gz",
     "https://github.com/neheller/kits19/raw/master/data/case_00000/imaging.nii.gz"),
    ("spleen_ct.nii.gz",
     "https://github.com/Project-MONAI/MONAI-extra-test-data/releases/download/0.8.1/CT_2D_head_fixed.nii.gz"),
]


def fetch() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    for name, url in SOURCES:
        dest = os.path.join(OUT_DIR, name)
        try:
            print(f"Downloading {name} …")
            req = urllib.request.Request(url, headers={"User-Agent": "mid/0.2"})
            with urllib.request.urlopen(req, timeout=120) as r, open(dest, "wb") as f:
                f.write(r.read())
            mb = os.path.getsize(dest) / 1e6
            print(f"  ✓ {dest}  ({mb:.1f} MB)")
            print("Upload this file to a CT study, set AI_ENGINE_MODE=monai, Run AI analysis.")
            return
        except Exception as exc:  # noqa: BLE001
            print(f"  ✗ {name}: {exc}")
    print("\nAll downloads failed — see the fallback sources in this file's header.")


if __name__ == "__main__":
    fetch()
