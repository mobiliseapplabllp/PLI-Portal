"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Activity, BarChart3, Cross, LogOut, Menu, Moon, Ribbon,
  Settings2, Sun, Users, X,
} from "lucide-react";
import { api, initials, Me, setToken } from "@/lib/api";

export function useMe() {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    api<Me>("/api/auth/me").then(setMe).catch(() => {});
  }, []);
  return me;
}

function ThemeToggle({ full }: { full?: boolean }) {
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
      className={`flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-500 transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800 ${full ? "w-full" : ""}`}
      title="Toggle theme"
    >
      {dark ? <Sun size={15} /> : <Moon size={15} />}
      {full && <span>{dark ? "Light mode" : "Dark mode"}</span>}
    </button>
  );
}

const NAV = [
  {
    section: "Clinical",
    items: [
      { href: "/", label: "Patients", icon: Users },
      { href: "/screening/", label: "Cancer Screening", icon: Ribbon },
    ],
  },
  {
    section: "Insights",
    items: [
      { href: "/analytics/", label: "Analytics", icon: BarChart3 },
      { href: "/models/", label: "AI Models", icon: Activity },
    ],
  },
  {
    section: "Administration",
    items: [{ href: "/admin/", label: "Admin & Users", icon: Settings2 }],
  },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const me = useMe();
  const pathname = usePathname();
  const [open, setOpen] = useState(false); // mobile drawer

  const Sidebar = (
    <div className="flex h-full w-64 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="flex h-16 items-center justify-between px-5">
        <a href="/" className="flex items-center gap-2.5 font-bold">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-teal-600 to-teal-500 text-white shadow">
            <Cross size={17} strokeWidth={3} />
          </span>
          <span className="leading-tight">
            Diagnostic<br /><span className="text-xs font-medium text-slate-400">Assistant</span>
          </span>
        </a>
        <button onClick={() => setOpen(false)} className="text-slate-400 md:hidden">
          <X size={20} />
        </button>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
        {NAV.map((group) => (
          <div key={group.section}>
            <div className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {group.section}
            </div>
            <div className="space-y-0.5">
              {group.items.map(({ href, label, icon: Icon }) => {
                const active = isActive(pathname, href);
                return (
                  <a
                    key={href}
                    href={href}
                    onClick={() => setOpen(false)}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                      active
                        ? "bg-teal-50 text-teal-800 dark:bg-teal-950/70 dark:text-teal-300"
                        : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                    }`}
                  >
                    <Icon size={17} className={active ? "text-teal-600 dark:text-teal-400" : ""} />
                    {label}
                    {href === "/screening/" && (
                      <span className="ml-auto grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                        !
                      </span>
                    )}
                  </a>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="space-y-3 border-t border-slate-200 p-3 dark:border-slate-800">
        <ThemeToggle full />
        {me && (
          <div className="flex items-center gap-3 rounded-lg px-2 py-1.5">
            <div className="grid h-9 w-9 flex-none place-items-center rounded-full border border-teal-200 bg-teal-50 text-xs font-bold text-teal-700 dark:border-teal-900 dark:bg-teal-950 dark:text-teal-300">
              {initials(me.full_name)}
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-sm font-semibold">{me.full_name}</div>
              <div className="truncate text-xs text-slate-500 capitalize">{me.role}</div>
            </div>
            <button
              onClick={() => { setToken(null); window.location.href = "/login/"; }}
              className="flex-none rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-red-500 dark:hover:bg-slate-800"
              title="Sign out"
            >
              <LogOut size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen md:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen flex-none md:block">{Sidebar}</aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-0 h-full">{Sidebar}</div>
        </div>
      )}

      <div className="min-w-0 flex-1">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90 md:hidden">
          <button onClick={() => setOpen(true)} className="text-slate-600 dark:text-slate-300">
            <Menu size={22} />
          </button>
          <span className="flex items-center gap-2 font-bold">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-teal-600 text-white">
              <Cross size={14} strokeWidth={3} />
            </span>
            Diagnostic Assistant
          </span>
        </header>

        <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}

export function SeverityBadge({ severity }: { severity: string }) {
  return <span className={`badge sev-${severity}`}>{severity}</span>;
}
