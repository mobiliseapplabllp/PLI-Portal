"use client";

import { useEffect, useState } from "react";
import { Boxes, Cpu } from "lucide-react";
import Shell from "@/components/shell";
import { api } from "@/lib/api";

interface Capability { engine: string; modality: string; description: string }
interface Engines { engine_mode: string; supported_modalities: string[]; capabilities: Capability[] }

const ICON: Record<string, string> = {
  cxr: "🫁", retinal: "👁", segmentation: "🧩", report: "📝", correlation: "🧠",
};

export default function ModelsPage() {
  const [data, setData] = useState<Engines | null>(null);
  useEffect(() => {
    api<Engines>("/api/engines").then(setData);
  }, []);

  return (
    <Shell>
      <div className="mb-5 flex items-center gap-2">
        <Cpu className="text-teal-600" />
        <h1 className="text-2xl font-bold">AI Models & Capabilities</h1>
      </div>

      {!data ? (
        <div className="card h-64 animate-pulse" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="card p-5 lg:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-bold">Diagnostic engines</h2>
              <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-bold text-teal-700 dark:bg-teal-950 dark:text-teal-300">
                mode: {data.engine_mode}
              </span>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.capabilities.map((c) => (
                <div key={c.engine} className="flex gap-3 py-3">
                  <div className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-teal-50 text-lg dark:bg-teal-950">
                    {ICON[c.engine] || "⚙️"}
                  </div>
                  <div>
                    <div className="font-semibold">
                      {c.engine} <span className="text-xs font-normal text-slate-400">· {c.modality}</span>
                    </div>
                    <div className="text-sm text-slate-500">{c.description}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="card p-5">
              <div className="mb-2 flex items-center gap-2 font-bold">
                <Boxes size={18} className="text-teal-600" /> Supported modalities
              </div>
              <div className="flex flex-wrap gap-2">
                {data.supported_modalities.map((m) => (
                  <span key={m} className="chip-soft">{m}</span>
                ))}
              </div>
            </div>
            <div className="card p-5 text-sm text-slate-600 dark:text-slate-300">
              <h3 className="mb-2 font-bold">Plug in real models</h3>
              <ul className="list-inside list-disc space-y-1.5 text-[13px]">
                <li>Chest X-ray: set <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">AI_ENGINE_MODE=real</code> → TorchXRayVision (18 pathologies).</li>
                <li>CT / MRI: <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">AI_ENGINE_MODE=monai</code> + the MONAI Label service → real segmentation.</li>
                <li>MedSAM / RETFound plug in behind the same engine contract.</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}
