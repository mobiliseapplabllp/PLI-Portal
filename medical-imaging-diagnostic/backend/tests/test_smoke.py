"""End-to-end smoke tests. Run:  cd backend && python -m pytest -q

Uses a throwaway SQLite DB and the FastAPI TestClient so no server or network
is required. Covers auth, the AI pipeline, correlation, and tenant isolation.
"""
import os
import tempfile

import pytest

# Isolate DB + uploads before importing the app.
_tmp = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}/test.db"
os.environ["UPLOAD_DIR"] = f"{_tmp}/uploads"
os.environ["AI_ENGINE_MODE"] = "mock"
os.environ["SECRET_KEY"] = "test-secret"

from fastapi.testclient import TestClient  # noqa: E402

from app.database import init_db  # noqa: E402
from app.main import app  # noqa: E402

# TestClient doesn't fire startup events unless used as a context manager, so
# initialise the schema + upload dir explicitly.
os.makedirs(os.environ["UPLOAD_DIR"], exist_ok=True)
init_db()
client = TestClient(app)


def _signup(slug: str) -> dict:
    r = client.post("/api/auth/signup", json={
        "org_name": f"Org {slug}", "org_slug": slug,
        "admin_email": f"{slug}@example.com", "admin_name": "Admin",
        "admin_password": "pw123456",
    })
    assert r.status_code == 201, r.text
    return r.json()


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_health_and_engines():
    assert client.get("/api/health").json()["status"] == "ok"
    eng = client.get("/api/engines").json()
    assert "xray" in eng["supported_modalities"]


def test_full_pipeline_and_correlation(tmp_path):
    tok = _signup("alpha")["access_token"]
    h = _auth(tok)

    # create patient
    p = client.post("/api/patients", json={"mrn": "A1", "full_name": "Test Patient"}, headers=h)
    assert p.status_code == 201
    pid = p.json()["id"]

    # create study
    s = client.post("/api/studies", json={"patient_id": pid, "modality": "xray"}, headers=h)
    sid = s.json()["id"]

    # upload an image with a scenario plan baked in via filename? -> just bytes
    img = tmp_path / "cxr.png"
    try:
        import numpy as np
        from PIL import Image
        Image.fromarray((np.random.rand(256, 256) * 255).astype("uint8")).save(img)
        data = img.read_bytes()
    except Exception:
        data = b"fake-image-bytes"
    up = client.post(f"/api/studies/{sid}/image",
                     files={"file": ("cxr.png", data, "image/png")}, headers=h)
    assert up.status_code == 201

    # analyze
    a = client.post(f"/api/studies/{sid}/analyze", headers=h)
    assert a.status_code == 200, a.text
    body = a.json()
    assert body["diagnostic"]["model_source"].startswith("MockEngine")
    assert "correlation" in body

    # profile carries the correlation
    prof = client.get(f"/api/patients/{pid}", headers=h).json()
    assert prof["correlation"] is not None
    assert len(prof["studies"]) == 1


def test_tenant_isolation():
    tok_a = _signup("beta")["access_token"]
    tok_b = _signup("gamma")["access_token"]
    # A creates a patient
    pid = client.post("/api/patients", json={"mrn": "B1", "full_name": "Private"},
                      headers=_auth(tok_a)).json()["id"]
    # B must not see it
    r = client.get(f"/api/patients/{pid}", headers=_auth(tok_b))
    assert r.status_code == 404


def test_requires_auth():
    assert client.get("/api/patients").status_code == 401


def test_user_endpoints_do_not_leak_password_hash():
    tok = _signup("delta")["access_token"]
    me = client.get("/api/auth/me", headers=_auth(tok)).json()
    assert "hashed_password" not in me
    users = client.get("/api/auth/users", headers=_auth(tok)).json()
    assert all("hashed_password" not in u for u in users)
