"""Medical Imaging Diagnostic Assistant — FastAPI entrypoint."""
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import get_settings
from .database import init_db
from .routers import auth, meta, patients, reports, studies

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
    if settings.secret_key in ("dev-secret-change-me", "change-me-to-a-long-random-string"):
        log.warning(
            "⚠️  SECRET_KEY is the built-in default — JWTs can be forged. "
            "Set a strong random SECRET_KEY in .env before any non-local use."
        )
    log.info("🩺 %s ready — %s", settings.app_name, describe_active())


# Serve the static frontend (built at ../../frontend relative to this file).
_frontend = os.path.join(os.path.dirname(__file__), "..", "..", "frontend")
if os.path.isdir(_frontend):
    app.mount("/", StaticFiles(directory=_frontend, html=True), name="frontend")
