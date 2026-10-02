import { useState, type FormEvent } from "react";
import { authorizedFetch } from "@/lib/supabase-browser";

type BusinessForm = {
  businessName: string;
  fullName: string;
  industry: string;
};

const industries = [
  "Business services",
  "Technology",
  "Real estate",
  "Logistics",
  "Professional services",
  "Retail and ecommerce",
  "Healthcare",
  "Education",
  "Other",
];

const initialForm: BusinessForm = {
  businessName: "",
  fullName: "",
  industry: "Business services",
};

export function BusinessOnboardingForm() {
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const response = await authorizedFetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "We could not create this business.");
      }

      setSuccess(`${payload.business.name} is ready to manage in Biz Pilot.`);
      setForm(initialForm);
      window.dispatchEvent(new Event("bizpilot-auth-change"));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "We could not create this business.");
    } finally {
      setSubmitting(false);
    }
  }

  function updateField(field: keyof BusinessForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  return (
    <section aria-labelledby="onboarding-heading" className="module-surface">
      <h2 id="onboarding-heading" className="section-heading">Business onboarding</h2>
      <p className="mt-1 text-sm leading-relaxed text-secondary">Set up your business profile.</p>
      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <div>
          <label className="form-label" htmlFor="business-name">Business name</label>
          <input id="business-name" className="form-control" autoComplete="organization" value={form.businessName} onChange={(event) => updateField("businessName", event.target.value)} required />
        </div>
        <div>
          <label className="form-label" htmlFor="owner-name">Owner full name</label>
          <input id="owner-name" className="form-control" autoComplete="name" value={form.fullName} onChange={(event) => updateField("fullName", event.target.value)} required />
        </div>
        <p className="text-xs leading-relaxed text-secondary">Your signed-in Supabase account will be set as the business owner.</p>
        <div>
          <label className="form-label" htmlFor="business-industry">Industry</label>
          <select id="business-industry" className="form-control" value={form.industry} onChange={(event) => updateField("industry", event.target.value)} required>
            {industries.map((industry) => <option key={industry} value={industry}>{industry}</option>)}
          </select>
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
        <button type="submit" className="button-primary min-h-11 w-full px-4 text-sm" disabled={submitting}>
          {submitting ? "Creating business..." : "Create business"}
        </button>
      </form>
    </section>
  );
}
