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
Chest Radiograph examination with automated diagnostic analysis.

FINDINGS:
- Consolidation: probability 83% (high)
- Pneumonia: probability 75% (high)
- Infiltration: probability 67% (high)
- Effusion: probability 28% (low)

IMPRESSION:
Consolidation identified (high). 4 finding(s) flagged — clinical correlation advised.
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