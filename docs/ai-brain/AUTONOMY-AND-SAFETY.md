# Cortex — Autonomy & Safety Model

**Companion to `ARCHITECTURE.md`**
Status: Draft for review

---

## 1. The premise

The decision is **full autonomy, humans audit after**. This document is how that is made to work
rather than how it is avoided.

The core move: **remove the human gate, do not remove the gate.** Every approval a person would
have given is replaced by an automated check that is faster, never tired, and applied to 100 % of
changes rather than the ones someone had time to read. Autonomy without automated verification is
not autonomy — it is unsupervised failure with a good story attached.

Three properties make audit-after safe:

1. **Everything is reversible.** No artifact is promoted unless its rollback has been tested.
2. **Everything is verified before it lands**, by an independent agent on a different model.
3. **Everything is visible after it lands**, in a digest that is one click from revert.

---

## 2. The autonomy ladder

Autonomy is **per capability**, not global. A single global switch is the mistake — "publish a
dashboard" and "alter a client's database" are not the same risk and must not share a setting.

| Level | Meaning |
|---|---|
| **L0 Observe** | Agent may read and report only |
| **L1 Propose** | Agent emits artifacts to a queue; a human promotes |
| **L2 Auto-apply, reversible** | Machine gates pass → applied automatically; trivially revertible; appears in the digest |
| **L3 Auto-apply with canary** | Applied to a subset/shadow first; promoted on clean telemetry; auto-reverted on divergence |
| **L4 Auto-apply, structural** | Applied directly, including changes with wide blast radius |
| **L5 Self-modifying** | Agent may change agent code, prompts, and its own operating parameters |

### 2.1 Capability matrix

Starting level, ceiling, and what it takes to climb. **The ceiling column is the important one.**

| Capability | Start | Ceiling | Promotion criteria |
|---|---|---|---|
| Publish/refresh a dashboard | L1 | **L4** | 50 consecutive artifacts with Verifier agreement ≥ 0.95 and zero user-reported errors |
| Create/modify a metric definition | L1 | **L3** | 30 consecutive shadow runs within tolerance; reconciliation to control totals passes |
| Update the semantic model / ontology mapping | L1 | **L3** | Golden question set pass rate non-decreasing across 20 promotions |
| Add/modify an alert rule | L1 | **L3** | False-positive rate < 5 % over 30 days |
| Generate/version an API | L1 | **L3** | Contract tests pass; no breaking change to a live consumer |
| Repair a broken scrape recipe | L1 | **L3** | Golden-snapshot validation passes 20 consecutive times |
| Dependency patch (security, no API change) | L1 | **L4** | Full test suite + SCA clean, 30 clean upgrades |
| Dependency major upgrade | L1 | **L2** | Requires canary; never above L2 without coverage ≥ 80 % on affected paths |
| Platform code refactor | L1 | **L3** | Coverage ≥ 80 % on touched files; no behaviour diff in regression suite |
| Infrastructure change (IaC) | L1 | **L2** | Plan diff within budget; blast radius under threshold |
| Technology-stack replacement (ADR) | L0 | **L1** | **Never autonomous.** Agents research and recommend; a human decides. |
| Schema change in a *client's* source system | L0 | **L0** | **Never.** The platform is read-only against source systems in v1. |
| Modify Assurance squad code/prompts/thresholds | L0 | **L0** | **Never.** See §6. |
| Modify the safety policy, audit log, or kill switch | L0 | **L0** | **Never.** See §6. |

L5 does not appear as a ceiling anywhere in v1. Self-modification of agent logic is reachable for
Squad 1–4 agents once the fleet has an incident-free operating history and the regression suite is
mature — it is a Phase 7+ conversation, not a launch property.

### 2.2 Earned promotion, automatic demotion

Promotion is computed, not granted. A capability that meets its criteria is promoted automatically
by the Autonomy Governor and the change is recorded in the audit log.

**Demotion is immediate and aggressive.** Any of the following drops a capability one full level:
- a promoted artifact is reverted for correctness
- Verifier and producer disagree above threshold
- the golden question set regresses
- a user reports a wrong number attributable to that capability

Two demotions in 30 days pin the capability at L1 until a human re-enables progression. This gives
you real full autonomy as an *outcome*, reached in months, with the system's own track record as
the evidence — rather than as an assumption made on day one.

---

## 3. The five machine gates

Every artifact passes all five before promotion. Any failure blocks and files an episodic record
with the reason.

| Gate | Question | Mechanism | Blocks on |
|---|---|---|---|
| **G1 Contract** | Is this a well-formed artifact? | JSON Schema validation, reference integrity, signature check | Any validation error |
| **G2 Independent verification** | Does a second, different model reach the same conclusion? | Verifier re-derives from the same evidence, blind to the original reasoning | Agreement below capability threshold |
| **G3 Reconciliation** | Do the numbers tie out? | Generated metric is compared against a known-true control total from the source system | Variance beyond tolerance |
| **G4 Regression** | Did anything that worked stop working? | Golden question set + contract tests + full suite for code artifacts | Any decrease in pass rate |
| **G5 Blast radius** | Is the potential damage within budget? | Estimated affected users/dashboards/rows/cost vs the capability's budget | Estimate exceeds budget |

High-blast-radius artifacts additionally face **Red Team**: an adversarial agent instructed to
*refute* the artifact, defaulting to "refuted" under uncertainty. Majority refutation blocks.

### 3.1 Why G3 matters more than it looks

Reconciliation is the gate that catches the failure that actually kills the product: a query that
runs, returns a plausible number, and is wrong. G2 can be fooled — two models can share the same
misreading of an ambiguous schema. G3 cannot: either the generated headcount matches HR's official
headcount or it does not.

Every connected system needs a small set of **control totals** established at onboarding — figures
the client already trusts and publishes. Without them, autonomy at L2+ should not be enabled for
metric capabilities at all.

---

## 4. Reversibility

**No artifact may be promoted unless it carries a tested rollback.**

| Artifact | Rollback | Tested by |
|---|---|---|
| Semantic model / metric / mapping | Version pin to previous | Applying the pin in a scratch environment |
| Dashboard spec | Previous spec | Render diff |
| Alert rule | Disable + previous rule | Dry-run |
| Connector config / scrape recipe | Previous version | Health check against golden snapshot |
| API definition | Deprecate + serve previous version | Contract test |
| Code change | Revert commit | CI on the revert |
| Infra change | Previous Terraform state | `terraform plan` on the previous state |
| Data written to the warehouse | Reprocess from the immutable raw zone | Partition-level replay |

The immutable raw zone (`ARCHITECTURE.md` §3.3) is what makes the last row possible. Every inference
is re-derivable, so a bad model version costs a reprocess, not a re-ingest.

---

## 5. Canary and shadow

For L3 capabilities:

- **Shadow** — a new metric definition runs alongside the old for N days without being shown.
  Divergence beyond tolerance auto-blocks promotion and files a diff for the digest.
- **Canary** — a code or infra change is applied to one instance (or one namespace) first.
  Telemetry is watched against the SLO set; a breach triggers automatic revert within minutes.
- **Progressive rollout** — fleet-wide changes reach instances in waves (internal → small clients →
  large clients), never all at once.

---

## 6. The immutability boundary

Four things sit **outside** the self-modification boundary and can only be changed by a human with
two-person review:

1. **Assurance squad** — agent code, prompts, models, and thresholds
2. **The safety policy** — the capability matrix, gates, and budgets in this document, as code
3. **The audit log** — append-only, hash-chained, with writes only from the runtime
4. **The kill switch**

The reasoning is short: a system that can edit its own safety checks does not have safety checks.
Squad 4 exists to improve the platform; if it can also lower the bar it must clear, the bar is
decorative. This constraint is enforced by repository CODEOWNERS, by capability tokens that simply
do not grant write access to those paths, and by a CI check that fails any agent-authored commit
touching them.

---

## 7. Circuit breakers and kill switches

### 7.1 Automatic breakers
Any breaker trips → **the whole fleet drops to L1** (propose only) and a human is paged.

| Breaker | Trips at |
|---|---|
| Rollback rate | > 3 correctness reverts in 24 h |
| Verification disagreement rate | > 15 % over a rolling 100 artifacts |
| Golden set regression | Any drop below the agreed floor |
| Cost burn | > 80 % of daily budget before 60 % of the day |
| Error rate | Agent failure rate > 25 % over 30 min |
| Loop detection | Same artifact type re-proposed > 5 times without acceptance |
| Data quality | Freshness or completeness SLO breach on a source feeding a promoted metric |

### 7.2 Kill switches
Three levels — single agent, squad, entire fleet — and the fleet-level switch **must function with
the control plane down**. It is a flag in the data plane that every runtime checks before acting,
not an API call to a service that may be the thing that is broken.

---

## 8. Making "audit after" actually work

Audit-after fails when the audit is a log file nobody opens. Requirements:

- **Daily digest** — every autonomous change in the last 24 h, ranked by blast radius, in plain
  language, with the evidence chain and a one-click revert on each entry.
- **Weekly review ritual** — a named owner walks the digest. Not optional; this is the human half
  of the control loop and without it the model is "no oversight", not "audit after".
- **Anomaly-first ordering** — surface what is unusual for this fleet, not what is chronologically
  latest.
- **Full provenance on demand** — for any number on any dashboard: which metric, which model
  version, which agent, which evidence, which verification results, which source rows.
- **Change-to-consequence linking** — when a user reports a wrong number, the audit must answer
  "what changed" in seconds, not hours.

---

## 9. Known failure modes

| Failure mode | How it shows up | Detection | Mitigation |
|---|---|---|---|
| Confident wrong join | Plausible but incorrect number | G3 reconciliation | Corroboration rule; value-overlap test |
| Silent metric drift | Definition slowly changes meaning over versions | Shadow comparison; semantic diff in digest | L3 ceiling on metric changes |
| Two models, same mistake | G2 passes on a shared misreading | G3 catches it; G2 alone will not | Never rely on G2 alone for numeric artifacts |
| Dependency upgrade passes tests, breaks prod | Runtime error after deploy | Canary + SLO watch | L2 ceiling on major upgrades; coverage gate |
| Prompt injection via ingested content | Agent behaves against intent | Egress allowlist violation; Red Team; artifact scan | Capability separation; untrusted-content labelling |
| Cost runaway | Budget consumed early | Cost breaker | Drift-triggered work; tiered routing; caching |
| Agent loop | Same proposal endlessly | Loop breaker | Episodic memory of rejections **with reasons** |
| Ontology thrash | Model rewritten repeatedly, dashboards break | Regression suite; change frequency metric | Stable core + domain packs; human decision on core changes |
| Model deprecation | Behaviour shifts after a provider change | Golden question set on every model change | Model routing abstraction; pinned versions per capability |
| Autonomy creep | Capability climbs past where evidence supports it | Governor audit in the weekly review | Hard ceilings in the matrix; ceilings are policy-as-code |

---

## 10. What this buys you

Within roughly six months of the fleet going live, the expected steady state is:

- dashboards, metrics, alerts, API versions and scrape repairs applying themselves without a human
  in the loop, at L3–L4;
- security patches and dependency updates self-applying at L4 with CI and SCA as the gate;
- performance and cost optimisations self-applying at L3 with canary;
- technology-stack direction and anything touching a client's source system still landing on a
  human desk as a recommendation — because those are the decisions where being wrong is expensive
  and being slow is not.

That is full autonomy in every place it pays, with the two or three exceptions where it never does.
