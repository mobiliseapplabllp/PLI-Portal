"""Generate ready-to-upload sample images into `sample_data/images/`.

Each image gets a `<name>.plan.json` sidecar so that even when uploaded manually
through the web UI (mock engine mode) it produces the intended, clinically
coherent findings. Delete the sidecar to see raw mock behaviour, or enable the
real model to analyse the actual pixels.

Run:  cd backend && python -m app.generate_samples
"""
from __future__ import annotations

import json
import os

from .sample_scenarios import SCENARIOS, make_synthetic_image, slugify

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
OUT_DIR = os.path.join(REPO_ROOT, "sample_data", "images")


def generate() -> list[str]:
    os.makedirs(OUT_DIR, exist_ok=True)
    written = []
    seed = 100
    for sc in SCENARIOS:
        pslug = slugify(sc["patient"]["name"])
        for st in sc["studies"]:
            seed += 1
            name = f"{pslug}_{st['modality'].value}_{st['kind']}"
            img_path = os.path.join(OUT_DIR, name + ".png")
            make_synthetic_image(img_path, seed, st["kind"])
            # Always write the sidecar (even empty) so intended-normal studies
            # stay normal when uploaded through the UI.
            with open(img_path + ".plan.json", "w") as fh:
                json.dump(st.get("plan", {}), fh, indent=2)
            written.append(img_path)
    return written


if __name__ == "__main__":
    files = generate()
    print(f"Wrote {len(files)} sample images to {OUT_DIR}")
    for f in files:
        print("  -", os.path.basename(f))
