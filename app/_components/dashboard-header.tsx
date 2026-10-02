import type { ThemeMode } from "./theme-types";
import Link from "next/link";

export type { ThemeMode } from "./theme-types";

import type { ReactNode } from "react";

type DashboardHeaderProps = {
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
  onAddLead: () => void;
  accountMenu: ReactNode;
};

export function DashboardHeader({ theme, onThemeChange, onAddLead, accountMenu }: DashboardHeaderProps) {
  return (
    <header className="border-b border-subtle">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-4 px-4 py-4 sm:px-6 lg:min-h-[88px] lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex w-16 shrink-0 flex-col items-center gap-1.5">
            <span aria-hidden="true" className="brand-mark flex h-12 w-12 items-center justify-center rounded-[14px] text-[15px] font-bold tracking-tight">
              BP
            </span>
            <span className="text-[11px] font-semibold leading-none tracking-tight">Biz Pilot</span>
          </div>
          <div className="min-w-0 border-l border-subtle pl-4">
            <h1 className="text-xl font-semibold leading-tight tracking-tight sm:text-[26px]">Business Operations Dashboard</h1>
            <p className="mt-1 text-[13px] leading-snug text-secondary">Track leads, pipeline value, and follow-ups in one place.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 sm:justify-end">
          <Link href="/reports" className="button-secondary min-h-11 px-4 text-sm">Reports</Link>
          {accountMenu}
          <button
            type="button"
            className="theme-toggle"
            role="switch"
            aria-checked={theme === "dark"}
            aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            onClick={() => onThemeChange(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? (
              <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
              </svg>
            ) : (
              <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
              </svg>
            )}
          </button>
          <button type="button" className="button-primary min-h-11 gap-2 px-4 text-sm" onClick={onAddLead}>
            <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add new lead
          </button>
        </div>
      </div>
    </header>
  );
}
