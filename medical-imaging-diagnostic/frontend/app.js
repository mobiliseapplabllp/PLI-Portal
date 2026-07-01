// Medical Imaging Diagnostic Assistant — frontend logic (vanilla JS).
const API = ""; // same origin
let token = localStorage.getItem("mid_token");
let currentPatient = null;

const $ = (id) => document.getElementById(id);
const sevBadge = (s) => `<span class="badge sev-${s}">${s}</span>`;

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

// Auth-aware image loader (img tags can't send bearer headers).
async function loadImage(imgEl, path) {
  try {
    const res = await fetch(API + path, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error();
    imgEl.src = URL.createObjectURL(await res.blob());
  } catch { imgEl.alt = "unavailable"; }
}

// ---- auth ----------------------------------------------------------------
async function login() {
  const form = new URLSearchParams();
  form.set("username", $("email").value);
  form.set("password", $("password").value);
  try {
    const res = await fetch(API + "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    });
    if (!res.ok) throw new Error("Invalid credentials");
    token = (await res.json()).access_token;
    localStorage.setItem("mid_token", token);
    await boot();
  } catch (e) {
    $("login-error").textContent = e.message;
    $("login-error").classList.remove("hidden");
  }
}

function logout() {
  token = null;
  localStorage.removeItem("mid_token");
  $("app-view").classList.add("hidden");
  $("login-view").classList.remove("hidden");
}

async function boot() {
  const me = await api("/api/auth/me");
  $("who").textContent = `${me.full_name} · ${me.role}`;
  $("login-view").classList.add("hidden");
  $("app-view").classList.remove("hidden");
  await loadPatients();
}

// ---- patients ------------------------------------------------------------
async function loadPatients() {
  const patients = await api("/api/patients");
  $("patient-list").innerHTML = patients.map((p) => `
    <button data-id="${p.id}" class="patient-item w-full text-left card px-3 py-2 hover:border-teal-400">
      <div class="font-medium">${p.full_name}</div>
      <div class="text-xs text-slate-500">MRN ${p.mrn} · ${p.sex || "?"} · ${p.date_of_birth || ""}</div>
    </button>`).join("") || `<p class="text-sm text-slate-400">No patients yet.</p>`;
  document.querySelectorAll(".patient-item").forEach((b) =>
    b.addEventListener("click", () => openPatient(b.dataset.id)));
}

async function newPatient() {
  const full_name = prompt("Patient full name:");
  if (!full_name) return;
  const mrn = prompt("Medical record number (MRN):", "MRN-" + Math.floor(Math.random() * 9000 + 1000));
  await api("/api/patients", { method: "POST", body: { full_name, mrn, sex: "", date_of_birth: "" } });
  await loadPatients();
}

// ---- patient profile -----------------------------------------------------
async function openPatient(id) {
  currentPatient = id;
  $("empty-state").classList.add("hidden");
  $("profile").classList.remove("hidden");
  const data = await api(`/api/patients/${id}`);
  const p = data.patient;
  const c = data.correlation;

  const diff = c ? JSON.parse(c.differential_json) : [];
  const recs = c ? JSON.parse(c.recommendations_json) : [];

  $("profile").innerHTML = `
    <div class="card p-5">
      <div class="flex items-start justify-between">
        <div>
          <h2 class="text-2xl font-bold">${p.full_name}</h2>
          <p class="text-sm text-slate-500">MRN ${p.mrn} · ${p.sex || "?"} · DOB ${p.date_of_birth || "n/a"}</p>
        </div>
        <button id="add-study-btn" class="bg-teal-600 hover:bg-teal-700 text-white text-sm rounded-lg px-3 py-2">+ New study</button>
      </div>
    </div>

    <div class="card p-5 border-l-4 ${c ? "border-teal-500" : "border-slate-300"}">
      <div class="flex items-center justify-between mb-2">
        <h3 class="font-semibold flex items-center gap-2">🧠 AI Correlation ${c ? sevBadge(c.max_severity) : ""}</h3>
        <button id="recorrelate-btn" class="text-xs text-teal-700 hover:underline">Recompute</button>
      </div>
      <p class="text-sm text-slate-700 mb-3">${c ? c.summary : "No correlation yet — analyse a study."}</p>
      ${diff.length ? `<div class="mb-3"><div class="text-xs font-semibold text-slate-500 mb-1">DIFFERENTIAL</div>
        ${diff.map((d) => `<div class="flex items-center justify-between text-sm py-1 border-b last:border-0">
          <span>${d.condition} <span class="text-xs text-slate-400">(${d.supporting_findings.join(", ")})</span></span>
          <span class="font-mono text-teal-700">${(d.confidence * 100).toFixed(0)}%</span></div>`).join("")}</div>` : ""}
      ${recs.length ? `<div><div class="text-xs font-semibold text-slate-500 mb-1">RECOMMENDATIONS</div>
        <ul class="list-disc list-inside text-sm text-slate-600">${recs.map((r) => `<li>${r}</li>`).join("")}</ul></div>` : ""}
    </div>

    <div>
      <h3 class="font-semibold mb-3">Studies (${data.studies.length})</h3>
      <div id="studies" class="grid md:grid-cols-2 gap-4"></div>
    </div>
  `;

  $("add-study-btn").addEventListener("click", () => addStudy(id));
  $("recorrelate-btn").addEventListener("click", async () => {
    await api(`/api/patients/${id}/correlate`, { method: "POST" });
    openPatient(id);
  });

  const container = $("studies");
  container.innerHTML = data.studies.map((s) => `
    <div class="card p-4" id="study-${s.id}">
      <div class="flex items-center justify-between">
        <div><span class="font-semibold uppercase text-xs bg-slate-100 rounded px-2 py-0.5">${s.modality}</span>
          <span class="ml-2 text-sm">${s.body_part || ""}</span></div>
        <span class="text-xs text-slate-400">${s.status}</span>
      </div>
      <p class="text-xs text-slate-500 mt-1">${s.description || ""}</p>
      <div class="study-detail mt-3 text-sm text-slate-400">Loading…</div>
    </div>`).join("") || `<p class="text-sm text-slate-400">No studies.</p>`;

  data.studies.forEach((s) => renderStudy(s.id));
}

async function renderStudy(studyId) {
  const el = document.querySelector(`#study-${studyId} .study-detail`);
  const d = await api(`/api/studies/${studyId}`);
  const diag = d.diagnostics[0];
  const report = d.reports[0];
  const hasImg = d.images.length > 0;

  el.innerHTML = `
    <div class="grid grid-cols-2 gap-3">
      <div>
        <img class="orig rounded-lg border w-full aspect-square object-cover bg-slate-100" alt="no image"/>
        <div class="text-[10px] text-center text-slate-400 mt-1">Original</div>
      </div>
      <div>
        <img class="heat rounded-lg border w-full aspect-square object-cover bg-slate-100" alt="run analysis"/>
        <div class="text-[10px] text-center text-slate-400 mt-1">AI attention (Grad-CAM)</div>
      </div>
    </div>
    ${diag ? `<div class="mt-3">
        <div class="text-xs text-slate-400 mb-1">${diag.model_source}</div>
        ${diag.findings.filter((f) => f.severity !== "normal").slice(0, 5).map((f) =>
          `<div class="flex justify-between items-center py-0.5"><span>${f.label}</span>
           <span>${(f.probability * 100).toFixed(0)}% ${sevBadge(f.severity)}</span></div>`).join("") ||
          `<div class="text-green-700 text-sm">No significant findings.</div>`}
      </div>
      ${report ? `<details class="mt-2"><summary class="text-xs text-teal-700 cursor-pointer">AI-draft report</summary>
        <pre class="text-xs whitespace-pre-wrap bg-slate-50 rounded p-2 mt-1">${report.body}</pre></details>` : ""}`
    : `<button class="analyze-btn mt-3 w-full bg-slate-800 hover:bg-black text-white rounded-lg py-2 text-sm" data-id="${studyId}">
         ${hasImg ? "▶ Run AI analysis" : "⚠ Upload an image first"}</button>`}
  `;

  if (hasImg) {
    loadImage(el.querySelector(".orig"), `/api/studies/${studyId}/image-file`);
    if (diag) loadImage(el.querySelector(".heat"), `/api/studies/${studyId}/image-file?heatmap=true`);
  }
  const btn = el.querySelector(".analyze-btn");
  if (btn && hasImg) btn.addEventListener("click", async () => {
    btn.textContent = "Analysing…"; btn.disabled = true;
    await api(`/api/studies/${studyId}/analyze`, { method: "POST" });
    openPatient(currentPatient); // refresh profile + correlation
  });
}

async function addStudy(patientId) {
  const modality = prompt("Modality (xray, ct, mri, fundus):", "xray");
  if (!modality) return;
  const study = await api("/api/studies", {
    method: "POST",
    body: { patient_id: Number(patientId), modality, body_part: "", description: "new study" },
  });
  // Upload an image.
  const input = document.createElement("input");
  input.type = "file"; input.accept = "image/*";
  input.onchange = async () => {
    if (input.files[0]) {
      const fd = new FormData();
      fd.append("file", input.files[0]);
      await api(`/api/studies/${study.id}/image`, { method: "POST", form: fd });
    }
    openPatient(patientId);
  };
  input.click();
}

// ---- wire up -------------------------------------------------------------
$("login-btn").addEventListener("click", login);
$("logout-btn").addEventListener("click", logout);
$("new-patient-btn").addEventListener("click", newPatient);
$("password").addEventListener("keydown", (e) => e.key === "Enter" && login());

if (token) boot().catch(() => logout());
