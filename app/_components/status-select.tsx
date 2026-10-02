"use client";

import type { LeadStatus } from "@/lib/types";

const statusOptions: LeadStatus[] = ["new", "contacted", "qualified", "proposal", "won", "lost"];

export const statusLabels: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  proposal: "Proposal",
  won: "Won",
  lost: "Lost",
};

type StatusSelectProps = {
  leadId: string;
  status: LeadStatus;
  disabled?: boolean;
  onChange: (leadId: string, next: LeadStatus) => void;
};

export function StatusSelect({ leadId, status, disabled = false, onChange }: StatusSelectProps) {
  return (
    <div className="status-select">
      <select
        className={`status-select-input status-${status}`}
        value={status}
        disabled={disabled}
        aria-label={`Status for this lead`}
        onChange={(event) => onChange(leadId, event.target.value as LeadStatus)}
      >
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
  );
}