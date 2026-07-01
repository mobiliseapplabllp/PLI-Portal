"""Sample clinical scenarios used by both the sample-image generator and the
database seeder, so the two always agree.

Each study carries a `plan` (label -> probability) that the mock engines honour
via a `<image>.plan.json` sidecar, producing clinically coherent demo data. When
the real TorchXRayVision engine is enabled it ignores the plan and reads pixels.
"""
from __future__ import annotations

import os

from .models import Modality, Role

ORGS = [
    ("City General Hospital", "city-general"),
    ("Sunrise Diagnostics", "sunrise-dx"),
]

DOCTORS = [
    ("Radiology", Role.radiologist),
    ("Cardiology", Role.doctor),
    ("Ophthalmology", Role.doctor),
]

# kind controls the synthetic image appearance: xray | ct | fundus
SCENARIOS = [
    {
        "org": "city-general",
        "patient": {"name": "Robert Chen", "sex": "M", "dob": "1963-04-18",
                    "notes": "Exertional dyspnoea, orthopnoea, bilateral ankle oedema."},
        "studies": [
            {"modality": Modality.xray, "body_part": "Chest", "kind": "xray",
             "description": "PA chest — worsening breathlessness",
             "plan": {"Cardiomegaly": 0.90, "Effusion": 0.78, "Edema": 0.63,
                      "Atelectasis": 0.22}},
        ],
        "expected": "Congestive heart failure",
    },
    {
        "org": "city-general",
        "patient": {"name": "Asha Verma", "sex": "F", "dob": "1977-09-02",
                    "notes": "Fever, productive cough, right-sided pleuritic pain."},
        "studies": [
            {"modality": Modality.xray, "body_part": "Chest", "kind": "xray",
             "description": "PA chest — suspected pneumonia",
             "plan": {"Consolidation": 0.83, "Infiltration": 0.67, "Pneumonia": 0.75,
                      "Effusion": 0.28}},
        ],
        "expected": "Pulmonary infection / pneumonia",
    },
    {
        "org": "city-general",
        "patient": {"name": "Maria Gomez", "sex": "F", "dob": "1986-12-11",
                    "notes": "Type 2 diabetes 12y, annual retinal screening, blurred vision."},
        "studies": [
            {"modality": Modality.fundus, "body_part": "Retina (OD)", "kind": "fundus",
             "description": "Fundus photograph — diabetic screening",
             "plan": {"Severe DR": 0.86, "Moderate DR": 0.30, "No DR": 0.05,
                      "Glaucoma": 0.12}},
            {"modality": Modality.xray, "body_part": "Chest", "kind": "xray",
             "description": "PA chest — pre-op clearance",
             "plan": {}},
        ],
        "expected": "Diabetic retinopathy progression",
    },
    {
        "org": "city-general",
        "patient": {"name": "James Okoro", "sex": "M", "dob": "1958-06-27",
                    "notes": "40 pack-year smoker, incidental opacity on prior imaging."},
        "studies": [
            {"modality": Modality.xray, "body_part": "Chest", "kind": "xray",
             "description": "PA chest — nodule follow-up",
             "plan": {"Nodule": 0.66, "Mass": 0.58, "Lung Opacity": 0.62}},
            {"modality": Modality.ct, "body_part": "Chest", "kind": "ct",
             "description": "CT chest with contrast — characterise nodule",
             "plan": {"Nodule": 0.82, "Mass": 0.71, "Ground-glass opacity": 0.55,
                      "Lesion": 0.6}},
        ],
        "expected": "Suspicious pulmonary neoplasm",
    },
    {
        "org": "city-general",
        "patient": {"name": "Emily Nguyen", "sex": "F", "dob": "1995-02-14",
                    "notes": "Routine pre-employment health check, asymptomatic."},
        "studies": [
            {"modality": Modality.xray, "body_part": "Chest", "kind": "xray",
             "description": "PA chest — routine screening",
             "plan": {}},
        ],
        "expected": "No significant findings",
    },
    {
        "org": "sunrise-dx",
        "patient": {"name": "David Smith", "sex": "M", "dob": "1990-11-05",
                    "notes": "Sudden right-sided chest pain and breathlessness after exertion."},
        "studies": [
            {"modality": Modality.xray, "body_part": "Chest", "kind": "xray",
             "description": "Erect chest — sudden dyspnoea",
             "plan": {"Pneumothorax": 0.81, "Atelectasis": 0.2}},
        ],
        "expected": "Tension/simple pneumothorax",
    },
    {
        "org": "sunrise-dx",
        "patient": {"name": "Fatima Al-Sayed", "sex": "F", "dob": "1951-08-19",
                    "notes": "Known ischaemic heart disease, increasing fatigue."},
        "studies": [
            {"modality": Modality.xray, "body_part": "Chest", "kind": "xray",
             "description": "PA chest — cardiac assessment",
             "plan": {"Cardiomegaly": 0.72, "Effusion": 0.6, "Edema": 0.4}},
        ],
        "expected": "Congestive heart failure",
    },
]


def slugify(name: str) -> str:
    return name.lower().replace(" ", "-").replace("'", "")


def make_synthetic_image(path: str, seed: int, kind: str = "xray") -> None:
    """Create a plausible-looking grayscale/colour scan so engines have pixels.
    Deterministic given (seed, kind)."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    try:
        import numpy as np
        from PIL import Image
    except Exception:
        with open(path, "wb") as fh:
            fh.write(f"synthetic-{kind}-{seed}".encode())
        return

    rng = np.random.default_rng(seed)
    size = 512
    yy, xx = np.mgrid[0:size, 0:size].astype(float)

    if kind == "fundus":
        cx = cy = size / 2
        disk = np.exp(-(((xx - cx) ** 2 + (yy - cy) ** 2) / (2 * (size * 0.33) ** 2)))
        r = np.clip(0.15 + 0.75 * disk, 0, 1)
        g = np.clip(0.05 + 0.35 * disk, 0, 1)
        b = np.clip(0.02 + 0.12 * disk, 0, 1)
        # optic disc (bright spot) + vessels
        ox, oy = size * 0.62, size * 0.5
        disc = np.exp(-(((xx - ox) ** 2 + (yy - oy) ** 2) / (2 * (size * 0.05) ** 2)))
        r = np.clip(r + 0.5 * disc, 0, 1); g = np.clip(g + 0.5 * disc, 0, 1)
        for _ in range(12):
            a = rng.uniform(0, np.pi)
            vessel = np.exp(-((np.abs((xx - ox) * np.sin(a) - (yy - oy) * np.cos(a))) / 2.5))
            mask = disk > 0.2
            r = np.where(mask, np.clip(r - 0.15 * vessel, 0, 1), r)
        img = (np.stack([r, g, b], axis=-1) * 255).astype("uint8")
        Image.fromarray(img, "RGB").save(path)
        return

    # xray / ct: grayscale thorax-like field
    base = 0.30 + 0.10 * np.sin(xx / 55.0) * np.cos(yy / 75.0)
    # lung fields (darker ovals)
    for sx in (0.33, 0.67):
        lx, ly = size * sx, size * 0.5
        lung = np.exp(-(((xx - lx) ** 2 / (size * 0.14) ** 2 +
                         (yy - ly) ** 2 / (size * 0.22) ** 2)))
        base -= 0.18 * lung
    # spine / mediastinum (brighter centre column)
    spine = np.exp(-((xx - size / 2) ** 2 / (size * 0.04) ** 2))
    base += 0.25 * spine
    if kind == "ct":
        base = 0.15 + 0.5 * (base - base.min()) / (np.ptp(base) + 1e-8)
        ring = np.exp(-((np.sqrt((xx - size/2)**2 + (yy - size/2)**2) - size*0.42)**2) / 200)
        base += 0.3 * ring  # body outline
    # incidental blobs
    for _ in range(rng.integers(1, 4)):
        cx, cy = rng.uniform(0.25, 0.75, 2) * size
        rad = rng.uniform(20, 60)
        blob = np.exp(-(((xx - cx) ** 2 + (yy - cy) ** 2) / (2 * rad ** 2)))
        base += rng.uniform(0.08, 0.22) * blob
    base += rng.normal(0, 0.025, base.shape)
    img = np.clip(base, 0, 1)
    Image.fromarray((img * 255).astype("uint8")).save(path)
