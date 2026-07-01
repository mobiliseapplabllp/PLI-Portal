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
Chest Radiograph examination with automated diagnostic analysis.

FINDINGS:
- Nodule: probability 66% (high)
- Lung Opacity: probability 62% (high)
- Mass: probability 58% (moderate)

IMPRESSION:
Nodule identified (high). 3 finding(s) flagged — clinical correlation advised.
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
CT examination with automated diagnostic analysis.

FINDINGS:
- Nodule: probability 82% (high)
- Mass: probability 71% (high)
- Lesion: probability 60% (high)
- Ground-glass opacity: probability 55% (moderate)

IMPRESSION:
Nodule identified (high). 4 finding(s) flagged — clinical correlation advised.
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