# Architecture

## Goal

A scalable, multi-organization AI diagnostic assistant. The unit of value is the
**patient profile**: a single view that unifies imaging, AI diagnostics, and
reports, and adds a **cross-study correlation** the treating doctor can act on.

## Layers

```
┌──────────────────────────────────────────────────────────────┐
│ Frontend (static SPA: HTML + Tailwind + vanilla JS)          │
│   login · patient list · unified profile · study analysis    │
└───────────────┬──────────────────────────────────────────────┘
                │ REST + JWT
┌───────────────▼──────────────────────────────────────────────┐
│ FastAPI                                                       │
│  routers/  auth · patients · studies · reports · meta         │
│  services  run_analysis() · regenerate_correlation()          │
│  deps      current_user + tenant scoping                      │
├──────────────────────────────────────────────────────────────┤
│ AI layer  (backend/app/ai)                                    │
│  base       DiagnosticEngine / EngineResult / Finding         │
│  engines    Mock{CXR,Retinal,Segmentation} + TorchXRayVision  │
│  registry   modality → engine (mock ⇄ real via env)           │
│  reporting  draft_report()  (VLM stand-in)                    │
│  correlation build_correlation()  (transparent rule engine)   │
├──────────────────────────────────────────────────────────────┤
│ Persistence  SQLModel → SQLite (dev) / Postgres (prod)        │
│ Storage      local FS (dev) / object store (prod)             │
└──────────────────────────────────────────────────────────────┘
```

## Multi-tenancy

Single database, `org_id` on every tenant-owned table (shared-schema
multi-tenancy). Every query filters by the JWT's `org` claim; ownership is
re-checked on each `GET /{id}`. This is the cheapest model to operate and scales
to many orgs; a hard-isolation deployment can later shard per-org databases
behind the same `org_id` boundary without touching the domain model.

## The AI contract

Everything an engine returns is the `EngineResult` dataclass:

```python
EngineResult(engine, modality, model_source, findings=[Finding(label, prob, severity)], heatmap_path)
```

Because the API only ever sees this contract, the *implementation* behind a
modality is swappable: mock heuristic → real pretrained network → hosted
inference API, with no changes upstream. `registry.get_engine()` picks the
backend from `AI_ENGINE_MODE`.

## Correlation (clinical reasoning)

`build_correlation()` aggregates every positive finding across a patient's
studies and matches them against transparent `PATTERN_RULES` (e.g. *Cardiomegaly
+ Effusion → CHF*). Output: a ranked differential, plain-language summary, and
recommendations — deliberately explainable, not a black box, per 2026 radiology
AI guidance. Swapping this for an LLM/agentic reasoner is a drop-in later.

## Data model

`Organization · User · Patient · Study · ImageAsset · DiagnosticResult · Report ·
Correlation` — see `backend/app/models.py`. `DiagnosticResult` stores findings as
JSON plus a denormalized `top_finding` / `max_severity` for fast list rendering.

## Scaling to production

| Concern | Prototype | Production path |
|---------|-----------|-----------------|
| DB | SQLite | Postgres (`DATABASE_URL`), read replicas |
| Image storage | local FS | S3/GCS, presigned URLs, DICOM ingest |
| Inference | in-process mock | GPU workers / Triton / hosted model API, async queue |
| API | single uvicorn | `--scale api=N` behind LB (stateless) |
| Auth | JWT | + refresh tokens, SSO/OIDC per org, audit log |
| Compliance | none | HIPAA/GDPR, encryption at rest, PHI access logging |
| Standards | PNG upload | DICOM / DICOMweb, HL7 FHIR for EHR integration |

## Testing done

- Full pipeline via `seed.py`: 2 orgs, doctors, patients, studies, images →
  analysis → reports → correlation.
- API smoke test: signup, login, patient profile, analyze, heatmap serving.
- **Tenant isolation verified**: cross-org patient access returns `404`.
