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
Fundus Photography examination with automated diagnostic analysis.

FINDINGS:
- Severe DR: probability 86% (critical)
- Moderate DR: probability 30% (low)

IMPRESSION:
Severe DR identified (critical). 2 finding(s) flagged — clinical correlation advised.
```

---

## XRAY — Chest
_PA chest — pre-op clearance_

**AI engine:** `MockEngine(cxr-densenet-sim)` · **Max severity:** normal

**Findings:**
_No significant findings._

**AI-draft report:**

```
Chest Radiograph examination. The study is within normal limits on automated analysis. No focal consolidation, effusion, or other acute finding.
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