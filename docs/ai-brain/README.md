# Cortex — Autonomous Data Intelligence Platform

Design documentation for a platform that connects to any operational system, discovers on its own
how that system works, and continuously produces dashboards, metrics, alerts and APIs from that
understanding — maintained by a fleet of autonomous agents that also keep the platform itself
updated, secured and optimised.

**Status: design phase. Nothing is being implemented until this is signed off.**

## Documents

| Document | Contents |
|---|---|
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | The system design: three-plane topology, artifact model, ingestion, discovery engine, knowledge core, agent fleet, consumption, security, tech selection, cost model, risk register |
| [`AUTONOMY-AND-SAFETY.md`](./AUTONOMY-AND-SAFETY.md) | How full autonomy is made safe: the autonomy ladder, capability matrix, five machine gates, reversibility, circuit breakers, failure modes |
| [`ROADMAP.md`](./ROADMAP.md) | Eight phases with measurable exit criteria, timeline, team, build-vs-buy, and the checkpoints that would stop the project |
| [`DECISIONS.md`](./DECISIONS.md) | Decision log (ADR-001 … ADR-009) and open decisions |

## The three sentences that define the design

1. **The product is the knowledge model, not the agents.** Agents are disposable workers; the
   versioned semantic model of each connected system is the asset that compounds.
2. **Agents produce artifacts, never side effects.** Nothing reaches a running system except as a
   versioned, validated, reversible artifact.
3. **Autonomy is earned per capability, verified by machine.** Full autonomy is the destination,
   reached by passing statistical gates rather than by being switched on.

## Decisions taken

- Per-client deployed instance, not shared multi-tenant SaaS
- All four ingestion modes: DB/replica, API, file drops, UI automation
- Full autonomy with post-hoc human audit — implemented as machine gates replacing the human gate
- Hybrid deployment: control plane MALL-operated, data plane inside the client boundary

## Where to start reading

Read `ARCHITECTURE.md` §0–§2 first — the goal, the four decisions and their consequences, and the
artifact model. Everything else follows from those three sections.

If you only have ten minutes: `ARCHITECTURE.md` §1.1 (topology), `AUTONOMY-AND-SAFETY.md` §2.1
(capability matrix), and `ROADMAP.md` §6 (what could stop this).
