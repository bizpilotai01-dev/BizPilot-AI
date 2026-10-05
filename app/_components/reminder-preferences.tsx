"use client";

import { useEffect, useState, type FormEvent } from "react";

import { authorizedFetch } from "@/lib/supabase-browser";
import { describeReminderChannel, isValidReminderPhone } from "@/lib/reminder-preferences";

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

  // A channel can always be chosen. Delivery waits on provider credentials,
  // but the choice itself must not be blocked, otherwise the setting cannot be
  // set up before Resend or Meta are wired up.
  const emailState = describeReminderChannel("email", preferences.configured);
  const whatsappState = describeReminderChannel("whatsapp", preferences.configured);
  const whatsappBlocked = preferences.whatsappEnabled && !isValidReminderPhone(preferences.phone);

  return (
    <section className="module-surface mt-4" aria-labelledby="reminder-preferences-heading">
      <div>
        <h2 id="reminder-preferences-heading" className="section-heading">Follow-up reminders</h2>
        <p className="mt-1 text-sm text-secondary">In-app due-date alerts are always on. Choose either reminder channel, or both.</p>
      </div>
      {loading ? (
        <p className="mt-4 text-sm text-secondary" role="status">Loading reminder settings...</p>
      ) : (
        <form onSubmit={handleSubmit} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="reminder-channel-option">
            <input
              type="checkbox"
              checked={preferences.emailEnabled}
              onChange={(event) => setPreferences((current) => ({ ...current, emailEnabled: event.target.checked }))}
            />
            <span>
              <span className="block font-medium">Email reminders</span>
              <span className="block text-xs text-secondary">A daily digest of tasks due tomorrow, overdue tasks, and quiet leads.</span>
              <span className={emailState.deliverable ? "reminder-channel-status" : "reminder-channel-status reminder-channel-status-pending"}>
                {emailState.status}
              </span>
            </span>
          </label>
          <label className="reminder-channel-option">
            <input
              type="checkbox"
              checked={preferences.whatsappEnabled}
              onChange={(event) => setPreferences((current) => ({ ...current, whatsappEnabled: event.target.checked }))}
            />
            <span>
              <span className="block font-medium">WhatsApp reminders</span>
              <span className="block text-xs text-secondary">The same daily digest, sent to your number in international format.</span>
              <span className={whatsappState.deliverable ? "reminder-channel-status" : "reminder-channel-status reminder-channel-status-pending"}>
                {whatsappState.status}
              </span>
            </span>
          </label>
          {preferences.whatsappEnabled && (
            <div className="sm:col-span-2">
              <label className="form-label" htmlFor="reminder-phone">WhatsApp number</label>
              <input
                id="reminder-phone"
                className="form-control max-w-sm"
                type="tel"
                autoComplete="tel"
                placeholder="+2348012345678"
                value={preferences.phone}
                aria-describedby="reminder-phone-help"
                onChange={(event) => setPreferences((current) => ({ ...current, phone: event.target.value }))}
              />
              <p id="reminder-phone-help" className="mt-1 text-xs text-secondary">Include the country code, for example +2348012345678.</p>
            </div>
          )}
          {whatsappBlocked && (
            <p className="feedback-message feedback-error sm:col-span-2" role="alert">
              Enter a WhatsApp number in international format before saving, for example +2348012345678.
            </p>
          )}
          {error && <p className="feedback-message feedback-error sm:col-span-2" role="alert">{error}</p>}
          {message && <p className="feedback-message feedback-success sm:col-span-2" role="status">{message}</p>}
          <div className="sm:col-span-2">
            <button type="submit" className="button-primary min-h-11 px-4 text-sm" disabled={saving || whatsappBlocked}>
              {saving ? "Saving..." : "Save reminder settings"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
