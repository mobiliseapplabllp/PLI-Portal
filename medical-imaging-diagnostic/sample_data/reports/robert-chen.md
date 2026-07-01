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
Chest Radiograph examination with automated diagnostic analysis.

FINDINGS:
- Cardiomegaly: probability 90% (critical)
- Effusion: probability 78% (high)
- Edema: probability 63% (high)
- Atelectasis: probability 22% (low)

IMPRESSION:
Cardiomegaly identified (critical). 4 finding(s) flagged — clinical correlation advised.
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