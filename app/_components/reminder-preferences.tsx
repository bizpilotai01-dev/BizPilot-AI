"use client";

import { useEffect, useState, type FormEvent } from "react";

import { authorizedFetch } from "@/lib/supabase-browser";

type Preferences = {
  phone: string;
  emailEnabled: boolean;
  whatsappEnabled: boolean;
  configured: { email: boolean; whatsapp: boolean };
};

export function ReminderPreferences() {
  const [preferences, setPreferences] = useState<Preferences>({
    phone: "",
    emailEnabled: false,
    whatsappEnabled: false,
    configured: { email: false, whatsapp: false },
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    authorizedFetch("/api/reminders/preferences")
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Reminder preferences could not be loaded.");
        if (active) setPreferences(payload as Preferences);
      })
      .catch((requestError: unknown) => {
        if (active) setError(requestError instanceof Error ? requestError.message : "Reminder preferences could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await authorizedFetch("/api/reminders/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: preferences.phone,
          emailEnabled: preferences.emailEnabled,
          whatsappEnabled: preferences.whatsappEnabled,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Reminder preferences could not be saved.");
      setMessage(payload.message ?? "Reminder preferences saved.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Reminder preferences could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="module-surface mt-4" aria-labelledby="reminder-preferences-heading">
      <div>
        <h2 id="reminder-preferences-heading" className="section-heading">Follow-up reminders</h2>
        <p className="mt-1 text-sm text-secondary">In-app due-date alerts are always on. Choose optional daily email or WhatsApp reminders for tasks due tomorrow or overdue.</p>
      </div>
      {loading ? (
        <p className="mt-4 text-sm text-secondary" role="status">Loading reminder settings...</p>
      ) : (
        <form onSubmit={handleSubmit} className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(260px,1fr)]">
          <label className="reminder-channel-option">
            <input
              type="checkbox"
              checked={preferences.emailEnabled}
              disabled={!preferences.configured.email}
              onChange={(event) => setPreferences((current) => ({ ...current, emailEnabled: event.target.checked }))}
            />
            <span>
              <span className="block font-medium">Email reminders</span>
              <span className="block text-xs text-secondary">
                {preferences.configured.email ? "Send to your account email." : "Email delivery needs Resend configuration."}
              </span>
            </span>
          </label>
          <label className="reminder-channel-option">
            <input
              type="checkbox"
              checked={preferences.whatsappEnabled}
              disabled={!preferences.configured.whatsapp}
              onChange={(event) => setPreferences((current) => ({ ...current, whatsappEnabled: event.target.checked }))}
            />
            <span>
              <span className="block font-medium">WhatsApp reminders</span>
              <span className="block text-xs text-secondary">
                {preferences.configured.whatsapp ? "Requires your international phone number." : "Needs Meta API credentials and an approved reminder template."}
              </span>
            </span>
          </label>
          <div className="sm:col-span-2">
            <label className="form-label" htmlFor="reminder-phone">WhatsApp number</label>
            <input
              id="reminder-phone"
              className="form-control max-w-sm"
              type="tel"
              autoComplete="tel"
              placeholder="+2348012345678"
              value={preferences.phone}
              onChange={(event) => setPreferences((current) => ({ ...current, phone: event.target.value }))}
            />
          </div>
          {error && <p className="feedback-message feedback-error sm:col-span-2" role="alert">{error}</p>}
          {message && <p className="feedback-message feedback-success sm:col-span-2" role="status">{message}</p>}
          <div className="sm:col-span-2">
            <button type="submit" className="button-primary min-h-11 px-4 text-sm" disabled={saving}>
              {saving ? "Saving..." : "Save reminder settings"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
