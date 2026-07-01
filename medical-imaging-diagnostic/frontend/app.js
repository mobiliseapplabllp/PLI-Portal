// Medical Imaging Diagnostic Assistant — frontend logic (vanilla JS, no deps).
const API = "";
let token = localStorage.getItem("mid_token");
let currentPatient = null;
let allPatients = [];

const $ = (id) => document.getElementById(id);
const AV_COLORS = ["#0d9488", "#4f46e5", "#db2777", "#ea580c", "#0891b2", "#7c3aed", "#059669"];
const initials = (name) => name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
const avColor = (name) => AV_COLORS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AV_COLORS.length];
const sevBadge = (s) => `<span class="badge sev-${s}">${s}</span>`;
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function ageFrom(dob) {
  if (!dob) return "—";
  const d = new Date(dob); if (isNaN(d)) return "—";
  const t = new Date(); let a = t.getFullYear() - d.getFullYear();
  if (t.getMonth() < d.getMonth() || (t.getMonth() === d.getMonth() && t.getDate() < d.getDate())) a--;
  return `${a} y`;
}

async function api(path, { method = "GET", body, form } = {}) {
  const headers = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  let payload = body;
  if (body && !form) { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body); }
  const res = await fetch(API + path, { method, headers, body: form || payload });
  if (res.status === 401) { logout(); throw new Error("unauthorized"); }
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || res.statusText);
  return res.status === 204 ? null : res.json();
}

async function loadImage(imgEl, path) {
  try {
    const res = await fetch(API + path, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error();
    imgEl.src = URL.createObjectURL(await res.blob());
  } catch { imgEl.style.opacity = 0.3; }
}

function toast(msg) {
  const t = document.createElement("div"); t.className = "toast"; t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), 2600);
}

// ---- auth ----------------------------------------------------------------
async function login() {
  const form = new URLSearchParams();
  form.set("username", $("email").value); form.set("password", $("password").value);
  try {
    const res = await fetch(API + "/api/auth/login", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form,
    });
    if (!res.ok) throw new Error("Invalid email or password");
    token = (await res.json()).access_token;
    localStorage.setItem("mid_token", token);
    await boot();
  } catch (e) { $("login-error").textContent = e.message; $("login-error").classList.remove("hidden"); }
}
function logout() {
  token = null; localStorage.removeItem("mid_token");
  $("app-view").classList.add("hidden"); $("login-view").classList.remove("hidden");
}
async function boot() {
  const me = await api("/api/auth/me");
  $("who").innerHTML = `<b>${esc(me.full_name)}</b><span>${esc(me.role)}</span>`;
  $("avatar").textContent = initials(me.full_name);
  $("avatar").style.background = "#f0fdfa";
  $("login-view").classList.add("hidden"); $("app-view").classList.remove("hidden");
  await loadPatients();
}

// ---- patients ------------------------------------------------------------
async function loadPatients() {
  allPatients = await api("/api/patients");
  renderPatientList(allPatients);
}
function renderPatientList(list) {
  $("patient-list").innerHTML = list.map((p) => `
    <button data-id="${p.id}" class="pcard ${p.id == currentPatient ? "active" : ""}">
      <span class="pav" style="background:${avColor(p.full_name)}">${initials(p.full_name)}</span>
      <span class="pmeta">
        <span class="pname">${esc(p.full_name)}</span>
        <span class="psub">MRN ${esc(p.mrn)} · ${esc(p.sex || "?")} · ${ageFrom(p.date_of_birth)}</span>
      </span>
    </button>`).join("") || `<p class="hint">No patients found.</p>`;
  document.querySelectorAll(".pcard").forEach((b) => b.addEventListener("click", () => openPatient(b.dataset.id)));
}
$("patient-search")?.addEventListener("input", (e) => {
  const q = e.target.value.toLowerCase();
  renderPatientList(allPatients.filter((p) =>
    p.full_name.toLowerCase().includes(q) || (p.mrn || "").toLowerCase().includes(q)));
});
async function newPatient() {
  const full_name = prompt("Patient full name:"); if (!full_name) return;
  const mrn = prompt("MRN:", "MRN-" + Math.floor(Math.random() * 9000 + 1000));
  await api("/api/patients", { method: "POST", body: { full_name, mrn, sex: "", date_of_birth: "" } });
  await loadPatients();
}

// ---- patient profile -----------------------------------------------------
async function openPatient(id) {
  currentPatient = id;
  $("empty-state").classList.add("hidden");
  document.querySelectorAll(".pcard").forEach((b) => b.classList.toggle("active", b.dataset.id == id));
  const data = await api(`/api/patients/${id}`);
  const p = data.patient, c = data.correlation;
  const diff = c ? JSON.parse(c.differential_json) : [];
  const recs = c ? JSON.parse(c.recommendations_json) : [];

  $("profile").innerHTML = `
    <div class="card pad">
      <div class="phead">
        <span class="pav" style="background:${avColor(p.full_name)}">${initials(p.full_name)}</span>
        <div>
          <h2>${esc(p.full_name)}</h2>
          <div class="sub">MRN ${esc(p.mrn)} · ${esc(p.sex || "?")} · DOB ${esc(p.date_of_birth || "n/a")} (${ageFrom(p.date_of_birth)})
            ${c ? " · " + sevBadge(c.max_severity) : ""}</div>
          ${p.notes ? `<div class="sub" style="margin-top:6px">📋 ${esc(p.notes)}</div>` : ""}
        </div>
        <div class="actions">
          <button class="btn ghost sm" id="report-btn">📄 Medical Report</button>
          <button class="btn ghost sm" id="recorrelate-btn">↻ Recompute</button>
          <button class="btn sm" id="add-study-btn">+ New study</button>
        </div>
      </div>
    </div>

    <div class="card pad corr">
      <div class="chead"><h3>🧠 AI Correlation</h3> ${c ? sevBadge(c.max_severity) : ""}</div>
      <p class="summary">${c ? esc(c.summary) : "No correlation yet — analyse a study."}</p>
      ${c ? `<div class="corr-cols">
        <div><h4>Differential considerations</h4>
          ${diff.map((d) => `<div class="diff-item">
            <span class="cond">${esc(d.condition)}</span><span class="conf">${(d.confidence * 100).toFixed(0)}%</span>
            <span class="supp">supporting: ${esc(d.supporting_findings.join(", "))}</span></div>`).join("")
          || '<div class="hint">No multi-finding pattern matched.</div>'}
        </div>
        <div><h4>Recommendations</h4>
          <ul class="recs">${recs.map((r) => `<li>${esc(r)}</li>`).join("") || '<li>Routine follow-up.</li>'}</ul>
        </div>
      </div>` : ""}
    </div>

    <div class="section-title">Studies (${data.studies.length})</div>
    <div class="studies" id="studies"></div>`;

  $("report-btn").addEventListener("click", () => openReport(id));
  $("add-study-btn").addEventListener("click", () => addStudy(id));
  $("recorrelate-btn").addEventListener("click", async () => {
    await api(`/api/patients/${id}/correlate`, { method: "POST" }); openPatient(id);
  });

  $("studies").innerHTML = data.studies.map((s) => `
    <div class="card study" id="study-${s.id}">
      <div class="shead">
        <div><span class="chip">${esc(s.modality)}</span> <span class="chip soft">${esc(s.body_part || "")}</span></div>
        <span class="hint">${esc(s.status)}</span>
      </div>
      <div class="sdesc hint" style="margin:-4px 0 8px">${esc(s.description || "")}</div>
      <div class="study-body">Loading…</div>
    </div>`).join("") || `<p class="hint">No studies yet.</p>`;
  data.studies.forEach((s) => renderStudy(s.id));
}

async function renderStudy(studyId) {
  const el = document.querySelector(`#study-${studyId} .study-body`);
  const d = await api(`/api/studies/${studyId}`);
  const diag = d.diagnostics[0], report = d.reports[0], hasImg = d.images.length > 0;

  if (!diag) {
    el.innerHTML = `<button class="btn dark analyze-cta" ${hasImg ? "" : "disabled"} data-id="${studyId}">
      ${hasImg ? "▶ Run AI analysis" : "⚠ Upload an image first"}</button>`;
    const btn = el.querySelector(".analyze-cta");
    if (btn && hasImg) btn.addEventListener("click", async () => {
      btn.textContent = "Analysing…"; btn.disabled = true;
      await api(`/api/studies/${studyId}/analyze`, { method: "POST" }); openPatient(currentPatient);
    });
    return;
  }

  const pos = diag.findings.filter((f) => f.severity !== "normal").sort((a, b) => b.probability - a.probability);
  const sevColor = { normal: "#15803d", low: "#0369a1", moderate: "#a16207", high: "#c2410c", critical: "#b91c1c" };
  el.innerHTML = `
    <div class="viewer"><img class="vimg" alt="scan"/></div>
    <div class="tabs"><button class="on" data-h="0">Original</button><button data-h="1">AI attention</button></div>
    <div>${pos.length ? pos.slice(0, 6).map((f) => `
      <div class="finding"><span>${esc(f.label)}</span>
        <div class="bar"><span style="width:${(f.probability * 100).toFixed(0)}%;background:${sevColor[f.severity]}"></span></div>
        <span>${(f.probability * 100).toFixed(0)}% ${sevBadge(f.severity)}</span></div>`).join("")
      : `<div class="none-good">✓ No significant findings.</div>`}</div>
    <div class="model-tag">Model: <code>${esc(diag.model_source)}</code></div>
    ${report ? `<details class="report"><summary>AI-draft report</summary><pre>${esc(report.body)}</pre></details>` : ""}`;

  const img = el.querySelector(".vimg");
  loadImage(img, `/api/studies/${studyId}/image-file`);
  el.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => {
    el.querySelectorAll(".tabs button").forEach((x) => x.classList.remove("on"));
    b.classList.add("on");
    loadImage(img, `/api/studies/${studyId}/image-file${b.dataset.h === "1" ? "?heatmap=true" : ""}`);
  }));
}

// ---- medical report artifact --------------------------------------------
async function openReport(patientId) {
  try {
    const res = await fetch(`${API}/api/patients/${patientId}/report.html`,
      { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error();
    const url = URL.createObjectURL(new Blob([await res.text()], { type: "text/html" }));
    window.open(url, "_blank");
    toast("Medical report opened in a new tab");
  } catch { toast("Could not generate report"); }
}

async function addStudy(patientId) {
  const modality = prompt("Modality (xray, ct, mri, fundus):", "xray"); if (!modality) return;
  const study = await api("/api/studies", {
    method: "POST", body: { patient_id: Number(patientId), modality, body_part: "", description: "new study" } });
  const input = document.createElement("input");
  input.type = "file"; input.accept = "image/*";
  input.onchange = async () => {
    if (input.files[0]) {
      const fd = new FormData(); fd.append("file", input.files[0]);
      await api(`/api/studies/${study.id}/image`, { method: "POST", form: fd });
    }
    openPatient(patientId);
  };
  input.click();
}

// ---- AI models modal -----------------------------------------------------
async function showModels() {
  const e = await api("/api/engines");
  const icons = { cxr: "🫁", retinal: "👁", segmentation: "🧩", report: "📝", correlation: "🧠" };
  $("modal-root").innerHTML = `
    <div class="modal-bg" id="modal-bg"><div class="modal">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h3>AI Models & Capabilities</h3>
        <span class="mode-pill">mode: ${esc(e.engine_mode)}</span>
      </div>
      <p class="hint" style="margin-top:4px">Supported modalities: ${e.supported_modalities.join(", ")}</p>
      ${e.capabilities.map((c) => `<div class="model-row">
        <div class="mi">${icons[c.engine] || "⚙️"}</div>
        <div><div class="mt">${esc(c.engine)} · <span class="hint">${esc(c.modality)}</span></div>
          <div class="md">${esc(c.description)}</div></div></div>`).join("")}
      <p class="hint" style="margin-top:14px">Enable real chest X-ray inference (TorchXRayVision) with
        <code>AI_ENGINE_MODE=real</code>. Real adapters for MedSAM / RETFound plug in behind the same contract.</p>
      <div style="text-align:right;margin-top:12px"><button class="btn sm" id="modal-close">Close</button></div>
    </div></div>`;
  const close = () => ($("modal-root").innerHTML = "");
  $("modal-close").addEventListener("click", close);
  $("modal-bg").addEventListener("click", (ev) => { if (ev.target.id === "modal-bg") close(); });
}

// ---- wire up -------------------------------------------------------------
$("login-btn").addEventListener("click", login);
$("logout-btn").addEventListener("click", logout);
$("new-patient-btn").addEventListener("click", newPatient);
$("models-btn").addEventListener("click", showModels);
$("password").addEventListener("keydown", (e) => e.key === "Enter" && login());
if (token) boot().catch(() => logout());
