"use client";

import Image from "next/image";
import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";

import type { Lead, LeadNote, LeadStatus } from "@/lib/types";
import { authorizedFetch } from "@/lib/supabase-browser";

const allowedStatuses: LeadStatus[] = ["new", "contacted", "qualified", "proposal", "won", "lost"];
const currencyFormatter = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Not recorded"
    : new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(date);
}

type LeadDetailCardProps = {
  initialLead: Lead;
};

export function LeadDetailCard({ initialLead }: LeadDetailCardProps) {
  const [lead, setLead] = useState<Lead>(initialLead);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [notes, setNotes] = useState<LeadNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(true);
  const [notesError, setNotesError] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteSuccess, setNoteSuccess] = useState("");
  const [photoSaving, setPhotoSaving] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [photoStatus, setPhotoStatus] = useState("");

  useEffect(() => {
    let active = true;

    async function loadNotes() {
      setNotesLoading(true);
      setNotesError("");

      try {
        const response = await authorizedFetch(`/api/leads/${encodeURIComponent(initialLead.id)}/notes`);
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error ?? "Lead notes could not be loaded.");
        }
        if (!Array.isArray(payload.items)) {
          throw new Error("The notes response was not in the expected format.");
        }
        if (active) setNotes(payload.items as LeadNote[]);
      } catch (requestError) {
        if (active) {
          setNotesError(requestError instanceof Error ? requestError.message : "Lead notes could not be loaded.");
        }
      } finally {
        if (active) setNotesLoading(false);
      }
    }

    void loadNotes();
    return () => {
      active = false;
    };
  }, [initialLead.id]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const response = await authorizedFetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: lead.name,
          status: lead.status,
          owner: lead.owner,
          nextAction: lead.nextAction,
          value: lead.value,
          company: lead.company,
          email: lead.email,
          phone: lead.phone,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "The lead could not be saved.");
      }

      setLead((current) => ({ ...current, ...payload.item, photoUrl: current.photoUrl }));
      setSuccess(
        payload.warning
          ? `${lead.name} was updated. ${payload.warning}`
          : `${lead.name} was updated successfully.`,
      );
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The lead could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function handleNoteSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = noteContent.trim();
    if (!content) {
      setNotesError("Write a note before saving.");
      return;
    }

    setNoteSaving(true);
    setNotesError("");
    setNoteSuccess("");

    try {
      const response = await authorizedFetch(`/api/leads/${encodeURIComponent(lead.id)}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "The note could not be saved.");
      }
      if (!payload.item) {
        throw new Error("The saved note was missing from the server response.");
      }

      setNotes((current) => [payload.item as LeadNote, ...current]);
      setNoteContent("");
      setNoteSuccess(
        payload.warning
          ? `Note saved. ${payload.warning}`
          : "Note added to this lead’s history.",
      );
    } catch (requestError) {
      setNotesError(requestError instanceof Error ? requestError.message : "The note could not be saved.");
    } finally {
      setNoteSaving(false);
    }
  }

  async function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;

    setPhotoError("");
    setPhotoStatus("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setPhotoError("Choose a JPG, PNG, or WebP image.");
      return;
    }
    if (file.size === 0 || file.size > 3 * 1024 * 1024) {
      setPhotoError("Choose an image smaller than 3 MB.");
      return;
    }

    setPhotoSaving(true);
    try {
      const formData = new FormData();
      formData.set("photo", file);
      const response = await authorizedFetch(`/api/leads/${encodeURIComponent(lead.id)}/photo`, {
        method: "POST",
        body: formData,
      });
      const payload = await response.json();
      if (!response.ok || typeof payload.photoUrl !== "string") {
        throw new Error(payload.error ?? "The profile photo could not be saved.");
      }
      setLead((current) => ({ ...current, photoUrl: payload.photoUrl }));
      setPhotoStatus(payload.warning ?? "Profile photo updated.");
    } catch (requestError) {
      setPhotoError(requestError instanceof Error ? requestError.message : "The profile photo could not be saved.");
    } finally {
      setPhotoSaving(false);
    }
  }

  async function handlePhotoRemove() {
    setPhotoSaving(true);
    setPhotoError("");
    setPhotoStatus("");
    try {
      const response = await authorizedFetch(`/api/leads/${encodeURIComponent(lead.id)}/photo`, {
        method: "DELETE",
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "The profile photo could not be removed.");
      }
      setLead((current) => ({ ...current, photoUrl: null }));
      setPhotoStatus(payload.warning ?? "Profile photo removed.");
    } catch (requestError) {
      setPhotoError(requestError instanceof Error ? requestError.message : "The profile photo could not be removed.");
    } finally {
      setPhotoSaving(false);
    }
  }

  return (
    <div className="lead-detail-layout">
      <nav className="lead-breadcrumb" aria-label="Breadcrumb">
        <Link href="/" className="lead-back-link">
          <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
          Pipeline
        </Link>
        <span aria-hidden="true">/</span>
        <span>Lead profile</span>
      </nav>

      <header className="lead-profile-header">
        <div className="lead-profile-identity">
          <div className="lead-photo-control">
            <span className="lead-profile-avatar">
              {lead.photoUrl ? (
                <Image src={lead.photoUrl} alt={`${lead.name} profile`} width={64} height={64} unoptimized />
              ) : (
                <span aria-hidden="true">{lead.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("")}</span>
              )}
            </span>
            <div className="lead-photo-actions">
              <label className="lead-photo-upload" htmlFor="lead-profile-photo">
                {photoSaving ? "Uploading..." : lead.photoUrl ? "Change photo" : "Add photo"}
              </label>
              <input
                id="lead-profile-photo"
                className="sr-only"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handlePhotoChange}
                disabled={photoSaving}
              />
              {lead.photoUrl && (
                <button type="button" className="lead-photo-remove" onClick={handlePhotoRemove} disabled={photoSaving}>
                  Remove
                </button>
              )}
            </div>
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="lead-profile-title">{lead.name || "Unnamed lead"}</h1>
              <span className={`status-label status-${lead.status}`}>{lead.status}</span>
            </div>
            <p className="mt-1 text-sm text-secondary">{lead.company || "No company added"}</p>
          </div>
        </div>
        <div className="lead-profile-value">
          <span>Opportunity value</span>
          <strong>{currencyFormatter.format(lead.value || 0)}</strong>
        </div>
      </header>
      {(photoError || photoStatus) && (
        <p className={`feedback-message ${photoError ? "feedback-error" : "feedback-success"}`} role={photoError ? "alert" : "status"}>
          {photoError || photoStatus}
        </p>
      )}

      <div className="lead-detail-columns">
        <section className="lead-section" aria-labelledby="lead-details-heading">
          <div className="lead-section-heading">
            <div>
              <p className="lead-eyebrow">Contact record</p>
              <h2 id="lead-details-heading">Lead details</h2>
              <p>Keep contact information and pipeline details up to date.</p>
            </div>
            <span className="lead-updated-date">Last contact · {formatDate(lead.lastContactAt)}</span>
          </div>

          <form onSubmit={handleSubmit} className="lead-edit-form">
            <fieldset className="lead-fieldset">
              <legend>Contact information</legend>
              <div className="lead-form-grid">
                <div>
                  <label className="form-label" htmlFor="lead-name">Lead name</label>
                  <input id="lead-name" className="form-control" value={lead.name} onChange={(event) => setLead((current) => ({ ...current, name: event.target.value }))} required />
                </div>
                <div>
                  <label className="form-label" htmlFor="lead-company">Company</label>
                  <input id="lead-company" className="form-control" value={lead.company} onChange={(event) => setLead((current) => ({ ...current, company: event.target.value }))} required />
                </div>
                <div>
                  <label className="form-label" htmlFor="lead-email">Email</label>
                  <input id="lead-email" className="form-control" type="email" value={lead.email} onChange={(event) => setLead((current) => ({ ...current, email: event.target.value }))} required />
                </div>
                <div>
                  <label className="form-label" htmlFor="lead-phone">Phone <span className="text-muted">(optional)</span></label>
                  <input id="lead-phone" className="form-control" type="tel" value={lead.phone ?? ""} onChange={(event) => setLead((current) => ({ ...current, phone: event.target.value }))} />
                </div>
              </div>
            </fieldset>

            <fieldset className="lead-fieldset">
              <legend>Pipeline and ownership</legend>
              <div className="lead-form-grid">
                <div>
                  <label className="form-label" htmlFor="lead-status">Pipeline stage</label>
                  <select id="lead-status" className="form-control" value={lead.status} onChange={(event) => setLead((current) => ({ ...current, status: event.target.value as LeadStatus }))}>
                    {allowedStatuses.map((status) => (
                      <option key={status} value={status}>{status[0].toUpperCase() + status.slice(1)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="form-label" htmlFor="lead-value">Opportunity value <span className="text-muted">(NGN)</span></label>
                  <input
                    id="lead-value"
                    className="form-control"
                    type="number"
                    min="0"
                    step="1000"
                    value={lead.value}
                    onChange={(event) => setLead((current) => ({ ...current, value: Number(event.target.value || 0) }))}
                  />
                </div>
                <div className="lead-owner-field">
                  <label className="form-label" htmlFor="lead-owner">Assigned owner</label>
                  <input id="lead-owner" className="form-control" value={lead.owner} onChange={(event) => setLead((current) => ({ ...current, owner: event.target.value }))} required />
                </div>
              </div>
            </fieldset>

            <div>
              <label className="form-label" htmlFor="lead-next-action">Next action</label>
              <textarea
                id="lead-next-action"
                className="form-control min-h-[100px] resize-y"
                value={lead.nextAction}
                onChange={(event) => setLead((current) => ({ ...current, nextAction: event.target.value }))}
                placeholder="What should happen next?"
              />
            </div>

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

            <div className="lead-form-actions">
              <p className="text-xs text-secondary">Changes only apply after you save.</p>
              <button type="submit" className="button-primary min-h-11 px-5 text-sm" disabled={saving}>
                {saving ? "Saving changes..." : "Save changes"}
              </button>
            </div>
          </form>
        </section>

        <aside className="lead-history-column">
          <section className="lead-section" aria-labelledby="lead-history-heading">
            <div className="lead-section-heading">
              <div>
                <p className="lead-eyebrow">Customer record</p>
                <h2 id="lead-history-heading">Notes &amp; history</h2>
                <p>Capture context your team can use in the next conversation.</p>
              </div>
              <span className="count-badge">{notes.length} {notes.length === 1 ? "note" : "notes"}</span>
            </div>

            <form onSubmit={handleNoteSubmit} className="lead-note-form">
              <div>
                <label className="form-label" htmlFor="lead-note">Add a note</label>
                <textarea
                  id="lead-note"
                  className="form-control min-h-[112px] resize-y"
                  value={noteContent}
                  onChange={(event) => setNoteContent(event.target.value)}
                  maxLength={5000}
                  placeholder="Log a conversation, customer need, decision, or follow-up..."
                  required
                />
                <p className="mt-1 text-right text-xs text-secondary">{noteContent.length}/5000</p>
              </div>
              {notesError && (
                <p className="feedback-message feedback-error" role="alert">{notesError}</p>
              )}
              {noteSuccess && (
                <p className="feedback-message feedback-success" role="status">{noteSuccess}</p>
              )}
              <button type="submit" className="button-primary min-h-11 w-full px-4 text-sm" disabled={noteSaving}>
                {noteSaving ? "Saving note..." : "Add note"}
              </button>
            </form>

            <div className="lead-timeline">
              <h3>Timeline</h3>
              {notesLoading ? (
                <p className="mt-4 text-sm text-secondary" role="status">Loading lead history...</p>
              ) : notesError && notes.length === 0 ? (
                <p className="feedback-message feedback-error mt-4" role="alert">{notesError}</p>
              ) : notes.length === 0 ? (
                <div className="lead-empty-history">
                  <span aria-hidden="true" className="lead-empty-icon">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
                    </svg>
                  </span>
                  <p>No notes yet</p>
                  <span>Notes added here will stay with {lead.name}’s record.</span>
                </div>
              ) : (
                <ol className="lead-note-timeline">
                  {notes.map((note) => (
                    <li key={note.id}>
                      <span className="activity-avatar" aria-hidden="true">
                        {note.author.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("")}
                      </span>
                      <article className="lead-note-entry">
                        <div className="lead-note-meta">
                          <p>{note.author}</p>
                          <time dateTime={note.createdAt}>
                            {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(note.createdAt))}
                          </time>
                        </div>
                        <p className="lead-note-content">{note.content}</p>
                      </article>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
