# Diagnostic Report — James Okoro

- **Organization:** City General Hospital
- **MRN:** CIT-1003
- **Sex / DOB:** M / 1958-06-27
- **Clinical notes:** 40 pack-year smoker, incidental opacity on prior imaging.

---

## XRAY — Chest
_PA chest — nodule follow-up_

**AI engine:** `MockEngine(cxr-densenet-sim)` · **Max severity:** high

**Findings:**
- **Nodule** — 66% (high)
- **Lung Opacity** — 62% (high)
- **Mass** — 58% (moderate)

**AI-draft report:**

```
Chest Radiograph — Chest

CLINICAL INFORMATION: 40 pack-year smoker, incidental opacity on prior imaging.
TECHNIQUE: Digital radiography, PA projection. Automated analysis by a deep-learning classifier.
COMPARISON: No prior studies available for comparison.

FINDINGS:
  1. Nodule identified in the lung (66% confidence, high concern). [Respiratory]
  2. Lung Opacity identified in the lung (62% confidence, high concern). [Respiratory]
  3. Mass identified in the lung (58% confidence, moderate concern). [Respiratory]

ASSESSMENT: Lung-RADS 4B (Lung-RADS v2022 (heuristic)) — Very suspicious — malignancy probability ≥15%. Tissue sampling / PET-CT.

IMPRESSION:
  1. Nodule (66%, high).
  2. Lung Opacity (62%, high).
  3. Mass (58%, moderate).
  4. Assessment: Lung-RADS 4B — Very suspicious — malignancy probability ≥15%. Tissue sampling / PET-CT.

RECOMMENDATIONS:
  - Very suspicious — malignancy probability ≥15%. Tissue sampling / PET-CT.
  - Oncologic workup advised: correlate with prior imaging, consider contrast CT/PET-CT and multidisciplinary review.
  - Clinical correlation and specialist review required.
```

---

## CT — Chest
_CT chest with contrast — characterise nodule_

**AI engine:** `MockEngine(medsam-sim)` · **Max severity:** high

**Findings:**
- **Nodule** — 82% (high)
- **Mass** — 71% (high)
- **Lesion** — 60% (high)
- **Ground-glass opacity** — 55% (moderate)

**AI-draft report:**

```
Computed Tomography — Chest

CLINICAL INFORMATION: 40 pack-year smoker, incidental opacity on prior imaging.
TECHNIQUE: Multidetector CT, axial acquisition. Automated segmentation/detection analysis.
COMPARISON: No prior studies available for comparison.

FINDINGS:
  1. Nodule identified in the lung (82% confidence, high concern). [Respiratory]
  2. Mass identified in the lung (71% confidence, high concern). [Respiratory]
  3. Lesion identified in the soft tissue (60% confidence, high concern). [General]
  4. Ground-glass opacity identified in the lung parenchyma (55% confidence, moderate concern). [Respiratory]

ASSESSMENT: Lung-RADS 4B (Lung-RADS v2022 (heuristic)) — Very suspicious — malignancy probability ≥15%. Tissue sampling / PET-CT.

IMPRESSION:
  1. Nodule (82%, high).
  2. Mass (71%, high).
  3. Lesion (60%, high).
  4. Ground-glass opacity (55%, moderate).
  5. Assessment: Lung-RADS 4B — Very suspicious — malignancy probability ≥15%. Tissue sampling / PET-CT.

RECOMMENDATIONS:
  - Very suspicious — malignancy probability ≥15%. Tissue sampling / PET-CT.
  - Oncologic workup advised: correlate with prior imaging, consider contrast CT/PET-CT and multidisciplinary review.
  - Clinical correlation and specialist review required.
```

---

## 🧠 Cross-study AI correlation
**Max severity:** high

Findings across 2 study(ies) — Ground-glass opacity, Lesion, Lung Opacity, Mass, Nodule. Pattern most consistent with suspicious pulmonary neoplasm. 1 candidate condition(s) flagged for review.

**Differential:**
- Suspicious pulmonary neoplasm — 71% (supporting: Mass)

**Recommendations:**
- Recommend contrast CT chest and pulmonology referral.

---
_⚠️ Research/education prototype. Findings are simulated (or from a non-clinical model) and are NOT validated for clinical use._