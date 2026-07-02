"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Stethoscope } from "lucide-react";
import Shell from "@/components/shell";
import { ageFrom, api, avatarColor, initials, Patient } from "@/lib/api";

export default function PatientsPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Not logged in → go to login.
    if (typeof window !== "undefined" && !localStorage.getItem("mid_token")) {
      window.location.href = "/login/";
      return;
    }
    api<Patient[]>("/api/patients")
      .then(setPatients)
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const s = q.toLowerCase();
    return patients.filter(
      (p) => p.full_name.toLowerCase().includes(s) || (p.mrn || "").toLowerCase().includes(s),
    );
  }, [patients, q]);

  const addPatient = async () => {
    const full_name = prompt("Patient full name:");
    if (!full_name) return;
    const mrn = prompt("MRN:", "MRN-" + Math.floor(Math.random() * 9000 + 1000)) || "";
    const created = await api<Patient>("/api/patients", {
      method: "POST",
      body: { full_name, mrn, sex: "", date_of_birth: "" },
    });
    setPatients((p) => [created, ...p]);
  };

  return (
    <Shell>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Patients</h1>
          <p className="text-sm text-slate-500">{patients.length} in your organization</p>
        </div>
        <button className="btn" onClick={addPatient}>
          <Plus size={16} /> New patient
        </button>
      </div>

      <div className="relative mb-4 max-w-md">
        <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
        <input
          className="input pl-9"
          placeholder="Search by name or MRN…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="card h-20 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card grid place-items-center gap-2 py-20 text-slate-400">
          <Stethoscope size={36} />
          <p>No patients found.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <a
              key={p.id}
              href={`/patient/?id=${p.id}`}
              className="card flex items-center gap-3 p-4 transition hover:-translate-y-0.5 hover:border-teal-400 hover:shadow-lg"
            >
              <span
                className="grid h-11 w-11 flex-none place-items-center rounded-full text-sm font-bold text-white"
                style={{ background: avatarColor(p.full_name) }}
              >
                {initials(p.full_name)}
              </span>
              <div className="min-w-0">
                <div className="truncate font-semibold">{p.full_name}</div>
                <div className="truncate text-xs text-slate-500">
                  MRN {p.mrn} · {p.sex || "?"} · {ageFrom(p.date_of_birth)}
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </Shell>
  );
}
