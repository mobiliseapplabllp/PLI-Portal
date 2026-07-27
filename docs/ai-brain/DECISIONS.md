# Cortex — Decision Log

Architecture decisions taken so far, with the reasoning and the consequences.
New decisions are appended; superseded decisions are marked, never deleted.

---

## ADR-001 — Per-client deployed instance
**Status:** Accepted
**Decision:** Each client receives an isolated installation rather than being a tenant in a shared
SaaS runtime.
**Consequences:** No cross-tenant leakage risk and a much easier enterprise security conversation.
In exchange, fleet management (remote upgrade, health, telemetry, release signing) becomes a
first-class subsystem from Phase 4 rather than something added at ten clients. Per-instance cost
must be bounded and known, since it is incurred N times.

---

## ADR-002 — Support all four ingestion modes
**Status:** Accepted
**Decision:** Direct DB/read replica, vendor APIs, file drops, and UI automation are all supported.
**Consequences:** One connector interface with four backends. Discovery quality degrades predictably
across the modes, and the platform must state its own confidence accordingly. UI automation carries
contractual and data-protection exposure, so it is gated by a `SourceAuthorization` interlock in
code. Standing guidance to clients: start on the mode they can give us, migrate toward a read
replica.

---

## ADR-003 — Full autonomy with post-hoc human audit
**Status:** Accepted, with an implementation constraint
**Decision:** Agents act without prior human approval; humans review afterwards.
**Constraint:** The human gate is *replaced* by an automated verification pipeline, not removed.
Autonomy is granted per capability and is earned against measured criteria, with hard ceilings on a
small number of capabilities (see `AUTONOMY-AND-SAFETY.md` §2.1).
**Consequences:** Reversibility, machine gates G1–G5, circuit breakers, kill switches and a
hash-chained audit log become load-bearing infrastructure rather than optional hardening. The daily
digest and weekly review ritual are the human half of the loop; without them this is "no oversight",
not "audit after".

---

## ADR-004 — Hybrid: control plane ours, data plane theirs
**Status:** Accepted
**Decision:** The agent fleet and knowledge base are operated by MALL; ingestion, storage and query
execution run inside the client's boundary. Only artifacts cross.
**Consequences:** Resolved together with ADR-001 as a three-plane topology (fleet / control / data).
The boundary is enforced by an Artifact Gateway with a schema allowlist and default-deny egress —
mechanism, not policy. For clients who will not permit even masked samples to leave, the control
plane is deployable in-VPC too, with discovery degrading to structure-and-statistics only.

---

## ADR-005 — The Artifact Model
**Status:** Accepted
**Decision:** Agents never mutate running systems. They emit versioned, schema-validated, signed,
reversible artifacts which a deterministic runtime interprets.
**Rationale:** A self-modifying process is unauditable and unrollbackable. An artifact-emitting
process is diffable, testable, revertible and explainable — while being equally autonomous from the
user's point of view. This is the decision that makes ADR-003 survivable.

---

## ADR-006 — Deterministic inference outranks LLM inference
**Status:** Accepted
**Decision:** The LLM proposes meaning; deterministic analysis proves structure. An LLM assertion
stays at `hypothesis` confidence until a deterministic test corroborates it.
**Rationale:** A confidently wrong join that reaches an executive dashboard destroys trust
permanently and is not recoverable by later accuracy. Structure is measurable, so it is measured.

---

## ADR-007 — Structural knowledge is relational, not vector
**Status:** Accepted
**Decision:** Schema, profiles, relationships and lineage live in PostgreSQL with bitemporal
versioning. The vector store holds free text only.
**Rationale:** Structural facts need exact joins, temporal queries and diffs. Similarity search over
them yields plausible nonsense. This is the most common way "AI brain" projects fail.

---

## ADR-008 — Assurance is outside the self-modification boundary
**Status:** Accepted
**Decision:** Assurance squad code, prompts, models and thresholds; the safety policy; the audit
log; and the kill switch may only be changed by a human, under two-person review. Enforced by
CODEOWNERS, capability tokens, and a CI check.
**Rationale:** A system that can edit its own safety checks has no safety checks.

---

## ADR-009 — PLI Portal is system #1
**Status:** Accepted
**Decision:** The first connected system is our own PLI Portal.
**Rationale:** Known MySQL schema, real workflow logic, real users, and numbers we can reconcile
against — with hand-labelled ground truth available for free. Zero cost to experiment on.

---

## Open decisions

| # | Question | Blocks |
|---|---|---|
| OD-1 | Which client system is #2, and on what engine/domain? | Phase 5 planning, domain pack #2 |
| OD-2 | Will the platform ever write back into source systems? (v1 assumes no) | A separate safety design if yes |
| OD-3 | Is pattern-level cross-client learning contractually acceptable? | Fleet plane design, client agreement |
| OD-4 | Team size and Python capacity | Phase 1 staffing, timeline |
| OD-5 | Commercial model — per instance, per connected system, or per seat? | Cost-control targets in `ARCHITECTURE.md` §11 |
