"use client";

import { useState } from "react";
import { Cross, Loader2 } from "lucide-react";
import { login } from "@/lib/api";

export default function LoginPage() {
  const [email, setEmail] = useState("admin@city-general.demo");
  const [password, setPassword] = useState("demo1234");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await login(email, password);
      window.location.href = "/";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-[radial-gradient(1100px_600px_at_15%_-10%,#ccfbf1_0%,transparent_55%),radial-gradient(900px_500px_at_110%_10%,#dbeafe_0%,transparent_50%)] p-4 dark:bg-[radial-gradient(1100px_600px_at_15%_-10%,#042f2e_0%,transparent_55%),radial-gradient(900px_500px_at_110%_10%,#172554_0%,transparent_50%)]">
      <div className="card w-full max-w-sm p-8">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-teal-600 to-teal-500 text-white shadow-lg shadow-teal-600/30">
            <Cross size={20} strokeWidth={3} />
          </span>
          <div>
            <h1 className="text-lg font-bold">Diagnostic Assistant</h1>
            <p className="text-xs text-slate-500">Multi-tenant AI for clinical imaging</p>
          </div>
        </div>

        <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">
          Email
        </label>
        <input className="input mb-3" value={email} onChange={(e) => setEmail(e.target.value)} />
        <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">
          Password
        </label>
        <input
          className="input mb-5"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        <button className="btn w-full" onClick={submit} disabled={busy}>
          {busy && <Loader2 size={15} className="animate-spin" />} Sign in
        </button>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <p className="mt-5 text-[11px] leading-relaxed text-slate-400">
          Demo accounts · <code>admin@city-general.demo</code> ·{" "}
          <code>admin@sunrise-dx.demo</code> — password <code>demo1234</code>
        </p>
      </div>
    </div>
  );
}
