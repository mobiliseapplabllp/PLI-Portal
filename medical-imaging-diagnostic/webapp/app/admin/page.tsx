"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, UserPlus } from "lucide-react";
import Shell from "@/components/shell";
import { api, avatarColor, initials, Me, UserRow } from "@/lib/api";

const ROLES = ["admin", "doctor", "radiologist", "viewer"];

function RoleBadge({ role }: { role: string }) {
  const map: Record<string, string> = {
    admin: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300",
    doctor: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300",
    radiologist: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
    viewer: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  };
  return <span className={`badge ${map[role] || map.viewer}`}>{role}</span>;
}

export default function AdminPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = () => api<UserRow[]>("/api/auth/users").then(setUsers);
  useEffect(() => {
    api<Me>("/api/auth/me").then(setMe);
    load().finally(() => setLoading(false));
  }, []);

  const isAdmin = me?.role === "admin";

  const setRole = async (u: UserRow, role: string) => {
    setError("");
    try {
      await api(`/api/auth/users/${u.id}`, { method: "PATCH", body: { role } });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    }
  };
  const toggleActive = async (u: UserRow) => {
    setError("");
    try {
      await api(`/api/auth/users/${u.id}`, { method: "PATCH", body: { is_active: !u.is_active } });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    }
  };
  const addUser = async () => {
    const full_name = prompt("Full name:");
    if (!full_name) return;
    const email = prompt("Email:");
    if (!email) return;
    const role = prompt("Role (admin/doctor/radiologist/viewer):", "doctor") || "doctor";
    const password = prompt("Temporary password (min 6 chars):", "changeme1") || "changeme1";
    setError("");
    try {
      await api("/api/auth/users", { method: "POST", body: { full_name, email, role, password } });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    }
  };

  return (
    <Shell>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <ShieldCheck className="text-teal-600" /> Admin
          </h1>
          <p className="text-sm text-slate-500">Manage doctors, roles, and access in your organization</p>
        </div>
        {isAdmin && (
          <button className="btn" onClick={addUser}>
            <UserPlus size={16} /> Add user
          </button>
        )}
      </div>

      {!isAdmin && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
          You have read-only access. Only <b>admin</b> users can change roles or add members.
        </div>
      )}
      {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</div>}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/50">
            <tr>
              <th className="px-4 py-3 font-semibold">User</th>
              <th className="px-4 py-3 font-semibold">Specialty</th>
              <th className="px-4 py-3 font-semibold">Role</th>
              <th className="px-4 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading ? (
              [...Array(4)].map((_, i) => (
                <tr key={i}><td colSpan={4} className="px-4 py-4"><div className="h-6 animate-pulse rounded bg-slate-100 dark:bg-slate-800" /></td></tr>
              ))
            ) : (
              users.map((u) => (
                <tr key={u.id} className={u.is_active ? "" : "opacity-50"}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="grid h-9 w-9 flex-none place-items-center rounded-full text-xs font-bold text-white" style={{ background: avatarColor(u.full_name) }}>
                        {initials(u.full_name)}
                      </span>
                      <div>
                        <div className="font-semibold">{u.full_name}{me?.id === u.id && <span className="ml-1.5 text-xs font-normal text-slate-400">(you)</span>}</div>
                        <div className="text-xs text-slate-500">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{u.specialty || "—"}</td>
                  <td className="px-4 py-3">
                    {isAdmin ? (
                      <select
                        className="input w-36 py-1 text-xs"
                        value={u.role}
                        onChange={(e) => setRole(u, e.target.value)}
                      >
                        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    ) : (
                      <RoleBadge role={u.role} />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {isAdmin && me?.id !== u.id ? (
                      <button
                        onClick={() => toggleActive(u)}
                        className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${u.is_active ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300" : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300"}`}
                      >
                        {u.is_active ? "active" : "inactive"}
                      </button>
                    ) : (
                      <span className={`badge ${u.is_active ? "sev-normal" : ""}`}>{u.is_active ? "active" : "inactive"}</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
