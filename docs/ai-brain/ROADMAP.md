# Cortex — Delivery Roadmap

**Companion to `ARCHITECTURE.md`**
Status: Draft for review

---

## 1. Sequencing principle

Build the boring, deterministic core first. The agent fleet is Phase 4, not Phase 1 — because a
fleet of agents operating on a knowledge model that does not exist yet produces confident output
nobody can check.

Three rules govern the order:

1. **Evals before intelligence.** The golden question set is built in Phase 0. Without it you
   cannot tell whether the system is improving, and every later decision becomes a matter of
   opinion.
2. **Deterministic before LLM.** Everything that can be measured is measured before anything is
   inferred. This is what keeps accuracy defensible.
3. **Prove generality at system #2, before selling generality.** Phase 5 is the commercial go/no-go.

**PLI Portal is system #1.** It is ours, it has a real MySQL schema, real workflow logic, real users
and real numbers we can reconcile against. It is the correct guinea pig and it costs nothing to
experiment on.

---

## 2. Phases

### Phase 0 — Foundations & evaluation harness · 2 weeks
Establish how we will know whether any of this works.

- Golden question set: **50 business questions about PLI Portal with hand-verified answers**
  (e.g. "average final KPI score by department for Q1 FY25", "employees with unlocked records
  after the cycle closed").
- Control totals for reconciliation (G3): figures the business already trusts.
- Hand-labelled ground truth for the schema: the real entity list and the real relationship graph,
  written down by a human who knows the system.
- Artifact schemas (JSON Schema) for the ten artifact types.
- Repo, CI, environments, secrets management, observability skeleton.

**Exit:** the eval harness runs and reports a score. The score is currently zero. That is fine.
**Explicitly not in this phase:** any agent, any LLM call.

---

### Phase 1 — Discovery engine, deterministic layers · 4 weeks
L0–L3 against PLI Portal's MySQL. No LLM anywhere in this phase.

- Catalog introspection (L0)
- Statistical profiler (L1)
- Relationship miner with value-overlap containment testing (L2)
- Workflow miner: state machines from status-transition history (L3)
- `SystemMap` artifact emitted and stored in bitemporal structural memory

**Exit:** generated system map achieves **≥ 95 % precision and ≥ 85 % recall** against the
hand-labelled relationship graph from Phase 0, and the mined KPI state machine matches the
documented workflow in `STEP1_ARCHITECTURE.md` — including any undocumented transitions, which are
a finding, not a bug.

---

### Phase 2 — Knowledge Core & semantic layer · 4 weeks
First LLM use, tightly bounded.

- Structural, semantic, episodic, procedural and document memory implemented
- Canonical ontology v1 + HR/performance domain pack
- Ontologist agent (L5 semantic labelling) under the corroboration rule
- PII classifier
- Cube semantic model generated from the system map
- NL → semantic query → SQL path

**Exit:** **≥ 85 % pass rate on the golden question set.** Every relationship used in a passing
answer is corroborated by a deterministic test, not asserted by a model.

---

### Phase 3 — Consumption: dashboards & APIs · 4 weeks
- `DashboardSpec` schema + fixed React renderer + drill-down
- Dashboard Designer agent
- Narrative writer for anomaly explanation
- Alert rules and delivery (email/Slack/Teams)
- Generated REST/GraphQL APIs over the semantic model
- Embed path into PLI Portal
- Usage telemetry capture — **this is the feedback signal the whole evolution loop later depends on**

**Exit:** 10 auto-generated dashboards in front of real PLI Portal users, with **≥ 7 accepted
without correction**, and every number reconciled against a control total.

---

### Phase 4 — Agent fleet & autonomy substrate · 5 weeks
- Temporal deployment; agents as durable workflows
- Squads 1–3 in production; Squad 4 (platform self-maintenance) in shadow
- **Squad 5 (Assurance) first-class**: Verifier, Red Team, Security Analyst, Data Quality Sentinel,
  Regression Guard, Auditor
- Five machine gates (G1–G5)
- Autonomy Governor, capability matrix as policy-as-code, all capabilities at L1
- Circuit breakers, kill switches, hash-chained audit log
- Daily digest UI with one-click revert

**Exit:** the fleet runs **unattended for 72 hours**, produces verified artifacts, trips at least
one breaker deliberately in a drill, and every change is revertible from the digest in one click.
All capabilities still at L1 — nothing auto-applies yet, by design.

---

### Phase 5 — System #2: the generality test · 5 weeks
The commercial go/no-go. A genuinely different system — different DB engine, different domain,
ideally a real client ERP rather than another MALL product.

- Second connector mode in production (API and/or file drop)
- Domain pack #2
- Ontology refactor — **budget for this, it will happen**
- Onboarding runbook

**Exit:** system #2 goes from credentials to first verified dashboard in **< 3 days with zero
platform code changes**. If it takes three weeks and a code change, the generic premise is not yet
true and Phase 6 waits while that is fixed. This is the honest checkpoint.

---

### Phase 6 — Hybrid split & security hardening · 5 weeks
Make it deployable into a client's network.

- Data plane packaged for client VPC (Kubernetes + Compose variants)
- Artifact Gateway with schema allowlist; default-deny egress
- Redaction proxy; in-VPC model option for `restricted` classifications
- Fleet plane: signed release channel, instance health, remote upgrade
- Prompt-injection hardening; capability tokens; Vault
- **External penetration test**

**Exit:** a full instance deployed in an isolated VPC, raw data provably never crossing the
boundary, pen-test findings at high severity closed.

---

### Phase 7 — Autonomy promotion & scale · ongoing
- Capabilities begin climbing the ladder on earned criteria
- Squad 4 leaves shadow: dependency stewardship, performance, cost optimisation self-applying
- Scrape recipes self-healing (mode D)
- Cross-client procedural learning through the fleet plane
- Systems #3–#10; the onboarding-days metric is the headline KPI

**Exit:** continuous. The target steady state is described in `AUTONOMY-AND-SAFETY.md` §10.

---

## 3. Timeline summary

| Phase | Weeks | Cumulative |
|---|---|---|
| 0 · Foundations & evals | 2 | 2 |
| 1 · Discovery (deterministic) | 4 | 6 |
| 2 · Knowledge Core & semantics | 4 | 10 |
| 3 · Dashboards & APIs | 4 | 14 |
| 4 · Agent fleet & autonomy | 5 | 19 |
| 5 · System #2 generality test | 5 | 24 |
| 6 · Hybrid split & security | 5 | 29 |
| 7 · Autonomy promotion | ongoing | — |

**~7 months to a client-deployable, security-hardened v1 with a proven second system.**

These figures assume the team in §4. They are engineering estimates, not commitments, and Phase 5
is the one most likely to overrun — it is where the ontology gets rewritten.

---

## 4. Team

| Role | Count | From phase | Focus |
|---|---|---|---|
| Data/backend engineer (Python) | 2 | 0 | Discovery engine, connectors, Knowledge Core |
| AI/agent engineer | 1–2 | 2 | Agent fleet, prompts, evals, assurance |
| Full-stack engineer (React/TS) | 1 | 3 | Renderer, digest UI, embeds |
| Platform/DevOps | 1 | 4 | Temporal, per-client deploy, fleet plane |
| Security engineer | 0.5 | 4 | Threat model, hardening, pen-test liaison |
| Domain/product owner | 0.5 | 0 | Ontology decisions, golden set, client liaison |

**Minimum viable team: 3 engineers**, at roughly 1.6× the timeline. Below three, the assurance work
gets skipped under pressure — and with full autonomy chosen, skipping assurance is the one shortcut
that cannot be taken.

The Python requirement is real: the discovery, profiling and agent layers belong in Python.
The consumption API and frontend stay in Node/TypeScript to match existing MALL products. Splitting
by service is correct here, not a compromise.

---

## 5. Build vs buy

| Component | Decision | Rationale |
|---|---|---|
| Connector library | **Buy** — Airbyte | 600+ connectors; building these is a multi-year detour |
| CDC | **Buy** — Debezium | Solved problem, hard to get right |
| Semantic layer | **Buy** — Cube | Do not invent a metric DSL |
| Orchestration | **Buy** — Temporal | Durable execution is very hard to build |
| Warehouse | **Buy** — ClickHouse / DuckDB | — |
| Security scanning | **Buy** — Semgrep, Trivy, Gitleaks, ZAP | Feed the agent; do not have an LLM freelance as a scanner |
| **Discovery & understanding engine** | **Build** | This is the differentiator; nothing off the shelf does L2/L3 inference |
| **Knowledge Core & ontology** | **Build** | The compounding asset |
| **Agent fleet & autonomy substrate** | **Build** | The product |
| **Dashboard spec & renderer** | **Build** | Must be spec-driven and embeddable; BI tools cannot be driven this way |

Rough split: ~70 % of engineering effort on the four "build" rows. That is the correct ratio — if it
drifts toward integration work, the differentiator is being starved.

---

## 6. What could stop this

| Checkpoint | Question | If the answer is no |
|---|---|---|
| End of Phase 1 | Can deterministic inference recover a schema we already know, accurately? | The generic premise is weaker than assumed; narrow to DB-only sources |
| End of Phase 2 | Does the semantic layer answer real business questions at ≥ 85 %? | Fix the ontology before building anything on top of it |
| End of Phase 3 | Do real users accept auto-generated dashboards? | The output is not valuable yet; no amount of autonomy fixes that |
| **End of Phase 5** | **Does system #2 onboard in days without code changes?** | **The commercial premise fails. Stop and re-scope to a per-client accelerator rather than a product.** |
| End of Phase 6 | Does it survive a pen test in a client VPC? | Not sellable to enterprise; fix before any client deployment |

Phase 5 is the one that matters. Everything before it is achievable engineering; Phase 5 is where
"generic across any ERP" is either true or is a slogan.
