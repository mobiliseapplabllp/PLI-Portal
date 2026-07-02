# Diagnostic Report — David Smith

- **Organization:** Sunrise Diagnostics
- **MRN:** SUN-1007
- **Sex / DOB:** M / 1990-11-05
- **Clinical notes:** Sudden right-sided chest pain and breathlessness after exertion.

---

## XRAY — Chest
_Erect chest — sudden dyspnoea_

**AI engine:** `MockEngine(cxr-densenet-sim)` · **Max severity:** high

**Findings:**
- **Pneumothorax** — 81% (high)
- **Atelectasis** — 20% (low)

**AI-draft report:**

```
Chest Radiograph — Chest

CLINICAL INFORMATION: Sudden right-sided chest pain and breathlessness after exertion.
TECHNIQUE: Digital radiography, PA projection. Automated analysis by a deep-learning classifier.
COMPARISON: No prior studies available for comparison.

FINDINGS:
  1. Pneumothorax identified in the pleural space (81% confidence, high concern). [Pleura]
  2. Atelectasis identified in the lung (20% confidence, low concern). [Respiratory]

IMPRESSION:
  1. Pneumothorax (81%, high).
  2. Atelectasis (20%, low).

RECOMMENDATIONS:
  - Clinical correlation and specialist review required.
```

---

## 🧠 Cross-study AI correlation
**Max severity:** high

Findings across 1 study(ies) — Atelectasis, Pneumothorax. Pattern most consistent with tension/simple pneumothorax. 1 candidate condition(s) flagged for review.

**Differential:**
- Tension/simple pneumothorax — 81% (supporting: Pneumothorax)

**Recommendations:**
- Urgent clinical review; consider chest decompression if symptomatic.

---
_⚠️ Research/education prototype. Findings are simulated (or from a non-clinical model) and are NOT validated for clinical use._