#!/usr/bin/env python3
"""Download a few public-domain chest X-rays for testing the REAL model.

The synthetic sample images in `sample_data/images/` are fine for the mock
engines, but the real TorchXRayVision model needs genuine radiographs to produce
meaningful predictions. This grabs a handful of public-domain images.

Usage:
    python scripts/fetch_real_samples.py
Output: sample_data/real_images/*.png  (or .jpg)

Note: these are public-domain / open-license teaching images, NOT for clinical
use. If a URL is unavailable, point the app at any chest X-ray you have, or use
a public dataset such as NIH ChestX-ray14 or the RSNA Pneumonia challenge.
"""
from __future__ import annotations

import os
import urllib.request

# Public-domain teaching radiographs (Wikimedia Commons).
SOURCES = {
    "normal_chest_pa.jpg":
        "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c8/Chest_Xray_PA_3-8-2010.png/640px-Chest_Xray_PA_3-8-2010.png",
    "pneumonia.jpg":
        "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1e/Streptococcus_pneumoniae%2C_lobar_pneumonia.jpg/640px-Streptococcus_pneumoniae%2C_lobar_pneumonia.jpg",
    "pneumothorax.jpg":
        "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5d/Right-sided_pneumothorax_%28on_the_left_of_the_image%29.jpg/640px-Right-sided_pneumothorax_%28on_the_left_of_the_image%29.jpg",
}

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(REPO_ROOT, "sample_data", "real_images")


def fetch() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    ok = 0
    for name, url in SOURCES.items():
        dest = os.path.join(OUT_DIR, name)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "mid-prototype/0.1"})
            with urllib.request.urlopen(req, timeout=30) as resp, open(dest, "wb") as fh:
                fh.write(resp.read())
            print(f"  ✓ {name}")
            ok += 1
        except Exception as exc:  # noqa: BLE001
            print(f"  ✗ {name}  ({exc}) — skip; use your own image instead")
    print(f"\n{ok}/{len(SOURCES)} downloaded to {OUT_DIR}")
    if ok:
        print("Set AI_ENGINE_MODE=real, then upload one of these via the UI or API.")


if __name__ == "__main__":
    fetch()
