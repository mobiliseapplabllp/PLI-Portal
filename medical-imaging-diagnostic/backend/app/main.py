"""Medical Imaging Diagnostic Assistant — FastAPI entrypoint."""
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import get_settings
from .database import init_db
from .routers import analytics, auth, meta, oncology, patients, reports, studies

settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    description="Multi-tenant AI diagnostic assistant for doctors — unified "
                "patient profiles with cross-modal correlation.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # prototype; lock down per-tenant origins in prod
    # Auth is via Bearer tokens (not cookies), so credentials are not needed.
    # "*" origin + credentials is also rejected by browsers, so keep this False.
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(meta.router)
app.include_router(analytics.router)
app.include_router(oncology.router)
app.include_router(auth.router)
app.include_router(patients.router)
app.include_router(studies.router)
app.include_router(reports.router)


@app.on_event("startup")
def _startup() -> None:
    import logging

    from .ai import describe_active

    os.makedirs(settings.upload_dir, exist_ok=True)
    init_db()
    log = logging.getLogger("uvicorn")
    if settings.secret_is_ephemeral:
        log.warning(
            "⚠️  No SECRET_KEY set — using a random per-process key. Logins will "
            "not survive a restart. Set a strong SECRET_KEY in .env for real use."
        )
    log.info("🩺 %s ready — %s", settings.app_name, describe_active())


# Serve the frontend. Prefer the built Next.js app (webapp/out); fall back to the
# legacy static frontend/ during development if the app hasn't been built.
_here = os.path.dirname(__file__)
_candidates = [
    os.path.join(_here, "..", "..", "webapp", "out"),   # Next.js production export
    os.path.join(_here, "..", "static"),                # baked into the Docker image
    os.path.join(_here, "..", "..", "frontend"),        # legacy fallback
]
for _dir in _candidates:
    if os.path.isdir(_dir):
        app.mount("/", StaticFiles(directory=_dir, html=True), name="frontend")
        break
