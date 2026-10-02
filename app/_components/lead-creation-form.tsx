import { useState, type FormEvent } from "react";

import type { LeadStatus } from "@/lib/types";
import { authorizedFetch } from "@/lib/supabase-browser";

type LeadForm = {
  name: string;
  company: string;
  email: string;
  phone: string;
  status: LeadStatus;
  value: string;
  owner: string;
  nextAction: string;
};

const initialForm: LeadForm = {
  name: "",
  company: "",
  email: "",
  phone: "",
  status: "new",
  value: "",
  owner: "Fidelix",
  nextAction: "Schedule a follow-up call",
};

const statuses: LeadStatus[] = ["new", "contacted", "qualified", "proposal", "won", "lost"];

type LeadCreationFormProps = {
  onCreated: () => Promise<void>;
  inputRef: (node: HTMLInputElement | null) => void;
};

export function LeadCreationForm({ onCreated, inputRef }: LeadCreationFormProps) {
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function updateField<K extends keyof LeadForm>(field: K, value: LeadForm[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const response = await authorizedFetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          value: Number(form.value || 0),
          tags: [form.status, "new"],
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "We could not save this lead.");
      }

      setSuccess(
        payload.warning
          ? `${payload.item.name} was added to the pipeline. ${payload.warning}`
          : `${payload.item.name} was added to the pipeline.`,
      );
      setForm(initialForm);
      await onCreated();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "We could not save this lead.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section id="lead-form" aria-labelledby="lead-form-heading" className="module-surface">
      <h2 id="lead-form-heading" className="section-heading">Add a lead</h2>
      <p className="mt-1 text-sm leading-relaxed text-secondary">Record a prospect and its next step.</p>
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <fieldset className="field-group">
          <legend className="field-legend">Who they are</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="form-label" htmlFor="lead-name">Lead name</label>
              <input ref={inputRef} id="lead-name" className="form-control" autoComplete="name" value={form.name} onChange={(event) => updateField("name", event.target.value)} required />
            </div>
            <div>
              <label className="form-label" htmlFor="lead-company">Company</label>
              <input id="lead-company" className="form-control" autoComplete="organization" value={form.company} onChange={(event) => updateField("company", event.target.value)} required />
            </div>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="form-label" htmlFor="lead-email">Email</label>
              <input id="lead-email" className="form-control" type="email" autoComplete="email" value={form.email} onChange={(event) => updateField("email", event.target.value)} required />
            </div>
            <div>
              <label className="form-label" htmlFor="lead-phone">Phone <span className="text-muted">(optional)</span></label>
              <input id="lead-phone" className="form-control" type="tel" autoComplete="tel" value={form.phone} onChange={(event) => updateField("phone", event.target.value)} />
            </div>
          </div>
        </fieldset>

        <fieldset className="field-group">
          <legend className="field-legend">Pipeline position</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="form-label" htmlFor="lead-status">Status</label>
              <select id="lead-status" className="form-control" value={form.status} onChange={(event) => updateField("status", event.target.value as LeadStatus)}>
                {statuses.map((status) => <option key={status} value={status}>{status[0].toUpperCase() + status.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label" htmlFor="lead-value">Value <span className="text-muted">(NGN)</span></label>
              <input id="lead-value" className="form-control" type="number" min="0" step="1000" inputMode="numeric" placeholder="0" value={form.value} onChange={(event) => updateField("value", event.target.value)} />
            </div>
          </div>
        </fieldset>

        <fieldset className="field-group">
          <legend className="field-legend">Ownership and next step</legend>
          <div>
            <label className="form-label" htmlFor="lead-owner">Assigned owner</label>
            <input id="lead-owner" className="form-control" autoComplete="name" value={form.owner} onChange={(event) => updateField("owner", event.target.value)} required />
          </div>
          <div className="mt-3">
            <label className="form-label" htmlFor="lead-next-action">Next action</label>
            <input id="lead-next-action" className="form-control" value={form.nextAction} onChange={(event) => updateField("nextAction", event.target.value)} required />
          </div>
        </fieldset>
        {error && (
          <p className="feedback-message feedback-error" role="alert">
            <svg aria-hidden="true" className="feedback-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v5M12 16.5h.01" />
            </svg>
            <span>{error}</span>
          </p>
        )}
        {success && (
          <p className="feedback-message feedback-success" role="status">
            <svg aria-hidden="true" className="feedback-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M8.5 12.5l2.5 2.5 4.5-5" />
            </svg>
            <span>{success}</span>
          </p>
        )}
        <button type="submit" className="button-primary min-h-11 w-full px-4 text-sm" disabled={submitting}>
          {submitting ? "Saving lead..." : "Create lead"}
        </button>
      </form>
    </section>
  );
}
