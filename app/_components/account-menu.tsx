"use client";

import { useEffect, useRef, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase-browser";
import { AuthCard } from "./auth-card";
import { ReminderPreferences } from "./reminder-preferences";
import { TeamProfiles } from "./team-profiles";

function initialsFor(email: string) {
  const name = email.split("@")[0] ?? "";
  return (
    name
      .split(/[._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "BP"
  );
}

export function AccountMenu() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!supabaseBrowser) {
      return;
    }

    let active = true;

    supabaseBrowser.auth.getUser().then(({ data }) => {
      if (!active) return;
      setEmail(data.user?.email ?? null);
    });

    const { data: subscription } = supabaseBrowser.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? null);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const signedIn = Boolean(email);

  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        className="button-secondary min-h-11 gap-2 px-3 text-sm"
        aria-expanded={open}
        aria-controls="account-menu-panel"
        onClick={() => setOpen((current) => !current)}
      >
        <span
          aria-hidden="true"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] bg-[var(--ink)] text-[10px] font-bold tracking-tight text-[var(--paper)]"
        >
          {signedIn && email ? initialsFor(email) : <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>}
        </span>
        <span className="max-w-[9rem] truncate">{signedIn && email ? email : "Account"}</span>
      </button>

      {open && (
        <div
          id="account-menu-panel"
          className="absolute right-0 z-50 mt-2 max-h-[min(32rem,calc(100vh-6rem))] w-[min(24rem,calc(100vw-2rem))] space-y-4 overflow-y-auto rounded-lg border border-subtle bg-[var(--page-background)] p-4 shadow-lg"
        >
          <AuthCard />
          {signedIn && (
            <>
              <TeamProfiles />
              <ReminderPreferences />
            </>
          )}
        </div>
      )}
    </div>
  );
}