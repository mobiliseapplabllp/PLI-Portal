# Diagnostic Report — Fatima Al-Sayed

- **Organization:** Sunrise Diagnostics
- **MRN:** SUN-1006
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
Chest Radiograph examination with automated diagnostic analysis.

FINDINGS:
- Cardiomegaly: probability 72% (high)
- Effusion: probability 60% (high)
- Edema: probability 40% (moderate)

IMPRESSION:
Cardiomegaly identified (high). 3 finding(s) flagged — clinical correlation advised.
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