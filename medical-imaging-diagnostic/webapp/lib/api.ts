// API client — same-origin by default (backend serves the built app);
// override with NEXT_PUBLIC_API_URL when running `next dev` separately.
export const API_BASE =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_API_URL) || "";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("mid_token");
}
export function setToken(t: string | null) {
  if (t) localStorage.setItem("mid_token", t);
  else localStorage.removeItem("mid_token");
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; form?: FormData } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  let payload: BodyInit | undefined = opts.form;
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(opts.body);
  }
  const res = await fetch(API_BASE + path, {
    method: opts.method || "GET",
    headers,
    body: payload,
  });
  if (res.status === 401) {
    setToken(null);
    if (typeof window !== "undefined") window.location.href = "/login/";
    throw new ApiError(401, "unauthorized");
  }
  if (!res.ok) {
    const detail = await res
      .json()
      .then((d) => (typeof d.detail === "string" ? d.detail : res.statusText))
      .catch(() => res.statusText);
    throw new ApiError(res.status, detail);
  }
  return res.status === 204 ? (null as T) : res.json();
}

export async function apiBlob(path: string): Promise<Blob> {
  const token = getToken();
  const res = await fetch(API_BASE + path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new ApiError(res.status, res.statusText);
  return res.blob();
}

export async function login(email: string, password: string) {
  const form = new URLSearchParams();
  form.set("username", email);
  form.set("password", password);
  const res = await fetch(API_BASE + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  if (!res.ok) throw new ApiError(res.status, "Invalid email or password");
  const data = await res.json();
  setToken(data.access_token);
  return data;
}

// ---- types (mirror backend models) ----
export interface Patient {
  id: number; mrn: string; full_name: string;
  sex?: string | null; date_of_birth?: string | null; notes?: string | null;
}
export interface Study {
  id: number; patient_id: number; modality: string; body_part?: string | null;
  description?: string | null; status: string; acquired_at?: string;
}
export interface Finding { label: string; probability: number; severity: string }
export interface Diagnostic {
  id: number; engine: string; model_source: string; findings: Finding[];
  top_finding?: string | null; max_severity: string; heatmap_path?: string | null;
}
export interface ReportRow {
  id: number; impression: string; body: string; is_ai_draft: boolean; signed: boolean;
  structured_json?: string; assessment_category?: string | null;
}
export interface StructuredReport {
  impression: string[];
  recommendations: string[];
  assessment: { category: string; system: string; meaning: string; onco_flag: boolean } | null;
  findings: { id: number; label: string; system: string; anatomy: string; oncologic: boolean }[];
}
export interface Correlation {
  id: number; summary: string; differential_json: string;
  recommendations_json: string; max_severity: string;
}
export interface UserRow {
  id: number; email: string; full_name: string; role: string;
  specialty?: string | null; is_active: boolean;
}
export interface Me extends UserRow { org_id: number }

export function ageFrom(dob?: string | null): string {
  if (!dob) return "—";
  const d = new Date(dob);
  if (isNaN(d.getTime())) return "—";
  const t = new Date();
  let a = t.getFullYear() - d.getFullYear();
  const m = t.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < d.getDate())) a--;
  return `${a} y`;
}
export const initials = (name: string) =>
  name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

const AV = ["#0d9488", "#4f46e5", "#db2777", "#ea580c", "#0891b2", "#7c3aed", "#059669"];
export const avatarColor = (name: string) =>
  AV[Array.from(name).reduce((a, c) => a + c.charCodeAt(0), 0) % AV.length];
