"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Activity, BarChart3, ChevronLeft, Cross, LogOut, Menu, Moon, Ribbon,
  Search, Settings2, Sun, Users, X,
} from "lucide-react";
import { api, initials, Me, setToken } from "@/lib/api";
import SearchPalette from "@/components/search-palette";

export function useMe() {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    api<Me>("/api/auth/me").then(setMe).catch(() => {});
  }, []);
  return me;
}

function ThemeToggle({ collapsed }: { collapsed?: boolean }) {
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
      title="Toggle theme"
      className={`flex items-center gap-2 rounded-lg border border-slate-200 py-2 text-sm text-slate-500 transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800 ${collapsed ? "justify-center px-2" : "w-full px-3"}`}
    >
      {dark ? <Sun size={15} /> : <Moon size={15} />}
      {!collapsed && <span>{dark ? "Light mode" : "Dark mode"}</span>}
    </button>
  );
}

const NAV = [
  {
    section: "Clinical",
    items: [
      { href: "/", label: "Patients", icon: Users },
      { href: "/screening/", label: "Cancer Screening", icon: Ribbon, badge: true },
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

const isActive = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" : pathname.startsWith(href);

export default function Shell({ children }: { children: React.ReactNode }) {
  const me = useMe();
  const pathname = usePathname();
  const [open, setOpen] = useState(false); // mobile drawer
  const [collapsed, setCollapsed] = useState(false);
  const [search, setSearch] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem("mid_sidebar") === "collapsed");
  }, []);
  const toggleCollapse = () => {
    setCollapsed((c) => {
      localStorage.setItem("mid_sidebar", !c ? "collapsed" : "expanded");
      return !c;
    });
  };

  // ⌘K / Ctrl+K opens global search
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearch(true);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const w = collapsed ? "w-16" : "w-64";

  const Sidebar = (
    <div className={`flex h-full ${w} flex-col border-r border-slate-200 bg-white transition-all dark:border-slate-800 dark:bg-slate-900`}>
      <div className={`flex h-16 items-center ${collapsed ? "justify-center" : "justify-between px-4"}`}>
        <a href="/" className="flex items-center gap-2.5 font-bold">
          <span className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-gradient-to-br from-teal-600 to-teal-500 text-white shadow">
            <Cross size={17} strokeWidth={3} />
          </span>
          {!collapsed && (
            <span className="leading-tight">
              Diagnostic<br /><span className="text-xs font-medium text-slate-400">Assistant</span>
            </span>
          )}
        </a>
        {!collapsed && (
          <button onClick={() => { toggleCollapse(); setOpen(false); }} className="hidden text-slate-400 hover:text-slate-600 md:block" title="Collapse">
            <ChevronLeft size={18} />
          </button>
        )}
        <button onClick={() => setOpen(false)} className="text-slate-400 md:hidden"><X size={20} /></button>
      </div>

      {/* Search trigger */}
      <div className="px-2 pb-2">
        <button
          onClick={() => setSearch(true)}
          title="Search (⌘K)"
          className={`flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 py-2 text-sm text-slate-400 transition hover:border-teal-400 dark:border-slate-700 dark:bg-slate-800/60 ${collapsed ? "w-full justify-center px-2" : "w-full px-3"}`}
        >
          <Search size={15} />
          {!collapsed && (
            <>
              <span>Search…</span>
              <kbd className="ml-auto rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 shadow-sm dark:bg-slate-700">⌘K</kbd>
            </>
          )}
        </button>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-2 py-2">
        {NAV.map((group) => (
          <div key={group.section}>
            {!collapsed && (
              <div className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">{group.section}</div>
            )}
            <div className="space-y-0.5">
              {group.items.map(({ href, label, icon: Icon, badge }) => {
                const active = isActive(pathname, href);
                return (
                  <a
                    key={href}
                    href={href}
                    onClick={() => setOpen(false)}
                    title={collapsed ? label : undefined}
                    className={`relative flex items-center gap-3 rounded-lg py-2 text-sm font-medium transition ${collapsed ? "justify-center px-2" : "px-3"} ${
                      active
                        ? "bg-teal-50 text-teal-800 dark:bg-teal-950/70 dark:text-teal-300"
                        : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                    }`}
                  >
                    <Icon size={17} className={active ? "text-teal-600 dark:text-teal-400" : ""} />
                    {!collapsed && label}
                    {badge && (
                      <span className={`grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ${collapsed ? "absolute right-1 top-1" : "ml-auto"}`}>!</span>
                    )}
                  </a>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className={`space-y-2 border-t border-slate-200 p-2 dark:border-slate-800`}>
        {collapsed && (
          <button onClick={toggleCollapse} className="hidden w-full justify-center rounded-lg py-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 md:flex" title="Expand">
            <ChevronLeft size={18} className="rotate-180" />
          </button>
        )}
        <ThemeToggle collapsed={collapsed} />
        {me && (
          <div className={`flex items-center gap-2.5 rounded-lg py-1.5 ${collapsed ? "justify-center" : "px-2"}`}>
            <div className="grid h-9 w-9 flex-none place-items-center rounded-full border border-teal-200 bg-teal-50 text-xs font-bold text-teal-700 dark:border-teal-900 dark:bg-teal-950 dark:text-teal-300" title={me.full_name}>
              {initials(me.full_name)}
            </div>
            {!collapsed && (
              <>
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="truncate text-sm font-semibold">{me.full_name}</div>
                  <div className="truncate text-xs capitalize text-slate-500">{me.role}</div>
                </div>
                <button
                  onClick={() => { setToken(null); window.location.href = "/login/"; }}
                  className="flex-none rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-red-500 dark:hover:bg-slate-800"
                  title="Sign out"
                >
                  <LogOut size={16} />
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen md:flex">
      <aside className="sticky top-0 hidden h-screen flex-none md:block">{Sidebar}</aside>

      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-0 h-full">{Sidebar}</div>
        </div>
      )}

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90 md:hidden">
          <button onClick={() => setOpen(true)} className="text-slate-600 dark:text-slate-300"><Menu size={22} /></button>
          <span className="flex items-center gap-2 font-bold">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-teal-600 text-white"><Cross size={14} strokeWidth={3} /></span>
            Diagnostic Assistant
          </span>
          <button onClick={() => setSearch(true)} className="ml-auto text-slate-500"><Search size={18} /></button>
        </header>

        <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">{children}</main>
      </div>

      {search && <SearchPalette onClose={() => setSearch(false)} />}
    </div>
  );
}

export function SeverityBadge({ severity }: { severity: string }) {
  return <span className={`badge sev-${severity}`}>{severity}</span>;
}
