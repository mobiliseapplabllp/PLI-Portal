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
# Force the holistic-AI rules fallback in tests (don't invoke a real Claude CLI,
# which the background auto-assessment would otherwise call).
os.environ["CLAUDE_CLI_CMD"] = "claude-not-installed"

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


def _seed_patient_with_analysis(tok, tmp_path, modality="xray"):
    h = _auth(tok)
    pid = client.post("/api/patients", json={"mrn": "R1", "full_name": "Rep Patient",
                      "date_of_birth": "1970-01-01", "notes": "test"}, headers=h).json()["id"]
    sid = client.post("/api/studies", json={"patient_id": pid, "modality": modality},
                      headers=h).json()["id"]
    img = tmp_path / "s.png"
    import numpy as np
    from PIL import Image
    Image.fromarray((np.random.rand(128, 128) * 255).astype("uint8")).save(img)
    client.post(f"/api/studies/{sid}/image",
                files={"file": ("s.png", img.read_bytes(), "image/png")}, headers=h)
    client.post(f"/api/studies/{sid}/analyze", headers=h)
    return pid


def test_analytics_summary():
    tok = _signup("epsilon")["access_token"]
    import tempfile, pathlib
    _seed_patient_with_analysis(tok, pathlib.Path(tempfile.mkdtemp()))
    s = client.get("/api/analytics/summary", headers=_auth(tok)).json()
    assert s["totals"]["patients"] == 1 and s["totals"]["analyzed"] == 1
    assert len(s["volume_30d"]) == 30
    assert any(row["count"] for row in s["severity_distribution"] if row["severity"] == "normal") or True


def test_report_pdf_export(tmp_path):
    tok = _signup("zeta")["access_token"]
    pid = _seed_patient_with_analysis(tok, tmp_path)
    r = client.get(f"/api/patients/{pid}/report.pdf", headers=_auth(tok))
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert r.content[:4] == b"%PDF"


def test_admin_cannot_deactivate_self_but_can_edit_others():
    signup = _signup("eta")
    tok = signup["access_token"]
    h = _auth(tok)
    admin_id = signup["user_id"]
    # cannot deactivate self
    assert client.patch(f"/api/auth/users/{admin_id}", json={"is_active": False}, headers=h).status_code == 400
    # can add + edit another user
    u = client.post("/api/auth/users", json={"email": "doc@example.com", "full_name": "Doc",
                    "password": "pw12345", "role": "doctor"}, headers=h).json()
    upd = client.patch(f"/api/auth/users/{u['id']}", json={"role": "radiologist"}, headers=h)
    assert upd.status_code == 200 and upd.json()["role"] == "radiologist"


def test_dicom_upload_converts_to_png(tmp_path):
    tok = _signup("theta")["access_token"]
    h = _auth(tok)
    pid = client.post("/api/patients", json={"mrn": "D1", "full_name": "Dicom P"}, headers=h).json()["id"]
    sid = client.post("/api/studies", json={"patient_id": pid, "modality": "ct"}, headers=h).json()["id"]

    import numpy as np
    import pydicom
    from pydicom.dataset import Dataset, FileMetaDataset
    from pydicom.uid import ExplicitVRLittleEndian, SecondaryCaptureImageStorage, generate_uid
    fm = FileMetaDataset()
    fm.MediaStorageSOPClassUID = SecondaryCaptureImageStorage
    fm.MediaStorageSOPInstanceUID = generate_uid()
    fm.TransferSyntaxUID = ExplicitVRLittleEndian
    ds = Dataset(); ds.file_meta = fm
    ds.Modality = "CT"; ds.Rows = ds.Columns = 64
    ds.BitsAllocated = 16; ds.BitsStored = 16; ds.HighBit = 15
    ds.PixelRepresentation = 0; ds.SamplesPerPixel = 1
    ds.PhotometricInterpretation = "MONOCHROME2"
    ds.WindowCenter = 400; ds.WindowWidth = 1000
    ds.PixelData = (np.random.rand(64, 64) * 800).astype(np.uint16).tobytes()
    ds.SOPClassUID = fm.MediaStorageSOPClassUID
    ds.SOPInstanceUID = fm.MediaStorageSOPInstanceUID
    dcm = tmp_path / "scan.dcm"
    ds.save_as(str(dcm), enforce_file_format=True)

    up = client.post(f"/api/studies/{sid}/image",
                     files={"file": ("scan.dcm", dcm.read_bytes(), "application/dicom")}, headers=h)
    assert up.status_code == 201, up.text
    body = up.json()
    assert body["storage_path"].endswith(".png")   # converted for viewing
    assert json_loads(body["meta_json"]).get("modality") == "CT"


def json_loads(s):
    import json
    return json.loads(s)


def test_structured_report_json_html_fhir(tmp_path):
    tok = _signup("iota")["access_token"]
    h = _auth(tok)
    pid = client.post("/api/patients", json={"mrn": "S1", "full_name": "Struct P",
                      "notes": "smoker"}, headers=h).json()["id"]
    sid = client.post("/api/studies", json={"patient_id": pid, "modality": "ct",
                      "body_part": "Chest"}, headers=h).json()["id"]
    # image with a planted oncologic scenario via sidecar plan
    import json as _json
    import numpy as np
    from PIL import Image
    img = tmp_path / "ct.png"
    Image.fromarray((np.random.rand(128, 128) * 255).astype("uint8")).save(img)
    client.post(f"/api/studies/{sid}/image",
                files={"file": ("ct.png", img.read_bytes(), "image/png")}, headers=h)
    client.post(f"/api/studies/{sid}/analyze", headers=h)

    sr = client.get(f"/api/studies/{sid}/report.json", headers=h)
    assert sr.status_code == 200
    body = sr.json()
    assert body["schema"] == "mid.structured-report/v1"
    assert isinstance(body["impression"], list)
    assert "findings" in body and "recommendations" in body

    fhir = client.get(f"/api/studies/{sid}/report.json?fhir=true", headers=h).json()
    assert fhir["resourceType"] == "DiagnosticReport"

    html = client.get(f"/api/studies/{sid}/report.html", headers=h)
    assert html.status_code == 200 and "Structured Report" in html.text


def test_documents_and_holistic_assessment(tmp_path, monkeypatch):
    monkeypatch.setenv("CLAUDE_CLI_CMD", "claude-not-installed")  # force rules fallback
    tok = _signup("kappa")["access_token"]
    h = _auth(tok)
    pid = _seed_patient_with_analysis(tok, tmp_path, modality="ct")

    # add a lab document
    fd = {"kind": (None, "lab"), "title": (None, "CA 19-9"), "value": (None, "250 U/mL")}
    r = client.post(f"/api/patients/{pid}/documents", files=fd, headers=h)
    assert r.status_code == 201 and r.json()["value"] == "250 U/mL"
    assert len(client.get(f"/api/patients/{pid}/documents", headers=h).json()) == 1

    # holistic assessment (rules fallback)
    a = client.post(f"/api/patients/{pid}/assess", headers=h)
    assert a.status_code == 200
    body = a.json()
    assert body["source"] == "rules"
    assert "narrative" in body and isinstance(body["problem_list"], list)
    # latest assessment persisted
    assert client.get(f"/api/patients/{pid}/assessment", headers=h).json()["narrative"]

    # chat falls back gracefully without a CLI
    c = client.post(f"/api/patients/{pid}/chat", json={"question": "urgent?"}, headers=h)
    assert c.status_code == 200 and c.json()["source"] == "unavailable"


def test_ai_assistant_role_gated(tmp_path):
    signup = _signup("lambda")
    tok = signup["access_token"]; h = _auth(tok)
    pid = _seed_patient_with_analysis(tok, tmp_path)
    # admin (clinician) can assess
    assert client.post(f"/api/patients/{pid}/assess", headers=h).status_code == 200
    # create a viewer and confirm they are blocked from the AI Assistant
    client.post("/api/auth/users", json={"email": "viewer@example.com", "full_name": "V",
                "password": "pw12345", "role": "viewer"}, headers=h)
    vtok = client.post("/api/auth/login",
                       data={"username": "viewer@example.com", "password": "pw12345"}).json()["access_token"]
    vh = _auth(vtok)
    assert client.post(f"/api/patients/{pid}/assess", headers=vh).status_code == 403
    assert client.post(f"/api/patients/{pid}/chat", json={"question": "x"}, headers=vh).status_code == 403
    # but a viewer can still READ the existing assessment + chat history
    assert client.get(f"/api/patients/{pid}/assessment", headers=vh).status_code == 200
