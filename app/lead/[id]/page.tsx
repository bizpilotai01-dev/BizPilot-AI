"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";

import { LeadDetailCard } from "@/app/_components/lead-detail-card";
import { authorizedFetch } from "@/lib/supabase-browser";
import type { Lead } from "@/lib/types";

export default function LeadPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [lead, setLead] = useState<Lead | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    authorizedFetch(`/api/leads/${encodeURIComponent(id)}`)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error ?? "Lead could not be loaded.");
        }
        if (active) setLead(payload.item as Lead);
      })
      .catch((requestError: unknown) => {
        if (active) setError(requestError instanceof Error ? requestError.message : "Lead could not be loaded.");
      });

    return () => {
      active = false;
    };
  }, [id]);

  return (
    <div className="app-shell min-h-screen">
      <main className="mx-auto max-w-[1180px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {lead ? (
          <LeadDetailCard initialLead={lead} />
        ) : error ? (
          <section className="module-surface mx-auto max-w-[760px]" role="alert">
            <p className="feedback-message feedback-error">{error}</p>
            <Link href="/" className="button-secondary mt-4 min-h-11 px-4 text-sm">Back to dashboard</Link>
          </section>
        ) : (
          <div className="mx-auto max-w-[760px]">
            <p className="text-secondary" role="status">Loading lead...</p>
          </div>
        )}
      </main>
    </div>
  );
}
