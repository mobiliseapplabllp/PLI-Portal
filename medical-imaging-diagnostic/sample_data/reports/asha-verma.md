# Diagnostic Report — Asha Verma

- **Organization:** City General Hospital
- **MRN:** CIT-1001
- **Sex / DOB:** F / 1977-09-02
- **Clinical notes:** Fever, productive cough, right-sided pleuritic pain.

---

## XRAY — Chest
_PA chest — suspected pneumonia_

**AI engine:** `MockEngine(cxr-densenet-sim)` · **Max severity:** high

**Findings:**
- **Consolidation** — 83% (high)
- **Pneumonia** — 75% (high)
- **Infiltration** — 67% (high)
- **Effusion** — 28% (low)

**AI-draft report:**

```
Chest Radiograph — Chest

CLINICAL INFORMATION: Fever, productive cough, right-sided pleuritic pain.
TECHNIQUE: Digital radiography, PA projection. Automated analysis by a deep-learning classifier.
COMPARISON: No prior studies available for comparison.

FINDINGS:
  1. Consolidation identified in the lung parenchyma (83% confidence, high concern). [Respiratory]
  2. Pneumonia identified in the lung parenchyma (75% confidence, high concern). [Respiratory]
  3. Infiltration identified in the lung parenchyma (67% confidence, high concern). [Respiratory]
  4. Effusion identified in the pleural space (28% confidence, low concern). [Pleura]

IMPRESSION:
  1. Consolidation (83%, high).
  2. Pneumonia (75%, high).
  3. Infiltration (67%, high).
  4. Effusion (28%, low).

RECOMMENDATIONS:
  - Clinical correlation and specialist review required.
```

---

## 🧠 Cross-study AI correlation
**Max severity:** high

Findings across 1 study(ies) — Consolidation, Effusion, Infiltration, Pneumonia. Pattern most consistent with pulmonary infection / pneumonia. 1 candidate condition(s) flagged for review.

**Differential:**
- Pulmonary infection / pneumonia — 83% (supporting: Consolidation)

**Recommendations:**
- Correlate with WBC/CRP and clinical signs; consider antibiotics.

---
_⚠️ Research/education prototype. Findings are simulated (or from a non-clinical model) and are NOT validated for clinical use._