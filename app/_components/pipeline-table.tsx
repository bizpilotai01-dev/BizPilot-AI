"use client";

import { useId } from "react";

import type { Lead, LeadStatus } from "@/lib/types";
import { CurrencyAmount } from "./currency-amount";
import { StatusSelect, statusLabels, statusOptions } from "./status-select";

type PipelineTableProps = {
  leads: Lead[];
  totalLeads: number;
  loading: boolean;
  error: string;
  onRetry: () => void;
  onAddLead: () => void;
  onStatusChange: (leadId: string, next: LeadStatus) => void;
  pendingLeadIds: string[];
  query: string;
  onQueryChange: (query: string) => void;
  statusFilter: LeadStatus | "all";
  onStatusFilterChange: (status: LeadStatus | "all") => void;
  onClearFilters: () => void;
};

function LeadValue({ value }: { value: number }) {
  return <span className="whitespace-nowrap font-medium"><CurrencyAmount amount={value} /></span>;
}

function LeadIdentity({ lead }: { lead: Lead }) {
  const initials = lead.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <span className="pipeline-lead-identity">
      <span className="pipeline-lead-avatar">
        {lead.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={lead.photoUrl} alt="" width={40} height={40} />
        ) : (
          <span aria-hidden="true">{initials}</span>
        )}
      </span>
      <span className="pipeline-lead-copy">
        <span className="pipeline-lead-name">{lead.name}</span>
        <span className="pipeline-lead-company">{lead.company}</span>
      </span>
    </span>
  );
}

export function PipelineTable({
  leads,
  totalLeads,
  loading,
  error,
  onRetry,
  onAddLead,
  onStatusChange,
  pendingLeadIds,
  query,
  onQueryChange,
  statusFilter,
  onStatusFilterChange,
  onClearFilters,
}: PipelineTableProps) {
  const searchId = useId();
  const statusId = useId();
  const filtersActive = query.trim().length > 0 || statusFilter !== "all";
  const filtered = filtersActive && leads.length !== totalLeads;

  return (
    <section aria-labelledby="pipeline-heading" className="min-w-0">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="pipeline-heading" className="section-heading">Pipeline overview</h2>
          <p className="mt-1 text-sm leading-relaxed text-secondary">Current opportunities and next actions</p>
        </div>
        {!loading && !error && (
          <span className="count-badge" role="status" aria-live="polite">
            {filtered ? `${leads.length} of ${totalLeads}` : totalLeads} {leads.length === 1 && !filtered ? "lead" : "leads"}
            {filtered ? " matching" : " in pipeline"}
          </span>
        )}
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <label className="form-label" htmlFor={searchId}>Search leads</label>
          <div className="relative">
            <svg
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-secondary"
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              id={searchId}
              type="search"
              className="form-control pl-9"
              placeholder="Name, company, email, owner, or next action"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              autoComplete="off"
            />
          </div>
        </div>

        <div>
          <label className="form-label" htmlFor={statusId}>Stage</label>
          <div className="status-select">
            <select
              id={statusId}
              className="status-select-input"
              value={statusFilter}
              onChange={(event) => onStatusFilterChange(event.target.value as LeadStatus | "all")}
            >
              <option value="all">All stages</option>
              {statusOptions.map((option) => (
                <option key={option} value={option}>
                  {statusLabels[option]}
                </option>
              ))}
            </select>
            <svg aria-hidden="true" className="status-select-chevron" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>
        </div>
      </div>

      {filtersActive && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-sm text-secondary">Filtering by</span>
          {query.trim().length > 0 && (
            <span className="count-badge">“{query.trim()}”</span>
          )}
          {statusFilter !== "all" && (
            <span className="count-badge">{statusLabels[statusFilter]}</span>
          )}
          <button type="button" className="button-secondary min-h-9 px-3 text-xs" onClick={onClearFilters}>
            Clear filters
          </button>
        </div>
      )}

      {error ? (
        <div className="feedback-message feedback-error" role="alert">
          <svg aria-hidden="true" className="feedback-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v5M12 16.5h.01" />
          </svg>
          <div>
            <p className="font-semibold">Pipeline data could not be loaded.</p>
            <p className="mt-0.5 opacity-90">{error}</p>
            <button type="button" className="button-secondary mt-3 min-h-11 px-4 text-sm" onClick={onRetry}>
              Try again
            </button>
          </div>
        </div>
      ) : loading ? (
        <div className="table-shell divide-y divide-[var(--border-subtle)]" role="status" aria-label="Loading pipeline">
          {[0, 1, 2].map((row) => (
            <div key={row} className="flex h-[68px] items-center gap-4 px-4">
              <span className="loading-line h-3 w-32" />
              <span className="loading-line h-3 w-20" />
              <span className="loading-line h-3 w-16" />
            </div>
          ))}
          <span className="sr-only">Loading leads...</span>
        </div>
      ) : leads.length === 0 ? (
        filtersActive ? (
          <div className="empty-state">
            <span aria-hidden="true" className="empty-state-icon">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
            </span>
            <h3 className="mt-4 font-semibold">No matching leads</h3>
            <p className="mx-auto mt-1 max-w-sm text-sm text-secondary">
              {totalLeads === 0
                ? "Add your first prospect to start tracking the pipeline."
                : "No leads match these filters. Try a different search term or stage."}
            </p>
            <div className="empty-state-actions mt-5">
              {filtersActive && (
                <button type="button" className="button-secondary min-h-11 px-4 text-sm" onClick={onClearFilters}>
                  Clear filters
                </button>
              )}
              {totalLeads === 0 && (
                <button type="button" className="button-primary min-h-11 px-4 text-sm" onClick={onAddLead}>
                  Add a lead
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="empty-state">
            <span aria-hidden="true" className="empty-state-icon">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 7h18M3 12h18M3 17h18" />
              </svg>
            </span>
            <h3 className="mt-4 font-semibold">No leads yet</h3>
            <p className="mx-auto mt-1 max-w-sm text-sm text-secondary">Add your first prospect to start tracking the pipeline.</p>
            <div className="empty-state-actions mt-5">
              <button type="button" className="button-primary min-h-11 px-4 text-sm" onClick={onAddLead}>
                Add a lead
              </button>
            </div>
          </div>
        )
      ) : (
        <>
          <div className="table-shell hidden md:block">
            <div className="table-scroll">
              <table className="pipeline-table">
                <caption className="sr-only">Sales pipeline leads, status, value, and next action</caption>
                <thead>
                  <tr>
                    <th scope="col">Lead</th>
                    <th scope="col">Status</th>
                    <th scope="col" className="text-right">Value</th>
                    <th scope="col">Next action</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead) => (
                    <tr key={lead.id}>
                      <th scope="row">
                        <LeadIdentity lead={lead} />
                      </th>
                      <td>
                        <StatusSelect
                          leadId={lead.id}
                          status={lead.status}
                          disabled={pendingLeadIds.includes(lead.id)}
                          onChange={onStatusChange}
                        />
                      </td>
                      <td className="cell-value"><LeadValue value={lead.value ?? 0} /></td>
                      <td className="cell-next">
                        <div className="flex items-center justify-between gap-2">
                          <span className="min-w-0 flex-1">{lead.nextAction || "No next action set"}</span>
                          <a href={`/lead/${lead.id}`} className="button-secondary min-h-9 px-2.5 text-xs">
                            Details
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <ul className="table-shell divide-y divide-[var(--border-subtle)] md:hidden" aria-label="Pipeline leads">
            {leads.map((lead) => (
              <li key={lead.id} className="interactive-row space-y-2 px-3 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <LeadIdentity lead={lead} />
                  </div>
                  <LeadValue value={lead.value ?? 0} />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <StatusSelect
                    leadId={lead.id}
                    status={lead.status}
                    disabled={pendingLeadIds.includes(lead.id)}
                    onChange={onStatusChange}
                  />
                  <a href={`/lead/${lead.id}`} className="button-secondary min-h-9 px-2.5 text-xs">
                    Details
                  </a>
                </div>
                <p className="min-w-0 break-words text-sm text-secondary">{lead.nextAction || "No next action set"}</p>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}