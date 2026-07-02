"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Activity, BarChart3, Cross, LogOut, Moon, Settings2, Sun, Users,
} from "lucide-react";
import { api, initials, Me, setToken } from "@/lib/api";

export function useMe() {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    api<Me>("/api/auth/me").then(setMe).catch(() => {});
  }, []);
  return me;
}

function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("mid_theme", next ? "dark" : "light");
  };
  return (
    <button
      onClick={toggle}
      className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
      title="Toggle theme"
    >
      {dark ? <Sun size={15} /> : <Moon size={15} />}
    </button>
  );
}

const NAV = [
  { href: "/", label: "Patients", icon: Users },
  { href: "/analytics/", label: "Analytics", icon: BarChart3 },
  { href: "/admin/", label: "Admin", icon: Settings2 },
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const me = useMe();
  const pathname = usePathname();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <a href="/" className="flex items-center gap-2.5 font-bold">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-teal-600 to-teal-500 text-white shadow">
                <Cross size={16} strokeWidth={3} />
              </span>
              <span className="hidden sm:block">Diagnostic Assistant</span>
            </a>
            <nav className="flex items-center gap-1">
              {NAV.map(({ href, label, icon: Icon }) => {
                const active = pathname === href || (href !== "/" && pathname.startsWith(href));
                return (
                  <a
                    key={href}
                    href={href}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                      active
                        ? "bg-teal-50 text-teal-800 dark:bg-teal-950 dark:text-teal-300"
                        : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                    }`}
                  >
                    <Icon size={15} />
                    <span className="hidden md:block">{label}</span>
                  </a>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="/models/"
              className="hidden items-center gap-1.5 text-sm font-semibold text-teal-700 hover:underline dark:text-teal-400 sm:flex"
            >
              <Activity size={15} /> AI Models
            </a>
            <ThemeToggle />
            {me && (
              <>
                <div className="hidden text-right text-xs leading-tight sm:block">
                  <div className="font-bold">{me.full_name}</div>
                  <div className="text-slate-500">{me.role}</div>
                </div>
                <div className="grid h-8 w-8 place-items-center rounded-full border border-teal-200 bg-teal-50 text-xs font-bold text-teal-700 dark:border-teal-900 dark:bg-teal-950 dark:text-teal-300">
                  {initials(me.full_name)}
                </div>
              </>
            )}
            <button
              onClick={() => { setToken(null); window.location.href = "/login/"; }}
              className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800"
              title="Sign out"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1400px] px-4 py-5">{children}</main>
    </div>
  );
}

export function SeverityBadge({ severity }: { severity: string }) {
  return <span className={`badge sev-${severity}`}>{severity}</span>;
}
