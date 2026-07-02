# Diagnostic Report — Fatima Al-Sayed

- **Organization:** Sunrise Diagnostics
- **MRN:** SUN-1009
- **Sex / DOB:** F / 1951-08-19
- **Clinical notes:** Known ischaemic heart disease, increasing fatigue.

---

## XRAY — Chest
_PA chest — cardiac assessment_

**AI engine:** `MockEngine(cxr-densenet-sim)` · **Max severity:** high

**Findings:**
- **Cardiomegaly** — 72% (high)
- **Effusion** — 60% (high)
- **Edema** — 40% (moderate)

**AI-draft report:**

```
Chest Radiograph — Chest

CLINICAL INFORMATION: Known ischaemic heart disease, increasing fatigue.
TECHNIQUE: Digital radiography, PA projection. Automated analysis by a deep-learning classifier.
COMPARISON: No prior studies available for comparison.

FINDINGS:
  1. Cardiomegaly identified in the cardiac silhouette (72% confidence, high concern). [Cardiovascular]
  2. Effusion identified in the pleural space (60% confidence, high concern). [Pleura]
  3. Edema identified in the lung interstitium (40% confidence, moderate concern). [Cardiopulmonary]

IMPRESSION:
  1. Cardiomegaly (72%, high).
  2. Effusion (60%, high).
  3. Edema (40%, moderate).

RECOMMENDATIONS:
  - Clinical correlation and specialist review required.
```

---

## 🧠 Cross-study AI correlation
**Max severity:** high

Findings across 1 study(ies) — Cardiomegaly, Edema, Effusion. Pattern most consistent with congestive heart failure. 1 candidate condition(s) flagged for review.

**Differential:**
- Congestive heart failure — 66% (supporting: Cardiomegaly, Effusion)

**Recommendations:**
- Correlate with BNP / echocardiography; assess fluid status.

---
_⚠️ Research/education prototype. Findings are simulated (or from a non-clinical model) and are NOT validated for clinical use._