"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { CurrencyAmount } from "@/app/_components/currency-amount";
import { authorizedFetch } from "@/lib/supabase-browser";

type ReportData = {
  range: string;
  summary: {
    totalLeads: number;
    newLeadsThisWeek: number;
    openPipelineValue: number;
    wonValue: number;
    wonCount: number;
    conversionRate: number;
    openTasks: number;
    completedTasks: number;
  };
  stages: Array<{ status: string; count: number; value: number }>;
};

export default function ReportsPage() {
  const [range, setRange] = useState("all");
  const [report, setReport] = useState<ReportData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    authorizedFetch(`/api/reports?range=${range}`)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Reports could not be loaded.");
        if (active) setReport(payload as ReportData);
      })
      .catch((requestError: unknown) => {
        if (active) setError(requestError instanceof Error ? requestError.message : "Reports could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [range]);

  const metrics = report
    ? [
        { label: "Leads in period", value: report.summary.totalLeads },
        { label: "New this week", value: report.summary.newLeadsThisWeek },
        { label: "Open pipeline", value: <CurrencyAmount amount={report.summary.openPipelineValue} /> },
        { label: "Won value", value: <CurrencyAmount amount={report.summary.wonValue} /> },
        { label: "Won deals", value: report.summary.wonCount },
        { label: "Conversion", value: `${report.summary.conversionRate}%` },
        { label: "Open follow-ups", value: report.summary.openTasks },
      ]
    : [];

  return (
    <div className="app-shell min-h-screen">
      <main className="mx-auto max-w-[1180px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <nav aria-label="Breadcrumb" className="mb-5 flex items-center gap-2 text-sm text-secondary">
          <Link href="/" className="font-medium text-primary hover:underline">Dashboard</Link>
          <span aria-hidden="true">/</span>
          <span>Sales reports</span>
        </nav>
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="lead-eyebrow">Performance</p>
            <h1 className="text-3xl font-semibold tracking-tight">Sales reports</h1>
            <p className="mt-1 text-secondary">A clear view of pipeline health and follow-up activity.</p>
          </div>
          <div>
            <label className="form-label" htmlFor="report-range">Reporting period</label>
            <select id="report-range" className="form-control min-w-44" value={range} onChange={(event) => { setError(""); setRange(event.target.value); }}>
              <option value="all">All time</option>
              <option value="90">Last 90 days</option>
              <option value="30">Last 30 days</option>
            </select>
          </div>
        </div>

        {error ? (
          <p className="feedback-message feedback-error" role="alert">{error}</p>
        ) : loading || !report ? (
          <p className="text-secondary" role="status">Loading sales reports...</p>
        ) : (
          <>
            <section aria-label="Sales performance summary" className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {metrics.map((metric) => (
                <article className="module-surface min-w-0" key={metric.label}>
                  <p className="text-xs font-medium text-secondary">{metric.label}</p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums">{metric.value}</p>
                </article>
              ))}
            </section>

            <section aria-labelledby="stage-report-heading" className="module-surface">
              <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 id="stage-report-heading" className="section-heading">Pipeline by stage</h2>
                  <p className="mt-1 text-sm text-secondary">Lead count and opportunity value at each stage.</p>
                </div>
                <p className="text-xs text-secondary">{report.summary.completedTasks} follow-ups completed</p>
              </div>
              <div className="space-y-5">
                {report.stages.map((stage) => {
                  const maxCount = Math.max(...report.stages.map((item) => item.count), 1);
                  return (
                    <div key={stage.status} className="report-stage">
                      <div className="flex min-w-0 items-center justify-between gap-3">
                        <span className="font-medium capitalize">{stage.status}</span>
                        <span className="shrink-0 text-sm text-secondary">{stage.count} {stage.count === 1 ? "lead" : "leads"} · <CurrencyAmount amount={stage.value} /></span>
                      </div>
                      <div className="report-bar-track" aria-hidden="true">
                        <div className="report-bar-fill" style={{ width: `${(stage.count / maxCount) * 100}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
