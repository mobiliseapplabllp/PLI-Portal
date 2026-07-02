# Diagnostic Report — Maria Gomez

- **Organization:** City General Hospital
- **MRN:** CIT-1002
- **Sex / DOB:** F / 1986-12-11
- **Clinical notes:** Type 2 diabetes 12y, annual retinal screening, blurred vision.

---

## FUNDUS — Retina (OD)
_Fundus photograph — diabetic screening_

**AI engine:** `MockEngine(retfound-sim)` · **Max severity:** critical

**Findings:**
- **Severe DR** — 86% (critical)
- **Moderate DR** — 30% (low)

**AI-draft report:**

```
Fundus Photography — Retina (OD)

CLINICAL INFORMATION: Type 2 diabetes 12y, annual retinal screening, blurred vision.
TECHNIQUE: Colour fundus photography. Automated retinal analysis.
COMPARISON: No prior studies available for comparison.

FINDINGS:
  1. Severe DR identified in the retina (86% confidence, critical concern). [Ophthalmic]
  2. Moderate DR identified in the retina (30% confidence, low concern). [Ophthalmic]

ASSESSMENT: ICDR Grade 3 (Intl. Clinical DR Severity) — Severe non-proliferative DR — refer within weeks.

IMPRESSION:
  1. Severe DR (86%, critical).
  2. Moderate DR (30%, low).
  3. Assessment: ICDR Grade 3 — Severe non-proliferative DR — refer within weeks.

RECOMMENDATIONS:
  - Severe non-proliferative DR — refer within weeks.
  - Clinical correlation and specialist review required.
```

---

## XRAY — Chest
_PA chest — pre-op clearance_

**AI engine:** `MockEngine(cxr-densenet-sim)` · **Max severity:** normal

**Findings:**
_No significant findings._

**AI-draft report:**

```
Chest Radiograph — Chest

CLINICAL INFORMATION: Type 2 diabetes 12y, annual retinal screening, blurred vision.
TECHNIQUE: Digital radiography, PA projection. Automated analysis by a deep-learning classifier.
COMPARISON: No prior studies available for comparison.

FINDINGS:
  No significant findings on automated analysis.

IMPRESSION:
  1. No acute abnormality detected on automated analysis.

RECOMMENDATIONS:
  - Routine clinical follow-up as indicated.
```

---

## 🧠 Cross-study AI correlation
**Max severity:** critical

Findings across 2 study(ies) — Moderate DR, Severe DR. Pattern most consistent with diabetic retinopathy progression. 1 candidate condition(s) flagged for review.

**Differential:**
- Diabetic retinopathy progression — 30% (supporting: Moderate DR)

**Recommendations:**
- Ophthalmology referral; optimise glycaemic control; consider anti-VEGF.

---
_⚠️ Research/education prototype. Findings are simulated (or from a non-clinical model) and are NOT validated for clinical use._