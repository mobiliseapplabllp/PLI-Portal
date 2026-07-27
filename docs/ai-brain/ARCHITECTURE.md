# Cortex — Autonomous Data Intelligence Platform

**Architecture & Analysis Document**
Status: **Draft for review — no implementation until signed off**
Working codename: `Cortex` (placeholder, not final branding)

---

## 0. What we are building

A platform that connects to any operational system — our own products, a client's ERP, a third-party
application we do not control — **discovers on its own how that system works**, builds a durable
model of it, and continuously produces dashboards, metrics, alerts and APIs from that model without
anyone hand-writing the integration.

The platform is operated by a fleet of long-running agents that keep the model current, keep the
platform itself current, and keep both under continuous security and quality assessment.

Three sentences that define the whole design:

1. **The product is the knowledge model, not the agents.** Agents are disposable workers. The
   versioned semantic model of each connected system is the asset that compounds.
2. **Agents produce artifacts, never side effects.** Nothing an agent emits reaches a running system
   except as a versioned, validated, reversible artifact.
3. **Autonomy is earned per capability, verified by machine.** Full autonomy is the destination. It
   is reached by a capability passing statistical gates, not by being switched on.

---

## 1. Decisions taken (and what they force)

| # | Decision | Consequence for the architecture |
|---|---|---|
| D1 | **Per-client deployed instance** | No shared runtime between clients. Every client gets an isolated stack. Upgrades, observability and agent operation must work *remotely, in someone else's network*. Fleet management becomes a first-class subsystem, not an afterthought. |
| D2 | **All four ingestion modes** (DB/replica, API, file drops, UI scraping) | One connector interface with four backends. Discovery must degrade gracefully: rich when we have a schema, inferential when we only have JSON or CSV, brittle-but-self-healing when we only have a screen. |
| D3 | **Full autonomy, humans audit after** | The approval queue is replaced by an automated verification pipeline. Reversibility, blast-radius budgets, circuit breakers and a hash-chained audit log stop being nice-to-haves and become the load-bearing structure. See `AUTONOMY-AND-SAFETY.md`. |
| D4 | **Hybrid: control plane ours, data plane theirs** | Raw client data never leaves the client boundary. Only *artifacts* cross. That boundary must be enforced by an egress gateway with a schema allowlist, not by a policy document. |

### 1.1 Reconciling D1 and D4

D1 ("per-client instance") and D4 ("hybrid, control plane ours") are two halves of the same
topology. Resolved as **three planes**:

```
┌─────────────────────────────────────────────────────────────────────┐
│  FLEET PLANE  —  MALL-operated, single, global                      │
│  Agent/prompt registry · platform release channel · model routing   │
│  Fleet telemetry (metadata only) · Procedural-memory exchange       │
│  Licence + entitlement · Kill switch of last resort                 │
└───────────────┬─────────────────────────────────────────────────────┘
                │ signed releases ↓        ↑ anonymised patterns, health
┌───────────────┴─────────────────────────────────────────────────────┐
│  CONTROL PLANE  —  one logical instance per client, MALL-operated   │
│  Agent fleet · Temporal orchestration · Knowledge Core              │
│  Artifact registry · Verification pipeline · Audit log · Web UI     │
└───────────────┬─────────────────────────────────────────────────────┘
                │ artifacts only, via Artifact Gateway (allowlist)
┌───────────────┴─────────────────────────────────────────────────────┐
│  DATA PLANE  —  per client, ALWAYS inside the client's boundary     │
│  Connectors · Raw/staged/modelled zones · Warehouse · Query engine  │
│  Redaction proxy · Egress firewall (default deny)                   │
│  ── raw rows never cross this line ──                               │
└─────────────────────────────────────────────────────────────────────┘
```

**The boundary contract.** Only these object types may travel data plane → control plane:

- structural metadata (tables, columns, types, constraints, indexes)
- statistical profiles (cardinality, null rate, distributions, ranges — **no raw values**)
- masked or synthetic samples that have passed the redaction proxy
- aggregates above a configurable k-anonymity threshold
- artifact proposals, verification results, telemetry, audit entries

Anything else is rejected by the Artifact Gateway at the schema level. If a client's policy forbids
even masked samples, the gateway is configured to drop them and the discovery engine falls back to
structure-and-statistics-only inference at a stated accuracy cost.

For high-security clients the control plane can be deployed *into the client's VPC too* — the code
is identical, only the placement changes. The fleet plane is then reduced to a signed release feed.

---

## 2. Core architectural principle: the Artifact Model

An **artifact** is a versioned, schema-validated, signed, reversible declaration of intent.
Agents emit artifacts. A fixed runtime interprets them. No agent ever mutates a running system directly.

| Artifact type | Emitted by | Interpreted by | Rollback |
|---|---|---|---|
| `SystemMap` | Discovery squad | Knowledge Core | version pin |
| `SemanticModel` | Semantics squad | Query gateway | version pin |
| `MetricDefinition` | Metric Miner | Query gateway | version pin |
| `DashboardSpec` | Dashboard Designer | Renderer | previous spec |
| `ConnectorConfig` | Crawler | Ingestion runtime | previous config |
| `ScrapeRecipe` | UI Automation agent | Playwright runner | previous recipe |
| `ApiDefinition` | API Synthesizer | API gateway | deprecate + previous version |
| `AlertRule` | Alert Designer | Alerting runtime | disable + previous rule |
| `CodeChange` (PR) | Platform squad | CI + deploy pipeline | revert commit |
| `InfraChange` (IaC) | Platform squad | Terraform pipeline | `terraform apply` previous state |

Why this matters more than anything else in the document: it is what makes "the software updates
itself" tractable. A self-modifying process is unauditable and unrollbackable. A process that
*emits a versioned artifact which a deterministic runtime applies* is diffable, testable, revertible
and explainable — while being just as autonomous from the user's seat.

Every artifact carries: `id, type, version, producer_agent, model_id, inputs_hash, confidence,
provenance[], verification_results[], rollback_ref, signature`.

---

## 3. Ingestion layer

### 3.1 One interface, four backends

Every connector implements the same contract:

```
discover()   → structural description of what is available
sample(n)    → representative records, through the redaction proxy
extract(wm)  → incremental pull from watermark wm
healthcheck()→ liveness, auth validity, rate-limit headroom
cost()       → estimated rows/bytes/API-calls for a full and incremental pull
```

| Mode | Mechanism | Discovery quality | Notes |
|---|---|---|---|
| **A. Database / read replica** | JDBC/native driver; `information_schema`; CDC via Debezium where log access exists, else watermark polling | **Best.** Full structure, constraints, indexes, history | Always request a read-only replica, never primary. Preferred mode; push every client here. |
| **B. Vendor / client API** | REST/GraphQL/SOAP. OpenAPI or GraphQL introspection when published | **Good structure, no relationships.** FK graph must be inferred from values alone | When no spec exists, a Probe agent walks endpoints and *synthesises* an OpenAPI artifact from observed responses. |
| **C. File drops / exports** | SFTP, S3, mailbox, manual upload. CSV/XLSX/JSON/XML/fixed-width | **Weak.** Schema inferred per file; no relationships, no types | Shape-drift detector on every load; a changed header quarantines the batch rather than corrupting the warehouse. |
| **D. UI automation / scraping** | Playwright, per-source `ScrapeRecipe` artifact | **Weakest and most fragile.** Screen-shaped, not data-shaped | Self-healing: broken selector → Repair agent regenerates the recipe, validated against a golden snapshot before promotion. |

### 3.2 Hard interlock on Mode D

The scraping runtime **refuses to execute** a `ScrapeRecipe` unless a `SourceAuthorization` record
exists for that source, naming the authorising party, the date, and the scope. This is a code-level
interlock, not a policy note. Scraping a system we do not own carries contractual and
data-protection exposure; the platform must make it impossible to do accidentally.

Where a client insists on Mode D, the standing recommendation to them is a read replica or an API
key — Mode D should be the migration path's starting point, not its resting place.

### 3.3 Landing zones

```
raw       immutable, append-only, partitioned by source+ingest_time, source hash retained
staged    typed, deduplicated, PII-tagged, quality-checked
modelled  conformed to the semantic model, the only zone dashboards read from
```

Raw is never deleted within the retention window. Every inference the platform makes is
re-derivable — when the Ontologist is wrong about a join in month three, we reprocess rather than
re-ingest.

---

## 4. Discovery & Understanding Engine

This is the "self-discovery mode". Most of it is **not AI**, and that is the point: the LLM proposes
meaning, deterministic analysis proves structure.

| Layer | What it does | Method | Output confidence |
|---|---|---|---|
| **L0 Structural** | Tables, columns, types, PKs, declared FKs, indexes, views, procedures, DDL history | Catalog introspection | `certain` |
| **L1 Statistical** | Row counts, cardinality, null rate, distinct count, distribution, min/max, date range, format regex, entropy, write frequency, per-column | Deterministic profiling passes | `certain` |
| **L2 Relational** | *Undeclared* relationships, junction tables, hierarchies, tenant discriminators, soft-delete columns | Name similarity **gated on a value-overlap containment test** (`|A∩B| / |A| ≥ θ` with cardinality and type checks) | `high` / `medium` with score |
| **L3 Behavioural** | Workflow logic: state machines mined from observed status transitions, approval chains, SLA timings, actor→action matrices, seasonality | Sequence mining over history/audit tables | `high` when transition volume is sufficient |
| **L4 Code** | ORM models, route handlers, validation rules, RBAC matrices, business rules in application code | Static analysis of the repo, where we have it | `high` |
| **L5 Semantic** | Human-meaningful names, descriptions, entity types, ontology mapping, PII classification, metric candidates | LLM over L0–L4 evidence | `hypothesis` until corroborated |
| **L6 External** | Industry KPI norms, vendor documentation, regulatory reporting requirements, benchmark definitions | Research agent, web + vendor docs | `reference` — never authoritative over client data |

**The corroboration rule.** An L5 assertion cannot be promoted above `hypothesis` until a
deterministic layer corroborates it. The LLM may say "`emp_cd` in `kpi_assignment` refers to
`employee.employee_code`" — the platform only believes it after the value-overlap test passes.
This single rule is what keeps a confident-but-wrong join out of a board dashboard.

**L3 deserves emphasis** because it answers the "understand the workflow logic" requirement without
reading a line of documentation. Given a status column and a history table, transition mining
recovers the actual state machine *as operated*, including the transitions the documentation
forgot and the ones the users invented. For PLI Portal that means recovering
`Draft → Assigned → Employee Submitted → Manager Reviewed → Final Reviewed → Locked` — plus every
unlock, every skipped step, and the real distribution of time spent in each state.

---

## 5. The Knowledge Core

Five stores. Keeping them separate is deliberate and is the difference between a brain and a pile
of embeddings.

| Memory | Contains | Store | Why |
|---|---|---|---|
| **Structural** | The system map: systems, datasets, fields, relationships, profiles, lineage | PostgreSQL, **bitemporal** (`valid_time`, `tx_time`) | Must answer "what did we believe on 1 March, and why did that change" |
| **Semantic** | Canonical ontology, per-system mappings, metric definitions, dimensions, grains, glossary | PostgreSQL + Cube-format model files under version control | The crown jewel; must be diffable and reviewable |
| **Episodic** | Every agent run, decision, proposal, verification result, rejection **with reason**, outcome | PostgreSQL, append-only, hash-chained | Stops the fleet re-proposing rejected ideas forever; *is* the audit log D3 depends on |
| **Procedural** | Learned playbooks — "in Tally-shaped schemas, invoices live here"; "this API rate-limits at 40/min" | PostgreSQL + rule files | Promoted from episodic when a pattern repeats; this is what makes system #10 faster than system #2 |
| **Document** | Vendor docs, research output, tickets, free text | Vector store (pgvector) | Free text only |

**Explicit anti-pattern:** do not put schema and profiles into a vector database. Structural facts
are relational, need exact joins, need temporal queries, and need to be diffed. Similarity search
over them produces plausible nonsense. Vectors are for prose.

### 5.1 The canonical ontology

The reason the platform is generic across ERPs is that every source system maps into **one**
canonical ontology (`Party`, `Employee`, `Organisation`, `Product`, `Order`, `Shipment`, `Invoice`,
`Payment`, `Ticket`, `Asset`, `Event`, …) with domain packs layered on (Manufacturing, 3PL/SCM,
HR, Field Service).

Expect the ontology to be rewritten once, when system #2 arrives. That is normal and should be
budgeted for, not treated as failure. The mapping work — unglamorous, semi-manual at first — **is**
the product; the AI accelerates it, it does not eliminate it.

### 5.2 Cross-client learning without moving data

Procedural memory is the one thing that flows *upward*. When an instance learns a durable,
PII-free, client-agnostic pattern, a Generaliser agent proposes it as a fleet-level playbook; after
verification it is distributed to other instances.

Strict rule: only *patterns* propagate — never data, never schemas identifiable to a client, never
metric definitions containing client-specific business rules. Every upward artifact passes the same
Artifact Gateway allowlist plus a client-identifiability scan. This is contractually significant;
the client agreement must permit it explicitly.

---

## 6. The Agent Fleet

Five squads. Each agent is narrow, budgeted, and emits exactly one artifact type.

### Squad 1 — Discovery
| Agent | Trigger | Emits |
|---|---|---|
| Crawler | New source registered; scheduled sweep | `ConnectorConfig`, source inventory |
| Profiler | New dataset; drift detected | Statistical profiles |
| Relationship Miner | Profile complete | Relationship candidates + evidence |
| Workflow Miner | History tables identified | State machines, process maps |
| Code Reader | Repo access available | Business rules, RBAC matrix |
| Drift Sentinel | Continuous | Change events (schema, volume, distribution) |

### Squad 2 — Semantics
| Agent | Trigger | Emits |
|---|---|---|
| Ontologist | New/changed structure | Ontology mappings |
| Metric Miner | Model updated; usage telemetry | `MetricDefinition` candidates |
| Glossary Curator | New terms | Business glossary entries |
| PII Classifier | Every new field, mandatory | Sensitivity labels, masking policy |

### Squad 3 — Product
| Agent | Trigger | Emits |
|---|---|---|
| Dashboard Designer | New metrics; usage gaps; role added | `DashboardSpec` |
| Narrative Writer | Dashboard refresh | Insight text, anomaly explanations |
| Alert Designer | Metric with actionable variance | `AlertRule` |
| API Synthesizer | Consumption demand detected | `ApiDefinition` (REST + GraphQL over the semantic model) |

### Squad 4 — Platform (the self-updating requirement)
| Agent | Trigger | Emits |
|---|---|---|
| Dependency Steward | CVE feed; release feed; weekly | Upgrade PRs |
| Stack Scout | Monthly; capability gap | ADR proposals (evaluate + recommend tech changes) |
| Performance Engineer | Slow-query log; SLO breach | Index / materialisation / query-rewrite PRs |
| Cost Optimiser | Spend anomaly; weekly | Model-routing, caching, storage-tiering changes |
| Refactorer | Complexity/duplication thresholds | Refactor PRs |
| Test Author | Coverage gap; new code | Test PRs |

### Squad 5 — Assurance (the counterweight)
| Agent | Trigger | Emits |
|---|---|---|
| Verifier | Every artifact | Independent re-derivation + agreement score |
| Red Team | Every high-blast-radius artifact | Refutation attempt, adversarial verdict |
| Security Analyst | Continuous + every `CodeChange` | SAST/DAST/SCA/secret-scan findings, threat-model diff, OWASP mapping |
| Data Quality Sentinel | Every load | Freshness, completeness, reconciliation breaks |
| Regression Guard | Every promotion | Golden-question-set pass rate delta |
| Auditor | Daily | Human-readable change digest, ranked by blast radius |

### 6.1 Three fleet rules that are non-negotiable

1. **Assurance is independent.** Squad 5 agents run on different models and different prompts from
   the agents they check, and **Squad 4 has no write access to Squad 5's code, prompts, or
   thresholds.** A system that can evolve its own safety checks has no safety checks.
2. **Every agent has a budget** — tokens, wall-clock, tool calls, and blast radius. Exceeding it
   halts the agent and files an episodic record. This is the runaway-cost and runaway-loop control.
3. **Readers of untrusted content hold no write capabilities.** Crawlers, file readers, research
   agents and scrapers ingest text an attacker can author. They run with read-only capability
   tokens and their output enters the system as *data*, never as instructions. Prompt injection is
   the primary attack surface of this architecture (§8.3).

### 6.2 Orchestration

**Temporal.** Not a scheduler, not a `while` loop. The requirement is agents that run for hours
across flaky networks and rate-limited APIs; that demands durable execution, checkpointing,
automatic retry with backoff, and resumability. Sagas provide the compensation path when a
multi-step change must be unwound. Signals wake workflows on drift events; crons drive sweeps.

---

## 7. Consumption layer

**Everything queries through the semantic layer. Nothing touches the warehouse directly.** This is
what makes generated output safe and consistent — a metric has exactly one definition, and a
generated query cannot invent a join the model does not sanction.

- **Dashboards** — the Designer emits a `DashboardSpec` (metric refs, viz type, filters, layout,
  drill paths). A fixed React renderer consumes it. Never generated chart code.
- **Natural-language query** — NL → semantic-layer query → SQL. Never free-hand SQL against a
  client database.
- **Generated APIs** — `ApiDefinition` declares a resource over the semantic model; the gateway
  materialises REST + GraphQL endpoints, with authorisation derived from the source system's
  mined RBAC matrix (L4), versioned, with managed deprecation.
- **Push** — alerts, scheduled digests, anomaly narratives to email/Slack/Teams/WhatsApp.
- **Embedding** — signed-URL embeds so dashboards can be dropped into PLI Portal, OPSuit, SCM Pro,
  HREVO and client apps.

---

## 8. Security architecture

Driven by three facts: the platform runs inside client networks, agents act without prior human
approval, and it ingests untrusted content by design.

### 8.1 Identity and capability
- Per-agent service identity; **short-lived credentials** from Vault; no long-lived secrets on disk.
- **Capability tokens** scoped per action and per resource, issued for the duration of one task.
  An agent that needs to read `information_schema` gets exactly that, for ten minutes.
- Source-system credentials are read-only by contract and by grant. Write-back to client systems is
  out of scope for v1 and requires a separate design review.

### 8.2 Data boundary
- Data plane egress is **default-deny**; the only permitted destination is the Artifact Gateway.
- **Redaction proxy** in front of every model call: PII detection, masking, k-anonymity checks,
  and a per-field policy deciding whether raw values may ever be transmitted.
- Model calls carry a data-classification header; a `restricted` classification routes to an
  in-VPC open-weight model instead of a commercial API.

### 8.3 Prompt injection — the primary threat
Crawled pages, PDFs, ticket text, database comments, file contents and scraped screens are all
attacker-authorable. Mitigations, layered:
- capability separation (§6.1.3) — the agent that reads cannot write;
- ingested content is wrapped and labelled as untrusted data in every prompt;
- artifacts derived from untrusted content are marked and require Red Team sign-off before
  promotion above autonomy L1;
- the Artifact Gateway scans outbound artifacts for secrets, credentials and exfiltration patterns;
- no agent may issue a network request to a destination not on the egress allowlist, regardless of
  what its input told it to do.

### 8.4 Audit
Append-only, hash-chained, tamper-evident, exportable. Because D3 puts humans *after* the change,
the audit log is not a compliance artefact — it is the primary control surface. It must be
queryable, diffable, and one click from revert.

### 8.5 Compliance posture
Target SOC 2 Type II and ISO 27001 for the fleet plane; DPDP Act (India) and GDPR data-handling
obligations in the data plane; per-client DPA covering the artifact boundary and the cross-client
learning clause (§5.2).

---

## 9. Technology selection

| Concern | Choice | Why this over the alternatives |
|---|---|---|
| Orchestration | **Temporal** | Durable multi-hour execution with checkpointing. Airflow is batch-DAG-shaped; Celery/BullMQ lack durable state; a bespoke loop loses four hours to one 429. |
| Agent runtime | **Claude Agent SDK** (Python) | Native tool use, sub-agents, long-context. Squad 5 runs a *different* model family for genuine independence. |
| Semantic layer | **Cube** | Mature metric/dimension/join model, caching, SQL + REST + GraphQL out of the box. Do not invent a metric DSL. |
| Ingestion | **Airbyte** (connectors) + **Debezium** (CDC) + custom for modes C/D | 600+ existing connectors is the difference between selling in month 6 and month 24. |
| Warehouse | **ClickHouse**; **DuckDB** for small instances | Per-client deployment means the warehouse must run in a client VPC on modest hardware. Snowflake/BigQuery are non-starters under D1/D4. |
| Metadata + memory | **PostgreSQL** (+ pgvector) | Bitemporal structural memory needs relational integrity; pgvector avoids a second datastore. |
| Static analysis | tree-sitter + language-native linters | Multi-language repo reading (L4). |
| Security scanning | Semgrep, Trivy, Gitleaks, OWASP ZAP | Feed the Security Analyst agent; do not have an LLM "look for vulnerabilities" unaided. |
| Runtime | Kubernetes per instance, or Docker Compose for small clients | Must be installable in a client VPC by our deploy pipeline. |
| IaC | Terraform + a signed release channel | Fleet plane pushes signed releases; instances pull. |
| Frontend | React + TypeScript, shared design system with existing MALL products | Reuse; dashboards must embed into OPSuit/SCM Pro/HREVO. |

**Deliberately not used:** a vector DB as primary knowledge store; LangChain-style agent chains
(insufficient durability and observability for multi-hour runs); a bespoke chart DSL; generated
chart *code*; direct LLM-to-production-database access under any circumstance.

---

## 10. Non-functional targets (v1)

| Dimension | Target |
|---|---|
| Dashboard query p95 | < 2 s warm, < 8 s cold |
| Data freshness | CDC sources < 5 min; API/file sources < 1 h; scraped < 6 h |
| New system onboarding | < 3 days from credentials to first verified dashboard, **no platform code change** |
| Instance footprint | Runs on 8 vCPU / 32 GB for a mid-size client |
| Availability | 99.5 % for the consumption layer; agent fleet may degrade without user impact |
| Autonomous change safety | Zero unreverted incorrect metrics reaching users per quarter |
| Cost per instance | Bounded and predictable — see §11 |

---

## 11. Cost model

Agent token spend dominates and is the single most likely thing to run away. Controls, in order of
impact:

1. **Drift-triggered, not schedule-triggered.** Re-profile when the Drift Sentinel says something
   changed, not every night. Most days, most schemas are identical, and re-deriving an unchanged
   model is pure waste.
2. **Tiered model routing.** Cheap/fast models for profiling, labelling, classification and
   summarisation. Expensive models only for ontology decisions, dashboard design, and Squad 5
   assurance. Route by task, enforced by the runtime, not left to the agent.
3. **Aggressive caching** on `inputs_hash` — an identical derivation never runs twice.
4. **Hard budgets** per agent, per squad, per instance, per day, with a circuit breaker at 80 %.
5. **Batch** everything batchable.

Every instance reports a cost-per-artifact and cost-per-active-dashboard metric. If the platform
cannot state what a client costs to run, it cannot be priced.

---

## 12. Risk register

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | A confidently wrong join produces a wrong number on an executive dashboard | **Critical** — destroys trust permanently | Corroboration rule (§4); reconciliation against known control totals; shadow-run new metrics before promotion |
| R2 | Full autonomy ships a bad change into a client's environment | **Critical** | Autonomy ladder, machine gates, reversibility requirement, circuit breakers — `AUTONOMY-AND-SAFETY.md` |
| R3 | Prompt injection via crawled/ingested content | **High** | §8.3 capability separation and egress allowlist |
| R4 | Token cost runaway across N client instances | **High** | §11 budgets and circuit breakers; cost is a fleet-level SLO |
| R5 | "Generic across ERPs" proves to be bespoke work per client | **High** — this is the business-model risk | Prove it at system #2 in Phase 5 before selling it; measure onboarding days as the headline metric |
| R6 | Scraping exposure (ToS, data protection) | **High** | `SourceAuthorization` interlock (§3.2); push clients to replica/API |
| R7 | Per-client deployment makes upgrades unmanageable at 10+ clients | **Medium–High** | Fleet plane, signed release channel, and automated instance health from day one — not retrofitted |
| R8 | Ontology thrash — repeated rewrites as new domains arrive | **Medium** | Domain packs layered over a small stable core; budget one rewrite explicitly |
| R9 | Client refuses any data egress, even masked | **Medium** | Control plane deployable in-VPC; discovery degrades to structure-and-statistics only |
| R10 | Model deprecation / provider change breaks agent behaviour | **Medium** | Model routing abstraction; golden question set catches regressions on model swap |

---

## 13. Open questions for you

These do not block starting Phase 0, but they shape Phases 4–6:

1. **First external client** — which real client system is system #2? Its DB engine and domain
   determine the first domain pack.
2. **Write-back** — will the platform ever need to *write* into source systems (create a task,
   update a status)? v1 says no. If yes, that is a separate design with a much heavier safety model.
3. **Cross-client learning** — are you comfortable with pattern-level (never data-level) learning
   flowing between client instances? It needs an explicit contract clause.
4. **Team shape** — how many engineers, and do we have Python/data engineering capacity or is the
   team Node-only? It changes Phase 1 staffing, not the design.
5. **Commercial model** — per-instance licence, per-connected-system, or per-seat? Cost controls
   (§11) need a target margin to be designed against.

---

## Companion documents

- `AUTONOMY-AND-SAFETY.md` — how full autonomy is made safe and how capabilities earn it
- `ROADMAP.md` — phases, exit criteria, team, build-vs-buy
- `DECISIONS.md` — decision log
