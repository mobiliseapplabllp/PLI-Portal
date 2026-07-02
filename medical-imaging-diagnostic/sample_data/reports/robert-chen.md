# Diagnostic Report — Robert Chen

- **Organization:** City General Hospital
- **MRN:** CIT-1000
- **Sex / DOB:** M / 1963-04-18
- **Clinical notes:** Exertional dyspnoea, orthopnoea, bilateral ankle oedema.

---

## XRAY — Chest
_PA chest — worsening breathlessness_

**AI engine:** `MockEngine(cxr-densenet-sim)` · **Max severity:** critical

**Findings:**
- **Cardiomegaly** — 90% (critical)
- **Effusion** — 78% (high)
- **Edema** — 63% (high)
- **Atelectasis** — 22% (low)

**AI-draft report:**

```
Chest Radiograph — Chest

CLINICAL INFORMATION: Exertional dyspnoea, orthopnoea, bilateral ankle oedema.
TECHNIQUE: Digital radiography, PA projection. Automated analysis by a deep-learning classifier.
COMPARISON: No prior studies available for comparison.

FINDINGS:
  1. Cardiomegaly identified in the cardiac silhouette (90% confidence, critical concern). [Cardiovascular]
  2. Effusion identified in the pleural space (78% confidence, high concern). [Pleura]
  3. Edema identified in the lung interstitium (63% confidence, high concern). [Cardiopulmonary]
  4. Atelectasis identified in the lung (22% confidence, low concern). [Respiratory]

IMPRESSION:
  1. Cardiomegaly (90%, critical).
  2. Effusion (78%, high).
  3. Edema (63%, high).
  4. Atelectasis (22%, low).

RECOMMENDATIONS:
  - Clinical correlation and specialist review required.
```

---

## 🧠 Cross-study AI correlation
**Max severity:** critical

Findings across 1 study(ies) — Atelectasis, Cardiomegaly, Edema, Effusion. Pattern most consistent with congestive heart failure. 1 candidate condition(s) flagged for review.

**Differential:**
- Congestive heart failure — 84% (supporting: Cardiomegaly, Effusion)

**Recommendations:**
- Correlate with BNP / echocardiography; assess fluid status.

---
_⚠️ Research/education prototype. Findings are simulated (or from a non-clinical model) and are NOT validated for clinical use._